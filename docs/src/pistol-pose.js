import {Box3,Euler,Quaternion,Vector3} from 'three';
import {fitArm,orientWorld} from './weapon-ik.js';
import {contactWrist,poseHand} from './weapon-hands.js';
import {recoilPose} from './weapon-recoil.js';

const v=(x=0,y=0,z=0)=>new Vector3(x,y,z);
const BASE_HAND=new Quaternion().setFromEuler(new Euler(-Math.PI/2,0,Math.PI/2)).invert();
// The metacarpals rise toward a pistol's grip. Reusing the horizontal rifle
// palm frame forces that angle into a bent or axially twisted wrist instead.
const PALM_PITCH=new Quaternion().setFromAxisAngle(v(1,0,0),-.28);
const RIGHT=PALM_PITCH.clone().multiply(BASE_HAND),GRIP=RIGHT.clone().invert();
// Both palms face forward. Mirroring around the barrel makes the support
// fingers close around the firing hand without turning its wrist sideways.
export const PISTOL_SUPPORT_ROTATION=PALM_PITCH.clone().multiply(new Quaternion().setFromAxisAngle(v(0,0,1),Math.PI)).multiply(BASE_HAND);
const LEFT=PISTOL_SUPPORT_ROTATION;
const bone=(entity,name)=>entity.model.getObjectByName(name);
const point=(entity,name)=>bone(entity,name).getWorldPosition(v());
const arm=(entity,side)=>['UpperArm','LowerArm','Wrist'].map(n=>bone(entity,n+side));
const scaled=(entity,p,q)=>v().fromArray(p).multiplyScalar(entity.weapon.userData.pistol.scale).applyQuaternion(q);

function blendPostures(entity,posture,delta){
  const blend=entity.rifleBlend||={carry:Number(posture==='carry'),hip:Number(posture==='hip'),aim:Number(posture==='aim')};
  if(delta>=.5){for(const state of ['carry','hip','aim'])blend[state]=Number(state===posture);entity.rifleTransition=null;}
  else{
    if(entity.rifleTransition?.posture!==posture)entity.rifleTransition={posture,from:{...blend},elapsed:0};
    const t=Math.min(1,(entity.rifleTransition.elapsed+=Math.max(0,delta))/.42),amount=t*t*(3-2*t);
    for(const state of ['carry','hip','aim'])blend[state]=entity.rifleTransition.from[state]+(Number(state===posture)-entity.rifleTransition.from[state])*amount;
  }
  entity.riflePosture=posture;return blend;
}

function eyeLocal(entity,player){
  if(entity.pistolEye)return entity.pistolEye;
  const head=bone(entity,'Head'),points=[];
  // These are the real eye meshes in the modular male/female heads. Store
  // their centre in the head frame so it follows nodding and every body pose.
  entity.clothing.head.traverseVisible(mesh=>{
    if(!mesh.isMesh||!['Eye','Brown'].includes(mesh.material?.name))return;
    for(let i=0;i<mesh.geometry.attributes.position.count;i++){
      const p=head.worldToLocal(mesh.getVertexPosition(i,v()).applyMatrix4(mesh.matrixWorld));if(p.x<-.01)points.push(p);
    }
  });
  return entity.pistolEye=points.length?new Box3().setFromPoints(points).getCenter(v()):v(-.034,player.appearance?.sex==='female'?.104:.109,.106);
}

export function pistolEye(entity){return bone(entity,'Head').localToWorld(entity.pistolEye.clone());}
export function pistolSight(entity){
  const weapon=entity.weapon,optic=weapon.getObjectByName('Reflex'),a=weapon.userData.anchors.optic;
  return v(0,a[1]+(optic?.visible ? .008 : -.014),a[2]);
}

function handOffset(entity,side,rotation){
  const profile=entity.weapon.userData.pistol,hand=rotation.clone().multiply(side==='R'?RIGHT:LEFT);
  const palm=scaled(entity,side==='R'?profile.rightPalm:profile.leftPalm,rotation);
  return contactWrist(entity,side,palm,hand);
}

// Attach by the measured middle knuckle. The wrist-to-palm distance belongs
// to the character; the grip position and physical size belong to the gun.
export function attachPistol(entity){
  const weapon=entity.weapon,wrist=bone(entity,'WristR');
  weapon.scale.setScalar(weapon.userData.pistol.scale/wrist.getWorldScale(v()).x);
  weapon.quaternion.copy(GRIP);weapon.updateMatrixWorld(true);
  const q=weapon.getWorldQuaternion(new Quaternion());
  weapon.position.copy(wrist.worldToLocal(point(entity,'Middle2R').sub(scaled(entity,weapon.userData.pistol.rightPalm,q))));
  weapon.updateMatrixWorld(true);
}

