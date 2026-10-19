import { Euler, Matrix4, Quaternion, Vector3 } from "three";
import { applyRifleAnimation } from './rifle-animation.js';

// The authored wrist's +Y follows the fingers; a rifle asset's +Z follows its
// barrel. Keep the original body/leg animation and fit both arms to this grip.
export const RIFLE_GRIP_ROTATION = new Quaternion().setFromEuler(new Euler(-Math.PI / 2, 0, Math.PI / 2));
const inverseGrip = RIFLE_GRIP_ROTATION.clone().invert();
const supportRotation = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(
  new Vector3(0,0,1), new Vector3(-1,0,0), new Vector3(0,-1,0)));

// Wrist offsets are measured from the AK, not mistaken for palm/grip centers.
// The long authored palm reaches from the wrist to the metacarpal knuckles.
export const RIFLE_HANDS = Object.freeze({
  right: new Vector3(-.032, 0, -.14),
  left: new Vector3(.145, .03, .255),
});

export function captureRifleRig(model) {
  const hands = new Map();
  for (const side of ["L","R"]) for (const finger of ["Index","Middle","Ring","Pinky","Thumb"])
    for (let i=1;i<=(finger==="Thumb"?3:4);i++) {
      const bone=model.getObjectByName(`${finger}${i}${side}`);
      if(bone)hands.set(bone.name,{bone,rotation:bone.quaternion.clone()});
    }
  for(const side of ['L','R'])for(const part of ['Shoulder','UpperArm','LowerArm','Wrist']) {
    const bone=model.getObjectByName(part+side);if(bone)hands.set(bone.name,{bone,rotation:bone.quaternion.clone()});
  }
  return hands;
}

export function restoreRiflePose(entity) {
  if(!entity.rifleRestore)return;
  for(const [bone,rotation] of entity.rifleRestore)bone.quaternion.copy(rotation);
  entity.rifleRestore=null;
}

