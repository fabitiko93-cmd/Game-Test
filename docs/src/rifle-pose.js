import { Euler, Matrix4, Quaternion, Vector3 } from "three";
import { applyRifleAnimation } from './rifle-animation.js';
import {applyWeaponClip,WEAPON_MOTIONS} from './weapon-animation.js';
import {recoilPose} from './weapon-recoil.js';
import {activeWeapon} from './inventory.js';

// The authored wrist's +Y follows the fingers; a rifle asset's +Z follows its
// barrel. Keep the original body/leg animation and fit both arms to this grip.
export const RIFLE_GRIP_ROTATION = new Quaternion().setFromEuler(new Euler(-Math.PI / 2, 0, Math.PI / 2));
const inverseGrip = RIFLE_GRIP_ROTATION.clone().invert();
const supportRotation = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(
  new Vector3(0,0,1), new Vector3(-1,0,0), new Vector3(0,-1,0)));
const verticalSupportRotation = new Quaternion().setFromAxisAngle(new Vector3(1,0,0),Math.PI/2).multiply(supportRotation);
const clampUnit=value=>Math.max(-1,Math.min(1,value));

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

function poseFingers(entity,freeLeft=false) {
  const hands=entity.rifleHands;
  for(const side of ["L","R"]) {
    if(side==='L'&&freeLeft)continue;
    for(const finger of ["Index","Middle","Ring","Pinky"]) {
      for(let i=1;i<=4;i++) {
        const entry=hands.get(`${finger}${i}${side}`);if(!entry)continue;
        if(i===1){entry.bone.quaternion.copy(entry.rotation);continue;}
        const angles=side==="L"?[.55,.95,.8]:finger==="Index"?[.35,1.05,.35]:[.90,1.20,.45];
        const rotation=new Euler().setFromQuaternion(entry.rotation);
        rotation.x=-angles[i-2];entry.bone.quaternion.setFromEuler(rotation);
      }
    }
    const thumb=[1,2,3].map(i=>hands.get(`Thumb${i}${side}`));
    if(thumb.every(Boolean)) {
      for(const entry of thumb)entry.bone.quaternion.copy(entry.rotation);
      entity.root.updateMatrixWorld(true);
      const grips=entity.weapon.userData.grips;
      const target=side==="R"?new Vector3(.015,.025,-.015):grips?.leftThumb?new Vector3().fromArray(grips.leftThumb):new Vector3(.025,.105,.245);
      const pole=side==="R"?new Vector3(-.01,.085,-.05):grips?.leftThumbPole?new Vector3().fromArray(grips.leftThumbPole):new Vector3(.11,.13,.27);
      fitArm(...thumb.map(e=>e.bone),entity.weapon.localToWorld(target),entity.weapon.localToWorld(pole));
    }
  }
}

function orientWorld(bone, rotation) {
  const parent = bone.parent.getWorldQuaternion(new Quaternion()).invert();
  bone.quaternion.copy(parent.multiply(rotation)); bone.updateMatrixWorld(true);
}

function pointBone(bone, child, target) {
  const start = bone.getWorldPosition(new Vector3());
  const from = child.getWorldPosition(new Vector3()).sub(start).normalize();
  const to = target.clone().sub(start).normalize();
  const turn = new Quaternion().setFromUnitVectors(from, to);
  orientWorld(bone, turn.multiply(bone.getWorldQuaternion(new Quaternion())));
}

