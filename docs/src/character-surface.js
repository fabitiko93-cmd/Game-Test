import {BufferGeometry,Color,Float32BufferAttribute,Uint16BufferAttribute,Vector3} from 'three';

export function mixVertex(a,b,t){
  const weights=new Map();
  for(const[i,w]of a.weights)weights.set(i,w*(1-t));
  for(const[i,w]of b.weights)weights.set(i,(weights.get(i)||0)+w*t);
  return{p:a.p.clone().lerp(b.p,t),weights};
}

export function meshTriangles(mesh){
  const a=mesh.geometry.attributes,index=mesh.geometry.index;
  const vertex=i=>({p:new Vector3().fromBufferAttribute(a.position,i).applyMatrix4(mesh.bindMatrix),weights:new Map(Array.from({length:4},(_,k)=>[a.skinIndex.getComponent(i,k),a.skinWeight.getComponent(i,k)]).filter(([,w])=>w>0))});
  return Array.from({length:(index?.count||a.position.count)/3},(_,i)=>[0,1,2].map(k=>vertex(index?index.getX(i*3+k):i*3+k)));
}

function clip(polygon,axis,at,above){
  const out=[];
  for(let i=0;i<polygon.length;i++){
    const a=polygon[i],b=polygon[(i+1)%polygon.length],av=a.p[axis],bv=b.p[axis],ia=above?av>=at:av<=at,ib=above?bv>=at:bv<=at;
    if(ia)out.push(a);if(ia!==ib)out.push(mixVertex(a,b,(at-av)/(bv-av)));
  }
  return out;
}

export const selectSurface=(source,planes)=>source.map(triangle=>planes.reduce((polygon,[axis,at,above])=>clip(polygon,axis,at,above),triangle)).filter(p=>p.length>=3);
export const paintSurface=(polygons,color)=>polygons.map(polygon=>polygon.map(v=>({...v,color})));
const positionKey=p=>p.toArray().map(n=>n.toFixed(5)).join(',');

// Ordered section loops retain the exact edge intersections and skin weights.
// A bridge therefore meets the retained source triangles without a second layer.
export function sectionLoops(triangles,height){
  const nodes=new Map();
  for(const tri of triangles){
    const hits=[];
    for(let i=0;i<tri.length;i++){
      const a=tri[i],b=tri[(i+1)%tri.length];
      if((a.p.y<height)!==(b.p.y<height))hits.push(mixVertex(a,b,(height-a.p.y)/(b.p.y-a.p.y)));
    }
    if(hits.length!==2)continue;
    for(const[a,b]of [hits,[hits[1],hits[0]]]){
      const key=positionKey(a.p);if(!nodes.has(key))nodes.set(key,{v:a,near:new Set()});nodes.get(key).near.add(positionKey(b.p));
    }
  }
  const seen=new Set(),loops=[];
  for(const key of nodes.keys()){
    if(seen.has(key))continue;
    const todo=[key],vertices=[];
    while(todo.length){const next=todo.pop();if(seen.has(next))continue;seen.add(next);const node=nodes.get(next);vertices.push(node.v);todo.push(...node.near);}
    if(vertices.length>=3&&vertices.every(v=>nodes.get(positionKey(v.p)).near.size===2))loops.push(orderRing(vertices));
  }
  return loops;
}

const tau=Math.PI*2;
export function orderRing(ring){
  const center=ring.reduce((p,v)=>p.add(v.p),new Vector3()).multiplyScalar(1/ring.length);
  return ring.map(v=>({v,angle:(Math.atan2(v.p.x-center.x,v.p.z-center.z)+tau)%tau})).sort((a,b)=>a.angle-b.angle).map(({v})=>v);
}

export function sampleRing(ring,angle){
  const center=ring.reduce((p,v)=>p.add(v.p),new Vector3()).multiplyScalar(1/ring.length),angles=ring.map(v=>(Math.atan2(v.p.x-center.x,v.p.z-center.z)+tau)%tau);
  angle=(angle+tau)%tau;
  let next=angles.findIndex(a=>a>=angle);if(next<0)next=0;
  const previous=(next+ring.length-1)%ring.length,a=angles[previous],b=angles[next]+(next===0?tau:0),at=angle+(angle<a?tau:0);
  return mixVertex(ring[previous],ring[next],(at-a)/(b-a));
}

