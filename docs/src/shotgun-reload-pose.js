import {Euler,Quaternion,Vector3} from 'three';
import {activeWeapon,itemDefinition} from './inventory.js';
import {reloadPhase} from './weapon-reload.js';
import {fitSupportContact,fitWeaponPose} from './rifle-pose.js';
import {fitOneHandWeaponPose} from './one-hand-pose.js';
import {cartridgeMesh} from './cartridge-models.js';
import {orientWorld} from './weapon-ik.js';
import {pinchPoint,poseHand,contactWrist,VERTICAL_HAND} from './weapon-hands.js';

const v=a=>new Vector3(...a),at=(e,n)=>e.model.getObjectByName(n).getWorldPosition(new Vector3());
const ease=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
const fingers=e=>new Map([...e.rifleHands.values()].filter(x=>/^(Index|Middle|Ring|Pinky|Thumb).*L$/.test(x.bone.name)).map(x=>[x.bone,x.bone.quaternion.clone()]));
function local(e,side,p){return e.root.worldToLocal(p.clone()).sub(e.root.worldToLocal(at(e,'UpperArm'+side)));}
function world(e,side,p){return e.root.localToWorld(e.root.worldToLocal(at(e,'UpperArm'+side)).add(p));}
function fitGun(e,p,q){if(e.weapon.userData.oneHandPose)fitOneHandWeaponPose(e,p,q);else fitWeaponPose(e,p,q,1);}
function reachableHold(e,origin,rotation){
 const weapon=e.weapon,gunQ=weapon.getWorldQuaternion(new Quaternion()),atR=at(e,'WristR'),offsetR=atR.sub(weapon.getWorldPosition(new Vector3())).applyQuaternion(gunQ.invert()).applyQuaternion(rotation);
 const hand=e.model.getObjectByName('WristL'),pinchOffset=pinchPoint(e).sub(at(e,'WristL')).applyQuaternion(hand.getWorldQuaternion(new Quaternion()).invert()).applyQuaternion(rotation.clone().multiply(VERTICAL_HAND));
 const offsetL=v(weapon.userData.anchors.loading).multiply(weapon.getWorldScale(new Vector3())).applyQuaternion(rotation).sub(pinchOffset);
 const arms=['R','L'].map((side,i)=>{const a=at(e,'UpperArm'+side),b=at(e,'LowerArm'+side),c=at(e,'Wrist'+side);return{start:a,reach:a.distanceTo(b)+b.distanceTo(c)-.018,offset:i?offsetL:offsetR};});
 for(let i=0;i<12;i++)for(const arm of arms){const d=origin.clone().add(arm.offset).sub(arm.start);if(d.length()>arm.reach)origin.copy(arm.start).add(d.setLength(arm.reach)).sub(arm.offset);}
 return origin;
}
function remember(e,weight){
 const yaw=e.root.getWorldQuaternion(new Quaternion()).invert();
 e.shotgunReload={id:e.weapon.userData.weaponId,weight,elapsed:0,weapon:local(e,'R',e.weapon.getWorldPosition(new Vector3())),rotation:yaw.clone().multiply(e.weapon.getWorldQuaternion(new Quaternion())),palm:local(e,'L',at(e,'Middle2L')),hand:yaw.multiply(e.model.getObjectByName('WristL').getWorldQuaternion(new Quaternion())),fingers:fingers(e),leftArm:new Map(['ShoulderL','UpperArmL','LowerArmL','WristL'].map(n=>{const b=e.model.getObjectByName(n);return[b,b.quaternion.clone()];}))};
 e.shotgunReload.rightArm=new Map(['UpperArmR','LowerArmR','WristR'].map(n=>{const b=e.model.getObjectByName(n);return[b,b.quaternion.clone()];}));
 e.shotgunReload.weaponLocal={position:e.weapon.position.clone(),rotation:e.weapon.quaternion.clone()};
}
function returnToPosture(e,delta){
 const last=e.shotgunReload;if(!last||last.id!==e.weapon.userData.weaponId){e.shotgunReload=null;return;}
 last.elapsed+=Math.max(0,delta);const amount=1-ease(last.elapsed/.4);
 const sourceArm=new Map([...last.leftArm.keys()].map(b=>[b,b.quaternion.clone()]));
 // The free source arm has its own relaxed wrist roll. Once the hand has
 // travelled around the knee, hand it back to that source pose smoothly;
 // keeping the contact solver active here would pin it to a loading frame.
 if(e.weapon.userData.oneHandPose&&last.elapsed>.4){
  last.freeArm??=last.reachedArm||last.leftArm;last.freeFingers??=last.reachedFingers||last.fingers;
  const rest=1-ease((last.elapsed-.4)/.4);
  for(const[b,q]of last.freeArm)b.quaternion.slerp(q,rest);
  for(const[b,q]of last.freeFingers)b.quaternion.slerp(q,rest);
  e.root.updateMatrixWorld(true);
  // Swing the released hand around the outside of the crouched knee while
  // its anatomical frame rejoins the original free-arm locomotion.
  const upper=e.model.getObjectByName('UpperArmL'),start=at(e,'UpperArmL'),from=at(e,'WristL').sub(start),to=from.clone().add(v([e.modelSex==='female'?.10:.04,.035,0]).multiplyScalar(Math.sin(Math.PI*rest)*e.root.scale.x).applyQuaternion(e.root.quaternion));
  orientWorld(upper,new Quaternion().setFromUnitVectors(from.normalize(),to.normalize()).multiply(upper.getWorldQuaternion(new Quaternion())));
  e.root.updateMatrixWorld(true);
  if(rest<.001){e.shotgunReload=null;e.shotgunSupportPose=null;}
  return;
 }
 const yaw=e.root.getWorldQuaternion(new Quaternion()),p=e.weapon.getWorldPosition(new Vector3()).lerp(world(e,'R',last.weapon),amount),q=e.weapon.getWorldQuaternion(new Quaternion()).slerp(yaw.clone().multiply(last.rotation),amount);
 const palm=at(e,'Middle2L').lerp(world(e,'L',last.palm),amount),hand=e.model.getObjectByName('WristL').getWorldQuaternion(new Quaternion()).slerp(yaw.multiply(last.hand),amount);
 palm.add(v([e.weapon.userData.oneHandPose?.32:.12,0,.06]).multiplyScalar(Math.sin(Math.PI*amount)*e.root.scale.x).applyQuaternion(e.root.quaternion));
 e.weaponPoles.left=at(e,'LowerArmL');
 if(amount>.001)fitGun(e,p,q);
 for(const[b,q]of last.fingers)b.quaternion.slerp(q,amount);
 fitSupportContact(e,palm,hand,'Middle2','return',{clearance:0});
 last.reachedArm=new Map([...sourceArm.keys()].map(b=>[b,b.quaternion.clone()]));last.reachedFingers=fingers(e);
 const remaining=Math.max(...[...sourceArm].map(([b,q])=>b.quaternion.clone().normalize().angleTo(q.normalize())));
 if(amount<.001&&remaining<.10){e.shotgunReload=null;e.shotgunSupportPose=null;}
 e.root.updateMatrixWorld(true);
}
function along(keys,t){for(let i=1;i<keys.length;i++)if(t<=keys[i][0])return keys[i-1][1].clone().lerp(keys[i][1],ease((t-keys[i-1][0])/(keys[i][0]-keys[i-1][0])));return keys.at(-1)[1].clone();}
export function applyShotgunReload(e,player,delta){
 const weapon=e.weapon,state=player.combat?.reload,item=activeWeapon(player);weapon.userData.heldShellSlot=null;
 if(weapon.userData.carriedShell)weapon.userData.carriedShell.visible=false;
 if(player.dead){e.shotgunReload=null;return;}
 // One-hand locomotion deliberately restores only the firing arm. Reload
 // temporarily owns the free arm too, including fingers without clip tracks.
 if(e.weapon.userData.oneHandPose&&(state?.kind==='tube'||e.shotgunReload))for(const x of e.rifleHands.values())if(x.bone.name.endsWith('L')&&!e.rifleRestore.has(x.bone))e.rifleRestore.set(x.bone,x.bone.quaternion.clone());
 if(state?.weaponId!==item?.id||state?.kind!=='tube'){returnToPosture(e,delta);return;}
 // The action continues from the last displayed arms. The baseline posture
 // was evaluated to obtain today's body frame, but must not move either arm
 // back towards its ordinary grip before the loading contact is solved.
 const previous=e.shotgunReload;
 if(previous?.id===item.id&&previous.elapsed===0){
  for(const[b,q]of previous.rightArm)b.quaternion.copy(q);
  for(const[b,q]of previous.leftArm)b.quaternion.copy(q);
  for(const[b,q]of previous.fingers)b.quaternion.copy(q);
  weapon.position.copy(previous.weaponLocal.position);weapon.quaternion.copy(previous.weaponLocal.rotation);e.root.updateMatrixWorld(true);
 }
 const phase=reloadPhase(state),weight=Math.min(ease(state.elapsed/.32),ease((state.duration-state.elapsed)/.28)),leftWeight=ease(state.elapsed/.32),root=e.root,yaw=root.getWorldQuaternion(new Quaternion());
 if(!weight){e.shotgunReload=null;return;}
 const baseHand=e.model.getObjectByName('WristL').getWorldQuaternion(new Quaternion()),before=fingers(e);
 const reachedElbow=at(e,'LowerArmL');
 const short=Boolean(weapon.userData.oneHandPose),female=e.modelSex==='female';
 const hold=short?[.04,-.12,.46]:female?[.12,-.1,item.type==='ithaca_mag10'?.24:.36]:[0,-.1,.36];
 const turn=short?[.1,0,0]:female&&item.type==='ithaca_mag10'?[-.2,0,-.5]:[-.2,0,-1];
 const shoulder=root.worldToLocal(at(e,'UpperArmR')),goal=root.localToWorld(shoulder.add(v(hold))),rotation=yaw.clone().multiply(new Quaternion().setFromEuler(new Euler(...turn,'YXZ')));
 poseHand(e,'L','pinch');for(const[b,q]of before)b.quaternion.copy(q.clone().slerp(b.quaternion,leftWeight));
 const heldRotation=weapon.getWorldQuaternion(new Quaternion()).slerp(rotation,weight),heldOrigin=weapon.getWorldPosition(new Vector3()).lerp(goal,weight);
 fitGun(e,reachableHold(e,heldOrigin,heldRotation),heldRotation);
 for(let i=0;i<5;i++){
  const gun=weapon.getWorldQuaternion(new Quaternion()),target=contactWrist(e,'L',weapon.localToWorld(v(weapon.userData.anchors.loading)),gun.clone().multiply(VERTICAL_HAND),'Index4'),start=at(e,'UpperArmL'),reach=start.distanceTo(at(e,'LowerArmL'))+at(e,'LowerArmL').distanceTo(at(e,'WristL'))-.02,d=target.clone().sub(start);
  if(d.length()<=reach)break;
  const shift=start.add(d.setLength(reach)).sub(target);
  fitGun(e,weapon.getWorldPosition(new Vector3()).add(shift),gun);
 }
 const gunQ=weapon.getWorldQuaternion(new Quaternion()),port=weapon.localToWorld(v(weapon.userData.anchors.loading)),approach=port.clone().add(v([.025,-.065,-.025]).applyQuaternion(gunQ));
 const hips=at(e,'UpperLegL').lerp(at(e,'UpperLegR'),.5),waist=hips.add(v(player.stance==='sneak'?[.34,.22,.28]:[.27,.14,.20]).multiplyScalar(root.scale.x).applyQuaternion(yaw));
 let source=waist,slot=null;
 if(phase.clip==='shellLoad'&&phase.round<state.carrierRounds){
  slot=state.carrierRounds-phase.round-1;const part=weapon.getObjectByName(weapon.userData.shellParts[slot][0]);if(!part.geometry.boundingBox)part.geometry.computeBoundingBox();source=part.localToWorld(part.geometry.boundingBox.getCenter(new Vector3())).add(v([.035,.035,0]).applyQuaternion(gunQ));
 }
 const outside=at(e,'UpperArmL').add(v([.30,-.13,.15]).multiplyScalar(root.scale.x).applyQuaternion(yaw));
 const p=phase.progress,load=phase.clip==='shellLoad',route=slot===null?[[0,outside],[.12,outside],[.28,source],[.36,source],[.50,outside],[.65,port],[.88,port],[.95,approach],[1,approach]]:[[0,approach],[.25,source],[.35,source],[.65,port],[.88,port],[.95,approach],[1,approach]],path=load?along(route,p):phase.clip==='shellStart'?outside:port;
 const pickup=load&&p>=.34&&p<state.insertAt;
 if(pickup&&slot!==null)weapon.userData.heldShellSlot=slot;
 // Keep the loading grasp until the arm leaves the port. Relaxing the fingers
 // early while a guided wrist is still above a bent knee makes the fingertips
 // sweep down through it; the separate return owns that release.
 const hand=baseHand.clone().slerp(gunQ.clone().multiply(VERTICAL_HAND),leftWeight),point=pinchPoint(e).lerp(path,leftWeight);
 e.weaponPoles.left=reachedElbow;
 fitSupportContact(e,point,hand,'Index4','reload',{directContact:true});
 if(load&&p>.65&&p<.87){
  const contact=pinchPoint(e),target=contact.clone().add(port.clone().sub(contact).clampLength(0,Math.max(0,delta)*1.5));
  const seating=ease((p-.65)/.08);
  for(let i=0;i<4;i++){
   const socket=weapon.localToWorld(v(weapon.userData.anchors.loading)),error=pinchPoint(e).sub(socket);
   if(error.length()<.002)break;
   const elbow=at(e,'LowerArmL'),leftQ=e.model.getObjectByName('WristL').getWorldQuaternion(new Quaternion());
   fitGun(e,weapon.getWorldPosition(new Vector3()).addScaledVector(error,seating),weapon.getWorldQuaternion(new Quaternion()));
   e.weaponPoles.left=elbow;
   fitSupportContact(e,target,leftQ,'Index4','reload',{directContact:true,pinContact:true});
  }
 }
 if(pickup){
  if(!weapon.userData.carriedShell){const shell=cartridgeMesh(itemDefinition(item).ammoType,false);shell.name='ReloadShell';weapon.add(shell);weapon.userData.carriedShell=shell;}
  const shell=weapon.userData.carriedShell;shell.visible=true;shell.position.copy(weapon.worldToLocal(pinchPoint(e)));shell.quaternion.copy(weapon.getWorldQuaternion(new Quaternion()).invert().multiply(gunQ));
 }
 const lifter=weapon.getObjectByName('Lifter');if(lifter&&load)lifter.rotation.x=-.35*Math.sin(Math.PI*p);
 root.updateMatrixWorld(true);remember(e,weight);
}
