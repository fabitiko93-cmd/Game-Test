// Runtime-only limb mathematics. No editor, DOM, asset URLs or model loading.
import {Quaternion,Vector3} from 'three';
const v=()=>new Vector3();
export function worldRotation(bone,rotation){bone.quaternion.copy(bone.parent.getWorldQuaternion(new Quaternion()).invert().multiply(rotation));bone.updateMatrixWorld(true);}
function aim(bone,from,to){worldRotation(bone,new Quaternion().setFromUnitVectors(from.normalize(),to.normalize()).multiply(bone.getWorldQuaternion(new Quaternion())));}

// Foot controllers in the original rigs are siblings of the legs, rather
// than children of the shins. Preserve a virtual ankle in the shin frame.
export function solveLeg(upper,lower,foot,target,pole,reference){
  const start=upper.getWorldPosition(v()),a=reference.a,b=reference.b;
  const offset=target.clone().sub(start),wanted=offset.length(),minimum=Math.abs(a-b)+.002,maximum=a+b-.002;
  if(wanted<1e-8)offset.copy(lower.getWorldPosition(v()).sub(start));
  const direction=offset.normalize(),distance=Math.max(minimum,Math.min(maximum,wanted));
  const bend=pole.clone().sub(start).addScaledVector(direction,-pole.clone().sub(start).dot(direction));
  if(bend.lengthSq()<1e-8){bend.set(0,0,1).addScaledVector(direction,-direction.z);if(bend.lengthSq()<1e-8)bend.set(1,0,0).addScaledVector(direction,-direction.x);}
  bend.normalize();
  const along=(a*a-b*b+distance*distance)/(2*distance),height=Math.sqrt(Math.max(0,a*a-along*along));
  const knee=start.clone().addScaledVector(direction,along).addScaledVector(bend,height),ankle=start.clone().addScaledVector(direction,distance);
  aim(upper,lower.getWorldPosition(v()).sub(start),knee.clone().sub(start));
  const lowerPoint=lower.getWorldPosition(v()),virtual=lower.localToWorld(reference.ankle.clone());
  aim(lower,virtual.sub(lowerPoint),ankle.clone().sub(lowerPoint));
  foot.position.copy(foot.parent.worldToLocal(ankle.clone()));foot.updateMatrixWorld(true);
  return{point:ankle,gap:ankle.distanceTo(target)};
}