function frame(entity,side,hand,maxBend){
  const rig=entity.rifleHands;
  return{hand,axis:rig.get('Wrist'+side).palm,rest:rig.get('Wrist'+side).rotation,lowerRest:rig.get('LowerArm'+side).rotation,
    hinge:rig.get('UpperArm'+side).hinge,maxTwist:Math.PI/3,maxBend:maxBend*Math.PI/180};
}

function aimPoint(entity,rotation){
  const origin=pistolEye(entity).sub(scaled(entity,pistolSight(entity).toArray(),rotation));
  const forward=v(0,0,1).applyQuaternion(rotation);let distance=Infinity;
  for(const side of ['R','L']){
    const [upper,lower,wrist]=arm(entity,side),start=upper.getWorldPosition(v());
    const reach=start.distanceTo(lower.getWorldPosition(v()))+lower.getWorldPosition(v()).distanceTo(wrist.getWorldPosition(v()))-.006;
    const offset=origin.clone().add(handOffset(entity,side,rotation)).sub(start),along=offset.dot(forward);
    const across=offset.lengthSq()-along*along;
    distance=Math.min(distance,-along+Math.sqrt(Math.max(0,reach*reach-across)));
  }
  return origin.addScaledVector(forward,distance);
}

function fitRight(entity,origin,rotation,pole,maxBend=22){
  const hand=rotation.clone().multiply(RIGHT),target=origin.clone().add(handOffset(entity,'R',rotation));
  fitArm(...arm(entity,'R'),target,pole,frame(entity,'R',hand,maxBend));
  orientWorld(bone(entity,'WristR'),hand);attachPistol(entity);
}

export function fitPistolWeaponPose(entity,origin,rotation,amount=1){
  const before=rotations(joints(entity,'R'));
  const shoulder=entity.root.worldToLocal(point(entity,'UpperArmR'));
  const pole=entity.root.localToWorld(shoulder.add(v(-.12,-.20,.12)));
  fitRight(entity,origin,rotation,pole,48);
  blendPistolJoints(entity,before,amount,'reload');attachPistol(entity);
}

export function fitPistolSupportContact(entity,palm,rotation,contact='Middle2'){
  const hand=rotation.clone(),shoulder=entity.root.worldToLocal(point(entity,'UpperArmL'));
  const pole=entity.pistolContactPole?entity.root.localToWorld(entity.pistolContactPole.clone()):entity.root.localToWorld(shoulder.add(v(.12,-.20,.12)));
  const start=point(entity,'UpperArmL'),reach=start.distanceTo(point(entity,'LowerArmL'))+point(entity,'LowerArmL').distanceTo(point(entity,'WristL'))-.012;
  for(let i=0;i<24;i++){
    const f=frame(entity,'L',hand,48);
    const target=contactWrist(entity,'L',palm,hand,contact),offset=target.clone().sub(start);
    if(offset.length()>reach)target.copy(start).add(offset.setLength(reach));
    fitArm(...arm(entity,'L'),target,pole,f);
    orientWorld(bone(entity,'WristL'),hand);entity.root.updateMatrixWorld(true);
    const axis=point(entity,'WristL').sub(point(entity,'LowerArmL')).normalize();
    const direction=point(entity,'Middle2L').sub(point(entity,'WristL')).normalize(),bend=direction.angleTo(axis);
    if(bend>50*Math.PI/180){
      const turn=direction.clone().cross(axis).normalize();hand.premultiply(new Quaternion().setFromAxisAngle(turn,Math.min(.35,bend-48*Math.PI/180)));
    }else if(Math.abs(f.wristTwist)>24*Math.PI/180){
      const excess=f.wristTwist-Math.sign(f.wristTwist)*22*Math.PI/180;
      hand.premultiply(new Quaternion().setFromAxisAngle(axis,-Math.max(-.35,Math.min(.35,excess))));
    }else break;
  }
  entity.pistolContactPole=entity.root.worldToLocal(point(entity,'LowerArmL'));
  return bone(entity,'WristL').getWorldQuaternion(new Quaternion());
}

const joints=(entity,side)=>['Shoulder','UpperArm','LowerArm','Wrist'].map(n=>bone(entity,n+side));
const rotations=bones=>new Map(bones.map(b=>[b,b.quaternion.clone()]));

