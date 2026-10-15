#!/usr/bin/env python3
"""Bake the supplied Denys Almaral GLB into Canvas sprites. Requires numpy, Pillow.

Usage: python scripts/prepare-zombies.py /path/to/original.glb
The input is data only; no embedded scripts are executed. See assets/zombies/README.md.
"""
import argparse
import hashlib
import io
import json
import math
import re
import struct
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

WIDTH, HEIGHT, ANCHOR, SCALE = 80, 88, (40, 72), 34
# Baked camera rows are not world-heading octants. In particular, the old
# direct row lookup mirrored headings across a diagonal (backwards pursuit).
DIRECTION_ROWS = [6, 5, 4, 3, 2, 1, 0, 7]
ATTACK_DURATION, ATTACK_HIT, ATTACK_SOURCE_HIT = 1.4, .28, .9
# The single Take contains ten independent actions on ten different rigs.
SOURCES = ["attack_left", "attack_right", "idle", "idle2_alert", "idle3",
           "running", "slowWalk", "Walk", "Walk_Agressive", "Walk2_limp"]
PERIODS = [70 / 30, 70 / 30, 221 / 30, 221 / 30, 221 / 30,
           58 / 30, 85 / 30, 64 / 30, 64 / 30, 60 / 30]
DTYPES = {5120: "i1", 5121: "u1", 5122: "<i2", 5123: "<u2", 5125: "<u4", 5126: "<f4"}
SIZES = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}


def trs(t, q, s):
    x, y, z, w = q / np.linalg.norm(q)
    m = np.eye(4)
    m[:3, :3] = np.array([
        [1 - 2*(y*y+z*z), 2*(x*y-z*w), 2*(x*z+y*w)],
        [2*(x*y+z*w), 1 - 2*(x*x+z*z), 2*(y*z-x*w)],
        [2*(x*z-y*w), 2*(y*z+x*w), 1 - 2*(x*x+y*y)],
    ]) * s
    m[:3, 3] = t
    return m


