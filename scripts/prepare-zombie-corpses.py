#!/usr/bin/env python3
"""Bake prone original zombie meshes for the existing no-WebGL fallback.

python scripts/prepare-zombie-corpses.py /path/to/original.glb
The real-time renderer uses the same frozen rest pose, laid on its back.
"""
import argparse
import hashlib
import importlib.util
import io
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("zombie_source", ROOT / "scripts/prepare-zombies.py")
source = importlib.util.module_from_spec(spec)
spec.loader.exec_module(source)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("glb")
    args = parser.parse_args()
    pack = source.Pack(args.glb)
    source.WIDTH, source.HEIGHT, source.ANCHOR = 96, 64, (48, 36)
    old_basis = source.view_basis

    def basis(row):
        rotation, right, _, _ = old_basis(row)
        camera = np.array([math.sqrt(.375), .5, math.sqrt(.375)])
        return rotation, right, camera, np.cross(camera, right)

    source.view_basis = basis
    output = ROOT / "docs/assets/zombies"
    metadata = dict(width=source.WIDTH, height=source.HEIGHT, anchor=list(source.ANCHOR),
                    pixelsPerMeter=source.SCALE, directionRows=source.DIRECTION_ROWS, variants=[])
    retained = set()
    for variant in range(10):
        vertices, indices, colors = pack.pose(variant, source.assignments(variant)["rest"], 0)
        # Rotation about local X by -90 degrees, then centre on the ground.
        vertices = vertices[:, [0, 2, 1]].copy()
        vertices[:, 2] *= -1
        vertices[:, [0, 2]] -= (vertices[:, [0, 2]].min(axis=0) + vertices[:, [0, 2]].max(axis=0)) / 2
        vertices[:, 1] -= vertices[:, 1].min()
        sheet = Image.new("RGBA", (source.WIDTH, source.HEIGHT*8))
        for row in range(8):
            image = source.raster((vertices, indices, colors), row)
            alpha = np.asarray(image)[:, :, 3]
            assert max(alpha[0].max(), alpha[-1].max(), alpha[:, 0].max(), alpha[:, -1].max()) < 12
            sheet.paste(image, (0, row*source.HEIGHT))
        encoded = io.BytesIO()
        sheet.quantize(colors=192, method=Image.Quantize.FASTOCTREE,
                       dither=Image.Dither.NONE).save(encoded, format="PNG", optimize=True)
        content = encoded.getvalue()
        filename = f"{variant}-corpse-{hashlib.sha256(content).hexdigest()[:10]}.png"
        (output / filename).write_bytes(content)
        metadata["variants"].append(dict(file=filename))
        retained.add(filename)
        print(variant, len(content), flush=True)
    (output / "corpses.json").write_text(json.dumps(metadata, separators=(",", ":"))+"\n")
    for file in output.glob("*-corpse-*.png"):
        if file.name not in retained:
            file.unlink()


if __name__ == "__main__":
    main()
