import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {weaponFixture} from './weapon-fixture.mjs';
import {applyRiflePose} from '../../docs/src/rifle-pose.js';
import PROFILE from '../../docs/assets/weapons/ithaca-short-pose.json' with {type:'json'};

// Reuse the two real character rigs, without adding a playable shotgun or
// giving the preview item a new ammunition/crafting path in the live game.
export async function ithacaFixture(sex='male',{profile=PROFILE,modelPath}={}){
 const f=await weaponFixture({sex,type:'revolver_44',track:'aim'});
 profile=structuredClone(profile);
 const file=await readFile(modelPath||new URL('../../docs/assets/weapons/'+profile.model,import.meta.url));
 const bytes=file[0]===0x1f&&file[1]===0x8b?gunzipSync(file):file;
 const root=(await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene;
 const {entity:e,player:p,models}=f;
 e.weapon.removeFromParent();e.weapon=root;e.model.getObjectByName('WristR').add(root);
 root.userData={oneHandPose:profile,weaponId:p.inventory.find(w=>w.id===p.equipment.mainHand).id,
  weaponType:'ithaca_short_preview',grips:{handgun:true,right:[0,0,0],left:[0,0,0],rightThumb:profile.rightThumb}};
 e.rifleBlend=null;e.rifleTransition=null;e.weaponMotion=null;e.pistolFits=null;e.pistolPreviousFit=null;
 e.animationPreview=null;e.animationDocument=null;
 f.pose=({clip='Idle_Gun',progress=.35,delta=1,yaw=0,posture='aim',sneak=false,running=false}={})=>{
  p.stance=sneak?'sneak':'stand';p.running=running;p.moving=['Walk','Run','Crouch_Walk'].includes(clip);
  models.pose(e,{clip,progress,delta,yaw});
  const left=new Map([...e.rifleHands.values()].filter(x=>x.bone.name.endsWith('L')).map(x=>[x.bone,x.bone.quaternion.clone()]));
  f.baseline={left,shoulder:e.model.getObjectByName('ShoulderR').quaternion.clone(),legs:['UpperLegR','LowerLegR','FootR','UpperLegL','LowerLegL','FootL'].map(n=>({bone:e.model.getObjectByName(n),rotation:e.model.getObjectByName(n).quaternion.clone()}))};
  applyRiflePose(e,p,delta,posture);
  return left;
 };
 return f;
}