class Pack:
    def __init__(self, filename):
        data = Path(filename).read_bytes()
        assert struct.unpack_from("<III", data) == (0x46546C67, 2, len(data)), "Expected GLB 2"
        size, kind = struct.unpack_from("<II", data, 12)
        assert kind == 0x4E4F534A
        self.g = json.loads(data[20:20+size])
        bsize, kind = struct.unpack_from("<II", data, 20+size)
        assert kind == 0x004E4942
        self.binary = data[28+size:28+size+bsize]
        self.sha = hashlib.sha256(data).hexdigest()
        self.nodes = self.g["nodes"]
        self.parents = {c: i for i, n in enumerate(self.nodes) for c in n.get("children", [])}
        self.defaults = [(np.array(n.get("translation", [0, 0, 0]), dtype=float),
                          np.array(n.get("rotation", [0, 0, 0, 1]), dtype=float),
                          np.array(n.get("scale", [1, 1, 1]), dtype=float)) for n in self.nodes]
        self.tracks = {}
        a = self.g["animations"][0]
        for ch in a["channels"]:
            sam = a["samplers"][ch["sampler"]]
            assert sam.get("interpolation", "LINEAR") == "LINEAR"
            self.tracks[ch["target"]["node"], ch["target"]["path"]] = (
                self.accessor(sam["input"]).ravel(), self.accessor(sam["output"]))
        self.skins = []
        for skin in self.g["skins"]:
            joints = skin["joints"]
            inverse = self.accessor(skin["inverseBindMatrices"]).reshape(-1, 4, 4).transpose(0, 2, 1)
            bind = np.linalg.inv(inverse)
            by_node = {j: k for k, j in enumerate(joints)}
            paths = {}
            # Numerical suffixes differ between rigs, including Spine/Finger names.
            # Ancestry + sibling order preserves the two spine/finger chains.
            def visit(i, path):
                paths[path] = i
                counts = {}
                for child in self.nodes[i].get("children", []):
                    if child not in by_node:
                        continue
                    name = re.sub(r"[\d_]", "", self.nodes[child]["name"])
                    occurrence = counts.get(name, 0)
                    counts[name] = occurrence + 1
                    visit(child, path + "/" + name + str(occurrence))
            visit(skin["skeleton"], "root")
            lengths = {}
            for path, node in paths.items():
                parent = self.parents.get(node)
                lengths[path] = np.linalg.norm((inverse[by_node[parent]] @ bind[by_node[node]])[:3, 3]) if parent in by_node else 0
            self.skins.append(dict(joints=joints, inverse=inverse, paths=paths, lengths=lengths,
                                   hip=abs(bind[2, 1, 3]), root=skin["skeleton"]))
        v = self.g["bufferViews"][self.g["images"][0]["bufferView"]]
        self.texture = np.asarray(Image.open(io.BytesIO(self.binary[v.get("byteOffset", 0):v.get("byteOffset", 0)+v["byteLength"]])).convert("RGB"))
        self.meshes = []
        for node in self.nodes:
            if "skin" not in node or "mesh" not in node:
                continue  # Excludes the display logo.
            for p in self.g["meshes"][node["mesh"]]["primitives"]:
                attrs = {key: self.accessor(value) for key, value in p["attributes"].items()}
                idx = self.accessor(p["indices"]).reshape(-1, 3).astype(int)
                uv = attrs["TEXCOORD_0"][idx].mean(axis=1)
                tex = self.texture
                colors = tex[np.clip((uv[:, 1]*tex.shape[0]).astype(int), 0, tex.shape[0]-1),
                             np.clip((uv[:, 0]*tex.shape[1]).astype(int), 0, tex.shape[1]-1)]
                self.meshes.append(dict(skin=node["skin"], attrs=attrs, indices=idx, colors=colors))
        # The walk/limp takes themselves also have a different anatomical
        # forward axis. Calibrate against both feet over the whole authored
        # gait; a biped-root quaternion alone is not the character's facing.
        self.motion_yaws = {source: self.motion_yaw(source) for source in (6, 7, 9)}

    def accessor(self, i):
        a = self.g["accessors"][i]
        v = self.g["bufferViews"][a["bufferView"]]
        dt, size = np.dtype(DTYPES[a["componentType"]]), SIZES[a["type"]]
        return np.ndarray((a["count"], size), dt, self.binary,
                          a.get("byteOffset", 0)+v.get("byteOffset", 0),
                          strides=(v.get("byteStride", size*dt.itemsize), dt.itemsize)).copy()

    def sample(self, node, path, time):
        if (node, path) not in self.tracks:
            return self.defaults[node][["translation", "rotation", "scale"].index(path)].copy()
        times, values = self.tracks[node, path]
        if len(times) == 1:
            return values[0].copy()
        k = max(0, min(int(np.searchsorted(times, time, side="right"))-1, len(times)-2))
        f = float(np.clip((time-times[k])/(times[k+1]-times[k]), 0, 1))
        a, b = values[k], values[k+1]
        if path == "rotation":
            dot = float(a @ b)
            if dot < 0:
                b, dot = -b, -dot
            if dot < .9995:
                angle = math.acos(min(1, dot))
                return (a*math.sin((1-f)*angle)+b*math.sin(f*angle))/math.sin(angle)
        out = a*(1-f)+b*f
        return out / np.linalg.norm(out) if path == "rotation" else out

    def motion_yaw(self, source):
        skin = self.skins[source]
        feet = [node for node in skin["joints"] if re.search(r"bip [LR] Foot", self.nodes[node]["name"])]
        samples = []
        for time in np.linspace(0, PERIODS[source], 32, endpoint=False):
            matrices = {}
            def world(i):
                if i not in matrices:
                    n = self.nodes[i]
                    local = np.array(n["matrix"]).reshape(4, 4).T if "matrix" in n else trs(
                        self.sample(i, "translation", time), self.sample(i, "rotation", time), self.sample(i, "scale", time))
                    matrices[i] = world(self.parents[i]) @ local if i in self.parents else local
                return matrices[i]
            for foot in feet:
                toe = next(i for i in self.nodes[foot]["children"] if "Toe" in self.nodes[i]["name"])
                forward = (world(toe)[:3, 3]-world(foot)[:3, 3])[[0, 2]]
                samples.append(forward / max(np.linalg.norm(forward), 1e-9))
        forward = np.mean(samples, axis=0)
        return math.atan2(forward[0], forward[1])

    def pose(self, target, source, time):
        dst, src = self.skins[target], self.skins[source]
        local = {}
        ratio = dst["hip"] / src["hip"]
        for path, node in dst["paths"].items():
            if path not in src["paths"]:
                continue  # Hair-specific joints keep their own bind/default pose.
            original = src["paths"][path]
            t = self.sample(original, "translation", time)
            q = self.sample(original, "rotation", time)
            if source in (2, 3, 4) and time > PERIODS[source] * .85:
                f = (time/PERIODS[source]-.85)/.15
                f = f*f*(3-2*f)
                t = t*(1-f) + self.sample(original, "translation", 0)*f
                start = self.sample(original, "rotation", 0)
                if q @ start < 0:
                    start = -start
                q = q*(1-f)+start*f
            length = src["lengths"][path]
            t *= dst["lengths"][path] / length if length > .001 and path.count("/") > 1 else ratio
            local[node] = trs(t, q, self.defaults[node][2])
        world = {}
        def global_matrix(i):
            if i not in world:
                n = self.nodes[i]
                m = local.get(i)
                if m is None:
                    m = np.array(n["matrix"]).reshape(4, 4).T if "matrix" in n else trs(*self.defaults[i])
                world[i] = global_matrix(self.parents[i]) @ m if i in self.parents else m
            return world[i]
        palette = np.array([global_matrix(i) for i in dst["joints"]]) @ dst["inverse"]
        root = global_matrix(dst["root"])[:3, 3].copy()
        # Remove horizontal locomotion in the animation; navigation owns position.
        bip = dst["joints"][1]
        initial_bip_t = self.sample(src["joints"][1], "translation", 0) * ratio
        parent = global_matrix(self.parents[bip])
        initial_bip = parent @ np.append(initial_bip_t, 1)
        drift = global_matrix(bip)[:3, 3] - initial_bip[:3]
        root[[0, 2]] += drift[[0, 2]]
        root[1] = 0
        vertices, indices, colors = [], [], []
        count = 0
        for mesh in self.meshes:
            if mesh["skin"] != target:
                continue
            a = mesh["attrs"]
            p = np.column_stack((a["POSITION"], np.ones(len(a["POSITION"]))))
            transforms = np.sum(palette[a["JOINTS_0"].astype(int)] * a["WEIGHTS_0"][:, :, None, None], axis=1)
            v = np.einsum("nij,nj->ni", transforms, p)[:, :3] - root
            vertices.append(v)
            indices.append(mesh["indices"] + count)
            colors.append(mesh["colors"])
            count += len(v)
        vertices = np.concatenate(vertices)
        if source in self.motion_yaws:
            angle = -self.motion_yaws[source]
            c, s = math.cos(angle), math.sin(angle)
            vertices = vertices @ np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]]).T
        return vertices, np.concatenate(indices), np.concatenate(colors)


