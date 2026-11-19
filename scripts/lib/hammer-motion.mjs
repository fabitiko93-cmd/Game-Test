// Offline authoring for the approved 17 November hammer preview.
import { Euler, Matrix4, Object3D, Quaternion, Vector3 } from 'three';
import { createPlayer } from '../../docs/src/character.js';
import { addItem, createItem, equipItem } from '../../docs/src/inventory.js';
import { fitArm, orientWorld } from '../../docs/src/weapon-ik.js';
import { KNIFE_ANIMATIONS } from '../../docs/src/knife-animations.js';

const outfits={male:['tshirt_grey','jeans_dark','sneakers_red'],female:['tshirt_white','trousers_rust','casual_shoes_f']};
const V=(x,y,z)=>new Vector3(x,y,z);
const at=node=>node.getWorldPosition(new Vector3());
const orientation=node=>node.getWorldQuaternion(new Quaternion());
const rad=Math.PI/180;
const palmFrame=(shaft,forward)=>{
  const z=shaft.clone().normalize();
  const y=forward.clone().addScaledVector(z,-forward.dot(z)).normalize();
  return new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(y.clone().cross(z),y,z));
};

// Short overhead swing authored for our character proportions.
const keys=[
  //   t     pelvis dx,dy,dz   pitch,yaw,roll        right wrist offset    elbow pole offset      hammer aim, deg    free hand delta
  [0.00,   .00,.000,.000,        0,  0,   0,        -.105,-.237,.159,     -.32,-.19,-.035,         30,         .00,.00,.00],
  [0.13,   .012,-.020,-.022,    -4,-12,  -4,        -.176,-.155,.111,     -.40,-.13,-.100,         24,         .02,.03,-.04],
  [0.31,   .020,-.006,-.036,    -9,-21,  -3,        -.218, .208,-.064,    -.44, .08,-.100,        -48,         .07,.09,-.06],
  [0.38,   .016,.006,-.025,     -7,-15,  -2,        -.177, .259,-.009,    -.42, .12,-.090,        -35,         .08,.10,-.07],
  [0.45,  -.011,-.019,.042,      8,  7,   2,        -.094, .132,.270,    -.36, .07,.100,          43,         .03,.03,-.09],
  [0.50,  -.020,-.038,.076,     17, 17,   3,        -.054,-.125,.302,    -.34,-.07,.065,         105,         .02,-.02,-.11],
  [0.61,  -.015,-.047,.066,     19, 20,   3,        -.024,-.277,.207,    -.31,-.19,.030,         134,         .00,-.03,-.075],
  [0.80,  -.006,-.013,.019,      6,  6,   1,        -.124,-.264,.122,    -.35,-.20,-.010,         65,        -.01,-.02,-.03],
  [1.08,   .00,.000,.000,        0,  0,   0,        -.105,-.237,.159,    -.32,-.19,-.035,         30,         .00,.00,.00],
];
const duration=keys.at(-1)[0];

function valueAt(t){
  const end=keys.findIndex(k=>k[0]>t);
  if(end<1)return keys.at(end<0?-1:0).slice(1);
  const a=keys[end-1], b=keys[end], p=keys[end-2]??a, n=keys[end+1]??b;
  const dt=b[0]-a[0], u=(t-a[0])/dt, u2=u*u, u3=u2*u;
  return a.slice(1).map((v,i)=>{
    const j=i+1;
    const prev=p===a?0:(b[j]-p[j])*dt/(b[0]-p[0]);
    const next=n===b?0:(n[j]-a[j])*dt/(n[0]-a[0]);
    const curve=(2*u3-3*u2+1)*v+(u3-2*u2+u)*prev+(-2*u3+3*u2)*b[j]+(u3-u2)*next;
    return Math.max(Math.min(v,b[j]),Math.min(Math.max(v,b[j]),curve));
  });
}

