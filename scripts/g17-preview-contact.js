// Preview-only palm fitting. The gun stays independent of the arms while the
// actual knuckles are fitted to its measured grip, then returns to the wrist.
import {Quaternion,Vector3} from 'three';
import {contactWrist} from '../docs/src/weapon-hands.js';
import {fitArm,orientWorld} from '../docs/src/weapon-ik.js';
const v=()=>new Vector3();
const point=(e,n)=>e.model.getObjectByName(n).getWorldPosition(v());

export function fitPreviewContacts(entity,{rightPitch=.30,leftPitch=.20}={}){
  const gun=entity.weapon,root=entity.root,originalParent=gun.parent,worldGun=gun.getWorldQuaternion(new Quaternion());
  const gunX=new Vector3(1,0,0).applyQuaternion(worldGun),forward=new Vector3(0,0,1).applyQuaternion(worldGun);
  root.attach(gun);root.updateMatrixWorld(true);
  const plans=['R','L'].map(side=>{
    const bones=['UpperArm','LowerArm','Wrist'].map(n=>entity.model.getObjectByName(n+side));
    const q=new Quaternion().setFromAxisAngle(gunX,side==='R'?rightPitch:leftPitch).multiply(bones[2].getWorldQuaternion(new Quaternion()));
    const local=gun.userData.pistol[side==='R'?'rightPalm':'leftPalm'];
    return{side,bones,q,local,pole:point(entity,'LowerArm'+side)};
  });
  let retreat=0;
  for(const p of plans){
    const palm=gun.localToWorld(new Vector3(...p.local));
    const target=contactWrist(entity,p.side,palm,p.q),start=p.bones[0].getWorldPosition(v());
    const a=start.distanceTo(p.bones[1].getWorldPosition(v())),b=p.bones[1].getWorldPosition(v()).distanceTo(p.bones[2].getWorldPosition(v()));
    const d=target.sub(start),along=d.dot(forward),across=d.lengthSq()-along*along,maximum=a+b-.005;
    if(d.length()>maximum)retreat=Math.max(retreat,along-Math.sqrt(Math.max(0,maximum*maximum-across)));
  }
  if(retreat>0)gun.position.copy(root.worldToLocal(gun.getWorldPosition(v()).addScaledVector(forward,-retreat)));
  root.updateMatrixWorld(true);const metrics={retreat,palms:{},frames:{}};
  for(const p of plans){
    const palm=gun.localToWorld(new Vector3(...p.local)),goal=contactWrist(entity,p.side,palm,p.q),rig=entity.rifleHands;
    const initial=p.bones.map(b=>b.quaternion.clone()),start=p.bones[0].getWorldPosition(v()),axis=goal.clone().sub(start).normalize();
    const radial=p.pole.clone().sub(start);radial.addScaledVector(axis,-radial.dot(axis)).normalize();
    let best=null;
    for(let turn=-120;turn<=120;turn+=5){
      p.bones.forEach((b,i)=>b.quaternion.copy(initial[i]));root.updateMatrixWorld(true);
      const frame={hand:p.q,axis:rig.get('Wrist'+p.side).palm,rest:rig.get('Wrist'+p.side).rotation,lowerRest:rig.get('LowerArm'+p.side).rotation,hinge:rig.get('UpperArm'+p.side).hinge,maxTwist:Math.PI/3,maxBend:38*Math.PI/180};
      const pole=start.clone().add(radial.clone().applyAxisAngle(axis,turn*Math.PI/180));
      fitArm(...p.bones,goal,pole,frame);orientWorld(p.bones[2],p.q);root.updateMatrixWorld(true);
      const lower=point(entity,'LowerArm'+p.side),wrist=point(entity,'Wrist'+p.side),middle=point(entity,'Middle2'+p.side);
      const bend=wrist.clone().sub(lower).angleTo(middle.clone().sub(wrist));
      const invalid=Math.max(0,Math.abs(frame.wristTwist)-35*Math.PI/180)+Math.max(0,bend-38*Math.PI/180);
      const cost=invalid*100+lower.distanceToSquared(p.pole);
      if(!best||cost<best.cost)best={cost,turn,bend,frame,quaternions:p.bones.map(b=>b.quaternion.clone())};
    }
    p.bones.forEach((b,i)=>b.quaternion.copy(best.quaternions[i]));root.updateMatrixWorld(true);
    metrics.palms[p.side]={error:point(entity,'Middle2'+p.side).distanceTo(palm),wristBend:best.bend,wristTwist:best.frame.wristTwist,forearmTwist:best.frame.forearmTwist,poleTurn:best.turn};
    metrics.frames[p.side]=worldGun.clone().invert().multiply(p.q).toArray();
  }
  originalParent.attach(gun);root.updateMatrixWorld(true);return metrics;
}
