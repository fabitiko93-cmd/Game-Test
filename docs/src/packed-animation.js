import { AnimationClip, LoopOnce } from 'three';
import { gunzipSync } from 'three/addons/libs/fflate.module.js';

export function unpackAnimationClips(packed) {
  const bytes = Uint8Array.from(atob(packed), char => char.charCodeAt(0));
  const poses = JSON.parse(new TextDecoder().decode(gunzipSync(bytes)));
  return new Map(poses.map(pose => [pose.name, AnimationClip.parse(pose)]));
}

export function bindOneShotAnimation(entity, name, clip) {
  const action = entity.mixer.clipAction(clip).setEffectiveTimeScale(0).setLoop(LoopOnce, 1);
  action.clampWhenFinished = true;
  entity.actions.set(name, action);
}
