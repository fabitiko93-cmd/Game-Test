// Bake the original, credited game meshes at their bind pose before splitting.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {Vector3} from 'three';
const [input,output]=process.argv.slice(2);if(!input||!output)throw Error('Provide source and output directories');await mkdir(output,{recursive:true});
for(const name of ['benelli_m4','mossberg_590','ithaca_mag10']){
 const raw=await readFile(`${input}/${name}.glb`),doc=JSON.parse(raw.subarray(20,20+raw.readUInt32LE(12)));
 const asset=await new GLTFLoader().parseAsync(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength),'');asset.scene.updateMatrixWorld(true);
 const triangles=[],colours=[],labels=[];
 asset.scene.traverse(mesh=>{if(!mesh.isMesh)return;mesh.skeleton?.update();const a=mesh.geometry.attributes,indices=mesh.geometry.index,material=doc.materials.find(m=>m.name===mesh.material.name)||{},color=material.pbrMetallicRoughness?.baseColorFactor?.slice(0,3)||material.extensions?.KHR_materials_pbrSpecularGlossiness?.diffuseFactor?.slice(0,3)||mesh.material.color.toArray();
  for(let i=0;i<(indices?.count||a.position.count);i+=3){const ids=[0,1,2].map(k=>indices?indices.getX(i+k):i+k);triangles.push(ids.map(j=>mesh.getVertexPosition(j,new Vector3()).applyMatrix4(mesh.matrixWorld).toArray()));colours.push(color);labels.push(a.skinIndex?mesh.skeleton.bones[a.skinIndex.getX(ids[0])].name:'body_00');}
 });
 await writeFile(`${output}/${name}.json`,JSON.stringify({triangles,colours,labels,source:doc.asset.extras}));
}
