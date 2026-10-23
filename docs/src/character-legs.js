import {Color,Vector3} from 'three';
import {bridgeRings,meshTriangles,mixVertex,orderRing,paintSurface,sampleRing,sectionLoops,selectSurface,surfaceGeometry} from './character-surface.js';

const LOWER=.62,UPPER=.78,WAIST=1.015,CENTER=.066;
const templates=new WeakMap();
export function makeBareLegs(part,sex){
  const meshes=[];part.traverse(m=>{if(m.isSkinnedMesh)meshes.push(m);});
  const skin=meshes.find(m=>m.material.name==='Skin'),cached=templates.get(skin.geometry)?.[sex];
  if(cached){for(const mesh of meshes)mesh.removeFromParent();const body=cached.clone();body.geometry=cached.geometry.clone();body.material=cached.material.clone();part.add(body);return part;}
  const skinTriangles=meshTriangles(skin),cloth=meshes.filter(m=>m!==skin).flatMap(meshTriangles),bones=skin.skeleton.bones,hips=bones.findIndex(b=>b.name==='Hips'),abdomen=bones.findIndex(b=>b.name==='Abdomen');
  const fit=v=>{
    const p=v.p.clone(),axis=Math.sign(p.x)*.12059,f=1-.22*Math.min(1,Math.max(0,(1.02-p.y)/.18)),t=Math.min(1,Math.max(0,(p.y-.90)/.095)),blend=t*t*(3-2*t),weights=new Map();
    p.x=axis+(p.x-axis)*f;p.z=CENTER+(p.z-CENTER)*f;
    // The waistband belongs to the pelvis. Borrowing both thigh rotations here
    // pulled the abdomen into a point during the authored deep crouch.
    for(const[i,w]of v.weights){
      const moved=/^UpperLeg[LR]$/.test(bones[i].name)?w*blend:0;
      weights.set(i,(weights.get(i)||0)+w-moved);
      if(moved){weights.set(hips,(weights.get(hips)||0)+moved*.45);weights.set(abdomen,(weights.get(abdomen)||0)+moved*.55);}
    }
    return{p,weights};
  };
  const lower=sectionLoops(skinTriangles,LOWER),upper=sectionLoops(cloth,UPPER).map(r=>orderRing(r.map(fit))),below=sectionLoops(skinTriangles,LOWER-.02),above=sectionLoops(cloth,UPPER+.02).map(r=>orderRing(r.map(fit)));
  const side=r=>Math.sign(r.reduce((s,v)=>s+v.p.x,0));
  const bridges=[];
  for(const bottom of lower){
    const top=upper.find(r=>side(r)===side(bottom)),before=below.find(r=>side(r)===side(bottom)),after=above.find(r=>side(r)===side(bottom)),rows=[bottom];
    for(const t of [.25,.5,.75])rows.push(Array.from({length:24},(_,i)=>{
      const angle=i/24*Math.PI*2,a=sampleRing(bottom,angle),b=sampleRing(top,angle),v=mixVertex(a,b,t),da=a.p.clone().sub(sampleRing(before,angle).p).multiplyScalar((UPPER-LOWER)/.02),db=sampleRing(after,angle).p.sub(b.p).multiplyScalar((UPPER-LOWER)/.02);
      v.p.copy(a.p).multiplyScalar(2*t**3-3*t*t+1).addScaledVector(da,t**3-2*t*t+t).addScaledVector(b.p,-2*t**3+3*t*t).addScaledVector(db,t**3-t*t);v.p.y=LOWER+(UPPER-LOWER)*t;return v;
    }));
    rows.push(top);for(let j=0;j<rows.length-1;j++)bridges.push(...bridgeRings(rows[j],rows[j+1]));
  }
  const body=[...selectSurface(skinTriangles,[['y',LOWER,false]]),...bridges,...selectSurface(cloth,[['y',UPPER,true],['y',WAIST,false]]).map(p=>p.map(fit))];
  const hem=sex==='female'?.865:.85,underwear=new Color(0x343945),polygons=[...paintSurface(selectSurface(body,[['y',hem,false]]),skin.material.color),...paintSurface(selectSurface(body,[['y',hem,true]]),underwear)];
  const result=skin.clone();result.name=sex==='female'?'PantyBody':'BoxerBody';result.geometry=surfaceGeometry(polygons,skin.bindMatrix);result.material=skin.material.clone();result.material.color.setRGB(1,1,1);result.material.vertexColors=true;result.material.name='Underwear';result.material.userData.clothingOwned=true;
  const a=result.geometry.attributes.position;result.geometry.userData.waistIndices=Array.from({length:a.count},(_,i)=>i).filter(i=>Math.abs(new Vector3().fromBufferAttribute(a,i).applyMatrix4(result.bindMatrix).y-WAIST)<1e-6);result.geometry.userData.bareLegs={hem,lower:LOWER,upper:UPPER,waist:WAIST};
  const variants=templates.get(skin.geometry)||{},saved=result.clone();saved.geometry=result.geometry.clone();saved.material=result.material.clone();variants[sex]=saved;templates.set(skin.geometry,variants);
  for(const mesh of meshes)mesh.removeFromParent();part.add(result);return part;
}

export function bareWaist(part){
  let mesh;part.traverse(m=>{if(m.geometry?.userData.waistIndices)mesh=m;});
  const a=mesh.geometry.attributes;
  return orderRing(mesh.geometry.userData.waistIndices.map(i=>({p:new Vector3().fromBufferAttribute(a.position,i).applyMatrix4(mesh.bindMatrix),weights:new Map(Array.from({length:4},(_,k)=>[mesh.skeleton.bones[a.skinIndex.getComponent(i,k)].name,a.skinWeight.getComponent(i,k)]).filter(([,w])=>w>0))})));
}
