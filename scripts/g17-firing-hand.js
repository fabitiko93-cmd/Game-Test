// Isolated, explicitly authored firing-hand study. Never imported by the game.
import {Euler,Quaternion,Vector3,Matrix4} from 'three';
import {contactWrist} from '../docs/src/weapon-hands.js';
import {fitArm,orientWorld} from '../docs/src/weapon-ik.js';

const point=(entity,name)=>entity.model.getObjectByName(name).getWorldPosition(new Vector3());
const radians=value=>value*Math.PI/180;

export function authorFiringHand(entity,pose){
  const root=entity.root,gun=entity.weapon,rig=entity.rifleHands,wrist=rig.get('WristR').bone,parent=gun.parent;
  const gunQ=gun.getWorldQuaternion(new Quaternion()),gunX=new Vector3(1,0,0).applyQuaternion(gunQ),gunY=new Vector3(0,1,0).applyQuaternion(gunQ),gunZ=new Vector3(0,0,1).applyQuaternion(gunQ);
  root.attach(gun);root.updateMatrixWorld(true);
  for(const[name,entry]of rig)if(/^(Index|Middle|Ring|Pinky|Thumb).*R$/.test(name))entry.bone.quaternion.copy(entry.rotation);
  root.updateMatrixWorld(true);
  const hand=new Quaternion().setFromAxisAngle(gunZ,radians(pose.roll||0)).multiply(new Quaternion().setFromAxisAngle(gunY,radians(pose.yaw||0))).multiply(new Quaternion().setFromAxisAngle(gunX,radians(pose.pitch||0))).multiply(wrist.getWorldQuaternion(new Quaternion()));
  let anchor=gun.localToWorld(new Vector3(...pose.palm)),target=contactWrist(entity,'R',anchor,hand);
  const start=point(entity,'UpperArmR'),elbow=point(entity,'LowerArmR'),maximum=start.distanceTo(elbow)+elbow.distanceTo(point(entity,'WristR'))-.005;
  const offset=target.clone().sub(start),along=offset.dot(gunZ),across=offset.lengthSq()-along*along;
  let retreat=0;
  if(offset.length()>maximum){
    if(across>=maximum*maximum)throw Error('Firing-hand contact is outside the arm reach');
    retreat=Math.max(0,along-Math.sqrt(maximum*maximum-across));
    gun.position.copy(root.worldToLocal(gun.getWorldPosition(new Vector3()).addScaledVector(gunZ,-retreat)));root.updateMatrixWorld(true);
    anchor=gun.localToWorld(new Vector3(...pose.palm));target=contactWrist(entity,'R',anchor,hand);
  }
  const pole=point(entity,'LowerArmR');
  const frame={hand,axis:rig.get('WristR').palm,rest:rig.get('WristR').rotation,lowerRest:rig.get('LowerArmR').rotation,hinge:rig.get('UpperArmR').hinge,maxTwist:Math.PI/3,maxBend:38*Math.PI/180};
  fitArm(rig.get('UpperArmR').bone,rig.get('LowerArmR').bone,wrist,target,pole,frame);orientWorld(wrist,hand);root.updateMatrixWorld(true);
  for(const finger of ['Index','Middle','Ring','Pinky']){
    const meta=entity.model.getObjectByName(finger+'1R'),spread=pose.spread?.[finger]||[0,0,0];
    const turn=new Quaternion().setFromAxisAngle(gunZ,radians(spread[2])).multiply(new Quaternion().setFromAxisAngle(gunY,radians(spread[1]))).multiply(new Quaternion().setFromAxisAngle(gunX,radians(spread[0])));
    orientWorld(meta,turn.multiply(meta.getWorldQuaternion(new Quaternion())));
    for(let i=2;i<=4;i++){
      const entry=rig.get(finger+i+'R'),e=new Euler().setFromQuaternion(entry.rotation);
      if(pose.planar){
        const angle=radians(pose.curls[finger].slice(0,i-1).reduce((a,b)=>a+b,0)),axisX=gunY.clone().negate(),axisY=gunX.clone().multiplyScalar(Math.sin(angle)).addScaledVector(gunZ,Math.cos(angle));
        const axisZ=axisX.clone().cross(axisY);
        orientWorld(entry.bone,new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(axisX,axisY,axisZ)));
      }else{e.x=-radians(pose.curls[finger][i-2]);entry.bone.quaternion.setFromEuler(e);}
      root.updateMatrixWorld(true);
    }
    root.updateMatrixWorld(true);
  }
  if(pose.thumb){
    for(let i=1;i<=3;i++){
      const b=rig.get('Thumb'+i+'R').bone,here=b.getWorldPosition(new Vector3()),wanted=gun.localToWorld(new Vector3(...pose.thumb[i-1])).sub(here).normalize();
      const from=i<3?point(entity,'Thumb'+(i+1)+'R').sub(here).normalize():new Vector3(0,1,0).applyQuaternion(b.getWorldQuaternion(new Quaternion()));
      orientWorld(b,new Quaternion().setFromUnitVectors(from,wanted).multiply(b.getWorldQuaternion(new Quaternion())));root.updateMatrixWorld(true);
    }
  }
  parent.attach(gun);root.updateMatrixWorld(true);
  const palmError=point(entity,'Middle2R').distanceTo(anchor);
  if(palmError>.0001)throw Error('Firing-hand contact was not reached: '+palmError);
  return{palmError,retreat,handFrame:gun.getWorldQuaternion(new Quaternion()).invert().multiply(wrist.getWorldQuaternion(new Quaternion())).toArray(),forearmTwist:frame.forearmTwist,wristTwist:frame.wristTwist};
}
