import {Box3,Euler,Quaternion,Vector3} from 'three';
import {fitArm,orientWorld} from './weapon-ik.js';
import {contactWrist,poseHand,poseThumb} from './weapon-hands.js';
import {recoilPose} from './weapon-recoil.js';
import {resolveAnimationEdits,editTarget,editBone,transitionDuration} from './animation-targets.js';
import {applyCharacterPose} from './character-pose.js';
import {fitAuthoredElbow,hasElbowEdit} from './elbow-pose.js';
import {PISTOL_POSES as POSES} from './weapon-poses.js';
import {transitionWeaponMotion} from './weapon-motion.js';
import {armObstacles,clearForearm,outsideBody,routeSupportWrist,routeSupportStep} from './arm-clearance.js';
import {G17_GRASP,hasApprovedGrip,approvedHandFrame,approvedUpperRest,poseApprovedHand,approvedAimOrigin,approvedElbowPole} from './g17-grasp.js';

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
const handFrame=(entity,side)=>hasApprovedGrip(entity)?approvedHandFrame(entity,side):(side==='R'?RIGHT:LEFT).clone();
const handPose=(entity,side,options)=>hasApprovedGrip(entity)?poseApprovedHand(entity,side):poseHand(entity,side,'pistol',options);
const scaled=(entity,p,q)=>v().fromArray(p).multiplyScalar(entity.weapon.userData.pistol.scale).applyQuaternion(q);