function fitArm(upper, lower, wrist, target, pole, frame) {
  const start = upper.getWorldPosition(new Vector3()), elbow = lower.getWorldPosition(new Vector3()), hand = wrist.getWorldPosition(new Vector3());
  const a = elbow.distanceTo(start), b = hand.distanceTo(elbow);
  const direction = target.clone().sub(start), distance = Math.max(.001, Math.min(direction.length(), a + b - .001));
  direction.normalize();
  const bend = pole.clone().sub(start); bend.addScaledVector(direction, -bend.dot(direction)).normalize();
  const along = (a * a - b * b + distance * distance) / (2 * distance);
  const height = Math.sqrt(Math.max(0, a * a - along * along));
  if(frame?.maxBend) {
    // The elbow can rotate around the shoulder-to-wrist line. Move its plane
    // only as far as needed to keep the firing wrist from folding backwards
    // when a step turns the shoulders away from the weapon.
    const handAxis=wrist.position.clone().normalize().applyQuaternion(frame.hand.clone().multiply(frame.rest.clone().invert()));
    const ideal=direction.clone().multiplyScalar(direction.dot(handAxis)).sub(handAxis);
    const projected=ideal.length();
    if(height*projected>1e-6) {
      ideal.normalize();
      const angle=Math.acos(clampUnit(bend.dot(ideal)));
      const maximum=Math.acos(clampUnit((b*Math.cos(frame.maxBend)-(distance-along)*direction.dot(handAxis))/(height*projected)));
      if(angle>maximum) {
        const signed=Math.atan2(direction.dot(bend.clone().cross(ideal)),bend.dot(ideal));
        bend.applyAxisAngle(direction,Math.sign(signed)*(angle-maximum));
      }
    }
  }
  const nextElbow = start.clone().addScaledVector(direction, along).addScaledVector(bend, height);
  const nextHand = start.clone().addScaledVector(direction, distance);
  pointBone(upper, lower, nextElbow);
  if(frame) {
    // Put the sleeve/elbow crease in the actual bend plane instead of carrying
    // the donor clip's upper-arm roll into a different hand target.
    const axis=nextElbow.clone().sub(start).normalize();
    const normal=axis.clone().cross(nextHand.clone().sub(nextElbow)).normalize();
    const current=frame.hinge.clone().applyQuaternion(upper.getWorldQuaternion(new Quaternion()));
    current.addScaledVector(axis,-current.dot(axis)).normalize();
    const angle=Math.atan2(axis.dot(current.clone().cross(normal)),current.dot(normal));
    orientWorld(upper,new Quaternion().setFromAxisAngle(axis,angle).multiply(upper.getWorldQuaternion(new Quaternion())));
  }
  pointBone(lower, wrist, nextHand);
  if(frame) {
    // Share the grip's roll with the forearm. Rotating only the wrist leaves a
    // corkscrew at the cuff even when the hand is in the correct position.
    const rotation=frame.hand.clone().multiply(frame.rest.clone().invert());
    const from=wrist.position.clone().normalize().applyQuaternion(rotation);
    const to=nextHand.clone().sub(nextElbow).normalize();
    orientWorld(lower,new Quaternion().setFromUnitVectors(from,to).multiply(rotation));
  }
}

