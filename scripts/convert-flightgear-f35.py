#!/usr/bin/env python3
"""Convert the bundled FlightGear AC3D F-35 model and livery to a compact GLB."""

from __future__ import annotations

import json
import math
import struct
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "public/assets/f35/source"
MODEL = SOURCE / "F-35B.ac"
TEXTURE = SOURCE / "RNoAF.png"
OUTPUT = ROOT / "public/assets/f35/f35-lightning.glb"


def read_ac3d(path: Path):
    lines = path.read_text(encoding="utf-8").splitlines()
    materials = []
    cursor = 1 if lines and lines[0].startswith("AC3D") else 0
    while cursor < len(lines) and lines[cursor].startswith("MATERIAL "):
        parts = lines[cursor].split()
        materials.append({
            "name": parts[1].strip('"'),
            "color": tuple(float(value) for value in parts[3:6]),
            "transparency": float(parts[21]),
        })
        cursor += 1

    def parse_object(index):
        while index < len(lines) and not lines[index].startswith("OBJECT "):
            index += 1
        if index >= len(lines):
            return None, index

        node = {"type": lines[index].split(maxsplit=1)[1], "name": "", "loc": (0, 0, 0), "rot": None,
                "texture": None, "vertices": [], "surfaces": [], "children": []}
        index += 1
        while index < len(lines):
            parts = lines[index].split()
            if not parts:
                index += 1
                continue
            key = parts[0]
            if key == "OBJECT":
                break
            if key == "name":
                node["name"] = lines[index][len("name "):].strip().strip('"')
            elif key == "loc":
                node["loc"] = tuple(float(value) for value in parts[1:4])
            elif key == "rot":
                node["rot"] = tuple(float(value) for value in parts[1:10])
            elif key == "texture":
                node["texture"] = lines[index][len("texture "):].strip().strip('"')
            elif key == "numvert":
                count = int(parts[1])
                node["vertices"] = [tuple(float(value) for value in lines[index + offset + 1].split()[:3]) for offset in range(count)]
                index += count
            elif key == "numsurf":
                count = int(parts[1])
                index += 1
                for _ in range(count):
                    surface = {"flags": int(lines[index].split()[1], 16), "material": 0, "refs": []}
                    index += 1
                    while index < len(lines):
                        tokens = lines[index].split()
                        if tokens and tokens[0] == "mat":
                            surface["material"] = int(tokens[1])
                        elif tokens and tokens[0] == "refs":
                            refs = int(tokens[1])
                            index += 1
                            surface["refs"] = [
                                (int((ref := lines[index + offset].split())[0]), float(ref[1]), float(ref[2]))
                                for offset in range(refs)
                            ]
                            index += refs
                            break
                        elif tokens and tokens[0] == "SURF":
                            raise ValueError(f"Surface in {node['name']} is missing refs")
                        index += 1
                    node["surfaces"].append(surface)
                continue
            elif key == "kids":
                child_count = int(parts[1])
                index += 1
                for _ in range(child_count):
                    child, index = parse_object(index)
                    if child is not None:
                        node["children"].append(child)
                return node, index
            index += 1
        return node, index

    root, _ = parse_object(cursor)
    return root, materials


def add3(a, b):
    return (a[0] + b[0], a[1] + b[1], a[2] + b[2])


def transform_point(point, node):
    rotation = node["rot"]
    if rotation:
        x, y, z = point
        point = (
            rotation[0] * x + rotation[1] * y + rotation[2] * z,
            rotation[3] * x + rotation[4] * y + rotation[5] * z,
            rotation[6] * x + rotation[7] * y + rotation[8] * z,
        )
    return add3(point, node["loc"])


