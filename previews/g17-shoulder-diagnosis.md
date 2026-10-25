# Right shoulder: unresolved visual defect

Reviewed on 2026-10-25 after the user found review 06's grip promising and
reported its right shoulder as unnatural. The delivered review 06 remains the
latest combined preview; no shoulder replacement has been presented or approved.
Review 04's right grasp approval is unchanged. No runtime files, source assets,
published files or workshop profiles were modified during this investigation.

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
  This is a possible additional contributor to the visible shoulder edge;
  it has not been established as the sole cause.
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

## Proposed next scope

Keep both grasp frames fixed and inspect the bare shoulder surface and its
skinning independently of the hand-contact solver. Compare matching front,
rear and side views; include the original source and a clothed body to separate
pose and body-surface effects. Any body correction should first be an isolated,
reviewable instance, with unchanged original assets and game imports. This is
a technical proposal, not a recorded user approval for a runtime body change.
The shoulder, female transfer and animation transitions remain unapproved.
