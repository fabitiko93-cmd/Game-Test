import {Color,Vector3} from 'three';
import {bridgeRings,meshTriangles,mixVertex,orderRing,paintSurface,sampleRing,sectionLoops,selectSurface,surfaceGeometry} from './character-surface.js';

const CUT=1.34,CENTER=.066,UNDERWEAR=new Color(0x343945),BRA_HEM=1.36,BRA_SIDE=1.405;
const bodies=new WeakMap();

function abdomen(sources,template,sex,waist){
  const candidates=sectionLoops(sources.flat(),CUT),ring=candidates.find(r=>r.every(v=>Math.abs(v.p.x)<.19));
  if(!ring||!waist?.length)throw new Error('Bare body requires matching waist and chest sections');
  const bottom=orderRing(waist.map(v=>({p:v.p.clone(),weights:new Map([...v.weights].map(([name,w])=>[template.skeleton.bones.findIndex(b=>b.name===name),w]))})));
  const width=Math.max(...ring.map(v=>Math.abs(v.p.x))),front=Math.max(...ring.map(v=>v.p.z))-CENTER,back=CENTER-Math.min(...ring.map(v=>v.p.z));
  const start=bottom.reduce((s,v)=>s+v.p.y,0)/bottom.length;
  const profile=sex==='female'?[[1.17,.96,.86],[1.22,.84,.78],[1.28,.90,.84]]:[[1.10,.91,.87],[1.18,.83,.82],[1.26,.90,.89]],rows=[bottom];
  for(const[y,w,d]of profile)rows.push(Array.from({length:32},(_,i)=>{
    const angle=i/32*Math.PI*2,c=Math.cos(angle),v=mixVertex(sampleRing(bottom,angle),sampleRing(ring,angle),(y-start)/(CUT-start));
    v.p.set(Math.sin(angle)*width*w,y,CENTER+c*(c>0?front:back)*d);return v;
  }));
  rows.push(ring);const polygons=[];
  for(let i=0;i<rows.length-1;i++)polygons.push(...bridgeRings(rows[i],rows[i+1]));
  return polygons;
}

function createBareTorso(part,sex,waist){
  const meshes=[];part.traverse(m=>{if(m.isSkinnedMesh)meshes.push(m);});
  const template=meshes.find(m=>m.material.name==='Skin'),skin=template.material.color,sources=meshes.filter(m=>m.material.name!=='Gold').map(meshTriangles),polygons=[];
  for(const mesh of meshes){
    if(mesh.material.name==='Gold')continue;
    const source=meshTriangles(mesh),isSkin=mesh.material.name==='Skin',top=selectSurface(source,[['y',CUT,true]]),arms=isSkin?[...selectSurface(source,[['y',CUT,false],['x',.19,true]]),...selectSurface(source,[['y',CUT,false],['x',-.19,false]])]:[];
    if(sex!=='female'){polygons.push(...paintSurface([...top,...arms],skin));continue;}
    if(!isSkin){
      polygons.push(...paintSurface(selectSurface(top,[['y',BRA_HEM,false]]),skin),...paintSurface(selectSurface(top,[['y',BRA_HEM,true]]),UNDERWEAR));
    }else{
      // The source has skin in its side cut-outs. Colour that same surface as
      // fabric to make a cropped sports top, without an overlaid fabric band.
      const middle=selectSurface(top,[['y',BRA_HEM,true],['y',BRA_SIDE,false]]);
      polygons.push(...paintSurface([...arms,...selectSurface(top,[['y',BRA_HEM,false]]),...selectSurface(top,[['y',BRA_SIDE,true]]),...selectSurface(middle,[['x',.16,true]]),...selectSurface(middle,[['x',-.16,false]])],skin),...paintSurface(selectSurface(middle,[['x',-.16,true],['x',.16,false]]),UNDERWEAR));
    }
  }
  polygons.push(...paintSurface(abdomen(sources,template,sex,waist),skin));
  const body=template.clone();body.name='BareTorso';body.geometry=surfaceGeometry(polygons,template.bindMatrix);body.material=template.material.clone();body.material.color.setRGB(1,1,1);body.material.vertexColors=true;body.material.name=sex==='female'?'Underwear':'Bare skin';body.material.userData.clothingOwned=true;
  body.geometry.userData.bareTorso={cut:CUT,braHem:sex==='female'?BRA_HEM:null};
  const a=body.geometry.attributes.position;body.geometry.userData.waistIndices=[];
  for(let i=0;i<a.count;i++){const p=new Vector3().fromBufferAttribute(a,i).applyMatrix4(body.bindMatrix);if(waist.some(v=>v.p.distanceToSquared(p)<1e-12))body.geometry.userData.waistIndices.push(i);}
  for(const mesh of meshes)mesh.removeFromParent();part.add(body);
}

export function makeBareTorso(part,sex,waist){
  let source;part.traverse(m=>{if(m.isSkinnedMesh&&!['Skin','Gold'].includes(m.material.name))source=m.geometry;});
  const cached=bodies.get(source);
  if(cached){
    for(const child of [...part.children])part.remove(child);
    for(const original of cached.children){const child=original.clone(true);child.traverse(m=>{if(m.isMesh){m.geometry=m.geometry.clone();m.material=m.material.clone();}});part.add(child);}
    return;
  }
  createBareTorso(part,sex,waist);bodies.set(source,part.clone(true));
}
