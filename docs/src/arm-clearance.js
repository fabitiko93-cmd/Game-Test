import {Vector3} from 'three';
import {approvedAimTurn,hasApprovedGrip} from './g17-grasp.js';

const at=(e,n)=>e.model.getObjectByName(n).getWorldPosition(new Vector3());
// Body volumes follow the original leg/spine animation. Radii include room
// for the hand/forearm; only procedural arm targets move, never the body.
export function armObstacles(e){
 const scale=e.root.scale.x,pivot=at(e,'Hips'),undo=hasApprovedGrip(e)?approvedAimTurn(e).invert():null;
 const obstaclePoint=(name,leg)=>{const p=at(e,name);return leg&&undo?p.sub(pivot).applyQuaternion(undo).add(pivot):p;};
 return [
  ['Hips','Torso',.15],['Torso','Chest',.15],
  ['UpperLegL','LowerLegL',.15],['UpperLegR','LowerLegR',.15],
  ['LowerLegL','FootL',.12],['LowerLegR','FootR',.12],
 ].map(([a,b,r])=>{const leg=a.includes('Leg');return {a:obstaclePoint(a,leg),b:obstaclePoint(b,leg),radius:r*scale,leg};});
}
export function outsideBody(e,point,offsets=[new Vector3()],obstacles=armObstacles(e)){
 const result=point.clone();
 for(let iteration=0;iteration<8;iteration++){
  let changed=false;
  for(const offset of offsets)for(const {a,b,radius,leg} of obstacles){
   const p=result.clone().add(offset),axis=b.clone().sub(a),t=Math.max(0,Math.min(1,p.clone().sub(a).dot(axis)/axis.lengthSq()));
   const center=a.clone().addScaledVector(axis,t),away=p.sub(center),distance=away.length();
   if(distance>=radius)continue;
   if(leg){
    const left=new Vector3(1,0,0).applyQuaternion(e.root.quaternion),along=away.dot(left),across=away.lengthSq()-along*along;
    result.addScaledVector(left,Math.sqrt(Math.max(0,radius*radius-across))-along);changed=true;continue;
   }
   if(distance<1e-6)away.set(0,0,1).applyQuaternion(e.root.quaternion);else away.divideScalar(distance);
   result.addScaledVector(away,radius-distance);changed=true;
  }
  if(!changed)break;
 }
 return result;
}

// A wrist outside the thigh can still demand an elbow/forearm through the
// knee. Plan the shoulder-to-wrist corridor before the temporal guide moves
// the hand: rise above a bent leg before crossing it towards the grip/pouch.
export function routeSupportWrist(e,point,obstacles=armObstacles(e)){
 const start=at(e,'UpperArmL'),result=point.clone(),up=new Vector3(0,1,0);
 for(let pass=0;pass<8;pass++){
  let changed=false;
  for(const t of [.25,.5,.75,1])for(const {a,b,radius,leg} of obstacles){
   if(!leg)continue;
   const p=start.clone().lerp(result,t),axis=b.clone().sub(a),s=Math.max(0,Math.min(1,p.clone().sub(a).dot(axis)/axis.lengthSq()));
   const away=p.sub(a.clone().addScaledVector(axis,s));
   if(away.lengthSq()>=radius*radius)continue;
   const along=away.dot(up),across=away.lengthSq()-along*along;
   result.addScaledVector(up,(Math.sqrt(Math.max(0,radius*radius-across))-along)/t);changed=true;
  }
  if(!changed)break;
 }
 return result;
}

function segmentDistance(a,b,c,d){
 const u=b.clone().sub(a),v=d.clone().sub(c),w=a.clone().sub(c),aa=u.dot(u),bb=u.dot(v),cc=v.dot(v),dd=u.dot(w),ee=v.dot(w);
 const clamp=t=>Math.max(0,Math.min(1,t)),denominator=aa*cc-bb*bb;
 let s=aa<1e-12?0:denominator>1e-12?clamp((bb*ee-cc*dd)/denominator):0;
 let t=cc<1e-12?0:(bb*s+ee)/cc;
 if(t<0){t=0;s=aa<1e-12?0:clamp(-dd/aa);}
 else if(t>1){t=1;s=aa<1e-12?0:clamp((bb-dd)/aa);}
 return w.addScaledVector(u,s).addScaledVector(v,-t).length();
}

export function routeSupportStep(e,from,to){
 const legs=armObstacles(e).filter(o=>o.leg);
 const blocked=(a,b)=>legs.some(o=>segmentDistance(a,b,o.a,o.b)<o.radius-.0005);
 if(!blocked(from,to))return to;
 const height=Math.max(from.y,to.y,...legs.map(o=>Math.max(o.a.y,o.b.y)+o.radius))+.015*e.root.scale.x;
 const raised=from.clone().setY(height);
 if(from.y<height-.025*e.root.scale.x){
  if(blocked(from,raised)){
   const left=new Vector3(1,0,0).applyQuaternion(e.root.quaternion),outer=Math.max(...legs.flatMap(o=>[o.a.dot(left)+o.radius,o.b.dot(left)+o.radius]))+.02*e.root.scale.x;
   const side=from.clone().addScaledVector(left,Math.max(0,outer-from.dot(left)));
   if(side.distanceTo(from)>.01*e.root.scale.x)return side;
  }
  return raised;
 }
 return to.clone().setY(height);
}

export function clearForearm(e,start,goal,bend,a,b,obstacles,delta=1){
 obstacles=obstacles.map(o=>({...o,radius:o.radius+.02*e.root.scale.x}));
 const offset=goal.clone().sub(start),distance=Math.max(Math.abs(a-b)+.001,Math.min(a+b-.001,offset.length())),axis=offset.normalize();
 const along=(a*a-b*b+distance*distance)/(2*distance),height=Math.sqrt(Math.max(0,a*a-along*along)),center=start.clone().addScaledVector(axis,along),direction=bend.clone();
 for(let pass=0;pass<6;pass++){
  const elbow=center.clone().addScaledVector(direction,height);let shift=new Vector3();
  for(const t of [0,.25,.5,.75]){
   const p=elbow.clone().lerp(goal,t),safe=outsideBody(e,p,undefined,obstacles);
   shift.add(safe.sub(p).divideScalar(1-t));
  }
  if(shift.lengthSq()<1e-10)break;
  direction.copy(elbow.add(shift).sub(center));direction.addScaledVector(axis,-direction.dot(axis)).normalize();
 }
 const turn=Math.atan2(axis.dot(bend.clone().cross(direction)),bend.dot(direction)),step=Math.max(0,delta)*6;
 return bend.clone().applyAxisAngle(axis,Math.max(-step,Math.min(step,turn)));
}
