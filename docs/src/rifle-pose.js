import { Euler, Quaternion, Vector3 } from "three";

// The authored wrist's +Y follows the fingers; a rifle asset's +Z follows its
// barrel. Keep the original body/leg animation and fit both arms to this grip.
export const RIFLE_GRIP_ROTATION = new Quaternion().setFromEuler(new Euler(-Math.PI / 2, 0, Math.PI / 2));
const inverseGrip = RIFLE_GRIP_ROTATION.clone().invert();

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
  root.updateMatrixWorld(true);
  const pitch = (player.combat?.enabled && !player.moving ? 0 : .25) - (player.combat?.recoil || 0) * .035;
  const gunRotation = root.getWorldQuaternion(new Quaternion()).multiply(new Quaternion().setFromEuler(new Euler(pitch, 0, 0)));
  const shoulder = root.worldToLocal(right[0].getWorldPosition(new Vector3()));
  const rightGoal = root.localToWorld(shoulder.clone().add(new Vector3(.09, -.12, .17)));
  const supportOffset = new Vector3(0, .045, .16).multiply(root.getWorldScale(new Vector3())).applyQuaternion(gunRotation);
  // Walking/running twists the shoulders. Keep the chosen grip inside both
  // arms' actual reach rather than stretching a sleeve or detaching a hand.
  for (let iteration = 0; iteration < 5; iteration++) {
    for (const [arm, offset] of [[right, new Vector3()], [left, supportOffset]]) {
      const start = arm[0].getWorldPosition(new Vector3()), elbow = arm[1].getWorldPosition(new Vector3()), hand = arm[2].getWorldPosition(new Vector3());
      const reach = elbow.distanceTo(start) + hand.distanceTo(elbow) - .01;
      const delta = rightGoal.clone().add(offset).sub(start);
      if (delta.length() > reach) rightGoal.copy(start).add(delta.setLength(reach)).sub(offset);
    }
  }
  const rightPole = root.localToWorld(shoulder.clone().add(new Vector3(-.25, -.3, .05)));
  fitArm(...right, rightGoal, rightPole);
  orientWorld(right[2], gunRotation.clone().multiply(inverseGrip));
  weapon.quaternion.copy(RIFLE_GRIP_ROTATION); weapon.updateMatrixWorld(true);
  const leftGoal = weapon.localToWorld(new Vector3(0, .045, .16));
  const leftShoulder = root.worldToLocal(left[0].getWorldPosition(new Vector3()));
  const leftPole = root.localToWorld(leftShoulder.clone().add(new Vector3(.2, -.3, .05)));
  fitArm(...left, leftGoal, leftPole);
  orientWorld(left[2], gunRotation.clone().multiply(inverseGrip));
}
