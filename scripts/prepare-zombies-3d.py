#!/usr/bin/env python3
"""Retarget the supplied Polyart rigs to self-contained, continuously animated GLBs.

python scripts/prepare-zombies-3d.py /path/to/original.glb
Keeps original geometry, UVs, texture, weights and authored skeletal key times.
Requires numpy and Pillow, like prepare-zombies.py. No vertex/sprite baking.
"""
import argparse
import copy
import gzip
import hashlib
import importlib.util
import json
import math
import re
import struct
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("zombie_source", ROOT / "scripts/prepare-zombies.py")
source = importlib.util.module_from_spec(spec)
spec.loader.exec_module(source)


class Document:
    def __init__(self):
        self.data = bytearray()
        self.cache = {}
        self.g = dict(asset={"version": "2.0", "generator": "SPERRKREIS 98 skeletal retargeter"},
                      scene=0, scenes=[{"nodes": [0]}], nodes=[], meshes=[], skins=[],
                      animations=[], accessors=[], bufferViews=[], buffers=[])

    def view(self, data):
        while len(self.data) % 4:
            self.data.append(0)
        index = len(self.g["bufferViews"])
        self.g["bufferViews"].append(dict(buffer=0, byteOffset=len(self.data), byteLength=len(data)))
        self.data.extend(data)
        return index

    def accessor(self, values, kind, component=5126):
        dtype = {5126: "<f4", 5123: "<u2", 5125: "<u4"}[component]
        values = np.asarray(values, dtype=dtype)
        if values.ndim == 1:
            values = values.reshape(-1, 1)
        data = values.tobytes()
        key = (kind, component, data)
        if key not in self.cache:
            record = dict(bufferView=self.view(data), componentType=component,
                          count=len(values), type=kind)
            if kind in ("SCALAR", "VEC3"):
                record.update(min=values.min(axis=0).astype(float).tolist(),
                              max=values.max(axis=0).astype(float).tolist())
            self.cache[key] = len(self.g["accessors"])
            self.g["accessors"].append(record)
        return self.cache[key]

    def bytes(self):
        while len(self.data) % 4:
            self.data.append(0)
        self.g["buffers"] = [{"byteLength": len(self.data)}]
        js = json.dumps(self.g, separators=(",", ":"), allow_nan=False).encode()
        js += b" " * (-len(js) % 4)
        return (struct.pack("<III", 0x46546C67, 2, 28 + len(js) + len(self.data))
                + struct.pack("<II", len(js), 0x4E4F534A) + js
                + struct.pack("<II", len(self.data), 0x004E4942) + self.data)


def original_world(pack, node, time=0, cache=None):
    cache = {} if cache is None else cache
    if node not in cache:
        n = pack.nodes[node]
        local = np.array(n["matrix"]).reshape(4, 4).T if "matrix" in n else source.trs(
            pack.sample(node, "translation", time), pack.sample(node, "rotation", time),
            pack.sample(node, "scale", time))
        cache[node] = original_world(pack, pack.parents[node], time, cache) @ local if node in pack.parents else local
    return cache[node]


def retarget_translation(pack, target, authored, path, node, time):
    dst, src = pack.skins[target], pack.skins[authored]
    t = pack.sample(node, "translation", time)
    length = src["lengths"][path]
    return t * (dst["lengths"][path] / length if length > .001 and path.count("/") > 1
                else dst["hip"] / src["hip"])


