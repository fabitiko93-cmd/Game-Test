import { Euler, Quaternion, Vector3 } from "three";
import { applyRifleAnimation } from './rifle-animation.js';
import {applyWeaponClip,WEAPON_MOTIONS} from './weapon-animation.js';
import {recoilPose} from './weapon-recoil.js';
import {activeWeapon} from './inventory.js';
import {fitArm,orientWorld} from './weapon-ik.js';
import {contactWrist,poseThumb,poseWeaponHands,supportHandRotation} from './weapon-hands.js';
import {applyPistolPose,fitPistolSupportContact,fitPistolWeaponPose} from './pistol-pose.js';
import {resolveAnimationEdits,editTarget,editBone,transitionDuration} from './animation-targets.js';
import {applyCharacterPose} from './character-pose.js';

// The authored wrist's +Y follows the fingers; a rifle asset's +Z follows its
// barrel. Keep the original body/leg animation and fit both arms to this grip.
export const RIFLE_GRIP_ROTATION = new Quaternion().setFromEuler(new Euler(-Math.PI / 2, 0, Math.PI / 2));
const inverseGrip = RIFLE_GRIP_ROTATION.clone().invert();



// Wrist offsets are measured from the AK, not mistaken for palm/grip centers.
// The long authored palm reaches from the wrist to the metacarpal knuckles.
export const RIFLE_HANDS = Object.freeze({
  right: new Vector3(-.032, 0, -.14),
  left: new Vector3(.145, .03, .255),
});

export function captureRifleRig(model) {
  const hands = new Map();
  model.updateMatrixWorld(true);
  for (const side of ["L","R"]) for (const finger of ["Index","Middle","Ring","Pinky","Thumb"])
    for (let i=1;i<=(finger==="Thumb"?3:4);i++) {
      const bone=model.getObjectByName(`${finger}${i}${side}`);
      if(bone)hands.set(bone.name,{bone,rotation:bone.quaternion.clone()});
    }
  for(const side of ['L','R'])for(const part of ['Shoulder','UpperArm','LowerArm','Wrist']) {
    const bone=model.getObjectByName(part+side);if(bone)hands.set(bone.name,{bone,rotation:bone.quaternion.clone()});
  }
  for(const side of ['L','R']) {
    const upper=hands.get('UpperArm'+side),lower=hands.get('LowerArm'+side),wrist=hands.get('Wrist'+side);
    if(!upper||!lower||!wrist)continue;
    const start=upper.bone.getWorldPosition(new Vector3()),elbow=lower.bone.getWorldPosition(new Vector3());
    wrist.palm=model.getObjectByName('Middle2'+side).getWorldPosition(new Vector3()).sub(wrist.bone.getWorldPosition(new Vector3())).applyQuaternion(wrist.bone.getWorldQuaternion(new Quaternion()).invert()).normalize();
    upper.hinge=elbow.clone().sub(start).cross(wrist.bone.getWorldPosition(new Vector3()).sub(elbow)).normalize()
      .applyQuaternion(upper.bone.getWorldQuaternion(new Quaternion()).invert());
  }
  return hands;
}

export function restoreRiflePose(entity) {
  if(!entity.rifleRestore)return;
  for(const [bone,rotation] of entity.rifleRestore)bone.quaternion.copy(rotation);
  entity.rifleRestore=null;
}


export function riflePosture(player) {
  const weapon=activeWeapon(player);
  if(player.moving)return player.running?'carry':'aim';
  const impulse=player.combat?.shotImpulse;
  if(impulse&&impulse.weaponId===weapon?.id&&impulse.age<.35&&!player.moving)return 'aim';
  if(player.combat?.enabled&&player.combat?.targetId&&(player.combat.aim>0||player.combat.triggerHeld))return 'aim';
  return 'carry';
}

