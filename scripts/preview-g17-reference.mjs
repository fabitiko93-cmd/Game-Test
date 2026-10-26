// Isolated review render. Does not activate a profile, build or publish the game.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {Vector3,Color,Euler,Quaternion,Matrix3,Matrix4} from 'three';
import {QuaterniusAssets} from '../docs/src/quaternius-assets.js';
import {PlayerModels} from '../docs/src/player-models.js';
import {AnimationReplay} from '../docs/src/animation-replay.js';
import {parseAnimation} from '../docs/src/animation-document.js';
import {poseHand,poseThumb} from '../docs/src/weapon-hands.js';
import {fitArm} from '../docs/src/weapon-ik.js';
import {fitPreviewContacts} from './g17-preview-contact.js';
import {orientWorld} from '../docs/src/weapon-ik.js';
import {fileURLToPath} from 'node:url';
import {authorFiringHand} from './g17-firing-hand.js';
import {authorSupportHand} from './g17-support-hand.js';
import {alignPreviewArm} from './g17-arm-alignment.js';

const output=process.env.SPERRKREIS_POSE_OUTPUT||fileURLToPath(new URL('../previews/rendered-g17',import.meta.url));
await mkdir(output,{recursive:true});
const source=await readFile(process.env.SPERRKREIS_POSE_INPUT||new URL('../previews/g17-input-reference.json',import.meta.url),'utf8');
const original=parseAnimation(source),cache=new Map();
const supportHandFile=process.env.SPERRKREIS_SUPPORT_HAND;
const supportHand=supportHandFile?JSON.parse(await readFile(supportHandFile,'utf8')):null;
if(supportHand?.status==='rejected-by-user'&&!process.argv.includes('--replay-rejected'))throw Error('Rejected pose: use --replay-rejected only for a historical comparison');
const firingHandFile=process.env.SPERRKREIS_FIRING_HAND||(supportHandFile?fileURLToPath(new URL('../previews/g17-firing-hand-pose.json',import.meta.url)):null);
const firingHandSource=firingHandFile?await readFile(firingHandFile,'utf8'):null;
const firingHand=firingHandSource?JSON.parse(firingHandSource):null;
if(supportHand){
  if(firingHand.status!=='visually-approved'||supportHand.sex!==firingHand.sex)throw Error('Support study requires the approved firing-hand reference on the same rig');
  const expected=supportHand.firingHandReference?.poseSha256;
  if(expected&&createHash('sha256').update(firingHandSource).digest('hex')!==expected)throw Error('Approved firing-hand reference has changed');
}
async function load(url){
  if(!cache.has(url))cache.set(url,(async()=>{let b=await readFile(new URL(url));if(b[0]===31)b=gunzipSync(b);return new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');})());return cache.get(url);
}
const library=new QuaterniusAssets({loadAsset:load});
const point=(e,n)=>e.model.getObjectByName(n).getWorldPosition(new Vector3());

function meshData(entity){
  entity.root.updateMatrixWorld(true);const meshes=[];
  entity.root.traverseVisible(mesh=>{
    if(!mesh.isMesh)return;mesh.skeleton?.update();const g=mesh.geometry,p=g.attributes.position,index=g.index,col=g.attributes.color;
    const positions=Array.from({length:p.count},(_,i)=>mesh.getVertexPosition(i,new Vector3()).applyMatrix4(mesh.matrixWorld).toArray());
    const normalMatrix=new Matrix3().getNormalMatrix(mesh.matrixWorld),bind=new Matrix3().setFromMatrix4(mesh.bindMatrix||new Matrix4()),inverseBind=new Matrix3().setFromMatrix4(mesh.bindMatrixInverse||new Matrix4());
    const normals=g.attributes.normal?Array.from({length:p.count},(_,i)=>{
      let n=new Vector3().fromBufferAttribute(g.attributes.normal,i);
      if(mesh.skeleton){
        n.applyMatrix3(bind);const skinned=new Vector3();
        for(let k=0;k<4;k++){
          const id=g.attributes.skinIndex.getComponent(i,k),weight=g.attributes.skinWeight.getComponent(i,k);
          if(weight)skinned.addScaledVector(n.clone().applyMatrix3(new Matrix3().setFromMatrix4(new Matrix4().fromArray(mesh.skeleton.boneMatrices,id*16))),weight);
        }
        n.copy(skinned).applyMatrix3(inverseBind);
      }
      return n.applyMatrix3(normalMatrix).normalize().toArray();
    }):null;
    const faces=[],colors=[],faceSides=[];
    const boneNames=[];
    const sides=Array.from({length:p.count},(_,i)=>{
      if(!mesh.skeleton||!g.attributes.skinIndex||!g.attributes.skinWeight)return null;
      let right=0,left=0,largest=-1,name=null;for(let k=0;k<4;k++){
        const n=mesh.skeleton.bones[g.attributes.skinIndex.getComponent(i,k)]?.name||'',w=g.attributes.skinWeight.getComponent(i,k);
        if(w>largest){largest=w;name=n;}
        if(!/^(Shoulder|UpperArm|LowerArm|Wrist|Index|Middle|Ring|Pinky|Thumb)/.test(n))continue;
        if(n.endsWith('R'))right+=w;else if(n.endsWith('L'))left+=w;
      }
      boneNames[i]=name;
      return Math.max(right,left)>.35?(right>=left?'R':'L'):null;
    });
    for(let j=0;j<(index?.count||p.count);j+=3){
      const ids=[0,1,2].map(k=>index?index.getX(j+k):j+k);faces.push(ids);
      const group=g.groups.find(group=>j>=group.start&&j<group.start+group.count),mat=Array.isArray(mesh.material)?mesh.material[group?.materialIndex||0]:mesh.material;
      faceSides.push(mat?.side??0);
      colors.push(ids.map(i=>{const c=(mat?.color||new Color(.6,.6,.6)).clone();if(mat?.vertexColors&&col)c.multiply(new Color().fromBufferAttribute(col,i));return c.toArray();}));
    }
    meshes.push({name:mesh.name,positions,normals,faces,colors,sides,boneNames,faceSides});
  });return meshes;
}

const variants=[{name:'candidate-l',roll:0,shift:0}];
function referenceFingers(entity){
  poseHand(entity,'R','pistol',{trigger:1});
  const spread=entity.model.getObjectByName('Index1R'),gunX=new Vector3(1,0,0).applyQuaternion(entity.weapon.getWorldQuaternion(new Quaternion())),gunY=new Vector3(0,1,0).applyQuaternion(entity.weapon.getWorldQuaternion(new Quaternion()));
  orientWorld(spread,new Quaternion().setFromAxisAngle(gunY,-.030).multiply(new Quaternion().setFromAxisAngle(gunX,-.090)).multiply(spread.getWorldQuaternion(new Quaternion())));
  const curls={Index:[1.05,.65,.30],Middle:[.95,.60,.30],Ring:[1,.65,.30],Pinky:[1.1,.65,.30]};
  for(const[finger,angles]of Object.entries(curls))for(let i=2;i<=4;i++){
    const entry=entity.rifleHands.get(`${finger}${i}L`);if(!entry)continue;
    const euler=new Euler().setFromQuaternion(entry.rotation);euler.x=-angles[i-2];entry.bone.quaternion.setFromEuler(euler);
  }
  for(const[finger,angles]of Object.entries({Middle:[.95,1.05,.40],Ring:[.90,1.05,.45],Pinky:[.65,.90,.40]}))for(let i=2;i<=4;i++){
    const entry=entity.rifleHands.get(`${finger}${i}R`),euler=new Euler().setFromQuaternion(entry.rotation);euler.x=-angles[i-2];entry.bone.quaternion.setFromEuler(euler);
  }
  entity.root.updateMatrixWorld(true);
  const wp=p=>entity.weapon.localToWorld(new Vector3(...p));
  // The trigger finger bends vertically into the trigger area; reusing the
  // three grip fingers' horizontal curl leaves it lying across the slide.
  const triggerBones=[2,3,4].map(i=>entity.model.getObjectByName('Index'+i+'R'));
  fitArm(...triggerBones,wp([-.006,-.014,.015]),wp([-.037,.020,.015]),{
    hinge:new Vector3(1,0,0),lowerRest:entity.rifleHands.get('Index3R').rotation,
    hand:triggerBones[2].getWorldQuaternion(new Quaternion()),rest:entity.rifleHands.get('Index4R').rotation,maxTwist:0,
  });
  const tip=new Euler().setFromQuaternion(entity.rifleHands.get('Index4R').rotation);tip.x=-.10;triggerBones[2].quaternion.setFromEuler(tip);
  // Keep the original right-thumb opposition on the other side of the grip.
  // The previous preview crossed it onto the back of the firing hand.
  const target=entity.weapon.localToWorld(new Vector3(.030,-.010,-.020));
  poseThumb(entity,'L','pistol',{thumbPoint:target});entity.root.updateMatrixWorld(true);
}
for(const sex of ['male','female'])for(const variant of variants){
  if(firingHand&&sex!==(firingHand.sex||'male'))continue;
  if(process.argv.includes('--serve')&&sex!==(process.argv.includes('--female')?'female':'male'))continue;
  const doc=structuredClone(original);if(sex==='female'){doc.profiles['female:pistol_9mm']=doc.profiles['male:pistol_9mm'];delete doc.profiles['male:pistol_9mm'];}
  if(variant.name!=='user'){
    const values=doc.profiles[sex+':pistol_9mm'].poses.aim;
    values.support=[0,0,variant.shift,0,0,variant.roll];
    if(sex==='female')values.elbowTurnL[0]=-25;
  }
  const models=new PlayerModels({},library);models.weapons.loadAsset=load;
  const create=models.weapons.create.bind(models.weapons);
  models.weapons.create=(item)=>{
    const weapon=create(item);if(!weapon||variant.name==='user'||process.argv.includes('--original-game-pose')||supportHand?.handLocalAttachment)return weapon;
    weapon.userData.pistol={...weapon.userData.pistol,rightPalm:[-.032,-.038,-.013],leftPalm:[.035,-.054,.009],rightThumb:[.012,-.010,-.050]};
    weapon.userData.grips={...weapon.userData.grips,rightThumb:[.012,-.010,-.050]};return weapon;
  };
  const replay=new AnimationReplay(models);replay.setDocument(doc,1);await replay.configure({sex,type:'pistol_9mm',track:'aim',movement:'idle'});
  if(variant.name!=='user'){
    const values=doc.profiles[sex+':pistol_9mm'].poses.aim;let best=null;
    for(let angle=-160;angle<=160;angle+=10){
      values.elbowTurnL[0]=angle;replay.setDocument(doc,angle);replay.seek(0,{reset:true});
      const e=replay.entity,a=point(e,'UpperArmL'),elbow=point(e,'LowerArmL'),direction=elbow.clone().sub(a).normalize();
      const desired=new Vector3(.015,-.292,.956).normalize();
      const cost=direction.distanceToSquared(desired);
      if(!best||cost<best.cost)best={angle,cost};
    }
    values.elbowTurnL[0]=best.angle;replay.setDocument(doc,1000);replay.seek(0,{reset:true});
  }
  const entity=replay.entity,joints={};const originalGame=process.argv.includes('--original-game-pose')||Boolean(supportHand?.handLocalAttachment);
  const contactMetrics=variant.name!=='user'&&!originalGame?fitPreviewContacts(entity):{};
  const firingBase=new Map();if(firingHand)entity.model.traverse(b=>{if(b.isBone)firingBase.set(b,b.quaternion.clone());});
  if(firingHand&&!originalGame)contactMetrics.authoredRight=authorFiringHand(entity,firingHand);
  else if(variant.name!=='user'&&!originalGame)referenceFingers(entity);
  if(supportHand?.armAlignment?.right&&!originalGame)contactMetrics.alignedRight=alignPreviewArm(entity,'R',supportHand.armAlignment.right);
  const supportBase=new Map();if(supportHand&&process.argv.includes('--serve-support-fit'))entity.model.traverse(b=>{if(b.isBone&&b.name.endsWith('L'))supportBase.set(b,b.quaternion.clone());});
  if(supportHand&&!originalGame)contactMetrics.authoredLeft=authorSupportHand(entity,supportHand);
  if(supportHand?.shoulderSkin&&!originalGame){
    const{repairPreviewShoulder}=await import('./g17-shoulder-skinning.js');
    contactMetrics.shoulderSkin=repairPreviewShoulder(entity,supportHand.shoulderSkin);
  }
  if(supportHand?.handLocalAttachment){
    if(supportHand.armAlignment||supportHand.shoulderSkin)throw Error('Hand-local attachment cannot use arm optimization or skin correction');
    const {attachAuthoredGrip}=await import('./g17-grip-attachment.js');
    const leftSource=await readFile(supportHand.handLocalAttachment.supportReviewFile,'utf8');
    if(createHash('sha256').update(leftSource).digest('hex')!==supportHand.handLocalAttachment.supportReviewSha256)throw Error('Support-grasp reference has changed');
    const leftReference=JSON.parse(leftSource);
    contactMetrics.handLocalAttachment=attachAuthoredGrip(entity,{...firingHand,knuckleTargets:supportHand.handLocalAttachment.rightKnuckleTargets,knuckleRotations:supportHand.handLocalAttachment.rightKnuckleRotations},supportHand,leftReference);
  }
  entity.root.updateMatrixWorld(true);
  entity.model.traverse(b=>{if(b.isBone)joints[b.name]=point(entity,b.name).toArray();});
  const localJoints=Object.fromEntries(Object.keys(joints).filter(n=>/Wrist|Thumb|Index|Middle|Ring|Pinky|LowerArm|UpperArm/.test(n)).map(n=>[n,entity.weapon.worldToLocal(point(entity,n)).toArray()]));
  const rotations=Object.fromEntries([...entity.rifleHands.keys()].filter(n=>/^(Wrist|Thumb|Index|Middle|Ring|Pinky)/.test(n)).map(n=>[n,entity.model.getObjectByName(n).quaternion.toArray()]));
  const boneRotations={};if(firingHand)entity.model.traverse(b=>{if(b.isBone)boneRotations[b.name]=b.quaternion.toArray();});
  const data={sex,variant:supportHand?'both-hands':firingHand?'firing-hand':variant.name,document:doc,rotations,boneRotations,authoredRight:firingHand,authoredLeft:supportHand,meshes:meshData(entity),joints,localJoints,weaponProfile:entity.weapon.userData.pistol,contactMetrics,weaponOrigin:entity.weapon.getWorldPosition(new Vector3()).toArray(),weaponQuaternion:entity.weapon.getWorldQuaternion(new Quaternion()).toArray(),scale:entity.weapon.getWorldScale(new Vector3()).toArray(),constraints:entity.elbowConstraints};
  if(process.argv.includes('--export-shoulder-binding')){
    const{shoulderBinding}=await import('./g17-shoulder-binding.js');
    await writeFile(`${output}/${sex}-shoulder-binding.json`,JSON.stringify(shoulderBinding(entity)));
  }
  if(process.argv.includes('--export-shoulder-probes')){
    const{exportShoulderProbes}=await import('./g17-shoulder-probes.js');
    await exportShoulderProbes(entity,{data,meshData,output});
  }
  if(supportHand&&process.argv.includes('--serve-support-fit')){
    const{serveSupportFit}=await import('./g17-support-fit-server.js');await serveSupportFit(entity,{base:supportBase,data,meshData,output});replay.dispose();process.exit(0);
  }
  if(firingHand&&process.argv.includes('--serve-firing-hand')){
    const{serveFiringHand}=await import('./g17-firing-hand-server.js');await serveFiringHand(entity,{base:firingBase,data,meshData,output});replay.dispose();process.exit(0);
  }
  if(process.argv.includes('--serve')){
    const {serveContacts}=await import('./g17-contact-server.js');await serveContacts(entity,{meshData,data,output});replay.dispose();process.exit(0);
  }
  await writeFile(`${output}/${sex}-${data.variant}-mesh.json`,JSON.stringify(data));
  console.log(JSON.stringify({sex,variant:data.variant,meshes:data.meshes.length,triangles:data.meshes.reduce((n,m)=>n+m.faces.length,0),contact:firingHand?contactMetrics.authoredRight:contactMetrics,thumb:localJoints[firingHand?'Thumb3R':'Thumb3L']}));
  replay.dispose();
}
