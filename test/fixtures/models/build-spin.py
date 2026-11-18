# Writes spin.glb, the animated test model: a phone-shaped slab under one root
# node that a two second clip named Spin turns once around its upright axis.
# Run as `python3 test/fixtures/models/build-spin.py test/fixtures/models/spin.glb`.
import json
import math
import struct
import sys


def box(cx, cy, cz, sx, sy, sz):
    # Four vertices per face, so each face keeps its own flat normal.
    faces = [
        ((1, 0, 0), [(1, -1, -1), (1, 1, -1), (1, 1, 1), (1, -1, 1)]),
        ((-1, 0, 0), [(-1, -1, 1), (-1, 1, 1), (-1, 1, -1), (-1, -1, -1)]),
        ((0, 1, 0), [(-1, 1, -1), (-1, 1, 1), (1, 1, 1), (1, 1, -1)]),
        ((0, -1, 0), [(-1, -1, 1), (-1, -1, -1), (1, -1, -1), (1, -1, 1)]),
        ((0, 0, 1), [(-1, -1, 1), (1, -1, 1), (1, 1, 1), (-1, 1, 1)]),
        ((0, 0, -1), [(1, -1, -1), (-1, -1, -1), (-1, 1, -1), (1, 1, -1)]),
    ]
    positions, normals, indices = [], [], []
    for normal, quad in faces:
        base = len(positions)
        for x, y, z in quad:
            positions.append((cx + x * sx / 2, cy + y * sy / 2, cz + z * sz / 2))
            normals.append(normal)
        indices += [base, base + 1, base + 2, base, base + 2, base + 3]
    return positions, normals, indices


PARTS = [  # name, box, base color, metallic, roughness
    ("body", box(0, 0, 0, 0.72, 1.5, 0.08), (0.12, 0.12, 0.14, 1), 0.6, 0.35),
    ("screen", box(0, 0, 0.041, 0.64, 1.38, 0.002), (0.18, 0.35, 0.95, 1), 0.0, 0.15),
    ("camera", box(-0.2, 0.55, -0.05, 0.22, 0.22, 0.03), (0.9, 0.3, 0.2, 1), 0.2, 0.4),
]
ARRAY_BUFFER, ELEMENT_BUFFER, FLOAT, USHORT = 34962, 34963, 5126, 5123

binary, views, accessors = bytearray(), [], []


def view(data, fmt, target=None):
    while len(binary) % 4:
        binary.append(0)
    offset = len(binary)
    for item in data:
        binary.extend(struct.pack(fmt, *item) if isinstance(item, tuple) else struct.pack(fmt, item))
    entry = {"buffer": 0, "byteOffset": offset, "byteLength": len(binary) - offset}
    if target is not None:
        entry["target"] = target
    views.append(entry)
    return len(views) - 1


def accessor(entry):
    accessors.append(entry)
    return len(accessors) - 1


meshes, materials, nodes = [], [], []
for index, (name, (positions, normals, indices), color, metallic, roughness) in enumerate(PARTS):
    bounds = [[fn(p[k] for p in positions) for k in range(3)] for fn in (min, max)]
    position = accessor({"bufferView": view(positions, "<3f", ARRAY_BUFFER), "componentType": FLOAT,
                         "count": len(positions), "type": "VEC3", "min": bounds[0], "max": bounds[1]})
    normal = accessor({"bufferView": view(normals, "<3f", ARRAY_BUFFER), "componentType": FLOAT,
                       "count": len(normals), "type": "VEC3"})
    face = accessor({"bufferView": view(indices, "<H", ELEMENT_BUFFER), "componentType": USHORT,
                     "count": len(indices), "type": "SCALAR"})
    materials.append({"name": name, "pbrMetallicRoughness": {
        "baseColorFactor": list(color), "metallicFactor": metallic, "roughnessFactor": roughness}})
    meshes.append({"name": name, "primitives": [
        {"attributes": {"POSITION": position, "NORMAL": normal}, "indices": face, "material": index}]})
    nodes.append({"name": name, "mesh": index})

# One root over the parts, so a single channel turns the whole phone.
ROOT = len(nodes)
nodes.append({"name": "phone", "children": list(range(ROOT))})

STEPS, SECONDS = 8, 2.0
times = [SECONDS * step / STEPS for step in range(STEPS + 1)]
turns = []
for step in range(STEPS + 1):
    half = math.pi * step / STEPS
    turns.append((0.0, math.sin(half), 0.0, math.cos(half)))
time = accessor({"bufferView": view(times, "<f"), "componentType": FLOAT, "count": len(times),
                 "type": "SCALAR", "min": [times[0]], "max": [times[-1]]})
turn = accessor({"bufferView": view(turns, "<4f"), "componentType": FLOAT, "count": len(turns), "type": "VEC4"})
animations = [{"name": "Spin",
               "samplers": [{"input": time, "output": turn, "interpolation": "LINEAR"}],
               "channels": [{"sampler": 0, "target": {"node": ROOT, "path": "rotation"}}]}]

while len(binary) % 4:
    binary.append(0)
document = {"asset": {"version": "2.0", "generator": "frameboard build-spin.py"}, "scene": 0,
            "scenes": [{"nodes": [ROOT]}], "nodes": nodes, "meshes": meshes, "materials": materials,
            "animations": animations, "accessors": accessors, "bufferViews": views,
            "buffers": [{"byteLength": len(binary)}]}
text = json.dumps(document, separators=(",", ":")).encode()
text += b" " * (-len(text) % 4)
glb = (struct.pack("<4sII", b"glTF", 2, 12 + 8 + len(text) + 8 + len(binary))
       + struct.pack("<I4s", len(text), b"JSON") + text
       + struct.pack("<I4s", len(binary), b"BIN\x00") + bytes(binary))
with open(sys.argv[1], "wb") as out:
    out.write(glb)
print(sys.argv[1], len(glb), "bytes")