def view_basis(row):
    angle = row*math.pi/4
    c, s = math.cos(angle), math.sin(angle)
    rotation = np.array([[-c, 0, -s], [0, 1, 0], [s, 0, -c]])
    right = np.array([1, 0, -1]) / math.sqrt(2)
    camera = np.array([math.sqrt(.4), math.sqrt(.2), math.sqrt(.4)])
    up = np.cross(camera, right)
    return rotation, right, camera, up


def raster(pose, row, supersample=2):
    vertices, indices, colors = pose
    rotation, right, camera, up = view_basis(row)
    v = vertices @ rotation.T
    points = np.column_stack((v @ right*SCALE + ANCHOR[0], -v @ up*SCALE + ANCHOR[1])) * supersample
    triangles = v[indices]
    normal = np.cross(triangles[:, 1]-triangles[:, 0], triangles[:, 2]-triangles[:, 0])
    normal /= np.maximum(np.linalg.norm(normal, axis=1)[:, None], 1e-9)
    normal *= np.where(normal @ camera < 0, -1, 1)[:, None]
    light = np.array([-.3, .85, .45]); light /= np.linalg.norm(light)
    shade = .57 + .43*np.maximum(0, normal @ light)
    colors = np.clip(colors*shade[:, None], 0, 255).astype(np.uint8)
    depth = triangles.mean(axis=1) @ camera
    image = Image.new("RGBA", (WIDTH*supersample, HEIGHT*supersample))
    draw = ImageDraw.Draw(image)
    for k in np.argsort(depth, kind="stable"):
        draw.polygon([tuple(p) for p in points[indices[k]]], fill=tuple(colors[k])+(255,))
    return image.resize((WIDTH, HEIGHT), Image.Resampling.LANCZOS)


def assignments(variant):
    return {"rest": 2 if variant % 2 == 0 else 4, "alert": 3,
            "shuffle": 9 if variant % 3 == 0 else 6,
            "walk": 7,
            "attack_left": 0, "attack_right": 1}


