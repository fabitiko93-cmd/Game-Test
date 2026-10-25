# G17 reference-pose review

## Review 05: support hand, awaiting review

The user approved the right firing hand in review 04 on 2026-10-25. Review 05
adds the support hand around that fixed reference. Its left-hand skin, thumb
and adjacent finger contacts were inspected separately. The approved firing
hand skin and prop do not move; both the authoring guard and the recorded skin
comparison check this. A reference content hash and rig check prevent using a
silently changed firing-hand study. The original user elbow direction remains
the preferred pole; its reached plane adjusts to the wrist limits.

`g17-support-hand-pose.json` is the new left-hand draft, and
`g17-support-hand-review.json` records the actual left-bone rotations and checks.
The combined grip is still awaiting approval. No runtime changes or publishing
are included. Small skin contact overlaps remain; this is not a collision-free
certificate, a female-rig transfer or a validated animation transition.

```sh
SPERRKREIS_SUPPORT_HAND=previews/g17-support-hand-pose.json SPERRKREIS_POSE_OUTPUT=/tmp/sperrkreis-g17-grip node scripts/preview-g17-reference.mjs
python scripts/render-g17-grip-review.py /tmp/sperrkreis-g17-grip/male-both-hands-mesh.json --output /tmp/Sperrkreis_G17_Beide_Haende_Vorschau_05.png
```

The review sheet contains five natural-color views and one clearly marked hand
ID view: blue is the approved firing hand, orange is the support-hand draft.

## Review 04: firing hand only

`g17-firing-hand-pose.json` is the visually approved male G17 firing-hand study.
The support hand is excluded from its renders. Individual finger arcs are
authored in anatomical flexion planes, independently of the arm IK. The
thumb has its own joint directions. Arm fitting must reach the palm anchor;
an unreachable target retreats the prop without stretching the skeleton.
`g17-firing-hand-review.json` records the reached right-bone rotations and
checks against the original rig, including the adjacent finger skin surfaces.
Small skin/object contact overlaps remain; this is not a collision-free
certificate or an approved whole-body/animation pose.

```sh
SPERRKREIS_FIRING_HAND=previews/g17-firing-hand-pose.json SPERRKREIS_POSE_OUTPUT=/tmp/sperrkreis-g17-right node scripts/preview-g17-reference.mjs
python scripts/render-g17-firing-hand.py /tmp/sperrkreis-g17-right/male-firing-hand-mesh.json --output /tmp/Sperrkreis_G17_Waffenhand_Vorschau_04.png
```

The close-ups use the original posed skin, material colors and skinned vertex
normals, with per-pixel depth. The earlier renderer used flat face normals
instead. No replacement hand mesh, altered bone lengths or generated image is
used. Runtime, source assets and published files are unchanged.

## Rejected review 03

The user rejected review 03 on 2026-10-25. The stored pose must not be used as an
approved reference or integrated into the game. Its hand and finger shapes are
visibly unnatural despite the surface-contact measurements. The original rigs
have individual finger joints; the current fitting objective does not adequately
constrain hand shape. A replacement must first establish a visually credible
firing hand by itself, then fit and inspect the support hand from both sides.

This directory retains the rejected attempt for reproduction. No
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
