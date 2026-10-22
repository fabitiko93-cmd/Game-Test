import {BufferGeometry,Float32BufferAttribute,Uint16BufferAttribute,Vector3} from 'three';

const CUT=1.34,CENTER=.066,UNDERWEAR=0x343945;
const bodies=new WeakMap();
const distinct=vertices=>[...new Map(vertices.map(v=>[v.p.toArray().map(n=>n.toFixed(6)).join(',')+';'+[...v.weights].map(([i,w])=>i+':'+w.toFixed(5)).join(','),v])).values()];
const mix=(a,b,t)=>{
  const weights=new Map();for(const[i,w]of a.weights)weights.set(i,w*(1-t));for(const[i,w]of b.weights)weights.set(i,(weights.get(i)||0)+w*t);
  return{p:a.p.clone().lerp(b.p,t),weights};
};
function triangles(mesh){
  const a=mesh.geometry.attributes,index=mesh.geometry.index;
  const vertex=i=>({p:new Vector3().fromBufferAttribute(a.position,i).applyMatrix4(mesh.bindMatrix),weights:new Map(Array.from({length:4},(_,k)=>[a.skinIndex.getComponent(i,k),a.skinWeight.getComponent(i,k)]).filter(([,w])=>w>0))});
  return Array.from({length:(index?.count||a.position.count)/3},(_,i)=>[0,1,2].map(k=>vertex(index?index.getX(i*3+k):i*3+k)));
}
const clip=(polygon,axis,at,above)=>{
  const out=[];for(let i=0;i<polygon.length;i++){
    const a=polygon[i],b=polygon[(i+1)%polygon.length],av=a.p[axis],bv=b.p[axis],ia=above?av>=at:av<=at,ib=above?bv>=at:bv<=at;
    if(ia)out.push(a);if(ia!==ib)out.push(mix(a,b,(at-av)/(bv-av)));
  }return out;
};
const select=(source,planes)=>source.map(triangle=>planes.reduce((polygon,[axis,at,above])=>clip(polygon,axis,at,above),triangle)).filter(p=>p.length>=3);
function geometry(polygons,bindMatrix,offset=0){
  const inverse=bindMatrix.clone().invert(),positions=[],joints=[],weights=[],indices=[],unique=new Map();
  const vertex=v=>{
    const p=v.p.clone();if(offset){const radial=new Vector3(p.x,0,p.z-CENTER).normalize();p.addScaledVector(radial,offset);}
    p.applyMatrix4(inverse);const ws=[...v.weights].sort((a,b)=>b[1]-a[1]).slice(0,4),total=ws.reduce((s,[,w])=>s+w,0);
    const key=p.toArray().map(n=>n.toFixed(6)).join(',')+';'+ws.map(([i,w])=>i+':'+w.toFixed(5)).join(',');
    if(unique.has(key))return unique.get(key);const id=positions.length/3;unique.set(key,id);positions.push(...p.toArray());
    for(let k=0;k<4;k++){joints.push(ws[k]?.[0]||0);weights.push((ws[k]?.[1]||0)/total);}return id;
  };
  for(const polygon of polygons)for(let k=1;k<polygon.length-1;k++)indices.push(vertex(polygon[0]),vertex(polygon[k]),vertex(polygon[k+1]));
  const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(positions,3));g.setAttribute('skinIndex',new Uint16BufferAttribute(joints,4));g.setAttribute('skinWeight',new Float32BufferAttribute(weights,4));g.setIndex(indices);g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere();g.userData.clothingOwned=true;return g;
}
function surface(mesh,polygons,color,name,offset=0){
  if(!polygons.length)return null;
  const result=mesh.clone();result.geometry=geometry(polygons,mesh.bindMatrix,offset);result.material=mesh.material.clone();result.material.color.copy(color);result.material.name=name;result.material.userData.clothingOwned=true;
  result.name=name==='Underwear'?'BraBand':name;return result;
}

function braBand(template){
  const source=distinct(triangles(template).flat()).filter(v=>v.p.y>1.3&&v.p.y<1.48),weightsAt=p=>{
    const near=source.map(v=>({v,d:v.p.distanceToSquared(p)})).sort((a,b)=>a.d-b.d).slice(0,4),out=new Map();let total=0;
    for(const{v,d}of near){const f=1/Math.max(1e-7,d);total+=f;for(const[i,w]of v.weights)out.set(i,(out.get(i)||0)+w*f);}
    const core=new Map(),chest=template.skeleton.bones.findIndex(b=>b.name==='Chest');
    for(const[i,w]of out){const joint=/^(Root|Body|Hips|Abdomen|Torso|Chest)$/.test(template.skeleton.bones[i].name)?i:chest;core.set(joint,(core.get(joint)||0)+w/total);}return core;
  };
  // A real circumferential strip bridges the dress's bare side cut-outs.
  // The inner return and both rims give the band a closed fabric thickness.
  const rings=[[1.355,.130,.184,-.014],[1.425,.135,.197,-.014],[1.425,.1335,.1955,-.0125],[1.355,.1285,.1825,-.0125]].map(([y,w,front,back])=>Array.from({length:32},(_,i)=>{
    const a=i/32*Math.PI*2,c=Math.cos(a),p=new Vector3(Math.sin(a)*w,y,CENTER+c*(c>0?front-CENTER:CENTER-back));return{p,weights:weightsAt(p)};
  })),polygons=[];
  for(let j=0;j<4;j++)for(let i=0;i<32;i++)polygons.push([rings[j][i],rings[j][(i+1)%32],rings[(j+1)%4][(i+1)%32],rings[(j+1)%4][i]]);
  const g=geometry(polygons,template.bindMatrix);g.userData.closedBraBand=true;return g;
}

