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

Then run `node scripts/prepare-player-animations.mjs /path/to/UAL1_Standard.glb`
with the non-root-motion GLB from Quaternius Universal Animation Library Standard:
https://quaternius.itch.io/universal-animation-library (free download, CC0).
`player-animations.json` records the source hash and original clip names.
Additional animation credits: Quaternius and Gonzalo Furnier; see `ANIMATION-LICENSE.txt`.

Rifle upper-body motion comes from Kay Lousberg's **KayKit Character Animations
FREE 1.1**, https://kaylousberg.itch.io/kaykit-character-animations, CC0;
see `KAYKIT-LICENSE.txt`. Run `node scripts/prepare-rifle-animations.mjs
/path/to/Animations/gltf/Rig_Medium` to regenerate `rifle-animations.json`.
The metadata records the two source GLB hashes and original clip names. Both
existing modular rigs receive separate 30 Hz retargets, including T-pose/A-pose
arm-direction correction. Only the upper body is transferred. Aiming excludes
the initial 0.32 s raise; movement keeps the game's existing feet and stride.
Runtime fitting aligns the real AK grips/stock and retains the finger pose.

## Weapon reloads and revolver motion

`weapon-animations.json` contains separate 30 Hz retargets for both modular rigs.
KayKit FREE 1.1 supplies `Ranged_1H_Reload` / `Ranged_2H_Reload` (CC0).
ZenXChaos's original ThirdPersonShooter-AnimationSets supplies the revolver's
aiming, shooting, reload start, per-cartridge loop and reload end:
https://github.com/ZenXChaos/ThirdPersonShooter-AnimationSets.
These files are released under the Unlicense, including commercial use; the
original text is preserved in `REVOLVER-ANIMATION-LICENSE.txt`.

The old FBX 6000 format is sampled using `scripts/sample-revolver-fbx.c` and
ufbx v0.20.1 (offline tooling only). Pass each original FBX through that sampler,
then run `node scripts/prepare-weapon-animations.mjs /path/to/Rig_Medium_CombatRanged.glb
/path/to/sampled-revolver-directory`. Source SHA-256 hashes and original clip
names accompany the baked data. Source meshes are not distributed or substituted
for our chosen Quaternius characters or revolver. Only upper-body motion is
transferred; the original legs, scale and clothing remain intact.

`weapon-reload.js` owns the animation clock and matching ammunition events.
Magazine insertion commits at 68% of the gesture; a revolver cartridge commits
at 70% of its individual loop. Interruption preserves already committed rounds
and magazine identities. Save snapshots omit unfinished gestures. Model-part
motion and support-hand fitting use that same clock, not an independent timer.

GLB containers retain the original character geometry, material colours, separate
clothing meshes, skeletons and all 24 animation clips without frame reduction.
Gzip is lossless; output names contain content hashes. No external textures are needed.
Head, torso, legs and feet share a posed skeleton and remain individually replaceable
on the player's rig. Cross-family garments are fitted through the source and target
bind-joint positions and target inverse bind matrices, preserving each garment's
original cut and material colours without inheriting the other rig's local axes.
A fixed reference scale per family prevents
changing a hat or clothing item from resizing the entire person.

Male reference height is 1.80 m, female 1.68 m; hats and hairstyles may extend above
the reference head. Foot travel is measured from the actual Walk/Run animations
and scaled into metres to drive animation from travelled distance. Crouch_Idle and
Crouch_Walk are retargeted from authored Crouch_Idle_Loop / Crouch_Fwd_Loop at the
original 30 Hz, with continuous interpolation at runtime. Bind-pose world rotations
map the rigs; the old rig's separate foot bones follow its posed shins. Sole
grounding and real foot travel are baked once, with no runtime crouch IK overlay.
Death uses the original Death clip. All 24 original clips remain available.

General furniture uses 0.5 metres per original OBJ unit (single bed 1.97 m long).
The fridge is calibrated to 0.60 × 0.665 × 1.86 m (width/depth/height).
Door leaves are 0.86 × 0.04 × 1.985 m; handle relief is retained outside panel
thickness. Double leaves are 1.72 m wide. All models are centred horizontally and
grounded at y=0. Inverse-transpose normals follow any nonuniform scale.
World furniture footprints and render heights come from these same measured assets.
Dining/work tables use a 0.74 m height override; all axes and mounted elevations
are reflected by the model renderer. `interior-layout.js` places the furniture as
separate objects with optional empty storage for future loot contents.
Lockers combine the supplied shelf with a fitted door; counters repeat three
kitchen drawer units. The current eight furnishing categories use the pack;
the full library is included for later building interiors.

Player, zombies and cached furniture share a single WebGL context and the world's
2:1 orthographic projection. Static furniture renders once at device resolution.
Without WebGL the new material-colour models render their actual posed triangles
on Canvas; this is not a reduced-frame animation atlas. Existing zombie fallbacks
remain separate. Knife, pistol and backpack use supplied meshes; the other existing
weapons use small distinct metric silhouettes attached to the animated wrist.

Starting clothing is now 45 individual inventory items (tops, bottoms and shoes)
plus three separate headwear accessories. New survivors wear only underwear.
The female Adventurer's original body mesh contained a complete shirt and 17
disconnected backpack islands. `prepare-quaternius.py` now assigns those 1,212
backpack triangles to a separate `Backpack` node, retaining all 2,854 shirt/skin
triangles, vertex attributes, skin weights and animation keys exactly. Equipping
the green outdoor top selects only the shirt. The existing hiking-pack item
continues to use the male Adventurer's separate backpack on the back slot.
`character-parts.js`, `character-body.js` and `character-legs.js` derive the bare
body, dark boxer briefs, female short panties and cropped sports top from the
existing CC0 Beach and Formal meshes. Sandals and the formal belt are removed.
The folded beach-short hems are discarded; smooth skinned transitions join the
retained upper shorts to the actual bare legs. Cloth colours occupy the same
surface as skin, using vertex colours instead of a second garment layer.
`character-surface.js` preserves section-edge positions and joint weights when
clipping and bridging. The abdomen meets the rebound leg waist at matching
vertices and weights; the waistband follows the pelvis rather than both thighs.
The sports top is the retained upper Formal top with its original skin side
panels coloured as fabric, without an added band or thickness. Generated body
templates are cached before rebinding and cloned when equipment changes.
This is a runtime geometry adaptation; the original compressed assets are intact.
Empty slots restore this body. Headwear overlays the independently selected face.
