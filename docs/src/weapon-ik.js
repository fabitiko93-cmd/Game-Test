import {Quaternion,Vector3} from "three";
const clampUnit=value=>Math.max(-1,Math.min(1,value));
const signedAngle=value=>((value+Math.PI)%(2*Math.PI)+2*Math.PI)%(2*Math.PI)-Math.PI;

export function axialAngle(rotation,axis){
  return signedAngle(2*Math.atan2(new Vector3(rotation.x,rotation.y,rotation.z).dot(axis),rotation.w));
}

export function orientWorld(bone, rotation) {
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

export function fitArm(upper, lower, wrist, target, pole, frame) {
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
    const handAxis=frame.axis?frame.axis.clone().applyQuaternion(frame.hand):wrist.position.clone().normalize().applyQuaternion(frame.hand.clone().multiply(frame.rest.clone().invert()));
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
  // The elbow has one bending hinge. Start from its bind rotation each time:
  // retaining the previous grip's roll makes repeated IK fits accumulate twist.
  if(frame?.lowerRest){lower.quaternion.copy(frame.lowerRest);lower.updateMatrixWorld(true);}
  pointBone(lower, wrist, nextHand);
  if(frame) {
    const neutral=lower.getWorldQuaternion(new Quaternion());
    const rotation=frame.hand.clone().multiply(frame.rest.clone().invert());
    const from=wrist.position.clone().normalize().applyQuaternion(rotation);
    const axis=nextHand.clone().sub(nextElbow).normalize();
    const desired=new Quaternion().setFromUnitVectors(from,axis).multiply(rotation);
    let twist=axialAngle(desired.multiply(neutral.clone().invert()),axis);
    if(Math.abs(twist)>Math.PI*2/3&&frame.twistPreference&&Math.sign(twist)!==Math.sign(frame.twistPreference))twist-=Math.sign(twist)*Math.PI*2;
    const limit=frame.maxTwist??Math.PI/3,actual=Math.max(-limit,Math.min(limit,twist));
    orientWorld(lower,new Quaternion().setFromAxisAngle(axis,actual).multiply(neutral));
    // The support-hand contact solver can turn a free hand instead of hiding
    // an impossible grip in a 150–180 degree forearm rotation.
    frame.wristTwist=twist-actual;
    frame.forearmTwist=actual;
  }
}