// The source beach shirt/dress has an inward folded hem. Replace that topology
// with a continuous waist, rather than painting the fold the colour of skin.
// Its top ring is the exact original section, including interpolated weights.
function abdomen(sources,template,sex){
  const intersections=new Map(),samples=sources.flat();
  for(const tri of samples)for(let i=0;i<3;i++){
    const a=tri[i],b=tri[(i+1)%3];if((a.p.y<CUT)===(b.p.y<CUT)||a.p.y===b.p.y)continue;
    const v=mix(a,b,(CUT-a.p.y)/(b.p.y-a.p.y));if(Math.abs(v.p.x)>.19)continue;
    const angle=Math.atan2(v.p.x,v.p.z-CENTER),key=angle.toFixed(5),old=intersections.get(key);
    if(!old||v.p.clone().sub(new Vector3(0,CUT,CENTER)).lengthSq()>old.p.clone().sub(new Vector3(0,CUT,CENTER)).lengthSq())intersections.set(key,v);
  }
  const ring=[...intersections.values()].sort((a,b)=>Math.atan2(a.p.x,a.p.z-CENTER)-Math.atan2(b.p.x,b.p.z-CENTER));
  const width=Math.max(...ring.map(v=>Math.abs(v.p.x))),front=Math.max(...ring.map(v=>v.p.z))-CENTER,back=CENTER-Math.min(...ring.map(v=>v.p.z));
  const profile=sex==='female'?[[1.04,1.07,.93],[1.12,.97,.86],[1.21,.83,.77],[1.28,.90,.84]]:[[1.025,1,.93],[1.10,.91,.87],[1.18,.83,.82],[1.26,.90,.89]];
  const vertices=distinct(triangles(template).flat()).filter(v=>v.p.y<CUT+.05),weightsAt=p=>{
    const nearest=vertices.map(v=>({v,d:v.p.distanceToSquared(p)})).sort((a,b)=>a.d-b.d).slice(0,4),weights=new Map();let total=0;
    for(const{v,d}of nearest){const f=1/Math.max(1e-7,d);total+=f;for(const[i,w]of v.weights)weights.set(i,(weights.get(i)||0)+w*f);}
    for(const[i,w]of weights)weights.set(i,w/total);return weights;
  };
  const rows=profile.map(([y,w,d])=>ring.map(v=>{
    const angle=Math.atan2(v.p.x,v.p.z-CENTER),c=Math.cos(angle),p=new Vector3(Math.sin(angle)*width*w,y,CENTER+c*(c>0?front:back)*d);
    return{p,weights:weightsAt(p)};
  })).concat([ring]),polygons=[];
  for(let j=0;j<rows.length-1;j++)for(let i=0;i<ring.length;i++){const next=(i+1)%ring.length;polygons.push([rows[j][i],rows[j][next],rows[j+1][next],rows[j+1][i]]);}
  const g=geometry(polygons,template.bindMatrix);g.userData.bareAbdomen={cut:CUT,rows:rows.length,ring: ring.length};return g;
}

function createBareTorso(part,sex){
  const meshes=[];part.traverse(m=>{if(m.isSkinnedMesh)meshes.push(m);});
  const skin=meshes.find(m=>m.material.name==='Skin').material.color,cloth=meshes.find(m=>!['Skin','Gold'].includes(m.material.name));
  const sources=meshes.filter(m=>m.material.name!=='Gold').map(triangles);
  const belly=cloth.clone();belly.name='BareAbdomen';belly.geometry=abdomen(sources,cloth,sex);belly.material=cloth.material.clone();belly.material.color.copy(skin);belly.material.name='Bare skin';belly.material.userData.clothingOwned=true;
  cloth.parent.add(belly);
  if(sex==='female'){
    const band=cloth.clone();band.name='BraBand';band.geometry=braBand(cloth);band.material=cloth.material.clone();band.material.color.setHex(UNDERWEAR);band.material.name='Underwear';band.material.userData.clothingOwned=true;cloth.parent.add(band);
  }
  for(const mesh of meshes){
    const source=triangles(mesh),isSkin=mesh.material.name==='Skin',parent=mesh.parent;
    if(mesh.material.name==='Gold'){mesh.removeFromParent();continue;}
    const top=select(source,[['y',CUT,true]]);
    // Keep all original fingers/arms below the torso cut; their authored
    // T-pose fingers extend lower than the chest plane.
    const arms=isSkin?[...select(source,[['y',CUT,false],['x',.19,true]]),...select(source,[['y',CUT,false],['x',-.19,false]])]:[];
    if(sex==='female'){
      if(isSkin){
        const body=surface(mesh,[...top,...arms],skin,'Bare skin');if(body)parent.add(body);
      }else{
        const body=surface(mesh,select(top,[['y',1.36,false]]),skin,'Bare skin'),bra=surface(mesh,select(top,[['y',1.36,true]]),skin.clone().setHex(UNDERWEAR),'Underwear',.0015);if(body)parent.add(body);if(bra)parent.add(bra);
      }
    }else{const body=surface(mesh,[...top,...arms],skin,'Bare skin');if(body)parent.add(body);}
    mesh.removeFromParent();
  }
}

export function makeBareTorso(part,sex){
  let source;part.traverse(m=>{if(m.isSkinnedMesh&&!['Skin','Gold'].includes(m.material.name))source=m.geometry;});
  const cached=bodies.get(source);
  if(cached){
    for(const child of [...part.children])part.remove(child);
    for(const original of cached.children){const child=original.clone(true);child.traverse(m=>{if(m.isMesh){m.geometry=m.geometry.clone();m.material=m.material.clone();}});part.add(child);}
    return;
  }
  createBareTorso(part,sex);bodies.set(source,part.clone(true));
}