export function applyRiflePose(entity, player, delta=1, posture=riflePosture(player)) {
  const model = entity.model, root = entity.root, weapon = entity.weapon;
  if (!weapon || player.dead) return;
  const grips=weapon.userData.grips;
  const handgun=Boolean(grips?.handgun),kick=recoilPose(player,weapon.userData.weaponId,handgun);
  const rightOffset=grips?new Vector3().fromArray(grips.right):RIFLE_HANDS.right;
  const leftOffset=grips?new Vector3().fromArray(grips.left):RIFLE_HANDS.left;
  const bone = name => model.getObjectByName(name);
  const right = ["UpperArmR", "LowerArmR", "WristR"].map(bone), left = ["UpperArmL", "LowerArmL", "WristL"].map(bone);
  if ([...right, ...left].some(part => !part)) return;
  entity.rifleHands ||= captureRifleRig(model);
  restoreRiflePose(entity);
  if(weapon.userData.pistol){applyPistolPose(entity,player,delta,posture);return;}
  const torso=bone('Torso'),chest=bone('Chest'),head=bone('Head');
  entity.rifleRestore=new Map([...right,...left,torso,chest,head,...[...entity.rifleHands.values()].map(e=>e.bone)].filter(Boolean).map(b=>[b,b.quaternion.clone()]));
  const freeLeftPoint=left[2].getWorldPosition(new Vector3()),freeLeftRotation=left[2].getWorldQuaternion(new Quaternion());
  const freeLeftElbow=left[1].getWorldPosition(new Vector3());
  const freeLeftArm=new Map([...left,bone('ShoulderL')].map(b=>[b,b.quaternion.clone()]));
  const freeLeftFingers=new Map([...entity.rifleHands.values()].filter(e=>/^(Index|Middle|Ring|Pinky|Thumb).*L$/.test(e.bone.name)).map(e=>[e.bone,e.bone.quaternion.clone()]));
  for(const side of ['L','R'])for(const part of ['Shoulder','UpperArm','LowerArm','Wrist']) {
    const entry=entity.rifleHands.get(part+side);if(entry)entry.bone.quaternion.copy(entry.rotation);
  }
  root.updateMatrixWorld(true);
  const blend=entity.rifleBlend ||= {carry:posture==='carry'?1:0,hip:posture==='hip'?1:0,aim:posture==='aim'?1:0};
  if(delta>=.5) {
    for(const state of ['carry','hip','aim'])blend[state]=Number(state===posture);
    entity.rifleTransition=null;
    entity.supportElbow=null;entity.supportTwist=null;
  } else {
    if(entity.rifleTransition?.posture!==posture)entity.rifleTransition={posture,from:{...blend},elapsed:0,duration:transitionDuration(entity,posture,.42)};
    const transition=entity.rifleTransition;
    transition.elapsed+=Math.max(0,delta);
    const t=Math.min(1,transition.elapsed/(transition.duration||.42)),amount=t*t*(3-2*t);
    for(const state of ['carry','hip','aim'])blend[state]=transition.from[state]+(Number(state===posture)-transition.from[state])*amount;
  }
  entity.riflePosture=posture;
  resolveAnimationEdits(entity,player,blend);
  applyCharacterPose(entity,player);
  const crouched=handgun&&player.stance==='sneak'&&!player.running;
  // Hold the front carry until the torso has finished standing up, then lower
  // it. Mixing in the neutral arm while the chest still leans twists the wrist.
  entity.handgunCrouchHold=crouched?.16:delta>=.5?0:Math.max(0,(entity.handgunCrouchHold||0)-delta);
  const crouchTarget=Number(crouched||entity.handgunCrouchHold>0),crouchDuration=crouchTarget?.12:.24;
  entity.handgunCrouchBlend??=crouchTarget;
  entity.handgunCrouchBlend=delta>=.5?crouchTarget:entity.handgunCrouchBlend+Math.max(-delta/crouchDuration,Math.min(delta/crouchDuration,crouchTarget-entity.handgunCrouchBlend));
  const crouchCarry=entity.handgunCrouchBlend;
  const headRotation=head?.getWorldQuaternion(new Quaternion());
  if(handgun){
    const amount=blend.hip+blend.aim;
    entity.rifleTime=(entity.rifleTime||0)+Math.max(0,delta);
    if(amount>0)applyWeaponClip(entity,player,'revolverAim',((entity.rifleTime||0)/WEAPON_MOTIONS.clips.revolverAim.duration)%1,amount);
    const impulse=player.combat?.shotImpulse;
    if(impulse?.age<.3)applyWeaponClip(entity,player,'revolverShoot',impulse.age/WEAPON_MOTIONS.clips.revolverShoot.duration,Math.exp(-impulse.age*14)*amount);
  }else applyRifleAnimation(entity,player,blend,delta);
  const stockContact=weapon.userData.stockContact;
  // Keep the imported torso motion while fitting the arms to the real weapon.
  // Turn the support shoulder forward so reaching the fore-end does not push
  // the hip-held rifle back through the firing wrist.
  if(chest) {
    const turn=handgun?-.08*blend.hip-.10*blend.aim:-.05*blend.carry-.50*blend.hip-.78*blend.aim;
    orientWorld(chest,new Quaternion().setFromAxisAngle(new Vector3(0,1,0),turn).multiply(chest.getWorldQuaternion(new Quaternion())));
    if(head)orientWorld(head,headRotation);
    root.updateMatrixWorld(true);
  }
  editBone(entity,'Chest','chest');editBone(entity,'Head','head');
  editBone(entity,'ShoulderR','shoulderR');editBone(entity,'ShoulderL','shoulderL');
  const pitch=(handgun?1.22:.80)*blend.carry+(handgun?.30:.22)*blend.hip+.015*blend.aim;
  const yaw=root.getWorldQuaternion(new Quaternion());
  const gunRotation=yaw.multiply(new Quaternion().setFromEuler(new Euler(pitch,(handgun?0:1.25)*blend.carry,0,'YXZ')));
  const shoulder = root.worldToLocal(right[0].getWorldPosition(new Vector3()));
  const scaled=point=>point.clone().multiply(root.getWorldScale(new Vector3())).applyQuaternion(gunRotation);
  let carryGoal=root.localToWorld(shoulder.clone().add(new Vector3(.14,-.30,.11))),carryElbow;
  if(handgun&&entity.handgunCarry){
    const previous=new Map([...entity.handgunCarry.keys()].map(b=>[b,b.quaternion.clone()]));
    for(const[b,q]of entity.handgunCarry)b.quaternion.copy(q);
    root.updateMatrixWorld(true);
    const carryRotation=right[2].getWorldQuaternion(new Quaternion()).multiply(RIFLE_GRIP_ROTATION);
    carryElbow=right[1].getWorldPosition(new Vector3());
    carryGoal=right[2].getWorldPosition(new Vector3()).sub(rightOffset.clone().multiply(root.getWorldScale(new Vector3())).applyQuaternion(carryRotation));
    for(const[b,q]of previous)b.quaternion.copy(q);
    root.updateMatrixWorld(true);
    // The standing arm follows a forward-leaning crouch torso backwards. Keep
    // the one-handed low ready in front of the chest, in the body's yaw frame.
    const crouchRotation=root.getWorldQuaternion(new Quaternion()).multiply(new Quaternion().setFromEuler(new Euler(.70,.55,0,'YXZ')));
    carryRotation.slerp(crouchRotation,crouchCarry);
    carryGoal.lerp(root.localToWorld(shoulder.clone().add(new Vector3(.10,-.13,.26))),crouchCarry);
    carryElbow.lerp(root.localToWorld(shoulder.clone().add(new Vector3(-.12,-.20,.12))),crouchCarry);
    gunRotation.slerp(carryRotation,blend.carry);
  }
  gunRotation.multiply(new Quaternion().setFromEuler(new Euler(-kick.pitch,0,kick.roll)));
  const hipGoal=root.localToWorld(handgun?new Vector3(0,shoulder.y-.24,shoulder.z+.38):shoulder.clone().add(new Vector3(.015,-.25,.24)));
  const shoulderContact=root.localToWorld(shoulder.clone().add(new Vector3(-.012,.015,.055)));
  const aimGoal=stockContact?shoulderContact.clone().sub(scaled(stockContact)):root.localToWorld(handgun?new Vector3(0,shoulder.y+.025,shoulder.z+.50):shoulder.clone().add(new Vector3(.03,-.10,.25)));
  const gunGoal=carryGoal.multiplyScalar(blend.carry).addScaledVector(hipGoal,blend.hip).addScaledVector(aimGoal,blend.aim);
  gunGoal.addScaledVector(new Vector3(0,0,1).applyQuaternion(gunRotation),-kick.back);
  editTarget(entity,'weapon',gunGoal,gunRotation);
  entity.rifleShoulderContact=shoulderContact;
  const offsets=[scaled(rightOffset),scaled(leftOffset)];
  // Walking/running twists the shoulders. Keep the chosen grip inside both
  // arms' actual reach rather than stretching a sleeve or detaching a hand.
  for (let iteration = 0; iteration < 10; iteration++) {
    for (const [arm, offset] of (handgun&&blend.carry>.99?[[right,offsets[0]]]:[[right,offsets[0]],[left,offsets[1]]])) {
      const start = arm[0].getWorldPosition(new Vector3()), elbow = arm[1].getWorldPosition(new Vector3()), hand = arm[2].getWorldPosition(new Vector3());
      const reach = elbow.distanceTo(start) + hand.distanceTo(elbow) - .01;
      const delta = gunGoal.clone().add(offset).sub(start);
      if (delta.length() > reach) gunGoal.copy(start).add(delta.setLength(reach)).sub(offset);
    }
  }
  // Body-relative elbow planes keep every pose open enough for the firing
  // forearm. Clip-dependent poles can fold it inward as the animation loops.
  const rightBend=new Vector3(-.12,-.28,.12).multiplyScalar(blend.carry)
    .addScaledVector(new Vector3(-.24,-.16,-.11),blend.hip).addScaledVector(new Vector3(-.28,-.10,-.10),blend.aim);
  const rightPole=root.localToWorld(shoulder.clone().add(rightBend));
  if(carryElbow)rightPole.lerp(carryElbow,blend.carry);
  const leftShoulder = root.worldToLocal(left[0].getWorldPosition(new Vector3()));
  const leftBend=new Vector3(.07,-.28,-.05).multiplyScalar(blend.carry)
    .addScaledVector(new Vector3(.10,-.24,.12),blend.hip).addScaledVector(new Vector3(.10,-.18,.15),blend.aim);
  const leftPole=root.localToWorld(leftShoulder.clone().add(leftBend));
  if(handgun)leftPole.lerp(freeLeftElbow,blend.carry);
  editTarget(entity,'elbowR',rightPole);editTarget(entity,'elbowL',leftPole);
  const rightHand=gunRotation.clone().multiply(inverseGrip),leftHand=gunRotation.clone().multiply(supportHandRotation(weapon));
  if(handgun)leftHand.slerp(freeLeftRotation,blend.carry);
  const frame=side=>({hand:side==='R'?rightHand:leftHand,axis:entity.rifleHands.get('Wrist'+side).palm,rest:entity.rifleHands.get('Wrist'+side).rotation,lowerRest:entity.rifleHands.get('LowerArm'+side).rotation,hinge:entity.rifleHands.get('UpperArm'+side).hinge,maxTwist:handgun?Math.PI/3:Math.PI,maxBend:(side==='R'?75:60)*Math.PI/180});
  entity.weaponPoles={right:rightPole.clone(),left:leftPole.clone()};
  if(delta<.5&&!entity.animationDirectEdit&&entity.supportElbow)entity.weaponPoles.left=root.localToWorld(entity.supportElbow.clone()).lerp(leftPole,Math.min(1,delta*8));
  fitArm(...right, gunGoal.clone().add(offsets[0]), rightPole,frame('R'));
  orientWorld(right[2], rightHand);
  if(handgun&&entity.handgunCarry&&kick.pitch===0&&crouchCarry===0&&!entity.animationEdits.weapon.some(Boolean)&&!entity.animationEdits.elbowR.some(Boolean)&&!entity.animationEdits.shoulderR.some(Boolean))for(const[b,q]of entity.handgunCarry)b.quaternion.slerp(q,blend.carry**4);
  root.updateMatrixWorld(true);
  if(handgun)entity.weaponPoles.right.copy(right[1].getWorldPosition(new Vector3()));
  weapon.quaternion.copy(RIFLE_GRIP_ROTATION);
  weapon.position.copy(rightOffset).negate().applyQuaternion(RIFLE_GRIP_ROTATION);
  weapon.updateMatrixWorld(true);
  const leftGoal = weapon.localToWorld(leftOffset.clone());
  if(handgun)leftGoal.lerp(freeLeftPoint,blend.carry);
  poseWeaponHands(entity,player,{freeLeft:handgun?blend.carry:0,freeLeftFingers});
  const offset=left[2].getWorldPosition(new Vector3()).sub(bone('Middle2L').getWorldPosition(new Vector3())).applyQuaternion(left[2].getWorldQuaternion(new Quaternion()).invert()).applyQuaternion(leftHand);
  const palmGoal=leftGoal.clone().sub(offset);
  if(handgun&&blend.carry>.999&&!entity.animationEdits.contactL.some(Boolean)&&!entity.animationEdits.support.some(Boolean)&&!entity.animationEdits.elbowL.some(Boolean)&&!entity.animationEdits.shoulderL.some(Boolean)){for(const[b,q]of freeLeftArm)b.quaternion.copy(q);}
  else fitSupportContact(entity,palmGoal,leftHand,'Middle2','base');
  if(!handgun||blend.carry<.999){
    poseThumb(entity,'L',handgun?'revolver':grips?.verticalSupport?'vertical':'support');
    if(handgun)for(const[b,q]of freeLeftFingers)if(b.name.startsWith('Thumb'))b.quaternion.slerp(q,blend.carry);
  }
  root.updateMatrixWorld(true);
}