def gait_distance(pack, target, authored):
    """Sum backward sole travel for both feet, including every step in a take.

    Walk contains TWO full gait cycles; treating its whole duration as one step
    caused incorrect cadence estimates. Measurements remain in source metres.
    """
    dst, src = pack.skins[target], pack.skins[authored]
    feet = [p for p, n in src["paths"].items() if re.search(r"bip [LR] Foot", pack.nodes[n]["name"])]
    yaw = -pack.motion_yaws[authored]
    rotation = np.array([[math.cos(yaw), 0, math.sin(yaw)], [0, 1, 0], [-math.sin(yaw), 0, math.cos(yaw)]])
    samples = []
    # Retargeted bone positions, not a nominal human stride or sprite width.
    basis = original_world(pack, dst["root"])
    basis[:3, 3] = 0
    for time in np.linspace(0, source.PERIODS[authored], 257):
        local, world = {}, {}
        for path, n in dst["paths"].items():
            if path not in src["paths"]:
                local[n] = source.trs(*pack.defaults[n]); continue
            sn = src["paths"][path]
            t = retarget_translation(pack, target, authored, path, sn, time)
            local[n] = source.trs(t, pack.sample(sn, "rotation", time), pack.defaults[n][2])
        def w(n):
            if n not in world:
                parent = pack.parents.get(n)
                world[n] = (w(parent) if parent in local else basis) @ local[n]
            return world[n]
        hip = w(dst["joints"][1])[:3, 3]
        samples.append([(rotation @ (w(dst["paths"][p])[:3, 3] - hip))[2] for p in feet])
    return float(np.maximum(0, -np.diff(samples, axis=0)).sum())


