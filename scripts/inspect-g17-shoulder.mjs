// Read-only source/binding diagnostics, isolated from the game's loader graph.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {Vector3,Matrix3} from 'three';

const output=process.argv[2];
if(!output)throw Error('Output directory required');
await mkdir(output,{recursive:true});
const catalogue=JSON.parse(await readFile(new URL('../docs/assets/quaternius/models.json',import.meta.url)));
for(const key of ['male-Beach','male-Casual_2']){
  const bytes=gunzipSync(await readFile(new URL('../docs/assets/quaternius/'+catalogue.characters[key].file,import.meta.url)));
  const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  gltf.scene.updateMatrixWorld(true);
  const part=gltf.scene.getObjectByName(catalogue.characters[key].parts.torso),meshes=[];
  part.traverse(mesh=>{
    if(!mesh.isSkinnedMesh)return;
    const g=mesh.geometry,a=g.attributes,p=a.position;
    mesh.skeleton.update();
    const matrices=mesh.skeleton.boneInverses.map(m=>m.clone().invert());
    const positions=Array.from({length:p.count},(_,i)=>new Vector3().fromBufferAttribute(p,i).applyMatrix4(mesh.bindMatrix).toArray());
    const normals=Array.from({length:p.count},(_,i)=>new Vector3().fromBufferAttribute(a.normal,i).applyMatrix3(new Matrix3().getNormalMatrix(mesh.bindMatrix)).normalize().toArray());
    const faces=Array.from({length:(g.index?.count||p.count)/3},(_,i)=>[0,1,2].map(k=>g.index?g.index.getX(i*3+k):i*3+k));
    meshes.push({name:mesh.name,material:mesh.material.name,positions,normals,faces,
      colors:faces.map(face=>face.map(()=>mesh.material.color.toArray())),faceSides:faces.map(()=>mesh.material.side),
      weights:Array.from({length:p.count},(_,i)=>Array.from({length:4},(_,k)=>[mesh.skeleton.bones[a.skinIndex.getComponent(i,k)].name,a.skinWeight.getComponent(i,k)]).filter(([,w])=>w>0)),
      joints:Object.fromEntries(mesh.skeleton.bones.map((bone,i)=>[bone.name,new Vector3().setFromMatrixPosition(matrices[i]).toArray()])),
      restRotations:Object.fromEntries(mesh.skeleton.bones.map(bone=>[bone.name,bone.quaternion.toArray()])),
    });
  });
  const joints=meshes[0].joints;
  await writeFile(output+'/'+key+'-bind.json',JSON.stringify({sex:'male',meshes,joints}));
  console.log(JSON.stringify({key,meshes:meshes.map(m=>({name:m.name,material:m.material,vertices:m.positions.length,faces:m.faces.length}))}));
}
