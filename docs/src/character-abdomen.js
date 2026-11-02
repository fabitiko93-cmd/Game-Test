import {Color,Vector3} from 'three';
import {bridgeRings,meshTriangles,mixVertex,orderRing,sampleRing,sectionLoops,selectSurface,surfaceGeometry} from './character-surface.js';

// Rebuild the former hem/waist area, keeping the source arms, upper chest and
// lower legs. Both sides of the waistband share positions and joint weights.
const TAU=Math.PI*2;
const mean=(a,fn)=>a.reduce((s,v)=>s+fn(v),0)/a.length;
const point=(mesh,i)=>new Vector3().fromBufferAttribute(mesh.geometry.attributes.position,i).applyMatrix4(mesh.bindMatrix);
const vertices=(mesh,ids)=>ids.map(i=>({p:point(mesh,i),weights:new Map(Array.from({length:4},(_,k)=>[mesh.geometry.attributes.skinIndex.getComponent(i,k),mesh.geometry.attributes.skinWeight.getComponent(i,k)]).filter(([,w])=>w>0))}));
function triangles(mesh){
 const out=meshTriangles(mesh),a=mesh.geometry.attributes,index=mesh.geometry.index;
 for(let t=0;t<out.length;t++)for(let k=0;k<3;k++){
  const i=index?index.getX(t*3+k):t*3+k;
  out[t][k].color=new Color().fromBufferAttribute(a.color,i);
 }
 return out;
}
function retain(source,planes){
 return source.flatMap(tri=>selectSurface([tri],planes).map(poly=>poly.map(v=>({...v,color:v.color||tri[0].color}))));
}
const torsoLoop=(source,y)=>sectionLoops(source,y).find(r=>r.every(v=>Math.abs(v.p.x)<.19));
function measures(ring){
 const xs=ring.map(v=>v.p.x),zs=ring.map(v=>v.p.z),min=Math.min(...zs),max=Math.max(...zs);
 return{width:(Math.max(...xs)-Math.min(...xs))/2,center:(min+max)/2,depth:(max-min)/2};
}
function spline(knots,y,key){
 let i=knots.findIndex((k,j)=>j<knots.length-1&&y<=knots[j+1].y);if(i<0)i=knots.length-2;
 const a=knots[i],b=knots[i+1],h=b.y-a.y,t=Math.max(0,Math.min(1,(y-a.y)/h));
 const slope=j=>{const l=knots[Math.max(0,j-1)],r=knots[Math.min(knots.length-1,j+1)];return(r[key]-l[key])/(r.y-l.y);};
 return(2*t**3-3*t*t+1)*a[key]+(t**3-2*t*t+t)*h*slope(i)+(-2*t**3+3*t*t)*b[key]+(t**3-t*t)*h*slope(i+1);
}
const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
function mapBones(ring,from,to){
 return ring.map(v=>({...v,p:v.p.clone(),weights:new Map([...v.weights].map(([i,w])=>[to.skeleton.bones.findIndex(b=>b.name===from.skeleton.bones[i].name),w]))}));
}
function setGeometry(mesh,polygons,waist){
 const previous=mesh.geometry,geometry=surfaceGeometry(polygons,mesh.bindMatrix);
  geometry.userData={...previous.userData,...geometry.userData,bodySmoothed:true,waistIndices:[]};
 mesh.geometry=geometry;
 for(let i=0;i<geometry.attributes.position.count;i++)if(waist.some(v=>v.p.distanceToSquared(point(mesh,i))<1e-12))geometry.userData.waistIndices.push(i);
  if(previous.userData.clothingOwned)previous.dispose();
}
function joinNormals(a,b){
 const key=p=>p.toArray().map(v=>v.toFixed(6)).join(','),nodes=new Map();
 for(const mesh of [a,b])for(const i of mesh.geometry.userData.waistIndices){
  const k=key(point(mesh,i)),node=nodes.get(k)||[];node.push({mesh,i});nodes.set(k,node);
 }
 for(const list of nodes.values()){
  const normal=list.reduce((s,{mesh,i})=>s.add(new Vector3().fromBufferAttribute(mesh.geometry.attributes.normal,i)),new Vector3()).normalize();
  for(const{mesh,i}of list)mesh.geometry.attributes.normal.setXYZ(i,...normal.toArray());
 }
}