// All action poses use the same bend plane and forearm roll as the grip fit.
export function fitSupportHand(entity,target,rotation){
  const bone=n=>entity.model.getObjectByName(n),arm=['UpperArmL','LowerArmL','WristL'].map(bone);
  const shoulder=entity.root.worldToLocal(arm[0].getWorldPosition(new Vector3()));
  const pole=entity.weaponPoles?.left||entity.root.localToWorld(shoulder.add(new Vector3(.18,-.22,.13)));
  const hand=rotation||arm[2].getWorldQuaternion(new Quaternion());
  const frame={hand,axis:entity.rifleHands.get('WristL').palm,rest:entity.rifleHands.get('WristL').rotation,lowerRest:entity.rifleHands.get('LowerArmL').rotation,hinge:entity.rifleHands.get('UpperArmL').hinge,maxTwist:entity.weapon.userData.grips?.handgun?Math.PI/3:Math.PI,maxBend:0,twistPreference:entity.weapon.userData.grips?.handgun?entity.supportTwist:0};
  fitArm(...arm,target,pole,frame);
  orientWorld(arm[2],hand);entity.root.updateMatrixWorld(true);
  entity.supportTwist=frame.forearmTwist;
  return frame.wristTwist;
}

export function fitWeaponPose(entity,point,rotation,amount=1,followSupport=false){
  if(entity.weapon.userData.pistol){fitPistolWeaponPose(entity,point,rotation,amount);return;}
  point=point.clone();rotation=rotation.clone();editTarget(entity,'weapon',point,rotation,'reload');
  const bone=n=>entity.model.getObjectByName(n),arm=['UpperArmR','LowerArmR','WristR'].map(bone),weapon=entity.weapon;
  if(!weapon.userData.grips?.handgun)amount=1;
  const offset=new Vector3().fromArray(weapon.userData.grips?.right||RIFLE_HANDS.right.toArray());
  const previous=entity.weaponPoles;
  const leftPole=entity.root.localToWorld(entity.root.worldToLocal(bone('UpperArmL').getWorldPosition(new Vector3())).add(new Vector3(.18,-.22,.13)));
  if(previous?.left)leftPole.lerp(previous.left,1-amount);
  if(followSupport&&weapon.userData.grips?.handgun&&entity.supportElbow)leftPole.lerp(entity.root.localToWorld(entity.supportElbow.clone()),.8*amount);
  const hand=rotation.clone().multiply(inverseGrip);
  const target=offset.clone().multiply(entity.root.getWorldScale(new Vector3())).applyQuaternion(rotation).add(point);
  const shoulder=entity.root.worldToLocal(arm[0].getWorldPosition(new Vector3()));
  const pole=entity.root.localToWorld(shoulder.add(new Vector3(-.22,-.22,.09)));
  if(previous?.right)pole.lerp(previous.right,1-amount);
  editTarget(entity,'elbowR',pole,null,'reload');editTarget(entity,'elbowL',leftPole,null,'reload');
  entity.weaponPoles={left:leftPole,right:pole};
  fitArm(...arm,target,pole,{hand,axis:entity.rifleHands.get('WristR').palm,rest:entity.rifleHands.get('WristR').rotation,lowerRest:entity.rifleHands.get('LowerArmR').rotation,hinge:entity.rifleHands.get('UpperArmR').hinge,maxTwist:weapon.userData.grips?.handgun?Math.PI/3:Math.PI,maxBend:75*Math.PI/180});
  orientWorld(arm[2],hand);weapon.quaternion.copy(RIFLE_GRIP_ROTATION);
  weapon.position.copy(offset).negate().applyQuaternion(RIFLE_GRIP_ROTATION);entity.root.updateMatrixWorld(true);
}