function poseFingers(entity) {
  const hands=entity.rifleHands;
  for(const side of ["L","R"]) {
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
      const target=side==="R"?new Vector3(.015,.025,-.015):new Vector3(.025,.105,.245);
      const pole=side==="R"?new Vector3(-.01,.085,-.05):new Vector3(.11,.13,.27);
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

function fitArm(upper, lower, wrist, target, pole) {
  const start = upper.getWorldPosition(new Vector3()), elbow = lower.getWorldPosition(new Vector3()), hand = wrist.getWorldPosition(new Vector3());
  const a = elbow.distanceTo(start), b = hand.distanceTo(elbow);
  const direction = target.clone().sub(start), distance = Math.max(.001, Math.min(direction.length(), a + b - .001));
  direction.normalize();
  const bend = pole.clone().sub(start); bend.addScaledVector(direction, -bend.dot(direction)).normalize();
  const along = (a * a - b * b + distance * distance) / (2 * distance);
  const height = Math.sqrt(Math.max(0, a * a - along * along));
  const nextElbow = start.clone().addScaledVector(direction, along).addScaledVector(bend, height);
  const nextHand = start.clone().addScaledVector(direction, distance);
  pointBone(upper, lower, nextElbow); pointBone(lower, wrist, nextHand);
}

export function riflePosture(player) {
  if(player.moving)return 'hip';
  if(player.combat?.enabled&&player.combat?.targetId&&(player.combat.aim>0||player.combat.triggerHeld))return 'aim';
  return 'carry';
}

export function applyRiflePose(entity, player, delta=1, posture=riflePosture(player)) {
  const model = entity.model, root = entity.root, weapon = entity.weapon;
  if (!weapon || player.dead) return;
  const bone = name => model.getObjectByName(name);
  const right = ["UpperArmR", "LowerArmR", "WristR"].map(bone), left = ["UpperArmL", "LowerArmL", "WristL"].map(bone);
  if ([...right, ...left].some(part => !part)) return;
  entity.rifleHands ||= captureRifleRig(model);
  restoreRiflePose(entity);
  const torso=bone('Torso'),chest=bone('Chest'),head=bone('Head');
  entity.rifleRestore=new Map([...right,...left,torso,chest,head,...[...entity.rifleHands.values()].map(e=>e.bone)].filter(Boolean).map(b=>[b,b.quaternion.clone()]));
  for(const side of ['L','R'])for(const part of ['Shoulder','UpperArm','LowerArm','Wrist']) {
    const entry=entity.rifleHands.get(part+side);if(entry)entry.bone.quaternion.copy(entry.rotation);
  }
  root.updateMatrixWorld(true);
  const blend=entity.rifleBlend ||= {carry:posture==='carry'?1:0,hip:posture==='hip'?1:0,aim:posture==='aim'?1:0};
  const amount=delta>=.5?1:1-Math.exp(-Math.max(0,delta)*12);
  for(const state of ['carry','hip','aim'])blend[state]+=(Number(state===posture)-blend[state])*amount;
  entity.riflePosture=posture;
  const headRotation=head?.getWorldQuaternion(new Quaternion());
  applyRifleAnimation(entity,player,blend,delta);
  const stockContact=weapon.userData.stockContact;
  // Keep the imported upper body and elbow twist, fitting the hand targets to
  // the real weapon. Turn the support shoulder forward to reach the fore-end.
  if(chest) {
    const turn=-.05*blend.carry-.12*blend.hip-.78*blend.aim;
    orientWorld(chest,new Quaternion().setFromAxisAngle(new Vector3(0,1,0),turn).multiply(chest.getWorldQuaternion(new Quaternion())));
    if(head)orientWorld(head,headRotation);
    root.updateMatrixWorld(true);
  }
  const pitch = .92*blend.carry+.30*blend.hip+.015*blend.aim-(player.combat?.recoil || 0)*.035;
  const gunRotation = root.getWorldQuaternion(new Quaternion()).multiply(new Quaternion().setFromEuler(new Euler(pitch,1.04*blend.carry,0,'YXZ')));
  const shoulder = root.worldToLocal(right[0].getWorldPosition(new Vector3()));
  const scaled=point=>point.clone().multiply(root.getWorldScale(new Vector3())).applyQuaternion(gunRotation);
  const carryGoal=root.localToWorld(shoulder.clone().add(new Vector3(.04,-.16,.24)));
  const hipGoal=root.localToWorld(shoulder.clone().add(new Vector3(.015,-.31,.27)));
  const shoulderContact=root.localToWorld(shoulder.clone().add(new Vector3(-.012,.015,.055)));
  const aimGoal=stockContact?shoulderContact.clone().sub(scaled(stockContact)):root.localToWorld(shoulder.clone().add(new Vector3(.03,-.10,.25)));
  const gunGoal=carryGoal.multiplyScalar(blend.carry).addScaledVector(hipGoal,blend.hip).addScaledVector(aimGoal,blend.aim);
  entity.rifleShoulderContact=shoulderContact;
  const offsets=[scaled(RIFLE_HANDS.right),scaled(RIFLE_HANDS.left)];
  // Walking/running twists the shoulders. Keep the chosen grip inside both
  // arms' actual reach rather than stretching a sleeve or detaching a hand.
  for (let iteration = 0; iteration < 10; iteration++) {
    for (const [arm, offset] of [[right,offsets[0]],[left,offsets[1]]]) {
      const start = arm[0].getWorldPosition(new Vector3()), elbow = arm[1].getWorldPosition(new Vector3()), hand = arm[2].getWorldPosition(new Vector3());
      const reach = elbow.distanceTo(start) + hand.distanceTo(elbow) - .01;
      const delta = gunGoal.clone().add(offset).sub(start);
      if (delta.length() > reach) gunGoal.copy(start).add(delta.setLength(reach)).sub(offset);
    }
  }
  const rightPole = right[1].getWorldPosition(new Vector3()).lerp(root.localToWorld(shoulder.clone().add(new Vector3(-.015,-.30,.06))),blend.carry*.8+blend.hip*.85);
  const leftShoulder = root.worldToLocal(left[0].getWorldPosition(new Vector3()));
  const leftPole = left[1].getWorldPosition(new Vector3()).lerp(root.localToWorld(leftShoulder.clone().add(new Vector3(.015,-.30,.08))),blend.carry*.8);
  fitArm(...right, gunGoal.clone().add(offsets[0]), rightPole);
  orientWorld(right[2], gunRotation.clone().multiply(inverseGrip));
  weapon.quaternion.copy(RIFLE_GRIP_ROTATION);
  weapon.position.copy(RIFLE_HANDS.right).negate().applyQuaternion(RIFLE_GRIP_ROTATION);
  weapon.updateMatrixWorld(true);
  const leftGoal = weapon.localToWorld(RIFLE_HANDS.left.clone());
  fitArm(...left, leftGoal, leftPole);
  orientWorld(left[2], gunRotation.clone().multiply(supportRotation));
  poseFingers(entity);root.updateMatrixWorld(true);
}
