import { Euler, Matrix4, Quaternion, Vector3 } from "three";

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
  left: new Vector3(.145, .03, .275),
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
      const target=side==="R"?new Vector3(.015,.025,-.015):new Vector3(.025,.105,.265);
      const pole=side==="R"?new Vector3(-.01,.085,-.05):new Vector3(.11,.13,.29);
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

export function applyRiflePose(entity, player) {
  const model = entity.model, root = entity.root, weapon = entity.weapon;
  if (!weapon || player.dead) return;
  const bone = name => model.getObjectByName(name);
  const right = ["UpperArmR", "LowerArmR", "WristR"].map(bone), left = ["UpperArmL", "LowerArmL", "WristL"].map(bone);
  if ([...right, ...left].some(part => !part)) return;
  entity.rifleHands ||= captureRifleRig(model);
  restoreRiflePose(entity);
  const chest=bone('Chest'),head=bone('Head');
  entity.rifleRestore=new Map([...right,...left,chest,head,...[...entity.rifleHands.values()].map(e=>e.bone)].filter(Boolean).map(b=>[b,b.quaternion.clone()]));
  // Solve from the same authored arm frame, not the twisting arm swing of a
  // walk clip. The body, legs and movement phase keep their source animation.
  for(const side of ['L','R'])for(const part of ['Shoulder','UpperArm','LowerArm','Wrist']) {
    const entry=entity.rifleHands.get(part+side);if(entry)entry.bone.quaternion.copy(entry.rotation);
  }
  root.updateMatrixWorld(true);
  const aimed=player.combat?.enabled&&!player.moving;
  const hasStock=weapon.getObjectByName('FixedStock')?.visible||weapon.getObjectByName('SkeletonStock')?.visible;
  // Bring the support shoulder forward, instead of collapsing the firing arm
  // to make both hands reach. Preserve the original head direction and gait.
  if(chest) {
    const headRotation=head?.getWorldQuaternion(new Quaternion());
    orientWorld(chest,new Quaternion().setFromAxisAngle(new Vector3(0,1,0),aimed?-.48:-.30).multiply(chest.getWorldQuaternion(new Quaternion())));
    if(head)orientWorld(head,headRotation);
    root.updateMatrixWorld(true);
  }
  const pitch = (aimed ? .02 : .28) - (player.combat?.recoil || 0) * .035;
  const gunRotation = root.getWorldQuaternion(new Quaternion()).multiply(new Quaternion().setFromEuler(new Euler(pitch, 0, 0)));
  const shoulder = root.worldToLocal(right[0].getWorldPosition(new Vector3()));
  const gunGoal=root.localToWorld(shoulder.clone().add(new Vector3(
    .015, aimed ? (hasStock ? -.055 : -.12) : -.20, hasStock ? .286 : .23)));
  const scaled=point=>point.clone().multiply(root.getWorldScale(new Vector3())).applyQuaternion(gunRotation);
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
  const rightPole = root.localToWorld(shoulder.clone().add(new Vector3(-.12, -.38, .08)));
  fitArm(...right, gunGoal.clone().add(offsets[0]), rightPole);
  orientWorld(right[2], gunRotation.clone().multiply(inverseGrip));
  weapon.quaternion.copy(RIFLE_GRIP_ROTATION);
  weapon.position.copy(RIFLE_HANDS.right).negate().applyQuaternion(RIFLE_GRIP_ROTATION);
  weapon.updateMatrixWorld(true);
  const leftGoal = weapon.localToWorld(RIFLE_HANDS.left.clone());
  const leftShoulder = root.worldToLocal(left[0].getWorldPosition(new Vector3()));
  const leftPole = root.localToWorld(leftShoulder.clone().add(new Vector3(.12, -.28, .08)));
  fitArm(...left, leftGoal, leftPole);
  orientWorld(left[2], gunRotation.clone().multiply(supportRotation));
  poseFingers(entity);root.updateMatrixWorld(true);
}
