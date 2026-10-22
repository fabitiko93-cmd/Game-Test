// Orthographic garment pictures from the shipped CC0 Quaternius models.
// No browser, model downloads, raster library or hand-drawn silhouettes needed.
import {createHash} from 'node:crypto';
import {readFile,mkdir,readdir,rm,writeFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import {AnimationMixer,Box3,Color,DoubleSide,OrthographicCamera,Vector3} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {clone} from 'three/addons/utils/SkeletonUtils.js';
import {ITEMS} from '../docs/src/data.js';
import {clothingModelFor} from '../docs/src/clothing-catalog.js';
import {QUATERNIUS_MODELS} from '../docs/src/quaternius-catalog.js';
import {headwearMaterial} from '../docs/src/character-parts.js';

const root=fileURLToPath(new URL('../',import.meta.url)),output=path.join(root,'docs/assets/clothing');
const number=value=>Number(value.toFixed(2)),keyFor=(model,slot)=>`${model}-${slot}`;
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');

function drawPart(scene,definition,slot,model) {
  const part=scene.getObjectByName(slot==='back'?'Backpack':definition.parts[slot]),meshes=[];
  if(!part)throw Error(`Missing ${model} ${slot}`);
  part.traverse(mesh=>{
    if(!mesh.isMesh||mesh.material.name==='Skin')return;
    if(slot==='head'&&!headwearMaterial(mesh.material.name,model))return;
    meshes.push(mesh);
  });
  const box=new Box3();for(const mesh of meshes)box.union(new Box3().setFromObject(mesh,true));
  const center=box.getCenter(new Vector3());
  // Front three-quarter garment view; shoes show their upper and outer surface.
  // A backpack is viewed from behind the original wearer, exposing its pockets.
  const camera=new OrthographicCamera(-1,1,1,-1,.01,20),back=slot==='back';
  camera.position.copy(center).add(new Vector3(back?-2.8:2.2,slot==='feet'?3.8:slot==='head'?1.8:.9,back?-7:7));
  camera.lookAt(center);camera.updateMatrixWorld(true);
  const direction=camera.getWorldDirection(new Vector3()).negate(),light=new Vector3(-3,7,5).normalize(),faces=[],materials=new Set();
  for(const mesh of meshes){
    mesh.skeleton?.update();const geometry=mesh.geometry,positions=geometry.attributes.position,index=geometry.index;
    const vertices=Array.from({length:positions.count},(_,i)=>mesh.getVertexPosition(i,new Vector3()).applyMatrix4(mesh.matrixWorld));
    for(let i=0;i<(index?.count||positions.count);i+=3){
      const ids=[0,1,2].map(k=>index?index.getX(i+k):i+k),points=ids.map(id=>vertices[id]);
      const normal=points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0]));
      if(normal.lengthSq()<1e-15)continue;normal.normalize();
      const material=mesh.material;
      if(normal.dot(direction)<0){if(material.side!==DoubleSide)continue;normal.negate();}
      const shade=.65+.35*Math.max(0,normal.dot(light));
      const color=new Color().copy(material.color).multiplyScalar(shade);
      materials.add(material.name);
      faces.push({points:points.map(p=>p.clone().project(camera)),depth:points.reduce((sum,p)=>sum+p.dot(direction),0),color:`#${color.getHexString()}`});
    }
  }
  if(!faces.length)throw Error(`Empty icon ${model} ${slot}`);
  const points=faces.flatMap(face=>face.points),xs=points.map(p=>p.x),ys=points.map(p=>p.y),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
  const scale=82/Math.max(maxX-minX,maxY-minY),cx=(minX+maxX)/2,cy=(minY+maxY)/2;
  // Group only consecutive same-colour faces: painter order and holes stay exact.
  const paths=[];
  for(const face of faces.sort((a,b)=>a.depth-b.depth)){
    const d=face.points.map((p,i)=>`${i?'L':'M'}${number(48+(p.x-cx)*scale)},${number(48-(p.y-cy)*scale)}`).join('')+'Z';
    if(paths.at(-1)?.color===face.color)paths.at(-1).d+=d;else paths.push({color:face.color,d});
  }
  const markup=`<g fill="currentColor" stroke="currentColor" stroke-width=".25" stroke-linejoin="round">${paths.map(({color,d})=>`<path color="${color}" d="${d}"/>`).join('')}</g>`;
  return {markup,materials:[...materials].sort(),triangles:faces.length};
}

export async function buildClothingIcons(){
  const sources=new Map();
  for(const [type,definition] of Object.entries(ITEMS)){
    if(!['clothing','bag'].includes(definition.type))continue;
    for(const sex of ['male','female']){
      const model=definition.type==='bag'?'male-Adventurer':clothingModelFor({type},definition,sex),slot=definition.equipSlot;
      if(model)sources.set(keyFor(model,slot),{model,slot});
    }
  }
  const symbols=[],icons={};let total=0;
  for(const [key,{model,slot}] of [...sources].sort(([a],[b])=>a.localeCompare(b,'en'))){
    const definition=QUATERNIUS_MODELS.characters[model],sourceBytes=await readFile(path.join(root,'docs/assets/quaternius',definition.file));
    const bytes=gunzipSync(sourceBytes),asset=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
    const scene=clone(asset.scene),mixer=new AnimationMixer(scene),clip=asset.animations.find(clip=>clip.name==='Idle_Neutral');
    mixer.clipAction(clip).play();mixer.setTime(clip.duration*.2);scene.updateMatrixWorld(true);
    const {markup,materials,triangles}=drawPart(scene,definition,slot,model);
    symbols.push(`<symbol id="${key}" viewBox="0 0 96 96">${markup}</symbol>`);
    icons[key]={model,slot,source:definition.file,sourceSha256:digest(sourceBytes),materials,triangles};total+=triangles;
    mixer.stopAllAction();mixer.uncacheRoot(scene);
  }
  const svg=`<svg xmlns="http://www.w3.org/2000/svg"><defs>${symbols.join('')}</defs></svg>\n`,file=`icons-${digest(svg).slice(0,12)}.svg`;
  const metadata=JSON.stringify({file,viewBox:'0 0 96 96',license:'CC0-1.0',generator:'scripts/prepare-clothing-icons.mjs',icons},null,2)+'\n';
  return {svg,file,metadata,total,count:symbols.length};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const result=await buildClothingIcons();
  if(process.argv.includes('--check')){
    if(await readFile(path.join(output,result.file),'utf8')!==result.svg||await readFile(path.join(output,'icons.json'),'utf8')!==result.metadata)throw Error('Clothing icons differ from source models');
  }else{
    await mkdir(output,{recursive:true});await writeFile(path.join(output,result.file),result.svg);await writeFile(path.join(output,'icons.json'),result.metadata);
    for(const file of await readdir(output))if(file.startsWith('icons-')&&file.endsWith('.svg')&&file!==result.file)await rm(path.join(output,file));
  }
  console.log(`${result.count} model-derived icons, ${result.total} visible triangles, ${Buffer.byteLength(result.svg)} SVG bytes.`);
}
