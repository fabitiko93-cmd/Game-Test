import { readFile, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { AnimationMixer, Box3, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const root=new URL('../docs/assets/quaternius/',import.meta.url);
const metadata=JSON.parse(await readFile(new URL('models.json',root)));
for(const [key,definition] of Object.entries(metadata.characters)) {
  const raw=gunzipSync(await readFile(new URL(definition.file,root)));
  const asset=await new GLTFLoader().parseAsync(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength),'');
  const mixer=new AnimationMixer(asset.scene),clips=new Map(asset.animations.map(a=>[a.name,a]));
  const neutral=mixer.clipAction(clips.get('Idle_Neutral'));neutral.play();mixer.update(0);asset.scene.updateMatrixWorld(true);
  const bounds=new Box3();
  for(const name of Object.values(definition.parts)) bounds.union(new Box3().setFromObject(asset.scene.getObjectByName(name),true));
  definition.referenceHeight=bounds.max.y-bounds.min.y;definition.groundOffset=-bounds.min.y;
  definition.dimensions=bounds.getSize(new Vector3()).toArray();
  definition.clips={};
  for(const [name,clip] of clips) {
    const data={duration:clip.duration};
    if(['Walk','Run','Run_Shoot'].includes(name)) {
      mixer.stopAllAction();const action=mixer.clipAction(clip);action.play();action.time=0;mixer.update(0);
      let previous=null,distance=0;
      for(let i=0;i<=128;i++) {
        action.time=clip.duration*i/128;mixer.update(0);asset.scene.updateMatrixWorld(true);
        const body=asset.scene.getObjectByName('Body').getWorldPosition(new Vector3());
        const feet=['FootL','FootR'].map(n=>asset.scene.getObjectByName(n).getWorldPosition(new Vector3()).z-body.z);
        if(previous)for(let j=0;j<2;j++)distance+=Math.max(0,previous[j]-feet[j]);previous=feet;
      }
      data.distance=distance;
    }
    definition.clips[name]=data;
  }
  console.log(key,definition.referenceHeight.toFixed(3),definition.clips.Walk.distance.toFixed(3),definition.clips.Run.distance.toFixed(3));
}
metadata.playerReference={male:metadata.characters['male-Casual_2'].referenceHeight,female:metadata.characters['female-Casual'].referenceHeight};
await writeFile(new URL('models.json',root),JSON.stringify(metadata,null,2)+'\n');