export function riflePosture(player) {
  const weapon=activeWeapon(player),handgun=['revolver_44','pistol_9mm'].includes(weapon?.type);
  const impulse=player.combat?.shotImpulse;
  if(impulse&&impulse.weaponId===weapon?.id&&impulse.age<.35&&!player.moving)return 'aim';
  if(handgun&&player.moving&&!player.combat?.enabled)return 'carry';
  if(player.moving)return player.running?'carry':'hip';
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
  const torso=bone('Torso'),chest=bone('Chest'),head=bone('Head');
  entity.rifleRestore=new Map([...right,...left,torso,chest,head,...[...entity.rifleHands.values()].map(e=>e.bone)].filter(Boolean).map(b=>[b,b.quaternion.clone()]));
  const freeLeftPoint=left[2].getWorldPosition(new Vector3()),freeLeftRotation=left[2].getWorldQuaternion(new Quaternion());
  for(const side of ['L','R'])for(const part of ['Shoulder','UpperArm','LowerArm','Wrist']) {
    const entry=entity.rifleHands.get(part+side);if(entry)entry.bone.quaternion.copy(entry.rotation);
  }
  root.updateMatrixWorld(true);
  const blend=entity.rifleBlend ||= {carry:posture==='carry'?1:0,hip:posture==='hip'?1:0,aim:posture==='aim'?1:0};
  if(delta>=.5) {
    for(const state of ['carry','hip','aim'])blend[state]=Number(state===posture);
    entity.rifleTransition=null;
  } else {
    if(entity.rifleTransition?.posture!==posture)entity.rifleTransition={posture,from:{...blend},elapsed:0};
    const transition=entity.rifleTransition;
    transition.elapsed+=Math.max(0,delta);
    const t=Math.min(1,transition.elapsed/.42),amount=t*t*(3-2*t);
    for(const state of ['carry','hip','aim'])blend[state]=transition.from[state]+(Number(state===posture)-transition.from[state])*amount;
  }
  entity.riflePosture=posture;
  const headRotation=head?.getWorldQuaternion(new Quaternion());
  if(handgun){
    const amount=blend.hip+blend.aim;
    if(amount>0)applyWeaponClip(entity,player,'revolverAim',((entity.rifleTime||0)/WEAPON_MOTIONS.clips.revolverAim.duration)%1,amount);
    entity.rifleTime=(entity.rifleTime||0)+Math.max(0,delta);
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
  const pitch=(handgun?1.22:.80)*blend.carry+(handgun?.30:.22)*blend.hip+.015*blend.aim-kick.pitch;
  const yaw=root.getWorldQuaternion(new Quaternion());
  if(entity.captureShot)yaw.copy(new Quaternion().setFromAxisAngle(new Vector3(0,1,0),Math.atan2(player.facingX??0,player.facingY??1)));
  else if(player.combat?.shotImpulse&&player.combat.shotImpulse.weaponId===weapon.userData.weaponId&&player.combat.shotImpulse.age<.35&&blend.aim>.9)
    yaw.copy(new Quaternion().setFromAxisAngle(new Vector3(0,1,0),player.combat.shotImpulse.yaw));
  const gunRotation=yaw.multiply(new Quaternion().setFromEuler(new Euler(pitch,(handgun?0:1.25)*blend.carry,kick.roll,'YXZ')));
  const shoulder = root.worldToLocal(right[0].getWorldPosition(new Vector3()));
  const scaled=point=>point.clone().multiply(root.getWorldScale(new Vector3())).applyQuaternion(gunRotation);
  const carryGoal=root.localToWorld(shoulder.clone().add(handgun?new Vector3(-.015,-.48,.015):new Vector3(.14,-.30,.11)));
  const hipGoal=root.localToWorld(handgun?new Vector3(0,shoulder.y-.24,shoulder.z+.38):shoulder.clone().add(new Vector3(.015,-.25,.24)));
  const shoulderContact=root.localToWorld(shoulder.clone().add(new Vector3(-.012,.015,.055)));
  const aimGoal=stockContact?shoulderContact.clone().sub(scaled(stockContact)):root.localToWorld(handgun?new Vector3(0,shoulder.y+.025,shoulder.z+.50):shoulder.clone().add(new Vector3(.03,-.10,.25)));
  const gunGoal=carryGoal.multiplyScalar(blend.carry).addScaledVector(hipGoal,blend.hip).addScaledVector(aimGoal,blend.aim);
  gunGoal.addScaledVector(new Vector3(0,0,1).applyQuaternion(gunRotation),-kick.back);
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
  const leftShoulder = root.worldToLocal(left[0].getWorldPosition(new Vector3()));
  const leftBend=new Vector3(.07,-.28,-.05).multiplyScalar(blend.carry)
    .addScaledVector(new Vector3(.10,-.24,.12),blend.hip).addScaledVector(new Vector3(.10,-.18,.15),blend.aim);
  const leftPole=root.localToWorld(leftShoulder.clone().add(leftBend));
  const rightHand=gunRotation.clone().multiply(inverseGrip),leftHand=gunRotation.clone().multiply(grips?.verticalSupport?verticalSupportRotation:supportRotation);
  const frame=side=>({hand:side==='R'?rightHand:leftHand,rest:entity.rifleHands.get('Wrist'+side).rotation,hinge:entity.rifleHands.get('UpperArm'+side).hinge,maxBend:side==='R'?75*Math.PI/180:0});
  fitArm(...right, gunGoal.clone().add(offsets[0]), rightPole,frame('R'));
  orientWorld(right[2], rightHand);
  weapon.quaternion.copy(RIFLE_GRIP_ROTATION);
  weapon.position.copy(rightOffset).negate().applyQuaternion(RIFLE_GRIP_ROTATION);
  weapon.updateMatrixWorld(true);
  const leftGoal = weapon.localToWorld(leftOffset.clone());
  if(handgun)leftGoal.lerp(freeLeftPoint,blend.carry);
  fitArm(...left, leftGoal, leftPole,frame('L'));
  orientWorld(left[2], handgun?leftHand.slerp(freeLeftRotation,blend.carry):leftHand);
  poseFingers(entity,handgun&&blend.carry>.5);root.updateMatrixWorld(true);
}

export function fitSupportHand(entity,target,rotation){
  const bone=n=>entity.model.getObjectByName(n),arm=['UpperArmL','LowerArmL','WristL'].map(bone);
  const shoulder=arm[0].getWorldPosition(new Vector3());
  const pole=entity.root.localToWorld(new Vector3(.30,shoulder.y/entity.root.scale.y-.22,.10));
  fitArm(...arm,target,pole);
  if(rotation)orientWorld(arm[2],rotation);
  entity.root.updateMatrixWorld(true);
}
