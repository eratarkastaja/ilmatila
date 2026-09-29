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
    retrieved = metadata["downloadedAt"]
    region = metadata["region"]
    return f"""# Terrain data attribution — {region}

© National Land Survey of Finland. Contains its open data: Elevation Model 2 m and Colour Orthophotos (ortokuva_vari), retrieved {retrieved}.

Source: [National Land Survey of Finland WCS](<{SOURCE_URL}>).

This package modifies the source data: elevation samples were downsampled to a 400 × 400 grid; orthophotos were cropped, resampled, tiled, and recompressed; water masks were derived from orthophoto colors. Orthophoto capture years can vary by tile.

Licensed under [Creative Commons Attribution 4.0 International (CC BY 4.0)](<{LICENSE_URL}>).
"""


def expected_files(metadata: dict) -> set[str]:
    grid = int(metadata["orthoGrid"])
    return {
        "terrain.json",
        "height.f32",
        *(
            name
            for row in range(grid)
            for col in range(grid)
            for name in (f"ortho-{row}-{col}.png", f"water-{row}-{col}.bin")
        ),
    }


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

    return area_dir, metadata, sorted(area_dir.iterdir(), key=lambda path: path.name)


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