export async function makeHammerPreview(models,sex,reference){
  const player=createPlayer({appearance:{sex}});
  for(const type of [...outfits[sex],'kitchen_knife']){
    const item=createItem(type);
    addItem(player,item);
    equipItem(player,item.id);
  }
  const entity=models.prepare(player,0);
  const bone=name=>entity.model.getObjectByName(name);
  const wrist=bone('WristR');
  models.pose(entity,{clip:'Knife_Stab',progress:0,delta:1,yaw:0});
  entity.weapon.visible=false;
  const grip=reference;
  for(const [name,value] of Object.entries(KNIFE_ANIMATIONS.rigs[sex].grip.fingers))bone(name).quaternion.fromArray(value);
  entity.root.updateMatrixWorld(true);
  const gripPoint=new Vector3().fromArray(grip.position), gripRotation=new Quaternion().fromArray(grip.rotation);
  const gripInverse=gripRotation.clone().invert();
  const wristLocal=wrist.matrixWorld.clone().invert().multiply(new Matrix4().compose(gripPoint,gripRotation,V(1,1,1)));
  const bendFinger=(names,target,pole)=>{
    const [a,b,c]=names.map(name=>bone(name+'R'));
    fitArm(a,b,c,target.applyQuaternion(gripRotation).add(gripPoint),pole?pole.applyQuaternion(gripRotation).add(gripPoint):at(b));
  };
  for(const [i,name] of ['Index','Middle','Ring','Pinky'].entries()){
    const tip=at(bone(name+'4R')).sub(gripPoint).applyQuaternion(gripInverse);
    tip.x=[-.002,-.005,-.008,-.011][i];
    tip.y=.015*Math.sqrt(1-(tip.x/.018)**2)+.004;
    bendFinger([name+'2',name+'3',name+'4'],tip);
  }
  bendFinger(['Thumb1','Thumb2','Thumb3'],V(.019,.006,-.026),sex==='female'?V(.048,-.004,-.019):null);
  const gripBones=[];
  entity.model.traverse(b=>{if(b.isBone&&/^(Index|Middle|Ring|Pinky|Thumb)\dR$/.test(b.name))gripBones.push([b,b.quaternion.clone()]);});
  const palmLocal=at(bone('Middle2R')).sub(at(wrist)).normalize().applyQuaternion(orientation(wrist).invert());
  const shaftLocal=V(0,0,-1).transformDirection(wristLocal);
  const gripBasis=palmFrame(shaftLocal,palmLocal).invert();

  models.pose(entity,{clip:'Idle_Sword',progress:.21,delta:1,yaw:0});
  entity.weapon.visible=false;
  entity.root.updateMatrixWorld(true);
  const rest=[];
  entity.model.traverse(b=>{if(b.isBone)rest.push([b,b.position.clone(),b.quaternion.clone()]);});
  const hips=bone('Body'), hipAt=at(hips), torso=bone('Torso'), chest=bone('Chest'), head=bone('Head');
  const bodyQ=orientation(hips),torsoQ=orientation(torso),chestQ=orientation(chest),headQ=orientation(head);
  const lwr=bone('WristL'),leftInitial=at(lwr),leftLower=bone('LowerArmL'),leftQ=orientation(lwr),leftElbow=at(leftLower);
  const rightUpper=bone('UpperArmR'),rightLower=bone('LowerArmR');
  const leftUpper=bone('UpperArmL');
  const limbSize=(at(rightUpper).distanceTo(at(rightLower))+at(rightLower).distanceTo(at(wrist)))/.406;
  const q=(p,y,r)=>new Quaternion().setFromEuler(new Euler(p*rad,y*rad,r*rad,'YXZ'));
  const legs=['R','L'].map(side=>{
    const start=bone('UpperLeg'+side),shin=bone('LowerLeg'+side),foot=bone('Foot'+side);
    const ankle=new Object3D(), point=at(foot);
    shin.add(ankle);
    ankle.position.copy(shin.worldToLocal(point.clone()));
    return {start,shin,ankle,foot,point,pole:at(shin),rotation:orientation(foot)};
  });

  function pose(time){
    entity.root.rotation.y=0;
    for(const [b,p,r] of rest){b.position.copy(p);b.quaternion.copy(r);}
    entity.root.updateMatrixWorld(true);
    const [dx,dy,dz,pitch,yaw,roll,wx,wy,wz,ex,ey,ez,aim,lx,ly,lz]=valueAt(time);
    hips.position.copy(hips.parent.worldToLocal(hipAt.clone().add(V(dx,dy,dz))));
    hips.updateMatrixWorld(true);
    orientWorld(hips,q(pitch*.35,yaw*.52,roll*.6).multiply(bodyQ));
    orientWorld(torso,q(pitch*.72,yaw*.79,roll).multiply(torsoQ));
    orientWorld(chest,q(pitch,yaw,roll).multiply(chestQ));
    orientWorld(head,q(pitch*.55,yaw*.48,roll*.55).multiply(headQ));
    for(const {start,shin,ankle,foot,point,pole,rotation} of legs){
      fitArm(start,shin,ankle,point,pole);
      foot.position.copy(foot.parent.worldToLocal(point.clone()));
      orientWorld(foot,rotation);
    }
    const shoulder=at(rightUpper);
    fitArm(rightUpper,rightLower,wrist,shoulder.clone().add(V(wx,wy,wz).multiplyScalar(limbSize)),
      shoulder.clone().add(V(ex,ey,ez).multiplyScalar(limbSize)));
    const forearm=at(wrist).sub(at(rightLower)).normalize();
    const shaft=V(.035,Math.cos(aim*rad),Math.sin(aim*rad)).normalize();
    const hand=palmFrame(shaft,forearm).multiply(gripBasis);
    const palm=palmLocal.clone().applyQuaternion(hand);
    const bend=forearm.angleTo(palm),limit=35*rad;
    if(bend>limit)hand.premultiply(new Quaternion().slerp(new Quaternion().setFromUnitVectors(palm,forearm),1-limit/bend));
    orientWorld(wrist,hand);
    fitArm(leftUpper,leftLower,lwr,leftInitial.clone().add(V(lx,ly,lz)),leftElbow);
    orientWorld(lwr,q(pitch*.5,-yaw*.45,roll).multiply(leftQ));
    for(const [joint,rotation] of gripBones)joint.quaternion.copy(rotation);
    entity.root.rotation.y=1.56;
    entity.root.updateMatrixWorld(true);
    return {wristBend:bend/rad,reach:at(wrist).distanceTo(at(rightUpper))};
  }
  const position=new Vector3(),rotation=new Quaternion(),scale=new Vector3();
  wristLocal.decompose(position,rotation,scale);
  const fittedGrip={position:position.toArray(),rotation:rotation.toArray(),scale:scale.toArray(),fingers:Object.fromEntries(gripBones.map(([b,q])=>[b.name,q.toArray()]))};
  return {entity,wrist,grip:fittedGrip,pose,duration};
}