function blendJoint(entity,key,from,to,weight){
  const arcs=entity.pistolArcs||=new Map(),relative=from.clone().invert().multiply(to).normalize(),previous=arcs.get(key);
  // A shortest-path slerp changes sides abruptly when a target crosses 180°
  // from the carry pose. Keep the same interpolation arc across that boundary.
  if((weight===0||!previous)?relative.w<0:relative.dot(previous)<0){relative.x*=-1;relative.y*=-1;relative.z*=-1;relative.w*=-1;}
  arcs.set(key,relative.clone());
  const angle=Math.acos(Math.max(-1,Math.min(1,relative.w))),axis=v(relative.x,relative.y,relative.z);
  if(axis.lengthSq()<1e-12)return from.clone().slerp(to,weight);
  return from.clone().multiply(new Quaternion().setFromAxisAngle(axis.normalize(),angle*2*weight)).normalize();
}

export function blendPistolJoints(entity,before,weight,key){
  for(const[b,q]of before)b.quaternion.copy(blendJoint(entity,key+b.name,q,b.quaternion,weight));
  entity.root.updateMatrixWorld(true);
}

export function applyPistolPose(entity,player,delta,posture){
  const rig=entity.rifleHands,root=entity.root,weapon=entity.weapon,profile=weapon.userData.pistol;
  const saved=[...rig.values()].map(e=>e.bone).concat(['Torso','Chest','Neck','Head'].map(n=>bone(entity,n))).filter(Boolean);
  entity.rifleRestore=new Map(saved.map(b=>[b,b.quaternion.clone()]));
  const freeLeft={joints:new Map(saved.filter(b=>/(Shoulder|UpperArm|LowerArm|Wrist|Index|Middle|Ring|Pinky|Thumb).*L$/.test(b.name)).map(b=>[b,b.quaternion.clone()]))};
  eyeLocal(entity,player);
  const blend=blendPostures(entity,posture,delta),active=blend.aim+blend.hip;
  entity.pistolBodyPose||=new Map();
  const bodyYaw=root.getWorldQuaternion(new Quaternion()),bodyTargets=new Map(['Torso','Chest'].map(name=>[name,bodyYaw.clone().invert().multiply(bone(entity,name).getWorldQuaternion(new Quaternion()))]));
  for(const name of ['Torso','Chest']){
    const target=bodyTargets.get(name),previous=entity.pistolBodyPose.get(name);
    if(previous&&delta<.5)target.copy(previous.clone().rotateTowards(target,Math.max(0,delta)*3));
    orientWorld(bone(entity,name),bodyYaw.clone().multiply(target));entity.pistolBodyPose.set(name,target.clone());
  }
  for(const side of ['R','L'])for(const part of ['Shoulder','UpperArm','LowerArm','Wrist']){const e=rig.get(part+side);e.bone.quaternion.copy(e.rotation);}
  root.updateMatrixWorld(true);
  const yaw=root.getWorldQuaternion(new Quaternion()),chest=bone(entity,'Chest'),head=bone(entity,'Head'),headQ=head.getWorldQuaternion(new Quaternion());
  const worldTurn=yaw.clone().multiply(new Quaternion().setFromAxisAngle(v(0,1,0),-.20*active)).multiply(yaw.clone().invert());
  orientWorld(chest,worldTurn.multiply(chest.getWorldQuaternion(new Quaternion())));
  const lift=yaw.clone().multiply(new Quaternion().setFromAxisAngle(v(0,0,1),-.25*active)).multiply(yaw.clone().invert());
  orientWorld(bone(entity,'ShoulderR'),lift.multiply(bone(entity,'ShoulderR').getWorldQuaternion(new Quaternion())));
  const headAim=yaw.clone().multiply(new Quaternion().setFromEuler(new Euler(.16,-.02,-.08,'YXZ')));
  orientWorld(head,headQ.slerp(headAim,blend.aim));root.updateMatrixWorld(true);
  // Use the same metacarpal pose for reach calculation and final attachment.
  // Locomotion clips contain small finger rotations of their own.
  poseHand(entity,'R','pistol');poseHand(entity,'L','pistol');

  const crouched=player.stance==='sneak'&&!player.running;
  entity.pistolCrouchHold=crouched?.16:Math.max(0,(entity.pistolCrouchHold||0)-Math.max(0,delta));
  const crouch=Number(crouched||entity.pistolCrouchHold>0),before=entity.pistolCrouch??crouch;
  entity.pistolCrouch=delta>=.5?crouch:before+Math.max(-delta/.24,Math.min(delta/.12,crouch-before));
  const shoulder=root.worldToLocal(point(entity,'UpperArmR')),hipAmount=active>0?blend.hip/active:0;
  const aimRotation=yaw.clone(),rotation=yaw.clone().multiply(new Quaternion().setFromEuler(new Euler(.23*hipAmount,0,0)));
  const origin=aimPoint(entity,aimRotation).lerp(root.localToWorld(shoulder.clone().add(v(.07,-.16,.42))),hipAmount);
  const kick=recoilPose(player,weapon.userData.weaponId,true);
  const pivot=origin.clone().add(handOffset(entity,'R',rotation));
  rotation.multiply(new Quaternion().setFromEuler(new Euler(-kick.pitch,0,kick.roll)));
  // Recoil turns around the firing wrist, rather than pulling the hand down
  // by the length of its palm as the barrel rises.
  origin.copy(pivot).sub(handOffset(entity,'R',rotation));
  origin.addScaledVector(v(0,0,1).applyQuaternion(rotation),-kick.back);
  const rightPole=root.localToWorld(shoulder.clone().add(v(-.035,-.08,.20)));
  entity.weaponPoles={right:rightPole.clone(),left:root.localToWorld(root.worldToLocal(point(entity,'UpperArmL')).add(v(.035,-.10,.20)))};
  fitRight(entity,origin,rotation,rightPole);
  const support=rotation.clone().multiply(LEFT),palm=weapon.localToWorld(v().fromArray(profile.leftPalm));
  fitArm(...arm(entity,'L'),contactWrist(entity,'L',palm,support),entity.weaponPoles.left,frame(entity,'L',support,28));
  orientWorld(bone(entity,'WristL'),support);root.updateMatrixWorld(true);
  const aimed=rotations([...joints(entity,'R'),...joints(entity,'L')]);

  // Blend complete, attainable joint poses. Interpolating a low wrist target
  // through the torso can make an IK elbow change its bend plane by 180°.
  for(const[b,q]of entity.handgunCarry)b.quaternion.copy(q);root.updateMatrixWorld(true);
  if(entity.pistolCrouch>0){
    const start=root.worldToLocal(point(entity,'UpperArmR'));
    const low=root.localToWorld(start.clone().add(v(.10,-.16,.36)));
    const q=yaw.clone().multiply(new Quaternion().setFromEuler(new Euler(.65,.75,0,'YXZ')));
    fitRight(entity,low,q,root.localToWorld(start.add(v(-.12,-.20,.12))));
    for(const[b,neutral]of entity.handgunCarry)b.quaternion.copy(blendJoint(entity,'crouch'+b.name,neutral,b.quaternion,entity.pistolCrouch));
  }
  for(const b of joints(entity,'R'))b.quaternion.copy(blendJoint(entity,'aim'+b.name,b.quaternion,aimed.get(b),active));
  for(const b of joints(entity,'L'))b.quaternion.copy(blendJoint(entity,'aim'+b.name,freeLeft.joints.get(b),aimed.get(b),active*active));
  // The donor walk/run clips can hand over very different free-arm phases.
  // Bound that handover in joint space; never let the support arm flip to a
  // different gait phase in one frame while releasing or joining the grip.
  entity.pistolArmPose||=new Map();
  for(const b of [...joints(entity,'R'),...joints(entity,'L')]){
    const previous=entity.pistolArmPose.get(b);
    const speed=b.name.endsWith('R')?8:4.5;
    if(previous&&delta<.5)b.quaternion.copy(previous.clone().rotateTowards(b.quaternion,Math.max(0,delta)*speed));
    entity.pistolArmPose.set(b,b.quaternion.clone());
  }
  root.updateMatrixWorld(true);attachPistol(entity);
  const impulse=player.combat?.shotImpulse,trigger=Boolean(player.combat?.triggerHeld)||impulse?.weaponId===weapon.userData.weaponId&&impulse.age<.25;
  poseHand(entity,'R','pistol',{trigger:Number(trigger)});
  poseHand(entity,'L','pistol');
  for(const[b,q]of freeLeft.joints)if(/^(Index|Middle|Ring|Pinky|Thumb)/.test(b.name))b.quaternion.copy(q.clone().slerp(b.quaternion,active*active));
  root.updateMatrixWorld(true);
}