export function smoothBareBody(torsoPart,legsPart,sex){
 let torso,legs;
 torsoPart.traverse(m=>{if(m.geometry?.userData.bareTorso)torso=m;});
 legsPart.traverse(m=>{if(m.geometry?.userData.bareLegs)legs=m;});
 if(torso.geometry.userData.abdomenProfile)return{...torso.geometry.userData.abdomenProfile,torso,legs};
 const source=triangles(torso),legSource=triangles(legs),waist=orderRing(vertices(torso,torso.geometry.userData.waistIndices));
 const waistY=mean(waist,v=>v.p.y),lowY=waistY-.10,topY=sex==='female'?1.365:1.36;
 const lowerRaw=torsoLoop(legSource,lowY),upper=torsoLoop(source,topY);
 if(!lowerRaw||!upper)throw Error('Review body needs closed pelvic and ribcage sections');
 const lower=mapBones(lowerRaw,legs,torso),lo=measures(lower),mid=measures(waist),hi=measures(upper),h=topY-waistY;
 const knots=[
  {y:lowY,...lo},
  {y:waistY,width:mid.width*(sex==='female'?.92:.95),center:mid.center,depth:mid.depth*.94},
  {y:waistY+h*.48,width:hi.width*(sex==='female'?.81:.90),center:mid.center*.4+hi.center*.6,depth:hi.depth*(sex==='female'?.90:.96)},
  {y:waistY+h*.74,width:hi.width*.97,center:hi.center,depth:hi.depth*.98},
  {y:topY,...hi}
 ];
 const ellipse=(y,angle)=>new Vector3(Math.sin(angle)*spline(knots,y,'width'),y,spline(knots,y,'center')+Math.cos(angle)*spline(knots,y,'depth'));
 const shape=(y,angle)=>{
  const p=ellipse(y,angle),bottomFade=1-smooth((y-lowY)/.06),topFade=smooth((y-(topY-.06))/.06);
  p.addScaledVector(sampleRing(lower,angle).p.sub(ellipse(lowY,angle)),bottomFade);
  p.addScaledVector(sampleRing(upper,angle).p.sub(ellipse(topY,angle)),topFade);
  return p;
 };
 const fittedWaist=waist.map(v=>{
  const angle=(Math.atan2(v.p.x,v.p.z-mid.center)+TAU)%TAU;
  return{...v,p:shape(waistY,angle)};
 });
 const patch=(a,b,ya,yb,color)=>{
  const count=Math.ceil((yb-ya)/.025),rows=[a],ys=Array.from({length:count-1},(_,j)=>ya+(yb-ya)*(j+1)/count);
  if(sex==='female'&&ya<1.36&&yb>1.36)ys.push(1.36);ys.sort((a,b)=>a-b);
  for(const y of ys){
   const t=(y-ya)/(yb-ya);
   rows.push(Array.from({length:32},(_,k)=>{const angle=k/32*TAU,v=mixVertex(sampleRing(a,angle),sampleRing(b,angle),t);v.p=shape(y,angle);return v;}));
  }
  rows.push(b);const polygons=[];
  for(let j=0;j<rows.length-1;j++)polygons.push(...bridgeRings(rows[j],rows[j+1]));
  return polygons.map(poly=>poly.map(v=>({...v,color:typeof color==='function'?color(mean(poly,v=>v.p.y)):color})));
 };
 const skin=source.find(tri=>tri.every(v=>v.p.y<topY&&Math.abs(v.p.x)<.18)&&tri[0].color.r>.15)?.[0].color;
 if(!skin)throw Error('Review body skin colour not found');
 const fabric=legSource[0][0].color.clone();fabric.set(0x343945);
 const arms=[...retain(source,[['y',topY,false],['x',.19,true]]),...retain(source,[['y',topY,false],['x',-.19,false]])];
 setGeometry(torso,[...retain(source,[['y',topY,true]]),...arms,...patch(fittedWaist,upper,waistY,topY,y=>sex==='female'&&y>1.36?fabric:skin)],fittedWaist);
 const legPatch=patch(lower,fittedWaist,lowY,waistY,fabric).map(poly=>mapBones(poly,torso,legs));
 setGeometry(legs,[...retain(legSource,[['y',lowY,false]]),...legPatch],mapBones(fittedWaist,torso,legs));
 joinNormals(torso,legs);
 const profile={sex,waistY,lowY,topY,waistWidthBefore:mid.width*2,waistWidthAfter:knots[1].width*2,naturalWaistY:knots[2].y,naturalWaistWidth:knots[2].width*2};
 torso.geometry.userData.abdomenProfile=profile;
 return{...profile,torso,legs};
}
