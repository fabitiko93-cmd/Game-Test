# G17 reference-pose review

This directory holds a review candidate, not an activated game profile. No
runtime files, original models, build output or game rules are changed here.
The accepted visual direction must be integrated and checked separately before
it is published. The current close-up review uses the male G17 reference; the
female transfer remains pending this reference review.

`g17-input-reference.json` is the supplied, unchanged workshop export.
`g17-reference-pose.json` records the current candidate's model-space hand
frames, contact anchors and individual finger rotations. Its format is
intentionally different from an importable workshop document.

To reproduce the stored candidate without running the numerical fit again:

```sh
SPERRKREIS_POSE_OUTPUT=/tmp/sperrkreis-g17-review python scripts/fit-g17-surfaces.py --replay
SPERRKREIS_POSE_OUTPUT=/tmp/sperrkreis-g17-review SPERRKREIS_REFERENCE_IMAGE=/path/to/reference.jpeg python scripts/assemble-g17-grip-review.py
```

The reference photograph is supplied separately and is not redistributed in
this repository. `SPERRKREIS_POSE_INPUT` optionally selects another workshop
export. The scripts require the repository's pinned Node dependencies, NumPy,
SciPy and Pillow. Output defaults to `previews/rendered-g17` unless an explicit
output directory is supplied.

The renders use the actual posed/skinned mesh triangles, their original colors,
material sidedness and per-pixel depth. No image-generated substitute models are
used. `analyze-g17-contact.py` checks skin-triangle crossings and sampled surface
distances; nearest-face-normal penetration estimates on open mesh subsets are
diagnostics, not an exact signed-volume test. The fitter uses ray parity to
classify its surface-contact samples.
