import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {Box3,Quaternion,Ray,Triangle,Vector3} from 'three';
import {ithacaFixture} from './helpers/ithaca-fixture.mjs';
import {gripContact,indexSurfaceDistance} from './helpers/grip-contact.mjs';
import {bodyIntersections} from './helpers/body-intersections.mjs';
import {poseOneHandFingers} from '../docs/src/one-hand-grasp.js';
import PROFILE from './fixtures/ithaca-reference-pose.json' with {type:'json'};
import STOCK_POINTS from './fixtures/ithaca-original-neck-points.json' with {type:'json'};
import RETAINED from './fixtures/ithaca-retained-surfaces.json' with {type:'json'};

const modelPath=new URL('./fixtures/ithaca-reference-cut.glb.gz',import.meta.url);
const fixture=sex=>ithacaFixture(sex,{profile:PROFILE,modelPath});
const at=(e,n)=>e.model.getObjectByName(n).getWorldPosition(new Vector3());
const forward=e=>new Vector3(0,0,1).applyQuaternion(e.weapon.getWorldQuaternion(new Quaternion()));
function untouched(f){
 for(const[b,q]of f.baseline.left)assert.deepEqual(b.quaternion.toArray(),q.toArray(),'free left '+b.name);
 for(const{bone,rotation}of f.baseline.legs)assert.deepEqual(bone.quaternion.toArray(),rotation.toArray(),'source leg '+bone.name);
 assert.deepEqual(f.entity.model.getObjectByName('ShoulderR').quaternion.toArray(),f.baseline.shoulder.toArray(),'source shoulder');
}
const inside=(p,poly)=>{let yes=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;};

test('the marked cut preserves the actual source stock contour and closes its complete new face',async()=>{
 const bytes=gunzipSync(await readFile(modelPath)),n=bytes.readUInt32LE(12),doc=JSON.parse(bytes.subarray(20,20+n)),binary=bytes.subarray(28+n),cut=doc.asset.extras.stockCut;
 assert.equal(doc.asset.extras.sourceAuthor,'TastyTony');assert.match(doc.asset.extras.modifications,/Retained|Surviving/);
 for(const[name,attrs]of Object.entries(RETAINED.retained))if(name!=='ReceiverAndGrip'){
  const prim=doc.meshes.find(m=>m.name===name).primitives[0];
  for(const[attr,digest]of Object.entries(attrs)){
   const a=doc.accessors[prim.attributes[attr]],v=doc.bufferViews[a.bufferView],s=(v.byteOffset||0)+(a.byteOffset||0);
   assert.equal(createHash('sha256').update(binary.subarray(s,s+a.count*12)).digest('hex'),digest,name+' retained');
  }
 }
 const f=await fixture('male');
 try{
  const a=f.entity.weapon.getObjectByName('ReceiverAndGrip').geometry.attributes.position,points=Array.from({length:a.count},(_,i)=>new Vector3().fromBufferAttribute(a,i));
  for(const p of STOCK_POINTS)assert.ok(points.some(q=>q.distanceTo(new Vector3(...p))<1e-7),'original stock vertex is not stretched or reshaped');
  const normal=new Vector3(0,-cut.slope,1).normalize(),u=new Vector3(1,0,0),v=normal.clone().cross(u),origin=new Vector3(0,0,cut.offset),caps=[];
  for(let i=cut.firstCapTriangle*3;i<a.count;i+=3){
   const tri=new Triangle(...[0,1,2].map(k=>points[i+k]));caps.push(tri);
   for(const p of [tri.a,tri.b,tri.c])assert.ok(Math.abs(p.z-cut.slope*p.y-cut.offset)<1e-7,'new face follows the reference plane');
   assert.ok(tri.getNormal(new Vector3()).dot(normal)<-.999,'end face points outward');
  }
  assert.equal(caps.length,cut.capTriangles);assert.ok(caps.length>0&&caps.length<100);
  for(const polygon of cut.sectionLoops){
   const min=[0,1].map(k=>Math.min(...polygon.map(p=>p[k]))),max=[0,1].map(k=>Math.max(...polygon.map(p=>p[k])));
   for(let i=0;i<11;i++)for(let j=0;j<11;j++){
    const xy=[min[0]+(max[0]-min[0])*(i+.37)/11,min[1]+(max[1]-min[1])*(j+.43)/11];if(!inside(xy,polygon))continue;
    const p=origin.clone().addScaledVector(u,xy[0]).addScaledVector(v,xy[1]),ray=new Ray(p.clone().addScaledVector(normal,-.02),normal),hits=[];
    for(const tri of caps){const h=ray.intersectTriangle(tri.a,tri.b,tri.c,false,new Vector3());if(h&&!hits.some(q=>q.distanceTo(h)<1e-7))hits.push(h);}
    assert.equal(hits.length,1,'cut face has one continuous closed surface');
   }
  }
 }finally{f.replay.dispose();}
});

