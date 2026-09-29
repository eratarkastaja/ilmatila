#!/usr/bin/env python3
"""Validate and package the generated terrain areas for a public data release."""

from __future__ import annotations

import hashlib
import json
import struct
import sys
import zipfile
from datetime import date
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SOURCE_ROOT = ROOT / "public" / "terrain" / "areas"
DEFAULT_OUTPUT = ROOT / "release-assets"
AREA_IDS = ("paijanne", "vironlahti", "ilomantsi", "kuusamo")
LICENSE_URL = "https://creativecommons.org/licenses/by/4.0/"
SOURCE_URL = "https://www.maanmittauslaitos.fi/ortokuvien-ja-korkeusmallien-kyselypalvelu/tekninen-kuvaus"


def attribution(metadata: dict) -> str:
    retrieved = metadata.get("retrievalDates", [metadata["downloadedAt"]])
    retrieved_text = ", ".join(retrieved)
    region = metadata["region"]
    modifications = metadata.get("attribution", {}).get("modifications", "orthophotos were cropped, resampled, tiled, and recompressed")
    return f"""# Terrain data attribution — {region}

© National Land Survey of Finland. Contains its open data: Elevation Model 2 m and Colour Orthophotos (ortokuva_vari), retrieved {retrieved_text}.

Source: [National Land Survey of Finland WCS](<{SOURCE_URL}>).

This package modifies the source data: {modifications} Orthophoto capture years can vary by tile.

Licensed under [Creative Commons Attribution 4.0 International (CC BY 4.0)](<{LICENSE_URL}>).
"""


def expected_files(metadata: dict) -> set[str]:
    grid = int(metadata["orthoGrid"])
    files = {
        "terrain.json",
        "height.f32",
        *(
            name
            for row in range(grid)
            for col in range(grid)
            for name in (f"ortho-{row}-{col}.png", f"water-{row}-{col}.bin")
        ),
    }
    detail_grid = metadata.get("detailOrthoGrid")
    if detail_grid is not None:
        files.update(
            f"detail-ortho-{row}-{col}.jpg"
            for row in range(int(detail_grid))
            for col in range(int(detail_grid))
        )
    return files


def validate_area(area_id: str) -> tuple[Path, dict, list[Path]]:
    area_dir = SOURCE_ROOT / area_id
    metadata_path = area_dir / "terrain.json"
    if not metadata_path.is_file():
        raise ValueError(f"{area_id}: missing terrain.json")

    metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    if metadata.get("id") != area_id:
        raise ValueError(f"{area_id}: terrain.json id does not match directory")
    if metadata.get("attribution", {}).get("license") != "CC BY 4.0":
        raise ValueError(f"{area_id}: missing CC BY 4.0 attribution metadata")
    date.fromisoformat(metadata["downloadedAt"])
    detail_grid = metadata.get("detailOrthoGrid")
    detail_pixels = metadata.get("detailOrthoTilePixels")
    detail_extent = metadata.get("detailOrthoAreaMeters")
    detail_tile_size = metadata.get("detailOrthoTileSizeMeters")
    if any(value is not None for value in (detail_grid, detail_pixels, detail_extent, detail_tile_size)):
        if not isinstance(detail_grid, int) or not 3 <= detail_grid <= 12:
            raise ValueError(f"{area_id}: invalid moving detailed orthophoto grid")
        if not isinstance(detail_pixels, int) or not 128 <= detail_pixels <= 2048:
            raise ValueError(f"{area_id}: invalid moving detailed orthophoto tile size")
        if not isinstance(detail_extent, (int, float)) or not 0 < detail_extent <= 24_000:
            raise ValueError(f"{area_id}: invalid moving detailed orthophoto extent")
        if not isinstance(detail_tile_size, (int, float)) or abs(detail_grid * detail_tile_size - detail_extent) >= 1:
            raise ValueError(f"{area_id}: moving detailed orthophoto tile grid does not cover its area")
        if detail_extent != metadata.get("orthoAreaMeters"):
            raise ValueError(f"{area_id}: moving detailed orthophoto extent does not match the terrain area")
        date.fromisoformat(metadata["detailOrthoRetrievedAt"])

    actual = {path.name for path in area_dir.iterdir() if path.is_file()}
    expected = expected_files(metadata)
    if actual != expected:
        missing = sorted(expected - actual)
        extra = sorted(actual - expected)
        raise ValueError(f"{area_id}: package file list mismatch (missing={missing}, extra={extra})")

    width, height = int(metadata["width"]), int(metadata["height"])
    if (area_dir / "height.f32").stat().st_size != width * height * 4:
        raise ValueError(f"{area_id}: height.f32 size does not match the metadata grid")

    pixels = int(metadata["orthoTilePixels"])
    for row in range(int(metadata["orthoGrid"])):
        for col in range(int(metadata["orthoGrid"])):
            image_path = area_dir / f"ortho-{row}-{col}.png"
            with image_path.open("rb") as image:
                header = image.read(24)
            if header[:8] != b"\x89PNG\r\n\x1a\n":
                raise ValueError(f"{area_id}: {image_path.name} is not a PNG image")
            image_width, image_height = struct.unpack(">II", header[16:24])
            if (image_width, image_height) != (pixels, pixels):
                raise ValueError(f"{area_id}: {image_path.name} dimensions do not match metadata")
            water_path = area_dir / f"water-{row}-{col}.bin"
            if water_path.stat().st_size != pixels * pixels:
                raise ValueError(f"{area_id}: {water_path.name} size does not match metadata")

    if detail_grid is not None:
        for row in range(detail_grid):
            for col in range(detail_grid):
                image_path = area_dir / f"detail-ortho-{row}-{col}.jpg"
                image_width, image_height = jpeg_dimensions(image_path)
                if (image_width, image_height) != (detail_pixels, detail_pixels):
                    raise ValueError(f"{area_id}: {image_path.name} dimensions do not match metadata")

    return area_dir, metadata, sorted(area_dir.iterdir(), key=lambda path: path.name)