// Keep the contact fixed while finding an attainable hand orientation. A fixed
// wrist marker alone can demand a 90° bend in carry/crouch even with perfect IK.
export function fitSupportContact(entity,point,rotation,contact='Middle2',stage='reload'){
  if(entity.weapon.userData.pistol)return fitPistolSupportContact(entity,point,rotation,contact,{stage});
  const wrist=entity.model.getObjectByName('WristL'),lower=entity.model.getObjectByName('LowerArmL'),middle=entity.model.getObjectByName('Middle2L');
  const hand=rotation.clone();
  point=point.clone();editTarget(entity,'support',point,hand,stage);
  for(let iteration=0;iteration<(entity.weapon.userData.grips?.handgun?32:8);iteration++){
    const twist=fitSupportHand(entity,contactWrist(entity,'L',point,hand,contact),hand);
    const start=wrist.getWorldPosition(new Vector3());
    const fore=start.clone().sub(lower.getWorldPosition(new Vector3())).normalize();
    const palm=middle.getWorldPosition(new Vector3()).sub(start).normalize(),angle=palm.angleTo(fore);
    if(Math.abs(twist)>20*Math.PI/180){
      const excess=twist-Math.sign(twist)*18*Math.PI/180;
      hand.premultiply(new Quaternion().setFromAxisAngle(fore,-Math.max(-.25,Math.min(.25,excess))));
    }else if(angle>=64*Math.PI/180){
      const axis=palm.clone().cross(fore).normalize();
      hand.premultiply(new Quaternion().setFromAxisAngle(axis,Math.min(.35,angle-58*Math.PI/180)));
    }else break;
  }
  entity.supportElbow=entity.root.worldToLocal(lower.getWorldPosition(new Vector3()));
  return wrist.getWorldQuaternion(new Quaternion());
}