def traverse(node, parent_loc=(0, 0, 0), parent_rot=None):
    if parent_rot:
        x, y, z = node["loc"]
        local = (parent_rot[0] * x + parent_rot[1] * y + parent_rot[2] * z,
                 parent_rot[3] * x + parent_rot[4] * y + parent_rot[5] * z,
                 parent_rot[6] * x + parent_rot[7] * y + parent_rot[8] * z)
        loc = add3(parent_loc, local)
    else:
        loc = add3(parent_loc, node["loc"])

    rotation = node["rot"]
    if parent_rot and rotation:
        rotation = tuple(sum(parent_rot[row * 3 + k] * rotation[k * 3 + col] for k in range(3))
                         for row in range(3) for col in range(3))
    elif not rotation:
        rotation = parent_rot

    yield node, loc, rotation
    for child in node["children"]:
        yield from traverse(child, loc, rotation)


def cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def normalize(v):
    length = math.sqrt(sum(value * value for value in v))
    return tuple(value / length for value in v) if length > 1e-12 else (0, 1, 0)


def align4(data: bytearray):
    while len(data) % 4:
        data.append(0)


def build_glb(root, materials):
    mesh_data = {}
    material_defs = []

    for index, material in enumerate(materials):
        material_defs.append({
            "name": material["name"],
            "pbrMetallicRoughness": {
                "baseColorFactor": [*material["color"], 1 - material["transparency"]],
                "metallicFactor": 0.12,
                "roughnessFactor": 0.68,
            },
            "alphaMode": "BLEND" if material["transparency"] > 0 else "OPAQUE",
            "doubleSided": True,
        })

    material_defs.append({
        "name": "FlightGear RNoAF low-visibility base texture",
        "pbrMetallicRoughness": {
            "baseColorTexture": {"index": 0},
            "baseColorFactor": [0.88, 0.9, 0.92, 1],
            "metallicFactor": 0.12,
            "roughnessFactor": 0.76,
        },
        "doubleSided": True,
    })
    material_defs.append({
        "name": "Canopy glass",
        "pbrMetallicRoughness": {
            "baseColorFactor": [0.16, 0.3, 0.35, 0.62],
            "metallicFactor": 0.44,
            "roughnessFactor": 0.18,
        },
        "alphaMode": "BLEND",
        "doubleSided": True,
    })

    # The fuel parts on this source airframe are the F-35B probe assembly at
    # the nose. ILMATILA depicts the F-35A, which has no deployable probe.
    excluded = {
        "pylons", "fan", "arch", "box", "case",
        "fuel top", "fuel box", "fuel intake", "fuel lever",
    }
    for node, loc, rotation in traverse(root):
        if node["type"] != "poly" or not node["vertices"] or node["name"] in excluded:
            continue

        verts = [transform_point(vertex, {"rot": rotation, "loc": loc}) for vertex in node["vertices"]]
        smooth_normals = [(0.0, 0.0, 0.0) for _ in verts]
        triangles = []
        for surface in node["surfaces"]:
            refs = surface["refs"]
            if len(refs) < 3 or surface["flags"] & 0x3:
                continue
            mat_id = surface["material"]
            uses_texture = node["texture"] is not None and node["name"] != "pylons"
            if node["name"] == "canopy":
                mat_id = len(materials) + 1
                uses_texture = False
            elif uses_texture:
                mat_id = len(materials)
            for triangle_index in range(1, len(refs) - 1):
                triangle = [refs[0], refs[triangle_index], refs[triangle_index + 1]]
                p0, p1, p2 = (verts[ref[0]] for ref in triangle)
                normal = normalize(cross(tuple(p1[k] - p0[k] for k in range(3)), tuple(p2[k] - p0[k] for k in range(3))))
                smooth = bool(surface["flags"] & 0x10)
                if smooth:
                    for ref in triangle:
                        previous = smooth_normals[ref[0]]
                        smooth_normals[ref[0]] = tuple(previous[k] + normal[k] for k in range(3))
                triangles.append((mat_id, triangle, normal, smooth))

        for mat_id, triangle, face_normal, smooth in triangles:
            target = mesh_data.setdefault(mat_id, {"positions": [], "normals": [], "uvs": [], "indices": [],
                                                      "min": [float("inf")] * 3, "max": [float("-inf")] * 3})
            for ref in triangle:
                vertex = verts[ref[0]]
                normal = normalize(smooth_normals[ref[0]]) if smooth else face_normal
                new_index = len(target["positions"]) // 3
                target["positions"].extend(vertex)
                target["normals"].extend(normal)
                target["uvs"].extend((ref[1], 1 - ref[2]))
                target["indices"].append(new_index)
                for axis in range(3):
                    target["min"][axis] = min(target["min"][axis], vertex[axis])
                    target["max"][axis] = max(target["max"][axis], vertex[axis])

    binary = bytearray()
    views = []
    accessors = []

    def append_accessor(values, component_type, gltf_type, target, count, minimum=None, maximum=None):
        align4(binary)
        offset = len(binary)
        if component_type == 5126:
            binary.extend(struct.pack("<" + "f" * len(values), *values))
        elif component_type == 5125:
            binary.extend(struct.pack("<" + "I" * len(values), *values))
        view = len(views)
        views.append({"buffer": 0, "byteOffset": offset, "byteLength": len(binary) - offset, "target": target})
        accessor = {"bufferView": view, "componentType": component_type, "count": count, "type": gltf_type}
        if minimum is not None:
            accessor["min"] = minimum
            accessor["max"] = maximum
        accessors.append(accessor)
        return len(accessors) - 1

    primitives = []
    for material_id, data in sorted(mesh_data.items()):
        vertex_count = len(data["positions"]) // 3
        pos = append_accessor(data["positions"], 5126, "VEC3", 34962, vertex_count, data["min"], data["max"])
        normal = append_accessor(data["normals"], 5126, "VEC3", 34962, vertex_count)
        uv = append_accessor(data["uvs"], 5126, "VEC2", 34962, vertex_count)
        indices = append_accessor(data["indices"], 5125, "SCALAR", 34963, len(data["indices"]))
        primitives.append({"attributes": {"POSITION": pos, "NORMAL": normal, "TEXCOORD_0": uv}, "indices": indices, "material": material_id})

    image_bytes = TEXTURE.read_bytes()
    align4(binary)
    image_offset = len(binary)
    binary.extend(image_bytes)
    image_view = len(views)
    views.append({"buffer": 0, "byteOffset": image_offset, "byteLength": len(image_bytes)})

    gltf = {
        "asset": {"version": "2.0", "generator": "convert-flightgear-f35.py"},
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [{"name": "FlightGear F-35B; aligned to game axes", "mesh": 0, "rotation": [0, math.sin(math.pi / 4), 0, math.cos(math.pi / 4)]}],
        "meshes": [{"name": "F-35 Lightning II airframe", "primitives": primitives}],
        "materials": material_defs,
        "textures": [{"sampler": 0, "source": 0}],
        "images": [{"bufferView": image_view, "mimeType": "image/png", "name": "RNoAF base livery; Finnish roundels added in scene"}],
        "samplers": [{"magFilter": 9729, "minFilter": 9987, "wrapS": 10497, "wrapT": 10497}],
        "accessors": accessors,
        "bufferViews": views,
        "buffers": [{"byteLength": len(binary)}],
    }
    json_bytes = json.dumps(gltf, separators=(",", ":")).encode("utf-8")
    while len(json_bytes) % 4:
        json_bytes += b" "
    align4(binary)

    json_chunk = struct.pack("<I4s", len(json_bytes), b"JSON") + json_bytes
    bin_chunk = struct.pack("<I4s", len(binary), b"BIN\x00") + binary
    total_length = 12 + len(json_chunk) + len(bin_chunk)
    return struct.pack("<4sII", b"glTF", 2, total_length) + json_chunk + bin_chunk


def main():
    root, materials = read_ac3d(MODEL)
    OUTPUT.write_bytes(build_glb(root, materials))
    print(f"Wrote {OUTPUT.relative_to(ROOT)} ({OUTPUT.stat().st_size / 1024:.0f} KiB)")


if __name__ == "__main__":
    main()