def jpeg_dimensions(path: Path) -> tuple[int, int]:
    data = path.read_bytes()
    if data[:2] != b"\xff\xd8":
        raise ValueError(f"{path.name} is not a JPEG image")

    offset = 2
    start_of_frame = {0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF}
    while offset < len(data):
        if data[offset] != 0xFF:
            offset += 1
            continue
        while offset < len(data) and data[offset] == 0xFF:
            offset += 1
        if offset >= len(data):
            break
        marker = data[offset]
        offset += 1
        if marker in {0xD8, 0xD9, 0x01} or 0xD0 <= marker <= 0xD7:
            continue
        if offset + 2 > len(data):
            break
        segment_length = int.from_bytes(data[offset:offset + 2], "big")
        if segment_length < 2 or offset + segment_length > len(data):
            break
        if marker in start_of_frame:
            if segment_length < 7:
                break
            height = int.from_bytes(data[offset + 3:offset + 5], "big")
            width = int.from_bytes(data[offset + 5:offset + 7], "big")
            return width, height
        offset += segment_length
    raise ValueError(f"{path.name} has no valid JPEG frame header")


def write_zip(area_id: str, output_dir: Path) -> tuple[Path, str]:
    area_dir, metadata, files = validate_area(area_id)
    archive_path = output_dir / f"{area_id}.zip"
    stamp = date.fromisoformat(metadata["downloadedAt"])
    timestamp = (stamp.year, stamp.month, stamp.day, 0, 0, 0)

    with zipfile.ZipFile(archive_path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        entries = [(f"{area_id}/ATTRIBUTION.md", attribution(metadata).encode("utf-8"))]
        entries.extend((f"{area_id}/{path.name}", path.read_bytes()) for path in files)
        for name, content in entries:
            info = zipfile.ZipInfo(name, date_time=timestamp)
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            info.create_system = 3
            archive.writestr(info, content, compress_type=zipfile.ZIP_DEFLATED, compresslevel=6)

    with zipfile.ZipFile(archive_path) as archive:
        corrupt = archive.testzip()
        if corrupt:
            raise ValueError(f"{archive_path.name}: corrupt archive entry {corrupt}")

    digest = hashlib.sha256(archive_path.read_bytes()).hexdigest()
    return archive_path, digest


def main() -> int:
    output_dir = Path(sys.argv[1]).expanduser().resolve() if len(sys.argv) > 1 else DEFAULT_OUTPUT
    if len(sys.argv) > 2:
        print("Usage: python3 tools/terrain/package-release.py [output-directory]", file=sys.stderr)
        return 2
    output_dir.mkdir(parents=True, exist_ok=True)

    manifest = []
    total_source_bytes = 0
    total_archive_bytes = 0
    for area_id in AREA_IDS:
        area_dir, _, files = validate_area(area_id)
        total_source_bytes += sum(path.stat().st_size for path in files)
        archive_path, digest = write_zip(area_id, output_dir)
        total_archive_bytes += archive_path.stat().st_size
        manifest.append(f"{digest}  {archive_path.name}")
        print(f"{archive_path.name}: {archive_path.stat().st_size:,} bytes  sha256 {digest}")

    (output_dir / "SHA256SUMS.txt").write_text("\n".join(manifest) + "\n", encoding="ascii")
    print(f"Source data: {total_source_bytes:,} bytes; archives: {total_archive_bytes:,} bytes")
    print(f"Release assets written to {output_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