// Zipper triangulation keeps both boundary loops intact even when their vertex
// counts differ. Resampling a boundary would introduce moving T-junctions.
export function bridgeRings(lower,upper){
  const angles=ring=>{const c=ring.reduce((p,v)=>p.add(v.p),new Vector3()).multiplyScalar(1/ring.length);return ring.map(v=>(Math.atan2(v.p.x-c.x,v.p.z-c.z)+tau)%tau);};
  const a=angles(lower),b=angles(upper),polygons=[];let i=0,j=0;
  while(i<lower.length||j<upper.length){
    const nextA=i<lower.length?a[(i+1)%a.length]+(i+1>=a.length?tau:0):Infinity,nextB=j<upper.length?b[(j+1)%b.length]+(j+1>=b.length?tau:0):Infinity;
    if(Math.abs(nextA-nextB)<1e-8){polygons.push([lower[i%a.length],lower[(i+1)%a.length],upper[(j+1)%b.length],upper[j%b.length]]);i++;j++;}
    else if(nextA<nextB){polygons.push([lower[i%a.length],lower[(i+1)%a.length],upper[j%b.length]]);i++;}
    else{polygons.push([lower[i%a.length],upper[(j+1)%b.length],upper[j%b.length]]);j++;}
  }
  return polygons;
}

export function surfaceGeometry(polygons,bindMatrix){
  const inverse=bindMatrix.clone().invert(),positions=[],joints=[],weights=[],colors=[],indices=[],unique=new Map(),hasColors=polygons.some(p=>p.some(v=>v.color));
  const vertex=v=>{
    const p=v.p.clone().applyMatrix4(inverse),ws=[...v.weights].sort((a,b)=>b[1]-a[1]||a[0]-b[0]).slice(0,4),total=ws.reduce((s,[,w])=>s+w,0),color=v.color||new Color(1,1,1);
    const key=p.toArray().map(n=>n.toFixed(6)).join(',')+';'+ws.map(([i,w])=>i+':'+(w/total).toFixed(6)).join(',')+(hasColors?';'+color.toArray().join(','):'');
    if(unique.has(key))return unique.get(key);const id=positions.length/3;unique.set(key,id);positions.push(...p.toArray());if(hasColors)colors.push(...color.toArray());
    for(let k=0;k<4;k++){joints.push(ws[k]?.[0]||0);weights.push((ws[k]?.[1]||0)/total);}return id;
  };
  for(const polygon of polygons)for(let k=1;k<polygon.length-1;k++){
    const a=polygon[0].p,b=polygon[k].p,c=polygon[k+1].p;
    if(new Vector3().subVectors(b,a).cross(new Vector3().subVectors(c,a)).lengthSq()>1e-16)indices.push(vertex(polygon[0]),vertex(polygon[k]),vertex(polygon[k+1]));
  }
  const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(positions,3));g.setAttribute('skinIndex',new Uint16BufferAttribute(joints,4));g.setAttribute('skinWeight',new Float32BufferAttribute(weights,4));if(hasColors)g.setAttribute('color',new Float32BufferAttribute(colors,3));g.setIndex(indices);g.computeVertexNormals();
  // Colour boundaries duplicate vertices, but must not add a lighting ridge.
  const smooth=new Map(),normal=g.attributes.normal;
  for(let i=0;i<positions.length/3;i++){const key=positions.slice(i*3,i*3+3).map(n=>n.toFixed(6)).join(','),entry=smooth.get(key)||{sum:new Vector3(),ids:[]};entry.sum.add(new Vector3().fromBufferAttribute(normal,i));entry.ids.push(i);smooth.set(key,entry);}
  for(const{sum,ids}of smooth.values()){sum.normalize();for(const i of ids)normal.setXYZ(i,...sum.toArray());}
  g.computeBoundingBox();g.computeBoundingSphere();g.userData.clothingOwned=true;return g;
}