def source_time(name, source, progress):
    if not name.startswith("attack"):
        return PERIODS[source]*progress
    # Skip the long inactive lead-in instead of fast-forwarding the whole
    # gesture 3.2x. Authored-speed windup, then a much calmer recovery.
    playback = progress*ATTACK_DURATION
    if playback <= ATTACK_HIT:
        return ATTACK_SOURCE_HIT-ATTACK_HIT+playback
    return ATTACK_SOURCE_HIT + (playback-ATTACK_HIT)/(ATTACK_DURATION-ATTACK_HIT)*(PERIODS[source]-ATTACK_SOURCE_HIT)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("glb")
    parser.add_argument("--output", default=str(Path(__file__).resolve().parents[1]/"docs/assets/zombies"))
    parser.add_argument("--preview", action="store_true")
    parser.add_argument("--clips", nargs="+", help="Rebake only these clips, retaining the others from the existing atlas")
    args = parser.parse_args()
    pack = Pack(args.glb)
    output = Path(args.output); output.mkdir(parents=True, exist_ok=True)
    previous = json.loads((output/"atlas.json").read_text()) if (output/"atlas.json").exists() else None
    if args.preview:
        sheet = Image.new("RGB", (10*WIDTH, 8*HEIGHT), "#27362d")
        for variant in range(10):
            for row, (name, source) in enumerate(assignments(variant).items()):
                image = raster(pack.pose(variant, source, source_time(name, source, .3)), DIRECTION_ROWS[1])
                sheet.paste(image, (variant*WIDTH, row*HEIGHT), image)
                ImageDraw.Draw(sheet).text((variant*WIDTH+2, row*HEIGHT+1), name, fill="white")
        sheet.save(output/"preview.png")
        return
    forwards = []
    for row in range(8):
        rotation, right, _, up = view_basis(row)
        forward = rotation @ np.array([0, 0, 1])
        forwards.append([round(float(forward @ right), 6), round(float(-forward @ up), 6)])
    meta = {"version": 2, "sourceSha256": pack.sha, "author": "Denys Almaral",
            "source": "https://sketchfab.com/3d-models/polyart-zombies-with-animations-free-pack-d9bcfdd88f5348549bc947226af7c314",
            "width": WIDTH, "height": HEIGHT,
            "anchor": list(ANCHOR), "scale": 1.5, "directions": 8,
            "directionRows": DIRECTION_ROWS, "viewForwards": forwards, "variants": []}
    for variant in range(10):
        clips = {}
        for name, source in assignments(variant).items():
            if args.clips and name not in args.clips:
                clips[name] = previous["variants"][variant][name].copy()
                old_file = output/clips[name]["file"]
                content = old_file.read_bytes()
                filename = f"{variant}-{name}-{hashlib.sha256(content).hexdigest()[:10]}.png"
                (output/filename).write_bytes(content)
                clips[name]["file"] = filename
                continue
            frames = 20 if name.startswith("attack") or name in ("rest", "alert") else 16
            period = PERIODS[source]
            sheet = Image.new("RGBA", (WIDTH*frames, HEIGHT*8))
            for frame in range(frames):
                pose = pack.pose(variant, source, source_time(name, source, frame/frames))
                for direction in range(8):
                    image = raster(pose, direction)
                    # Nonzero alpha at the border indicates an incorrectly anchored/cropped model.
                    alpha = np.asarray(image)[:, :, 3]
                    assert max(alpha[0].max(), alpha[-1].max(), alpha[:, 0].max(), alpha[:, -1].max()) < 12, (variant, name, frame, direction)
                    sheet.paste(image, (frame*WIDTH, direction*HEIGHT))
            # Palette compression keeps all sheets small; fully transparent pixels share index 0.
            encoded = io.BytesIO()
            sheet.quantize(colors=192, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE).save(encoded, format="PNG", optimize=True)
            content = encoded.getvalue()
            filename = f"{variant}-{name}-{hashlib.sha256(content).hexdigest()[:10]}.png"
            (output/filename).write_bytes(content)
            clips[name] = {"file": filename, "frames": frames, "source": SOURCES[source], "sourceDuration": round(period, 6)}
            if source in pack.motion_yaws:
                clips[name]["sourceYawCorrection"] = round(-math.degrees(pack.motion_yaws[source]), 6)
            if name.startswith("attack"):
                clips[name].update(playbackDuration=ATTACK_DURATION, hitTime=ATTACK_HIT, hitFrame=4,
                                   sourceStart=ATTACK_SOURCE_HIT-ATTACK_HIT, sourceHit=ATTACK_SOURCE_HIT)
            print(variant, name, (output/filename).stat().st_size, flush=True)
        meta["variants"].append(clips)
    (output/"atlas.json").write_text(json.dumps(meta, separators=(",", ":"))+"\n")
    retained = {clip["file"] for variant in meta["variants"] for clip in variant.values()}
    for file in output.glob("*.png"):
        if file.name not in retained and re.fullmatch(r"\d+-(rest|alert|shuffle|walk|run|attack_left|attack_right)(-[0-9a-f]{10})?\.png", file.name):
            file.unlink()


if __name__ == "__main__":
    main()
