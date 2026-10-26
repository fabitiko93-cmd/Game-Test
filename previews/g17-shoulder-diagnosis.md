# Right shoulder: diagnosis and isolated review 07

Reviewed on 2026-10-25 after the user found review 06's grip promising and
reported its right shoulder as unnatural. On 2026-10-26 the user requested the
shoulder correction. Review 07 now combines a neutral clavicle/arm calibration
with a localized skin-weight correction and awaits visual approval. Review 04's
right grasp approval is unchanged. No runtime files, original assets, published
files or workshop profiles were modified during this investigation.

## Confirmed findings

- Review 06's arm fit rotates the already posed clavicle by another 24.93 degrees.
  Relative to review 05, the upper-arm origin moves 22.48 mm inward, 10.74 mm up
  and 7.58 mm back. The right and left arm origins differ in height by 21.88 mm.
- `scripts/g17-arm-alignment.js` scores wrist bend, wrist axial twist, additional
  shoulder turn and elbow displacement. It does not score actual shoulder skin
  deformation. Passing these numerical limits did not establish a credible
  shoulder silhouette.
- `docs/src/clothing-catalog.js` uses `male-Beach` for the bare male torso.
  `docs/src/character-body.js:createBareTorso` retains upper source surfaces,
  including non-skin garment surfaces, and repaints them as skin. Their vertex
  positions and bone weights remain inherited in the shoulder region.
  A bind-space render of the source confirms the retained tank-top surfaces.
  A controlled same-arm-pose comparison shows that localized weight smoothing
  improves the shoulder silhouette. The joint fit and skin binding both matter.
- An inspection of coincident bind-space torso vertices found no separated
  coincident seam above 0.1 mm in the review-06 mesh. Do not describe this as
  a confirmed open seam or a missing model.

## Rejected internal experiments

Reducing clavicle turn and restoring the captured rest clavicle improves
shoulder position. Calibrating the upper-arm crease frame can improve its front
silhouette while retaining both hand frames, fingers and the prop. However,
the tested combinations retain or increase visible pinching in the rear view.
Extra axial clavicle roll also deforms the torso and is rejected.

For example, a rest-clavicle / -60-degree rig-frame crease trial preserves
the grasp to numerical tolerance and reaches a 24.53-degree wrist bend with
zero residual axial wrist twist. Nevertheless its rear shoulder skin is
visibly unacceptable. It must not become an approved pose merely because
its geometric checks pass. No such trial replaced review 06 or the approved
right-hand reference.

## Review-07 correction and remaining scope

Both grasp frames remain fixed. The revised arm fitting restores the neutral
clavicle rather than optimizing wrist bend alone. A separate, explicitly
configured preview step diffuses only the right shoulder's skin weights over
the original mesh adjacency. It clones geometry first and checks the original
fingerprint afterward. It does not change bind positions, normals, topology,
colors or source files. The neck, opposite arm, fingers and outer body weights
remain outside the correction. Actual Three.js-skinned triangles are rendered;
no bitmap edits or substitute body are used.

The snapshot records the 93 corrected vertices, fixed grasp/prop skin, actual
wrist bend and static Idle_Neutral/Punch_Right source-clip probes. The selected
shoulder triangle-crossing count falls from 138 to 110, but intersections
remain. This is a visual improvement with bounded, reviewable scope, not a
globally collision-free body or a validated animation-transition solution.
The new shoulder still awaits user approval. Female transfer, full animation
transitions and any runtime body integration remain separate pending work.
