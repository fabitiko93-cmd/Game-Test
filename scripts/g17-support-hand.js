// Preview only. The approved firing hand and prop are immutable references.
import {Matrix4,Quaternion,Vector3} from 'three';
import {contactWrist} from '../docs/src/weapon-hands.js';
import {fitArm,orientWorld} from '../docs/src/weapon-ik.js';

const v=()=>new Vector3(),rad=n=>n*Math.PI/180;
const point=(e,n)=>e.model.getObjectByName(n).getWorldPosition(v());
const LEFT=new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(new Vector3(0,1,0),new Vector3(0,0,1),new Vector3(1,0,0)));

export function authorSupportHand(entity,pose){
  const root=entity.root,gun=entity.weapon,rig=entity.rifleHands;
  root.updateMatrixWorld(true);
  const fixedGun=gun.matrixWorld.clone(),fixedRight=new Map();
  entity.model.traverse(b=>{if(b.isBone&&b.name.endsWith('R'))fixedRight.set(b,b.quaternion.clone());});
  const gunQ=gun.getWorldQuaternion(new Quaternion()),axes=[new Vector3(1,0,0),new Vector3(0,1,0),new Vector3(0,0,1)].map(a=>a.applyQuaternion(gunQ));
  const[gunX,gunY,gunZ]=axes;
  for(const[name,e]of rig)if(/^(Index|Middle|Ring|Pinky|Thumb).*L$/.test(name))e.bone.quaternion.copy(e.rotation);
  root.updateMatrixWorld(true);
  const relative=new Quaternion().setFromAxisAngle(new Vector3(0,0,1),rad(pose.roll||0)).multiply(new Quaternion().setFromAxisAngle(new Vector3(0,1,0),rad(pose.yaw||0))).multiply(new Quaternion().setFromAxisAngle(new Vector3(1,0,0),rad(pose.pitch||0))).multiply(LEFT);
  const hand=gunQ.clone().multiply(relative),anchor=gun.localToWorld(new Vector3(...pose.palm)),goal=contactWrist(entity,'L',anchor,hand);
  const bones=['UpperArmL','LowerArmL','WristL'].map(n=>entity.model.getObjectByName(n)),start=bones[0].getWorldPosition(v()),reach=start.distanceTo(bones[1].getWorldPosition(v()))+bones[1].getWorldPosition(v()).distanceTo(bones[2].getWorldPosition(v()));
  if(goal.distanceTo(start)>reach-.0015)throw Error('Support contact exceeds arm reach; firing-hand reference stays fixed: '+JSON.stringify({distance:goal.distanceTo(start),reach,goal:gun.worldToLocal(goal.clone()).toArray(),shoulder:gun.worldToLocal(start.clone()).toArray()}));
  const pole=start.clone().add(new Vector3(...pose.elbowDirection).applyQuaternion(root.getWorldQuaternion(new Quaternion()))),axis=goal.clone().sub(start).normalize();
  const radial=pole.clone().sub(start).addScaledVector(axis,-pole.clone().sub(start).dot(axis)).normalize(),initial=bones.map(b=>b.quaternion.clone());
  const maxBend=pose.maxWristBend||42;let best=null;
  for(let turn=-120;turn<=120;turn+=5){
    bones.forEach((b,i)=>b.quaternion.copy(initial[i]));root.updateMatrixWorld(true);
    const frame={hand,axis:rig.get('WristL').palm,rest:rig.get('WristL').rotation,lowerRest:rig.get('LowerArmL').rotation,hinge:rig.get('UpperArmL').hinge,maxTwist:Math.PI/3,maxBend:rad(maxBend)};
    const elbowPole=start.clone().add(radial.clone().applyAxisAngle(axis,rad(turn+(pose.poleTurn||0))));
    fitArm(...bones,goal,elbowPole,frame);orientWorld(bones[2],hand);root.updateMatrixWorld(true);
    const fore=point(entity,'WristL').sub(point(entity,'LowerArmL')),palmAxis=point(entity,'Middle2L').sub(point(entity,'WristL')),bend=fore.angleTo(palmAxis);
    const penalty=Math.max(0,Math.abs(frame.wristTwist)-rad(35))+Math.max(0,bend-rad(maxBend+1));
    const cost=penalty*100+point(entity,'LowerArmL').distanceToSquared(pole.clone().sub(start).normalize().multiplyScalar(start.distanceTo(point(entity,'LowerArmL'))).add(start));
    if(!best||cost<best.cost)best={cost,turn,bend,frame,quaternions:bones.map(b=>b.quaternion.clone())};
  }
  bones.forEach((b,i)=>b.quaternion.copy(best.quaternions[i]));root.updateMatrixWorld(true);
  for(const finger of ['Index','Middle','Ring','Pinky']){
    const meta=entity.model.getObjectByName(finger+'1L'),spread=pose.spread?.[finger]||[0,0,0];
    const turn=new Quaternion().setFromAxisAngle(gunZ,rad(spread[2])).multiply(new Quaternion().setFromAxisAngle(gunY,rad(spread[1]))).multiply(new Quaternion().setFromAxisAngle(gunX,rad(spread[0])));
    orientWorld(meta,turn.multiply(meta.getWorldQuaternion(new Quaternion())));
    for(let i=2;i<=4;i++){
      const plane=new Quaternion().setFromAxisAngle(gunZ,rad(pose.fingerPlaneRoll?.[finger]||0));
      const baseX=pose.handAlignedFingers?new Vector3(1,0,0).applyQuaternion(hand):gunY.clone();
      const baseY=pose.handAlignedFingers?new Vector3(0,1,0).applyQuaternion(hand):gunZ.clone();
      const baseZ=pose.handAlignedFingers?new Vector3(0,0,1).applyQuaternion(hand):gunX.clone();
      const angle=rad(pose.curls[finger].slice(0,i-1).reduce((a,b)=>a+b,0)),axisX=baseX.applyQuaternion(plane),axisY=baseY.multiplyScalar(Math.cos(angle)).addScaledVector(baseZ,-Math.sin(angle)).applyQuaternion(plane),axisZ=axisX.clone().cross(axisY);
      orientWorld(rig.get(finger+i+'L').bone,new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(axisX,axisY,axisZ)));root.updateMatrixWorld(true);
    }
  }
  for(let i=1;i<=3;i++){
    const b=rig.get('Thumb'+i+'L').bone,here=b.getWorldPosition(v()),wanted=gun.localToWorld(new Vector3(...pose.thumb[i-1])).sub(here).normalize();
    const from=i<3?point(entity,'Thumb'+(i+1)+'L').sub(here).normalize():new Vector3(0,1,0).applyQuaternion(b.getWorldQuaternion(new Quaternion()));
    orientWorld(b,new Quaternion().setFromUnitVectors(from,wanted).multiply(b.getWorldQuaternion(new Quaternion())));root.updateMatrixWorld(true);
  }
  const palmError=point(entity,'Middle2L').distanceTo(anchor);
  if(palmError>.0001)throw Error('Support palm anchor not reached: '+palmError);
  const gunDelta=Math.max(...gun.matrixWorld.elements.map((n,i)=>Math.abs(n-fixedGun.elements[i])));
  let rightDelta=0;for(const[b,q]of fixedRight)rightDelta=Math.max(rightDelta,Math.abs(b.quaternion.x-q.x),Math.abs(b.quaternion.y-q.y),Math.abs(b.quaternion.z-q.z),Math.abs(b.quaternion.w-q.w));
  if(gunDelta>1e-10||rightDelta>1e-10)throw Error('Approved firing-hand reference changed');
  return{palmError,handFrame:relative.toArray(),wristBend:best.bend,forearmTwist:best.frame.forearmTwist,wristTwist:best.frame.wristTwist,poleTurn:best.turn+(pose.poleTurn||0),fixedRightQuaternionDelta:rightDelta,fixedWeaponMatrixDelta:gunDelta};
}
