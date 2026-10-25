// Preview only: improve the arm connection while preserving the hand/prop frame.
import {Quaternion,Vector3} from 'three';
import {fitArm,orientWorld} from '../docs/src/weapon-ik.js';
const v=()=>new Vector3(),rad=n=>n*Math.PI/180,deg=n=>n*180/Math.PI;
const point=(e,n)=>e.model.getObjectByName(n).getWorldPosition(v());

export function alignPreviewArm(entity,side,{maxBend=22,maxShoulderTurn=20,maxWristTwist=25,maxForearmTwist=60,maxRetreat=0}={}){
  const root=entity.root,gun=entity.weapon,rig=entity.rifleHands;
  root.updateMatrixWorld(true);
  const [shoulder,upper,lower,wrist]=['Shoulder','UpperArm','LowerArm','Wrist'].map(n=>entity.model.getObjectByName(n+side));
  const bones=[shoulder,upper,lower,wrist],initial=bones.map(b=>b.quaternion.clone());
  const target=wrist.getWorldPosition(v()),hand=wrist.getWorldQuaternion(new Quaternion()).normalize(),oldElbow=lower.getWorldPosition(v());
  const palm=point(entity,'Middle2'+side),handAxis=palm.clone().sub(target).normalize(),before=target.clone().sub(oldElbow).angleTo(handAxis);
  const oldStart=upper.getWorldPosition(v()),a=oldStart.distanceTo(oldElbow),b=oldElbow.distanceTo(target),distance=oldStart.distanceTo(target);
  const axis0=target.clone().sub(oldStart).normalize(),delta=axis0.angleTo(handAxis),cone=Math.acos(Math.max(-1,Math.min(1,(b*b+distance*distance-a*a)/(2*b*distance))));
  const originalMinimum=Math.abs(delta-cone),shoulderWorld=shoulder.getWorldQuaternion(new Quaternion()).normalize();
  const axes=[new Vector3(1,0,0),new Vector3(0,1,0),new Vector3(0,0,1)].map(x=>x.applyQuaternion(root.getWorldQuaternion(new Quaternion())));
  const forward=new Vector3(0,0,1).applyQuaternion(gun.getWorldQuaternion(new Quaternion())).normalize(),oldGunPosition=gun.getWorldPosition(v());
  const parent=gun.parent;root.attach(gun);root.updateMatrixWorld(true);
  let best=null,evaluations=0;
  const evaluate=(rotation,angles,poleTurn,retreat)=>{
    bones.forEach((bone,i)=>bone.quaternion.copy(initial[i]));root.updateMatrixWorld(true);
    orientWorld(shoulder,rotation.clone().multiply(shoulderWorld));root.updateMatrixWorld(true);
    const goal=target.clone().addScaledVector(forward,-retreat),start=upper.getWorldPosition(v()),offset=goal.clone().sub(start),d=offset.length();
    if(d>=a+b-.001||d<=Math.abs(a-b)+.001)return;
    const axis=offset.normalize(),radial=oldElbow.clone().sub(start);radial.addScaledVector(axis,-radial.dot(axis)).normalize();
    const pole=start.clone().add(radial.applyAxisAngle(axis,rad(poleTurn)));
    const frame={hand,axis:rig.get('Wrist'+side).palm,rest:rig.get('Wrist'+side).rotation,lowerRest:rig.get('LowerArm'+side).rotation,hinge:rig.get('UpperArm'+side).hinge,maxTwist:rad(maxForearmTwist),maxBend:0};
    fitArm(upper,lower,wrist,goal,pole,frame);orientWorld(wrist,hand);root.updateMatrixWorld(true);evaluations++;
    const elbow=lower.getWorldPosition(v()),bend=deg(goal.clone().sub(elbow).angleTo(handAxis)),twist=Math.abs(deg(frame.wristTwist)),shoulderAngle=deg(rotation.angleTo(new Quaternion()));
    const violation=100*(Math.max(0,bend-maxBend)**2+Math.max(0,twist-maxWristTwist)**2)+10000*Math.max(0,elbow.y-goal.y+.005)**2;
    const cost=violation+bend*bend+shoulderAngle*shoulderAngle*.18+oldElbow.distanceToSquared(elbow)*400+(retreat*100)**2*5;
    if(!best||cost<best.cost)best={cost,violation,bend,twist,frame,angles,poleTurn,shoulderAngle,retreat,quaternions:bones.map(bone=>bone.quaternion.clone())};
  };
  const span=maxShoulderTurn?[-maxShoulderTurn,-maxShoulderTurn/2,0,maxShoulderTurn/2,maxShoulderTurn]:[0];
  for(const x of span)for(const y of span)for(const z of span){
    const rotation=new Quaternion().setFromAxisAngle(axes[2],rad(z)).multiply(new Quaternion().setFromAxisAngle(axes[1],rad(y))).multiply(new Quaternion().setFromAxisAngle(axes[0],rad(x)));
    if(deg(rotation.angleTo(new Quaternion()))>maxShoulderTurn+.01)continue;
    for(const retreat of new Set([0,maxRetreat/4,maxRetreat/2,maxRetreat*3/4,maxRetreat]))for(let turn=-180;turn<180;turn+=10)evaluate(rotation,[x,y,z],turn,retreat);
  }
  if(best){
    const centre=best.angles,turn=best.poleTurn,retreat=best.retreat;
    for(const dx of [-3,0,3])for(const dy of [-3,0,3])for(const dz of [-3,0,3]){
      const angles=centre.map((n,i)=>n+[dx,dy,dz][i]);
      const rotation=new Quaternion().setFromAxisAngle(axes[2],rad(angles[2])).multiply(new Quaternion().setFromAxisAngle(axes[1],rad(angles[1]))).multiply(new Quaternion().setFromAxisAngle(axes[0],rad(angles[0])));
      if(deg(rotation.angleTo(new Quaternion()))>maxShoulderTurn+.01)continue;
      for(const r of new Set([Math.max(0,retreat-.005),retreat,Math.min(maxRetreat,retreat+.005)]))for(let dt=-8;dt<=8;dt+=2)evaluate(rotation,angles,turn+dt,r);
    }
  }
  if(!best||best.bend>maxBend+.1||best.twist>maxWristTwist+.1){
    bones.forEach((bone,i)=>bone.quaternion.copy(initial[i]));root.updateMatrixWorld(true);parent.attach(gun);
    throw Error('No acceptable arm connection within preview limits: '+JSON.stringify(best&&{bend:best.bend,wristTwist:best.twist,shoulderTurn:best.shoulderAngle,angles:best.angles,poleTurn:best.poleTurn,retreat:best.retreat}));
  }
  const translation=forward.clone().multiplyScalar(-best.retreat);
  bones.forEach((bone,i)=>bone.quaternion.copy(best.quaternions[i]));root.updateMatrixWorld(true);gun.position.copy(root.worldToLocal(oldGunPosition.clone().add(translation)));root.updateMatrixWorld(true);parent.attach(gun);root.updateMatrixWorld(true);
  const positionError=point(entity,'Wrist'+side).distanceTo(target.clone().add(translation)),palmError=point(entity,'Middle2'+side).distanceTo(palm.clone().add(translation)),rotationError=wrist.getWorldQuaternion(new Quaternion()).normalize().angleTo(hand);
  if(positionError>1e-6||palmError>1e-6||rotationError>1e-6)throw Error('Arm alignment lost the fixed hand frame');
  return{beforeDegrees:deg(before),afterDegrees:best.bend,originalFixedShoulderMinimumDegrees:deg(originalMinimum),shoulderTurnDegrees:best.shoulderAngle,shoulderEulerDegrees:best.angles,shoulderDisplacementMetres:point(entity,'UpperArm'+side).sub(oldStart).toArray(),elbowDisplacementMetres:point(entity,'LowerArm'+side).sub(oldElbow).toArray(),gripRetreatMetres:best.retreat,gripTranslation:translation.toArray(),handPositionError:positionError,palmPositionError:palmError,handRotationError:rotationError,forearmTwist:best.frame.forearmTwist,wristTwist:best.frame.wristTwist,evaluations};
}
