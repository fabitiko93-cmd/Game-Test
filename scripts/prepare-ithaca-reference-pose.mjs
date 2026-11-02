import {writeFile} from 'node:fs/promises';
import {Euler,Quaternion,Vector3} from 'three';
import BASE from '../docs/assets/weapons/ithaca-short-pose.json' with {type:'json'};
import OPTIONS from './lib/ithaca-stock-options.json' with {type:'json'};
import {ithacaFixture} from '../tests/helpers/ithaca-fixture.mjs';
import {fitArm,orientWorld} from '../docs/src/weapon-ik.js';
import {gripContact,indexSurfaceDistance} from '../tests/helpers/grip-contact.mjs';

const profile=structuredClone(BASE),modelPath=new URL('../tests/fixtures/ithaca-reference-cut.glb.gz',import.meta.url);
profile.model='ithaca-reference-cut.glb.gz';profile.contactMesh='ReceiverAndGrip';
profile.reference='ithaca.jpg · user red-line reference';profile.designStatus='user-marked-original-cut-stance-preview';
profile.changes='Original stock digitally clipped at the marked reference line. Retained source surfaces unchanged. New flat cut face closed; previous short barrel and carrier retained. No wrap, stretching or replacement grip.';
profile.crouchCarry.wrist=[.10,-.04,.40];
for(const sex of ['male','female']){
 const r=profile.rigs[sex];Object.assign(r,structuredClone(OPTIONS.a[sex]));
 if(sex==='male'){
  const q=new Quaternion().fromArray(r.boneRotations.Ring3R),e=new Euler().setFromQuaternion(q);e.x+=.04;r.boneRotations.Ring3R=new Quaternion().setFromEuler(e).toArray();
 }else{
  const hand=new Quaternion().fromArray(r.gripQuaternion).invert().premultiply(new Quaternion().setFromAxisAngle(new Vector3(0,1,0),.04));r.gripQuaternion=hand.clone().invert().toArray();r.rightPalm[0]+=.001;
  const axis=new Vector3(0,1,0).applyQuaternion(hand.clone().invert());r.boneRotations.Thumb1R=new Quaternion().setFromAxisAngle(axis,.02).multiply(new Quaternion().fromArray(r.boneRotations.Thumb1R)).toArray();
 }
 const f=await ithacaFixture(sex,{profile,modelPath}),e=f.entity;f.pose();
 const rest=gripContact(e,profile.contactMesh),bone=n=>e.model.getObjectByName(n);
 const worldX=new Vector3(1,0,0).applyQuaternion(e.weapon.getWorldQuaternion(new Quaternion()));
 orientWorld(bone('Index1R'),new Quaternion().setFromAxisAngle(worldX,sex==='female'?.15:0).multiply(bone('Index1R').getWorldQuaternion(new Quaternion())));e.root.updateMatrixWorld(true);
 const target=e.weapon.localToWorld(new Vector3(sex==='male'?-.012:-.008,-.004,.022)),pole=e.weapon.localToWorld(new Vector3(-.036,.002,.025));
 fitArm(bone('Index2R'),bone('Index3R'),bone('Index4R'),target,pole);e.root.updateMatrixWorld(true);
 const contact=new Vector3(0,-.004,.028),index4=new Euler().setFromQuaternion(new Quaternion().fromArray(r.boneRotations.Index4R));let best;
 for(const curl of [.20,.45,.70,.95]){
  index4.x=-curl;bone('Index4R').quaternion.setFromEuler(index4);e.root.updateMatrixWorld(true);
  const probe=gripContact(e,profile.contactMesh),deep=Math.max(0,...probe.inside.filter(v=>v.name.startsWith('Index')).map(v=>v.depth)),distance=indexSurfaceDistance(e,contact),score=distance**2+Math.max(0,deep-.0007)**2*100;
  const candidate={score,deep,distance,q:bone('Index4R').quaternion.toArray()};if(!best||score<best.score)best=candidate;
 }
 bone('Index4R').quaternion.fromArray(best.q);e.root.updateMatrixWorld(true);r.triggerRotations=Object.fromEntries([1,2,3,4].map(i=>['Index'+i+'R',bone('Index'+i+'R').quaternion.toArray()]));r.triggerPitch=0;
 console.log(JSON.stringify({sex,restPenetration:rest.maxDepth,triggerPenetration:best.deep,triggerContactDistance:best.distance,indexTargetError:bone('Index4R').getWorldPosition(new Vector3()).distanceTo(target)}));
 f.replay.dispose();
}
await writeFile(new URL('../tests/fixtures/ithaca-reference-pose.json',import.meta.url),JSON.stringify(profile,null,2)+'\n');
