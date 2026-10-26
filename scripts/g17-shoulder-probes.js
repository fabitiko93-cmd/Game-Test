// Additional static source-clip checks for the localized preview skin binding.
import {writeFile} from 'node:fs/promises';
import {Vector3} from 'three';
import {originalShoulderGeometry} from './g17-shoulder-skinning.js';

export async function exportShoulderProbes(entity,{data,meshData,output}){
  let torso;entity.root.traverseVisible(m=>{if(m.name==='BareTorso'&&m.isSkinnedMesh)torso=m;});
  const original=originalShoulderGeometry(torso),corrected=torso.geometry;
  if(!original)throw Error('Shoulder probes require the isolated skin correction');
  const bones=[];entity.model.traverse(b=>{if(b.isBone)bones.push(b);});
  const saved=bones.map(b=>b.quaternion.clone()),visible=entity.weapon.visible;
  try{
    entity.weapon.visible=false;
    for(const [name,clipName,phase] of [['neutral','Idle_Neutral',.2],['reach','Punch_Right',.6]]){
      const clip=entity.actions.get(clipName)?.getClip();
      if(!clip)throw Error('Missing original shoulder probe clip '+clipName);
      bones.forEach((b,i)=>b.quaternion.copy(saved[i]));
      for(const track of clip.tracks){
        if(!track.name.endsWith('.quaternion'))continue;
        const bone=entity.model.getObjectByName(track.name.slice(0,-11));
        if(bone?.isBone)bone.quaternion.fromArray(track.createInterpolant().evaluate(clip.duration*phase));
      }
      entity.root.updateMatrixWorld(true);
      const joints=Object.fromEntries(bones.map(b=>[b.name,b.getWorldPosition(new Vector3()).toArray()]));
      for(const [variant,geometry] of [['before',original],['after',corrected]]){
        torso.geometry=geometry;
        await writeFile(`${output}/male-shoulder-${name}-${variant}.json`,JSON.stringify({
          ...data,poseProbe:{name,clip:clipName,phase},joints,meshes:meshData(entity),
        }));
      }
    }
  }finally{
    torso.geometry=corrected;bones.forEach((b,i)=>b.quaternion.copy(saved[i]));
    entity.weapon.visible=visible;entity.root.updateMatrixWorld(true);
  }
}
