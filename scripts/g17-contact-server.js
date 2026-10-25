import {createInterface} from 'node:readline';
import {writeFile} from 'node:fs/promises';
import {Euler,Quaternion,Vector3} from 'three';
import {fitArm,orientWorld} from '../docs/src/weapon-ik.js';
import {contactWrist,poseThumb} from '../docs/src/weapon-hands.js';

const v=()=>new Vector3(),hand=/^(Wrist|Index[1-4]|Middle[1-4]|Ring[1-4]|Pinky[1-4]|Thumb[1-3])([RL])$/;
export async function serveContacts(entity,{meshData,data,output}){
  const meshes=[];entity.root.traverseVisible(m=>{if(m.isMesh)meshes.push(m);});
  const refs={R:[],L:[]},faces={R:[],L:[]},labels={R:[],L:[]};
  for(const side of ['R','L']){
    for(let mi=0;mi<meshes.length;mi++){
      const m=data.meshes[mi],lookup=new Map();
      for(let i=0;i<m.positions.length;i++)if(hand.test(m.boneNames[i]||'')&&m.boneNames[i].endsWith(side)){
        lookup.set(i,refs[side].length);refs[side].push({mesh:meshes[mi],index:i});labels[side].push(m.boneNames[i]);
      }
      for(const f of m.faces)if(f.every(i=>lookup.has(i)))faces[side].push(f.map(i=>lookup.get(i)));
    }
  }
  const root=entity.root,gun=entity.weapon,rig=entity.rifleHands,gunQ=gun.getWorldQuaternion(new Quaternion());
  const gunX=new Vector3(1,0,0).applyQuaternion(gunQ),gunY=new Vector3(0,1,0).applyQuaternion(gunQ),gunZ=new Vector3(0,0,1).applyQuaternion(gunQ);
  let base=new Map();entity.model.traverse(b=>{if(b.isBone)base.set(b,b.quaternion.clone());});
  const q0=new Quaternion().setFromAxisAngle(gunX,-.20).multiply(entity.model.getObjectByName('WristL').getWorldQuaternion(new Quaternion()));
  const initialPole=entity.model.getObjectByName('LowerArmL').getWorldPosition(v());
  const thumbBone=entity.model.getObjectByName('Thumb3L'),thumbDirection=thumbBone.getWorldPosition(v()).sub(entity.model.getObjectByName('Thumb2L').getWorldPosition(v())).normalize();
  const thumbCandidates=refs.L.filter((_,i)=>labels.L[i]==='Thumb3L').map(({mesh,index})=>mesh.getVertexPosition(index,v()).applyMatrix4(mesh.matrixWorld));
  thumbCandidates.sort((a,b)=>b.clone().sub(thumbBone.getWorldPosition(v())).dot(thumbDirection)-a.clone().sub(thumbBone.getWorldPosition(v())).dot(thumbDirection));
  const tipAxis=thumbCandidates.length?thumbBone.worldToLocal(thumbCandidates[0].clone()).normalize():new Vector3(0,1,0);
  const restore=()=>{for(const[b,q]of base)b.quaternion.copy(q);root.updateMatrixWorld(true);};
  const curl=(side,finger,angles)=>{for(let i=2;i<=4;i++){const r=rig.get(`${finger}${i}${side}`),e=new Euler().setFromQuaternion(r.rotation);e.x=-angles[i-2];r.bone.quaternion.setFromEuler(e);}};
  const sample=side=>{root.updateMatrixWorld(true);for(const m of meshes)m.skeleton?.update();return refs[side].map(({mesh,index})=>mesh.getVertexPosition(index,v()).applyMatrix4(mesh.matrixWorld).toArray());};
  const bonePoint=name=>entity.model.getObjectByName(name).getWorldPosition(v());
  const grip=[],weapon=[];
  for(const m of data.meshes)if(['Receiver','Slide','Magazine'].includes(m.name))for(const f of m.faces){
    const tri=f.map(i=>m.positions[i]);weapon.push(tri);
    const c=gun.worldToLocal(new Vector3(...tri[0]).add(new Vector3(...tri[1])).add(new Vector3(...tri[2])).multiplyScalar(1/3));
    if(m.name==='Receiver'&&c.y<-.028&&c.z<-.008)grip.push(tri);
  }
  let rightAngles=[.95,1.05,.40,.90,1.05,.45,.65,.90,.40],leftParams=null,lastMetrics=null;
  const applyRight=values=>{restore();rightAngles=values;['Middle','Ring','Pinky'].forEach((f,i)=>curl('R',f,values.slice(i*3,i*3+3)));root.updateMatrixWorld(true);};
  const applyLeft=values=>{
    restore();leftParams=values;const [x,y,z,pitch,roll,poleTurn]=values;
    const q=new Quaternion().setFromAxisAngle(gunZ,roll).multiply(new Quaternion().setFromAxisAngle(gunX,pitch)).multiply(q0);
    const palm=gun.localToWorld(new Vector3(x,y,z)),goal=contactWrist(entity,'L',palm,q),bones=['UpperArmL','LowerArmL','WristL'].map(n=>entity.model.getObjectByName(n));
    const start=bones[0].getWorldPosition(v()),axis=goal.clone().sub(start).normalize(),radial=initialPole.clone().sub(start);radial.addScaledVector(axis,-radial.dot(axis)).normalize();
    const pole=start.clone().add(radial.applyAxisAngle(axis,poleTurn));
    const frame={hand:q,axis:rig.get('WristL').palm,rest:rig.get('WristL').rotation,lowerRest:rig.get('LowerArmL').rotation,hinge:rig.get('UpperArmL').hinge,maxTwist:Math.PI/3,maxBend:38*Math.PI/180};
    fitArm(...bones,goal,pole,frame);orientWorld(bones[2],q);root.updateMatrixWorld(true);
    ['Index','Ring','Pinky'].forEach((finger,i)=>{
      const meta=entity.model.getObjectByName(finger+'1L');
      const turn=new Quaternion().setFromAxisAngle(gunY,values[22+i*2]).multiply(new Quaternion().setFromAxisAngle(gunX,values[21+i*2]));
      orientWorld(meta,turn.multiply(meta.getWorldQuaternion(new Quaternion())));
    });
    ['Index','Middle','Ring','Pinky'].forEach((f,i)=>curl('L',f,values.slice(6+i*3,9+i*3)));
    const thumb=[1,2,3].map(i=>entity.model.getObjectByName('Thumb'+i+'L'));for(let i=0;i<3;i++)thumb[i].quaternion.copy(rig.get('Thumb'+(i+1)+'L').rotation);root.updateMatrixWorld(true);
    fitArm(...thumb,gun.localToWorld(new Vector3(...values.slice(18,21))),gun.localToWorld(new Vector3(.065,.010,-.025)));
    const before=thumb[2].getWorldQuaternion(new Quaternion()),thumbAxis=tipAxis.clone().applyQuaternion(before),target=gunZ.clone();
    const turn=new Quaternion().setFromUnitVectors(thumbAxis,target),bounded=new Quaternion().rotateTowards(turn,Math.PI/3);orientWorld(thumb[2],bounded.multiply(before));root.updateMatrixWorld(true);
    const fore=bonePoint('WristL').sub(bonePoint('LowerArmL')),palmAxis=bonePoint('Middle2L').sub(bonePoint('WristL'));
    lastMetrics={palmError:bonePoint('Middle2L').distanceTo(palm),wristBend:fore.angleTo(palmAxis),wristTwist:frame.wristTwist};
  };
  console.log(JSON.stringify({type:'init',sex:data.sex,faces,labels,points:{R:sample('R'),L:sample('L')},grip,weapon,gunOrigin:data.weaponOrigin,gunQuaternion:data.weaponQuaternion,gunScale:data.scale,rightAngles}));
  const reader=createInterface({input:process.stdin,terminal:false});
  for await(const line of reader){
    try{
      const request=JSON.parse(line);
      if(request.mode==='right'){
        applyRight(request.values);console.log(JSON.stringify({points:sample('R')}));
      }else if(request.mode==='commit-right'){
        applyRight(request.values);base=new Map([...base.keys()].map(b=>[b,b.quaternion.clone()]));console.log(JSON.stringify({points:sample('R')}));
      }else if(request.mode==='left'){
        applyLeft(request.values);console.log(JSON.stringify({points:sample('L'),metrics:lastMetrics}));
      }else if(request.mode==='save'){
        const joints={};entity.model.traverse(b=>{if(b.isBone)joints[b.name]=bonePoint(b.name).toArray();});
        const localJoints=Object.fromEntries(Object.entries(joints).filter(([n])=>/Wrist|Thumb|Index|Middle|Ring|Pinky|LowerArm|UpperArm/.test(n)).map(([n,p])=>[n,gun.worldToLocal(new Vector3(...p)).toArray()]));
        const rotations=Object.fromEntries([...rig.keys()].filter(n=>/^(Wrist|Thumb|Index|Middle|Ring|Pinky)/.test(n)).map(n=>[n,entity.model.getObjectByName(n).quaternion.toArray()]));
        const file=`${output}/${data.sex}-candidate-fit-mesh.json`;
        const handFrames=Object.fromEntries(['R','L'].map(side=>[side,gun.getWorldQuaternion(new Quaternion()).invert().multiply(entity.model.getObjectByName('Wrist'+side).getWorldQuaternion(new Quaternion())).toArray()]));
        const boneRotations=Object.fromEntries([...base.keys()].map(b=>[b.name,b.quaternion.toArray()]));
        await writeFile(file,JSON.stringify({...data,variant:'candidate-fit',meshes:meshData(entity),joints,localJoints,rotations,boneRotations,handFrames,weaponProfile:{...data.weaponProfile,leftPalm:leftParams.slice(0,3)},weaponOrigin:gun.getWorldPosition(v()).toArray(),weaponQuaternion:gun.getWorldQuaternion(new Quaternion()).toArray(),surfaceFit:{rightAngles,leftParams,metrics:lastMetrics}}));
        console.log(JSON.stringify({saved:file,metrics:lastMetrics}));
      }else if(request.mode==='quit'){console.log(JSON.stringify({done:true}));break;}
      else throw Error('Unknown mode');
    }catch(error){console.log(JSON.stringify({error:error.message}));}
  }
  reader.close();
}