def export_variant(pack, variant):
    doc = Document(); g = doc.g
    dst = pack.skins[variant]
    reference = pack.pose(variant, 2, 0)[0]
    min_y, max_y = float(reference[:, 1].min()), float(reference[:, 1].max())
    g["nodes"] = [dict(name=f"variant_{variant}", children=[1], translation=[0, -min_y, 0]),
                  dict(name=f"v{variant}_heading", children=[2]), dict(name=f"v{variant}_armature", children=[3])]
    basis = original_world(pack, dst["root"]); basis[:3, 3] = 0
    g["nodes"][2]["matrix"] = basis.T.reshape(-1).tolist()
    mapping = {node: i + 3 for i, node in enumerate(dst["joints"])}
    for node in dst["joints"]:
        t, q, s = pack.defaults[node]
        g["nodes"].append(dict(name=f"v{variant}_bone{node}", translation=t.tolist(), rotation=q.tolist(),
                               scale=s.tolist(), children=[mapping[c] for c in pack.nodes[node].get("children", []) if c in mapping]))
    inverse = doc.accessor(dst["inverse"].transpose(0, 2, 1).reshape(-1, 16), "MAT4")
    g["skins"] = [dict(joints=[mapping[n] for n in dst["joints"]], skeleton=mapping[dst["root"]], inverseBindMatrices=inverse)]
    for mesh in pack.meshes:
        if mesh["skin"] != variant:
            continue
        attributes = {}
        for name, array in mesh["attrs"].items():
            kind = {2: "VEC2", 3: "VEC3", 4: "VEC4"}[array.shape[1]]
            attributes[name] = doc.accessor(array, kind, 5123 if name == "JOINTS_0" else 5126)
        index = doc.accessor(mesh["indices"].reshape(-1), "SCALAR", 5123)
        g["nodes"][0]["children"].append(len(g["nodes"]))
        g["nodes"].append(dict(name=f"v{variant}_mesh{len(g['meshes'])}", mesh=len(g["meshes"]), skin=0))
        g["meshes"].append(dict(primitives=[dict(attributes=attributes, indices=index, material=0)]))
    image = pack.g["bufferViews"][pack.g["images"][0]["bufferView"]]
    offset = image.get("byteOffset", 0)
    g["images"] = [dict(bufferView=doc.view(pack.binary[offset:offset + image["byteLength"]]), mimeType="image/png")]
    for key in ("materials", "textures", "samplers"):
        if key in pack.g:
            g[key] = copy.deepcopy(pack.g[key])
    clips = {}
    for name, authored in source.assignments(variant).items():
        src = pack.skins[authored]
        attack = name.startswith("attack")
        duration = source.ATTACK_DURATION if attack else source.PERIODS[authored]
        start = source.ATTACK_SOURCE_HIT - source.ATTACK_HIT if attack else 0
        def playback_time(t):
            if not attack: return t
            return t - start if t <= source.ATTACK_SOURCE_HIT else (source.ATTACK_HIT
                + (t-source.ATTACK_SOURCE_HIT)/(source.PERIODS[authored]-source.ATTACK_SOURCE_HIT)
                * (duration-source.ATTACK_HIT))
        times = {0., duration}
        if attack: times.add(source.ATTACK_HIT)
        for node in src["joints"]:
            for path in ("translation", "rotation"):
                if (node, path) in pack.tracks:
                    times.update(playback_time(float(t)) for t in pack.tracks[node, path][0]
                                 if start < t < source.PERIODS[authored])
        times = np.array(sorted(times), dtype=float)
        animation = dict(name=name, samplers=[], channels=[])
        def track(node, path, values):
            values = np.array(values)
            constant = np.max(np.abs(values - values[0])) < 1e-6
            ti = times[:1] if constant else times
            va = values[:1] if constant else values
            sampler = len(animation["samplers"])
            animation["samplers"].append(dict(input=doc.accessor(ti, "SCALAR"),
                output=doc.accessor(va, "VEC4" if path == "rotation" else "VEC3"), interpolation="LINEAR"))
            animation["channels"].append(dict(sampler=sampler, target=dict(node=node, path=path)))
        # Clip-specific anatomical heading correction participates in pose blending.
        yaw = -pack.motion_yaws.get(authored, 0)
        track(1, "rotation", [[0, math.sin(yaw/2), 0, math.cos(yaw/2)]] * len(times))
        for path, node in dst["paths"].items():
            if path not in src["paths"]: continue
            sn = src["paths"][path]
            translations, rotations = [], []
            initial = retarget_translation(pack, variant, authored, path, sn, 0)
            for t in times:
                st = source.source_time(name, authored, float(t/duration))
                tv = retarget_translation(pack, variant, authored, path, sn, st)
                q = pack.sample(sn, "rotation", st)
                if authored in (2, 3, 4) and t > duration * .85:
                    f = (t/duration-.85)/.15; f = f*f*(3-2*f)
                    tv = tv*(1-f)+initial*f
                    q0 = pack.sample(sn, "rotation", 0)
                    if q @ q0 < 0: q0 = -q0
                    q = q*(1-f)+q0*f; q /= np.linalg.norm(q)
                # Author's rigs are Z-up locally; navigation owns horizontal travel.
                if node == dst["joints"][1]: tv[:2] = initial[:2]
                translations.append(tv); rotations.append(q)
            track(mapping[node], "translation", translations)
            track(mapping[node], "rotation", rotations)
        g["animations"].append(animation)
        clips[name] = dict(duration=round(duration, 8), source=source.SOURCES[authored])
        if authored in pack.motion_yaws:
            clips[name]["distance"] = round(gait_distance(pack, variant, authored), 8)
        if attack: clips[name]["hitTime"] = source.ATTACK_HIT
    return doc.bytes(), dict(referenceHeight=round(max_y-min_y, 8), groundOffset=round(-min_y, 8), clips=clips)


def main():
    parser = argparse.ArgumentParser(description=__doc__); parser.add_argument("glb")
    args = parser.parse_args(); pack = source.Pack(args.glb)
    output = ROOT / "docs/assets/zombies3d"; output.mkdir(parents=True, exist_ok=True)
    manifest = dict(version=1, sourceSha256=pack.sha, author="Denys Almaral", variants=[])
    retained = set()
    for variant in range(10):
        raw, meta = export_variant(pack, variant)
        data = gzip.compress(raw, compresslevel=9, mtime=0)
        filename = f"{variant}-{hashlib.sha256(data).hexdigest()[:12]}.glb.gz"
        (output / filename).write_bytes(data); retained.add(filename)
        manifest["variants"].append(dict(file=filename, **meta))
        print(variant, len(data), {k: v.get("distance") for k, v in meta["clips"].items() if "distance" in v}, flush=True)
    (output / "models.json").write_text(json.dumps(manifest, indent=2)+"\n")
    for file in list(output.glob("*.glb")) + list(output.glob("*.glb.gz")):
        if file.name not in retained: file.unlink()


if __name__ == "__main__":
    main()
