// Runtime-only authored elbow planes. A pinned hand gives an elbow one degree
// of freedom around the shoulder/wrist axis, rather than a free XYZ position.
import {Quaternion,Vector3} from 'three';
import {fitArm,orientWorld} from './weapon-ik.js';
const radians=Math.PI/180,v=()=>new Vector3();
export function hasElbowEdit(entity,side){return Boolean(entity.animationEdits?.['elbowTurn'+side]?.[0]||entity.animationEdits?.['elbow'+side]?.some(Boolean));}
export function armCircle(upper,lower,wrist){
  const start=upper.getWorldPosition(v()),end=wrist.getWorldPosition(v()),point=lower.getWorldPosition(v()),axis=end.clone().sub(start).normalize();
  const center=start.clone().addScaledVector(axis,point.clone().sub(start).dot(axis)),radial=point.clone().sub(center);
  return{center,axis,radial,radius:radial.length(),point};
}
function planeDirection(point,start,axis){
  const direction=point.clone().sub(start);direction.addScaledVector(axis,-direction.dot(axis));
  if(direction.lengthSq()<1e-10){direction.set(0,0,1).addScaledVector(axis,-axis.z);if(direction.lengthSq()<1e-10)direction.set(1,0,0).addScaledVector(axis,-axis.x);}
  return direction.normalize();
}

export function fitAuthoredElbow(entity,side,arm,target,pole,frame,{maxBend=75,maxWristTwist=40,basePole=null}={}){
  if(!hasElbowEdit(entity,side))return false;
  const [upper,lower,wrist]=arm,start=upper.getWorldPosition(v()),axis=target.clone().sub(start).normalize();
  const saved=arm.map(b=>b.quaternion.clone()),basePoint=basePole||lower.getWorldPosition(v());
  const edited=basePoint.clone().add(new Vector3(...(entity.animationEdits['elbow'+side]||[0,0,0])).applyQuaternion(entity.root.getWorldQuaternion(new Quaternion())));
  const base=planeDirection(basePoint,start,axis),wanted=planeDirection(edited,start,axis);
  wanted.applyAxisAngle(axis,(entity.animationEdits['elbowTurn'+side]?.[0]||0)*radians);
  let angle=Math.atan2(axis.dot(base.clone().cross(wanted)),base.dot(wanted));
  let lastFrame;
  const solve=turn=>{
    arm.forEach((b,i)=>b.quaternion.copy(saved[i]));entity.root.updateMatrixWorld(true);
    const hint=start.clone().add(base.clone().applyAxisAngle(axis,turn)),f={...frame,maxBend:0};
    fitArm(...arm,target,hint,f);orientWorld(wrist,frame.hand);entity.root.updateMatrixWorld(true);lastFrame=f;
    const fore=wrist.getWorldPosition(v()).sub(lower.getWorldPosition(v())).normalize(),middle=entity.model.getObjectByName('Middle2'+side);
    const handAxis=middle?middle.getWorldPosition(v()).sub(wrist.getWorldPosition(v())).normalize():frame.axis.clone().applyQuaternion(frame.hand);
    return fore.angleTo(handAxis)<=maxBend*radians+1e-6&&Math.abs(f.wristTwist)<=maxWristTwist*radians+1e-6;
  };
  const requested=angle;let chosen=angle,limited=false;
  if(!solve(angle)){
    limited=true;
    if(solve(0)){
      let low=0,high=1;for(let i=0;i<8;i++){const t=(low+high)/2;if(solve(angle*t))low=t;else high=t;}chosen=angle*low;
    }else{
      let best=null;for(let i=-12;i<=12;i++){const candidate=i*Math.PI/12;if(solve(candidate)){const difference=Math.abs(Math.atan2(Math.sin(candidate-angle),Math.cos(candidate-angle)));if(!best||difference<best.difference)best={candidate,difference};}}
      if(!best){arm.forEach((b,i)=>b.quaternion.copy(saved[i]));entity.root.updateMatrixWorld(true);entity.elbowConstraints||={};entity.elbowConstraints[side]={limited:true,unavailable:true};return false;}
      chosen=best.candidate;
    }
    solve(chosen);
  }
  Object.assign(frame,{wristTwist:lastFrame.wristTwist,forearmTwist:lastFrame.forearmTwist});
  const circle=armCircle(...arm);entity.elbowConstraints||={};entity.elbowConstraints[side]={limited,requested:requested/radians,reached:chosen/radians,radius:circle.radius};
  if(entity.pistolFits){const bend=circle.radial.clone().normalize().applyQuaternion(entity.root.getWorldQuaternion(new Quaternion()).invert()),flex=lower.getWorldPosition(v()).sub(start).angleTo(wrist.getWorldPosition(v()).sub(lower.getWorldPosition(v())));entity.pistolFits[side]={upper:upper.getWorldQuaternion(new Quaternion()).premultiply(entity.root.getWorldQuaternion(new Quaternion()).invert()),offset:wrist.getWorldPosition(v()).sub(start).applyQuaternion(entity.root.getWorldQuaternion(new Quaternion()).invert()),bend,hand:wrist.getWorldQuaternion(new Quaternion()).premultiply(entity.root.getWorldQuaternion(new Quaternion()).invert()),flex,twist:frame.forearmTwist};}
  return true;
}