function blendPostures(entity,posture,delta){
  const blend=entity.rifleBlend||={carry:Number(posture==='carry'),hip:Number(posture==='hip'),aim:Number(posture==='aim')};
  if(delta>=.5){for(const state of ['carry','hip','aim'])blend[state]=Number(state===posture);entity.rifleTransition=null;}
  else{
    if(entity.rifleTransition?.posture!==posture)entity.rifleTransition={posture,from:{...blend},elapsed:0,duration:transitionDuration(entity,posture,POSES.transition)};
    const t=Math.min(1,(entity.rifleTransition.elapsed+=Math.max(0,delta))/(entity.rifleTransition.duration||POSES.transition)),amount=t*t*(3-2*t);
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
  const profile=entity.weapon.userData.pistol,hand=rotation.clone().multiply(handFrame(entity,side));
  const palm=scaled(entity,side==='R'?profile.rightPalm:profile.leftPalm,rotation);
  return contactWrist(entity,side,palm,hand);
}

// Attach by the measured middle knuckle. The wrist-to-palm distance belongs
// to the character; the grip position and physical size belong to the gun.
export function attachPistol(entity){
  const weapon=entity.weapon,wrist=bone(entity,'WristR');
  weapon.scale.setScalar(weapon.userData.pistol.scale/wrist.getWorldScale(v()).x);
  weapon.quaternion.copy(hasApprovedGrip(entity)?handFrame(entity,'R').invert():GRIP);weapon.updateMatrixWorld(true);
  const q=weapon.getWorldQuaternion(new Quaternion());
  weapon.position.copy(wrist.worldToLocal(point(entity,'Middle2R').sub(scaled(entity,weapon.userData.pistol.rightPalm,q))));
  weapon.updateMatrixWorld(true);
}

function frame(entity,side,hand,maxBend){
  const rig=entity.rifleHands;
  const approved=hasApprovedGrip(entity),palm=approved?point(entity,'Middle2'+side).sub(point(entity,'Wrist'+side)).applyQuaternion(bone(entity,'Wrist'+side).getWorldQuaternion(new Quaternion()).invert()).normalize():rig.get('Wrist'+side).palm;
  return{hand,axis:palm,rest:rig.get('Wrist'+side).rotation,lowerRest:rig.get('LowerArm'+side).rotation,
    ...(approved&&side==='R'?{preserveUpperSwing:true,upperRest:approvedUpperRest(entity)}:side==='R'&&entity.handgunUpperRest?{preserveUpperSwing:true,upperRest:entity.handgunUpperRest}:{}),
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

function fitHandBase(entity,side,target,rotation,pole,maxBend,contact=null,delta=entity.pistolStep??1){
  if(entity.animationDirectEdit)delta=1;
  const hand=rotation.clone(),root=entity.root,yaw=root.getWorldQuaternion(new Quaternion()),start=point(entity,'UpperArm'+side),previous=entity.pistolPreviousFit?.[side];
  if(previous&&delta<.5&&!(side==='R'&&entity.handgunRecoil))hand.copy(yaw.clone().multiply(previous.hand).rotateTowards(hand,Math.max(0,delta)*5));
  const a=start.distanceTo(point(entity,'LowerArm'+side)),b=point(entity,'LowerArm'+side).distanceTo(point(entity,'Wrist'+side));
  const manual=entity.animationDirectEdit||hasElbowEdit(entity,side)||entity.animationEdits?.support?.some(Boolean)||entity.animationEdits?.contactL?.some(Boolean);
  const obstacles=side==='L'&&entity.weapon.userData.pistol&&!manual?armObstacles(entity):null;
  const inverseHand=bone(entity,'Wrist'+side).getWorldQuaternion(new Quaternion()).invert();
  const handPoints=obstacles?['Middle2','Middle4','Index4','Pinky4'].map(n=>point(entity,n+side).sub(point(entity,'Wrist'+side)).applyQuaternion(inverseHand)):[];
  const loading=entity.weapon.userData.pistol&&(entity.pistolReloadReferenceWeight>0||entity.reloadLast);
  // Finishing the action does not mean the anatomical arm frame has arrived.
  // Release its transport only after the last displayed frame joined the rest.
  const recovering=side==='R'&&(loading||previous?.recovering);
  const wristTarget=()=>{
    const goal=contact?contactWrist(entity,side,target,hand,contact):target.clone(),offset=goal.clone().sub(start);
    if(previous&&delta<.5){
      const wanted=Math.acos(Math.max(-1,Math.min(1,(offset.lengthSq()-a*a-b*b)/(2*a*b)))),step=Math.max(0,delta)*(entity.weapon.userData.pistol&&side==='L'?6:4);
      // Pistols bound opening and closing around the reached elbow angle.
      // The shared revolver/rifle fit retains its calibrated retraction.
      const flex=Math.max(previous.flex-step,(entity.weapon.userData.pistol?Math.min(previous.flex+step,wanted):wanted));
      goal.copy(start).add(offset.setLength(Math.sqrt(Math.max(.000001,a*a+b*b+2*a*b*Math.cos(flex)))));
    }
    if(recovering&&previous&&delta<.5){
      const reached=start.clone().add(previous.offset.clone().applyQuaternion(yaw)),movement=goal.clone().sub(reached).clampLength(0,Math.max(0,delta)*2.5);
      goal.copy(reached).add(movement);
    }
    if(obstacles&&contact){
      const offsets=[v(),...handPoints.map(p=>p.clone().applyQuaternion(hand))];
      for(let pass=0;pass<8;pass++){
        goal.copy(outsideBody(entity,goal,offsets,obstacles));
        const reach=goal.clone().sub(start);if(reach.length()<=a+b-.001)break;
        goal.copy(start).add(reach.setLength(a+b-.001));
      }
      if(previous&&delta<.5){
        const reached=start.clone().add(previous.offset.clone().applyQuaternion(yaw));
        const movement=goal.clone().sub(reached).clampLength(0,Math.max(0,delta)*2.5);
        goal.copy(reached).add(movement);
        const offset=goal.clone().sub(start),wanted=Math.acos(Math.max(-1,Math.min(1,(offset.lengthSq()-a*a-b*b)/(2*a*b)))),step=Math.max(0,delta)*(entity.weapon.userData.pistol&&side==='L'?6:4);
        const flex=Math.max(previous.flex-step,(entity.weapon.userData.pistol?Math.min(previous.flex+step,wanted):wanted));
        goal.copy(start).add(offset.setLength(Math.sqrt(Math.max(.000001,a*a+b*b+2*a*b*Math.cos(flex)))));
      }
    }
    const minimum=Math.abs(a-b)+.008,direction=goal.clone().sub(start);
    if(direction.length()<minimum)goal.copy(start).add(direction.setLength(minimum));
    return goal;
  };
  const twistFrame=()=>{
    const result={twistPreference:previous?.twist};
    if(entity.weapon.userData.pistol&&previous&&delta<.5){
      Object.assign(result,{twistFrom:previous.twist,twistStep:Math.max(0,delta)*8});
      if(side==='L'||recovering)Object.assign(result,{upperFrom:yaw.clone().multiply(previous.upper),upperStep:Math.max(0,delta)*6});
    }
    return result;
  };
  fitArm(...arm(entity,side),wristTarget(),pole,{...frame(entity,side,hand,maxBend),...twistFrame()});
  const axis=point(entity,'Wrist'+side).sub(start).normalize();
  const bend=point(entity,'LowerArm'+side).sub(start);bend.addScaledVector(axis,-bend.dot(axis)).normalize();
  if(previous&&delta<.5&&!entity.animationDirectEdit){
    const before=previous.bend.clone().applyQuaternion(yaw);before.addScaledVector(axis,-before.dot(axis)).normalize();
    if(before.lengthSq()>.5){
      const turn=Math.atan2(axis.dot(before.clone().cross(bend)),before.dot(bend)),limit=Math.max(0,delta)*3;
      bend.copy(before.applyAxisAngle(axis,Math.max(-limit,Math.min(limit,turn))));
    }
  }
  const stablePole=goal=>{
    const offset=goal.clone().sub(start),axis=offset.clone().normalize(),direction=bend.clone().addScaledVector(axis,-bend.dot(axis)).normalize();
    if(side==='L'){
      const distance=Math.max(.001,Math.min(a+b-.001,offset.length())),along=(a*a-b*b+distance*distance)/(2*distance),height=Math.sqrt(Math.max(0,a*a-along*along));
      const down=v(0,-1,0).addScaledVector(axis,axis.y),vertical=down.length();
      if(height*vertical>1e-6){
        down.normalize();const maximum=Math.acos(Math.max(-1,Math.min(1,(axis.y*along-.02)/(height*vertical)))),angle=direction.angleTo(down);
        if(angle>maximum){const signed=Math.atan2(axis.dot(direction.clone().cross(down)),direction.dot(down));direction.applyAxisAngle(axis,Math.sign(signed)*(angle-maximum));}
      }
    }
    if(obstacles)direction.copy(clearForearm(entity,start,goal,direction,a,b,obstacles,delta));
    return start.clone().add(direction);
  };
  let twist=0,upperRemaining=0;
  for(let i=0;i<32;i++){
    const f={...frame(entity,side,hand,0),...twistFrame()};
    const goal=wristTarget();fitArm(...arm(entity,side),goal,stablePole(goal),f);orientWorld(bone(entity,'Wrist'+side),hand);root.updateMatrixWorld(true);
    twist=f.forearmTwist;
    upperRemaining=f.upperRemaining||0;
    const fore=point(entity,'Wrist'+side).sub(point(entity,'LowerArm'+side)).normalize();
    const direction=point(entity,'Middle2'+side).sub(point(entity,'Wrist'+side)).normalize(),angle=direction.angleTo(fore);
    if(angle>(maxBend+2)*Math.PI/180){
      const turn=direction.clone().cross(fore).normalize();hand.premultiply(new Quaternion().setFromAxisAngle(turn,Math.min(.25,angle-maxBend*Math.PI/180)));
    }else if(Math.abs(f.wristTwist)>24*Math.PI/180){
      const excess=f.wristTwist-Math.sign(f.wristTwist)*22*Math.PI/180;
      hand.premultiply(new Quaternion().setFromAxisAngle(fore,-Math.max(-.25,Math.min(.25,excess))));
    }else break;
  }
  const actual=point(entity,'LowerArm'+side).sub(start),along=point(entity,'Wrist'+side).sub(start).normalize();actual.addScaledVector(along,-actual.dot(along)).normalize();
  const flex=point(entity,'LowerArm'+side).sub(start).angleTo(point(entity,'Wrist'+side).sub(point(entity,'LowerArm'+side)));
  entity.pistolFits||={};entity.pistolFits[side]={recovering:Boolean(recovering&&upperRemaining>.005),upper:bone(entity,'UpperArm'+side).getWorldQuaternion(new Quaternion()).premultiply(yaw.clone().invert()),offset:point(entity,'Wrist'+side).sub(start).applyQuaternion(yaw.clone().invert()),bend:actual.applyQuaternion(yaw.clone().invert()),hand:bone(entity,'Wrist'+side).getWorldQuaternion(new Quaternion()).premultiply(yaw.clone().invert()),flex,twist};
  return hand;
}

function fitHand(entity,side,target,rotation,pole,maxBend,contact=null,delta=entity.pistolStep??1){
  const authored=hasElbowEdit(entity,side),previous=entity.pistolPreviousFit;
  if(authored)entity.pistolPreviousFit={...previous,[side]:entity.pistolAutoFits?.[side]};
  let hand;
  try{hand=fitHandBase(entity,side,target,rotation,authored?(entity.animationTargetBases?.['elbow'+side]||pole):pole,maxBend,contact,delta);}
  finally{entity.pistolPreviousFit=previous;}
  entity.pistolAutoFits||={};entity.pistolAutoFits[side]=entity.pistolFits[side];
  if(authored){
    const baseline=point(entity,'LowerArm'+side),wristTarget=point(entity,'Wrist'+side),reached=bone(entity,'Wrist'+side).getWorldQuaternion(new Quaternion());
    fitAuthoredElbow(entity,side,arm(entity,side),wristTarget,pole,frame(entity,side,reached,maxBend),{maxBend:entity.weapon.userData.pistol?38:75,maxWristTwist:35,basePole:baseline});
    hand=bone(entity,'Wrist'+side).getWorldQuaternion(new Quaternion());
  }
  return hand;
}

export function fitHandTarget(entity,side,target,rotation,pole,maxBend){return fitHand(entity,side,target,rotation,pole,maxBend);}

function fitRight(entity,origin,rotation,pole,maxBend=22){
  if(hasApprovedGrip(entity)&&maxBend===22)maxBend=24;
  const hand=rotation.clone().multiply(handFrame(entity,'R')),target=origin.clone().add(handOffset(entity,'R',rotation));
  fitHand(entity,'R',target,hand,pole,maxBend);attachPistol(entity);
}

export function fitPistolWeaponPose(entity,origin,rotation,amount=1){
  const weapon=entity.weapon,from=weapon.getWorldPosition(v()),q=weapon.getWorldQuaternion(new Quaternion());
  origin=origin.clone();rotation=rotation.clone();editTarget(entity,'weapon',origin,rotation,'reload');
  const shoulder=entity.root.worldToLocal(point(entity,'UpperArmR'));
  const pole=entity.root.localToWorld(shoulder.add(v(-.12,-.20,.12)));
  editTarget(entity,'elbowR',pole,null,'reload');
  const wristPath=from.add(handOffset(entity,'R',q)).lerp(origin.add(handOffset(entity,'R',rotation)),amount);
  const blended=q.slerp(rotation,amount);
  fitRight(entity,wristPath.sub(handOffset(entity,'R',blended)),blended,pole,48);
}

export function fitPistolSupportContact(entity,palm,rotation,contact='Middle2',options={}){
  const hand=rotation.clone(),shoulder=entity.root.worldToLocal(point(entity,'UpperArmL'));
  palm=palm.clone();if(options.stage==='reload')editTarget(entity,'support',palm,hand,'reload');
  palm=frontPoint(entity,palm,options.clearance??1);
  if(options.delta!==undefined){
    let wrist=contactWrist(entity,'L',palm,hand,contact);
    if(entity.weapon.userData.pistol)wrist=routeSupportWrist(entity,outsideBody(entity,wrist));
    const target=guide(entity,options.key||'pistolContactPose','L',wrist,hand,options.delta);
    hand.copy(target.rotation);palm=target.point.sub(contactWrist(entity,'L',v(),hand,contact));
  }
  const editedPole=options.stage==='reload'&&entity.animationEdits?.elbowL.some(Boolean);
  const pole=options.pole?.clone()||(!editedPole&&entity.pistolContactPole?entity.root.localToWorld(entity.pistolContactPole.clone()):entity.root.localToWorld(shoulder.clone().add(v(.12,-.20,.12))));
  if(options.stage==='reload'&&entity.weapon.userData.pistol&&!editedPole)pole.lerp(entity.root.localToWorld(shoulder.clone().add(v(.20,.20,.25))),entity.pistolCrouch||0);
  if(options.stage==='reload')editTarget(entity,'elbowL',pole,null,'reload');
  const maxBend=options.maxBend??48;
  fitHand(entity,'L',palm,hand,pole,maxBend,contact,options.delta??entity.pistolStep??1);
  entity.pistolContactPole=entity.root.worldToLocal(point(entity,'LowerArmL'));
  return bone(entity,'WristL').getWorldQuaternion(new Quaternion());
}

const joints=(entity,side)=>['Shoulder','UpperArm','LowerArm','Wrist'].map(n=>bone(entity,n+side));

function frontPoint(entity,palm,amount){
  const root=entity.root,target=root.worldToLocal(palm.clone()),anchor=root.worldToLocal(point(entity,'UpperArmL'));
  const clearance=Math.max(0,Math.min(1,(target.y-anchor.y+.45)/.20));
  if(clearance>0)target.z+=Math.max(0,anchor.z+.25*clearance-target.z)*Math.max(0,Math.min(1,amount/.25));
  return root.localToWorld(target);
}

// Follow a hand target relative to its shoulder. Joint-space crossfades between
// different clavicle frames can lift the hand over the head even though both
// endpoints are sound. A target path also survives interrupted transitions.
function guide(entity,key,side,pointTarget,rotation,delta){
  const root=entity.root,yaw=root.getWorldQuaternion(new Quaternion()),anchor=root.worldToLocal(point(entity,'UpperArm'+side));
  let wanted=pointTarget;
  const reached=side==='L'&&entity.weapon.userData.pistol?entity.pistolPreviousFit?.L:null;
  const previous=reached?{offset:reached.offset.clone().divideScalar(root.scale.x),rotation:reached.hand}:entity[key];
  if(previous&&delta<.5&&!entity.animationDirectEdit&&side==='L'&&entity.weapon.userData.pistol){
    const from=root.localToWorld(anchor.clone().add(previous.offset));
    wanted=routeSupportStep(entity,from,pointTarget);
  }
  const offset=root.worldToLocal(wanted.clone()).sub(anchor),q=yaw.clone().invert().multiply(rotation);
  if(previous&&delta<.5&&!entity.animationDirectEdit){
    const step=offset.clone().sub(previous.offset),distance=(side==='L'?2:1.5)*Math.max(0,delta)/root.scale.x;
    offset.copy(previous.offset).add(step.clampLength(0,distance));
    q.copy(previous.rotation.clone().rotateTowards(q,Math.max(0,delta)*6));
  }
  entity[key]={offset:offset.clone(),rotation:q.clone()};
  return{point:root.localToWorld(anchor.add(offset)),rotation:yaw.multiply(q)};
}

export function applyPistolPose(entity,player,delta,posture){
  entity.pistolStep=delta;
  entity.pistolPreviousFit={...entity.pistolFits};
  const rig=entity.rifleHands,root=entity.root,weapon=entity.weapon,profile=weapon.userData.pistol;
  const saved=[...rig.values()].map(e=>e.bone).concat(['Torso','Chest','Neck','Head'].map(n=>bone(entity,n))).filter(Boolean);
  entity.rifleRestore=new Map(saved.map(b=>[b,b.quaternion.clone()]));
  const freeLeft=new Map(saved.filter(b=>/(Shoulder|UpperArm|LowerArm|Wrist|Index|Middle|Ring|Pinky|Thumb).*L$/.test(b.name)).map(b=>[b,b.quaternion.clone()]));
  eyeLocal(entity,player);
  const blend=blendPostures(entity,posture,delta),active=blend.aim+blend.hip;
  if(hasApprovedGrip(entity)){
    const ease=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);},reload=player.combat?.reload,last=entity.reloadLast;
    const reloadWeight=reload?ease(Math.min(reload.elapsed/.25,(reload.duration-reload.elapsed)/.25)):last?last.referenceWeight*(1-ease(last.elapsed/.28)):0;
    entity.pistolReloadReferenceWeight=reloadWeight;
    // The new aiming frame must not be forced onto a lowered/reloading arm.
    // Blend the authored neutral arm frame into the approved reference frame.
    entity.pistolReferenceWeight=active*(1-reloadWeight);
  }
  resolveAnimationEdits(entity,player,blend);
  applyCharacterPose(entity,player);
  entity.pistolBodyPose||=new Map();
  const bodyYaw=root.getWorldQuaternion(new Quaternion()),bodyTargets=new Map(['Torso','Chest'].map(name=>[name,bodyYaw.clone().invert().multiply(bone(entity,name).getWorldQuaternion(new Quaternion()))]));
  for(const name of ['Torso','Chest']){
    const target=bodyTargets.get(name),previous=entity.pistolBodyPose.get(name);
    if(previous&&delta<.5&&!entity.animationDirectEdit)target.copy(previous.clone().rotateTowards(target,Math.max(0,delta)*3));
    orientWorld(bone(entity,name),bodyYaw.clone().multiply(target));entity.pistolBodyPose.set(name,target.clone());
  }
  for(const side of ['R','L'])for(const part of ['Shoulder','UpperArm','LowerArm','Wrist']){const e=rig.get(part+side);e.bone.quaternion.copy(e.rotation);}
  root.updateMatrixWorld(true);
  const yaw=root.getWorldQuaternion(new Quaternion()),chest=bone(entity,'Chest'),head=bone(entity,'Head'),headQ=head.getWorldQuaternion(new Quaternion());
  const worldTurn=yaw.clone().multiply(new Quaternion().setFromAxisAngle(v(0,1,0),POSES.chestTurn*active)).multiply(yaw.clone().invert());
  orientWorld(chest,worldTurn.multiply(chest.getWorldQuaternion(new Quaternion())));
  editBone(entity,'Chest','chest');
  const approved=hasApprovedGrip(entity);
  const lift=yaw.clone().multiply(new Quaternion().setFromAxisAngle(approved?v(0,1,0):v(0,0,1),(approved?G17_GRASP.shoulderProtraction:POSES.shoulderLift)*active)).multiply(yaw.clone().invert());
  orientWorld(bone(entity,'ShoulderR'),lift.multiply(bone(entity,'ShoulderR').getWorldQuaternion(new Quaternion())));
  const headAim=yaw.clone().multiply(new Quaternion().setFromEuler(new Euler(...POSES.head,'YXZ')));
  orientWorld(head,headQ.slerp(headAim,blend.aim));root.updateMatrixWorld(true);
  editBone(entity,'Head','head');
  // Use the same metacarpal pose for reach calculation and final attachment.
  // Locomotion clips contain small finger rotations of their own.
  handPose(entity,'R');handPose(entity,'L');

  const crouched=player.stance==='sneak'&&!player.running;
  entity.pistolCrouchHold=crouched?.16:Math.max(0,(entity.pistolCrouchHold||0)-Math.max(0,delta));
  const crouch=Number(crouched||entity.pistolCrouchHold>0),before=entity.pistolCrouch??crouch;
  entity.pistolCrouch=delta>=.5?crouch:before+Math.max(-delta/.24,Math.min(delta/.12,crouch-before));
  const shoulder=root.worldToLocal(point(entity,'UpperArmR')),hipAmount=active>0?blend.hip/active:0;
  const aimRotation=yaw.clone().multiply(new Quaternion().setFromEuler(new Euler(.23*hipAmount,approved?G17_GRASP.weaponYaw:0,0,'YXZ')));
  const aimOrigin=(approved?approvedAimOrigin(entity,aimRotation):aimPoint(entity,yaw)).lerp(root.localToWorld(shoulder.clone().add(v(...POSES.hipPoint))),hipAmount);
  const aimShoulder=bone(entity,'ShoulderR').quaternion.clone();
  for(const[b,q]of entity.handgunCarry)b.quaternion.copy(q);root.updateMatrixWorld(true);
  attachPistol(entity);
  const carryElbow=point(entity,'LowerArmR');
  const carryOrigin=weapon.getWorldPosition(v()),carryRotation=weapon.getWorldQuaternion(new Quaternion());
  carryOrigin.lerp(root.localToWorld(shoulder.clone().add(v(...POSES.crouchCarryPoint))),entity.pistolCrouch);
  carryRotation.slerp(yaw.clone().multiply(new Quaternion().setFromEuler(new Euler(...POSES.crouchCarryRotation,'YXZ'))),entity.pistolCrouch);
  const endpoint=posture==='carry'?{point:carryOrigin,rotation:carryRotation}:{point:aimOrigin,rotation:aimRotation};
  const blendedRotation=carryRotation.clone().slerp(aimRotation,active);
  const wristPath=carryOrigin.clone().add(handOffset(entity,'R',carryRotation)).lerp(aimOrigin.clone().add(handOffset(entity,'R',aimRotation)),active);
  wristPath.addScaledVector(v(0,0,1).applyQuaternion(yaw),.18*Math.sin(Math.PI*active)*root.scale.x);
  const blendedOrigin=wristPath.sub(handOffset(entity,'R',blendedRotation));
  const {point:targetPoint,rotation:targetRotation}=transitionWeaponMotion(entity,blendedOrigin,blendedRotation,delta,endpoint);
  editTarget(entity,'weapon',targetPoint,targetRotation);
  const held=guide(entity,'pistolWeaponPose','R',targetPoint,targetRotation,delta);
  const kick=recoilPose(player,weapon.userData.weaponId,true),pivot=held.point.clone().add(handOffset(entity,'R',held.rotation));
  held.rotation.multiply(new Quaternion().setFromEuler(new Euler(-kick.pitch*active,0,kick.roll*active)));
  held.point.copy(pivot).sub(handOffset(entity,'R',held.rotation)).addScaledVector(v(0,0,1).applyQuaternion(held.rotation),-kick.back*active);
  bone(entity,'ShoulderR').quaternion.slerp(aimShoulder,active);editBone(entity,'ShoulderR','shoulderR');root.updateMatrixWorld(true);
  const rightPole=carryElbow.lerp(root.localToWorld(shoulder.clone().add(v(...POSES.carryElbow))),entity.pistolCrouch)
    .lerp(approved?approvedElbowPole(entity,'R'):root.localToWorld(shoulder.clone().add(v(...POSES.aimElbow))),active);
  editTarget(entity,'elbowR',rightPole);
  fitRight(entity,held.point,held.rotation,rightPole);

  // Read the authored free hand in world space before putting the clavicle
  // into the common procedural frame. In particular, the female crouch clips
  // carry a different clavicle rotation; blending those local axes caused the
  // large clockwise loop on release and rejoining.
  for(const[b,q]of freeLeft)b.quaternion.copy(q);root.updateMatrixWorld(true);
  const freeWrist=point(entity,'WristL'),hand=bone(entity,'WristL').getWorldQuaternion(new Quaternion()),elbow=point(entity,'LowerArmL');
  for(const b of joints(entity,'L'))b.quaternion.copy(rig.get(b.name).rotation);root.updateMatrixWorld(true);
  if(approved&&entity.pistolSupportShoulder){bone(entity,'ShoulderL').quaternion.copy(entity.pistolSupportShoulder);root.updateMatrixWorld(true);}
  editBone(entity,'ShoulderL','shoulderL');
  handPose(entity,'L');
  for(const[b,q]of freeLeft)if(/^(Index|Middle|Ring|Pinky|Thumb)/.test(b.name))b.quaternion.copy(q.clone().slerp(b.quaternion,active));
  root.updateMatrixWorld(true);
  const support=weapon.getWorldQuaternion(new Quaternion()).multiply(handFrame(entity,'L')),contact=weapon.localToWorld(v().fromArray(profile.leftPalm));
  const leftShoulder=point(entity,'UpperArmL');
  if(approved){
    // A hanging neutral hand is behind the raised knee in these crouch clips.
    // Keep the released G17 hand in an open low-ready beside the knee instead.
    const ready=root.localToWorld(root.worldToLocal(leftShoulder.clone()).add(v(.26,-.10,.30)));
    freeWrist.lerp(ready,entity.pistolCrouch);
    hand.slerp(yaw.clone().multiply(handFrame(entity,'L')),entity.pistolCrouch);
  }
  // Keep a joining/releasing hand in front of the chest. A straight blend
  // through the torso can put its wrist inside the unequal arm links' minimum
  // reach during a crouch/stand interruption, forcing a folded elbow to flip.
  const supportWrist=freeWrist.lerp(contactWrist(entity,'L',contact,support),active);
  supportWrist.add(v(.18,.04,.16).multiplyScalar(Math.sin(Math.PI*active)*root.scale.x).applyQuaternion(yaw));
  hand.slerp(support,active);
  const supportTarget=outsideBody(entity,supportWrist);
  // The final joined grip is calibrated and reachable with a bent arm; a
  // straight shoulder corridor must not lift it off the gun while walking.
  supportTarget.lerp(routeSupportWrist(entity,supportTarget),Math.min(1,(1-active)/.15));
  const supportPose=guide(entity,'pistolSupportPose','L',supportTarget,hand,delta);
  supportPose.point.sub(contactWrist(entity,'L',v(),supportPose.rotation));
  editTarget(entity,'support',supportPose.point,supportPose.rotation);
  const pole=elbow.lerp(approved?approvedElbowPole(entity,'L'):leftShoulder.clone().add(v(...POSES.supportElbow).applyQuaternion(yaw)),active);
  pole.add(v(.20,.50,.30).multiplyScalar(Math.sin(Math.PI*active)*root.scale.x).applyQuaternion(yaw));
  editTarget(entity,'elbowL',pole);
  fitPistolSupportContact(entity,supportPose.point,supportPose.rotation,'Middle2',{pole,maxBend:32-4*active,clearance:0});
  entity.weaponPoles={right:rightPole,left:pole};
  const impulse=player.combat?.shotImpulse,trigger=Boolean(player.combat?.triggerHeld)||impulse?.weaponId===weapon.userData.weaponId&&impulse.age<.25;
  handPose(entity,'R',{trigger:Number(trigger)});
  // Thumb contact depends on the reached wrist and gun, while the metacarpal
  // pose used by the arm solve must stay unchanged.
  if(!approved){
    for(const[b,q]of freeLeft)if(/^Thumb/.test(b.name))b.quaternion.copy(q);
    poseThumb(entity,'L','pistol',{weight:active});
  }
  root.updateMatrixWorld(true);
}