test('the reference stock has a fitted one-hand stance on both source rigs',async()=>{
 for(const sex of ['male','female']){
  const f=await fixture(sex),e=f.entity,probe=bodyIntersections(e);
  try{
   for(const clip of ['Idle_Gun','Walk','Run','Crouch_Idle','Crouch_Walk'])for(const progress of [.1,.4,.8])for(const posture of ['carry','hip','aim']){
    const yaw=progress*2;f.pose({clip,progress,posture,yaw,sneak:clip.startsWith('Crouch'),running:clip==='Run'});untouched(f);
    const palm=PROFILE.rigs[sex].rightPalm;assert.ok(at(e,'Middle2R').distanceTo(e.weapon.localToWorld(new Vector3(...palm)))<1e-6,'palm contact');
    assert.ok(at(e,'WristR').sub(at(e,'LowerArmR')).angleTo(at(e,'Middle2R').sub(at(e,'WristR')))<60*Math.PI/180,'bounded wrist');
    assert.deepEqual(probe().filter(x=>x.startsWith('R')),[],`${sex} ${clip} ${posture}: arm clears body`);
    if(posture==='aim'){
     assert.ok(forward(e).dot(new Vector3(Math.sin(yaw),0,Math.cos(yaw)))>.999,'aim direction retained');
     const barrel=new Box3().setFromObject(e.weapon.getObjectByName('BarrelAndRib')),shoulder=at(e,'UpperArmR').y;
     assert.ok(barrel.max.y<shoulder+.10&&barrel.min.y>shoulder-.08,'barrel stays at shoulder height');
    }else if(posture==='carry')assert.ok(forward(e).y<-.35,'carry points down');
   }
   f.pose();
   for(const amount of [0,.25,.5,.75,1]){poseOneHandFingers(e,amount);assert.ok(gripContact(e,PROFILE.contactMesh).maxDepth<.0025,'skin contact remains within the soft-contact tolerance');}
   assert.ok(indexSurfaceDistance(e,new Vector3(0,-.004,.028))<.006,'firing index reaches its contact');
  }finally{f.replay.dispose();}
 }
});

test('the reference stance keeps continuous transitions and original legs at 30 and 60 Hz',async()=>{
 for(const sex of ['male','female'])for(const fps of [30,60]){
  const f=await fixture(sex),e=f.entity,probe=bodyIntersections(e);f.pose({posture:'carry'});let last=at(e,'WristR').sub(at(e,'UpperArmR'));
  try{
   for(let i=0;i<fps*3;i++){
    const t=i/fps,phase=Math.floor(t/.5)%6,clip=['Idle_Gun','Walk','Crouch_Idle','Crouch_Walk','Run','Idle_Gun'][phase];
    f.player.combat.triggerHeld=Math.floor(t/.23)%2===1;
    f.pose({clip,progress:t*.6%1,posture:clip==='Run'?'carry':Math.floor(t/.37)%2?'aim':'carry',sneak:clip.startsWith('Crouch'),running:clip==='Run',delta:1/fps,yaw:Math.sin(t)*.5});untouched(f);
    const next=at(e,'WristR').sub(at(e,'UpperArmR'));assert.ok(next.distanceTo(last)<.075,'bounded hand path');last=next;
    assert.deepEqual(probe().filter(x=>x.startsWith('R')),[],`${sex} ${fps} ${i}: arm clears body during transition`);
   }
  }finally{f.replay.dispose();}
 }
});
