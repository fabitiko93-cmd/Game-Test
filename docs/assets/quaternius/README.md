# Quaternius models

Creator: Quaternius. License: CC0-1.0; original text in `LICENSE.txt`.

- Ultimate Modular Men (February 2022): 11 characters.
- Ultimate Modular Women (April 2022): 10 characters.
- Ultimate House Interior (June 2020): 123 furnishing models.

The creator's character pages are https://quaternius.com/packs/ultimatemodularcharacters.html
and https://quaternius.com/packs/ultimatemodularwomen.html. The character downloads
were obtained from the CC0 mirror https://github.com/agentkaerf/FreeModels at tree
`db3df04d1e4714298a09510b26fb6de6645138a2` because the linked Drive downloads
were over quota. Each downloaded source matched its mirror Git blob SHA.
The interior ZIP is the creator's publication at
https://opengameart.org/content/lowpoly-house-interior-pack.
Per-source SHA-256 hashes and original filenames are in `models.json`.

## Preparation and scale

Run `python scripts/prepare-quaternius.py /path/to/quaternius-source`, followed by
`node scripts/measure-quaternius.mjs`. The source directory contains `male/*.gltf`,
`female/*.gltf`, and `interior/**/*.obj` with matching MTL files. Python requires NumPy.

GLB containers retain the original character geometry, material colours, separate
clothing meshes, skeletons and all 24 animation clips without frame reduction.
Gzip is lossless; output names contain content hashes. No external textures are needed.
Head, torso, legs and feet share a posed skeleton and remain individually replaceable
within the same male/female rig family. A fixed reference scale per family prevents
changing a hat or clothing item from resizing the entire person.

Male reference height is 1.80 m, female 1.68 m; hats and hairstyles may extend above
the reference head. Foot travel is measured from the actual Walk/Run animations
and scaled into metres to drive animation from travelled distance. The source has
no sneak clip: a reversible two-bone leg IK overlay lowers the pelvis and keeps
the animated feet in place. Death uses the original Death clip.

General furniture uses 0.5 metres per original OBJ unit (single bed 1.97 m long).
The fridge is calibrated to 0.60 × 0.665 × 1.86 m (width/depth/height).
Door leaves are 0.86 × 0.04 × 1.985 m; handle relief is retained outside panel
thickness. Double leaves are 1.72 m wide. All models are centred horizontally and
grounded at y=0. Inverse-transpose normals follow any nonuniform scale.
World furniture footprints and render heights come from these same measured assets.
Lockers combine the supplied shelf with a fitted door; counters repeat three
kitchen drawer units. The current eight furnishing categories use the pack;
the full library is included for later building interiors.

Player, zombies and cached furniture share a single WebGL context and the world's
2:1 orthographic projection. Static furniture renders once at device resolution.
Without WebGL the new material-colour models render their actual posed triangles
on Canvas; this is not a reduced-frame animation atlas. Existing zombie fallbacks
remain separate. Knife, pistol and backpack use supplied meshes; the other existing
weapons use small distinct metric silhouettes attached to the animated wrist.
