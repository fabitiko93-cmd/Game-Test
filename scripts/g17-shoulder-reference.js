// Static reference study. Uses the original mesh, weights and bone lengths.
// The approved grasp is a rigid endpoint: proximal arm edits never author fingers.
import {Quaternion, Vector3} from 'three';
import {fitArm, orientWorld, axialAngle} from '../docs/src/weapon-ik.js';

const v=(...a)=>new Vector3(...a);
const rad=d=>d*Math.PI/180;
const bone=(e,n)=>e.model.getObjectByName(n);
const point=(e,n)=>bone(e,n).getWorldPosition(v());
const angle=(a,b)=>a.clone().normalize().angleTo(b.clone().normalize())*180/Math.PI;

export function fitReferenceShoulder(entity,options){
  const root=entity.root,rig=entity.rifleHands;
  root.updateMatrixWorld(true);
  const keepNames=[];entity.model.traverse(b=>{if(b.isBone&&/^(Wrist|Index|Middle|Ring|Pinky|Thumb)/.test(b.name))keepNames.push(b.name);});
  const protectedRotations=new Map(keepNames.filter(n=>!/Wrist/.test(n)).map(n=>[n,bone(entity,n).quaternion.clone()]));
  const endpoints=Object.fromEntries(['R','L'].map(s=>[s,{position:point(entity,'Wrist'+s),rotation:bone(entity,'Wrist'+s).getWorldQuaternion(new Quaternion()).normalize(),direction:point(entity,'Middle2'+s).sub(point(entity,'Wrist'+s)).normalize()}]));
  const gun=entity.weapon,gunPosition=gun.getWorldPosition(v()),gunRotation=gun.getWorldQuaternion(new Quaternion()).normalize();
  const originalParent=gun.parent;root.attach(gun);root.updateMatrixWorld(true);
  const metrics={};
  for(const [side,cfg] of Object.entries(options.sides)){
    const shoulder=bone(entity,'Shoulder'+side),upper=bone(entity,'UpperArm'+side),lower=bone(entity,'LowerArm'+side),wrist=bone(entity,'Wrist'+side);
    const a=point(entity,'UpperArm'+side).distanceTo(point(entity,'LowerArm'+side));
    const b=point(entity,'LowerArm'+side).distanceTo(point(entity,'Wrist'+side));
    const before=shoulder.getWorldQuaternion(new Quaternion()),oldElbow=point(entity,'LowerArm'+side);
    // Start from this rig's bind frame rather than transporting the procedural
    // aiming pose's axial humerus twist into the new arm plane.
    for(const part of ['Shoulder','UpperArm','LowerArm','Wrist'])bone(entity,part+side).quaternion.copy(rig.get(part+side).rotation);
    root.updateMatrixWorld(true);
    const yawAxis=v(0,1,0).transformDirection(root.matrixWorld),forward=v(0,0,1).transformDirection(root.matrixWorld);
    const q=shoulder.getWorldQuaternion(new Quaternion());
    q.premultiply(new Quaternion().setFromAxisAngle(yawAxis,rad(cfg.protractionDegrees||0)));
    q.premultiply(new Quaternion().setFromAxisAngle(forward,rad(cfg.elevationDegrees||0)));
    orientWorld(shoulder,q);root.updateMatrixWorld(true);
    const target=endpoints[side].position,pole=cfg.elbowPole?root.localToWorld(v(...cfg.elbowPole)):oldElbow.clone();
    const reach=point(entity,'UpperArm'+side).distanceTo(target);
    if(reach>=a+b-.001||reach<=Math.abs(a-b)+.001)throw Error('Reference shoulder has unreachable rigid hand endpoint: '+side);
    if(cfg.maxWristBendDegrees){
      // Choose the nearest reachable elbow plane satisfying the hand frame.
      // This adjusts the pole only; it deliberately does not reset the humerus
      // hinge/roll, which caused the earlier shoulder-volume regression.
      const start=point(entity,'UpperArm'+side),axis=target.clone().sub(start).normalize();
      const radial=pole.clone().sub(start).addScaledVector(axis,-pole.clone().sub(start).dot(axis)).normalize();
      const handDirection=endpoints[side].direction;
      const along=(a*a-b*b+reach*reach)/(2*reach),height=Math.sqrt(Math.max(0,a*a-along*along));
      const ideal=axis.clone().multiplyScalar(axis.dot(handDirection)).sub(handDirection),projected=ideal.length();
      if(height*projected>1e-9){
        ideal.normalize();
        const value=(b*Math.cos(rad(cfg.maxWristBendDegrees))-(reach-along)*axis.dot(handDirection))/(height*projected);
        if(value>1+1e-7)throw Error('Rigid endpoint cannot meet wrist-bend bound: '+side);
        const maximum=Math.acos(Math.max(-1,Math.min(1,value))),current=radial.angleTo(ideal);
        if(current>maximum){
          const signed=Math.atan2(axis.dot(radial.clone().cross(ideal)),radial.dot(ideal));
          radial.applyAxisAngle(axis,Math.sign(signed)*(current-maximum));
        }
        pole.copy(start).add(radial);
      }
    }
    fitArm(upper,lower,wrist,target,pole);root.updateMatrixWorld(true);
    const upperAxis=point(entity,'LowerArm'+side).sub(point(entity,'UpperArm'+side)).normalize();
    orientWorld(upper,new Quaternion().setFromAxisAngle(upperAxis,rad(cfg.upperRollDegrees||0)).multiply(upper.getWorldQuaternion(new Quaternion())));
    lower.quaternion.copy(rig.get('LowerArm'+side).rotation);root.updateMatrixWorld(true);
    const from=point(entity,'Wrist'+side).sub(point(entity,'LowerArm'+side)).normalize();
    const fore=target.clone().sub(point(entity,'LowerArm'+side)).normalize();
    orientWorld(lower,new Quaternion().setFromUnitVectors(from,fore).multiply(lower.getWorldQuaternion(new Quaternion())));
    const neutral=lower.getWorldQuaternion(new Quaternion());
    const desired=endpoints[side].rotation.clone().multiply(rig.get('Wrist'+side).rotation.clone().invert());
    const twist=axialAngle(desired.clone().multiply(neutral.clone().invert()),fore);
    const limit=rad(cfg.maxForearmTwistDegrees??60),used=Math.max(-limit,Math.min(limit,twist));
    orientWorld(lower,new Quaternion().setFromAxisAngle(fore,used).multiply(neutral));
    orientWorld(wrist,endpoints[side].rotation);root.updateMatrixWorld(true);
    metrics[side]={clavicleChangeDegrees:angle(before,shoulder.getWorldQuaternion(new Quaternion())),upperRollDegrees:cfg.upperRollDegrees||0,
      wristEndpointError:point(entity,'Wrist'+side).distanceTo(target),handFrameErrorRadians:wrist.getWorldQuaternion(new Quaternion()).normalize().angleTo(endpoints[side].rotation),
      upperLengthError:Math.abs(point(entity,'UpperArm'+side).distanceTo(point(entity,'LowerArm'+side))-a),
      lowerLengthError:Math.abs(point(entity,'LowerArm'+side).distanceTo(point(entity,'Wrist'+side))-b),
      forearmTwistDegrees:used*180/Math.PI,wristAxialTwistDegrees:(twist-used)*180/Math.PI,
      wristBendDegrees:point(entity,'Wrist'+side).sub(point(entity,'LowerArm'+side)).angleTo(point(entity,'Middle2'+side).sub(point(entity,'Wrist'+side)))*180/Math.PI};
  }
  originalParent.attach(gun);root.updateMatrixWorld(true);
  let fingerError=0;
  for(const [name,q]of protectedRotations)for(const k of ['x','y','z','w'])fingerError=Math.max(fingerError,Math.abs(bone(entity,name).quaternion[k]-q[k]));
  const gunTranslation=gun.getWorldPosition(v()).distanceTo(gunPosition),gunAngle=gun.getWorldQuaternion(new Quaternion()).normalize().angleTo(gunRotation);
  if(fingerError!==0||gunTranslation>1e-6||gunAngle>1e-6||Object.entries(metrics).some(([s,x])=>x.wristEndpointError>1e-6||x.handFrameErrorRadians>1e-6||x.upperLengthError>1e-6||x.lowerLengthError>1e-6||(options.sides[s].maxWristBendDegrees&&x.wristBendDegrees>options.sides[s].maxWristBendDegrees+.001)))throw Error('Shoulder reference changed approved grasp or exceeded its bounds: '+JSON.stringify({fingerError,gunTranslation,gunAngle,metrics}));
  return{mode:'reference-shoulder-proximal-swing',sides:metrics,fingerQuaternionMaxDifference:fingerError,gunPositionError:gunTranslation,gunRotationErrorRadians:gunAngle,geometryModified:false,skinWeightsModified:false};
}
