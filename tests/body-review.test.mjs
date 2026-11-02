import test from 'node:test';
import assert from 'node:assert/strict';
import {Ray,Vector3} from 'three';
import {ithacaFixture} from './helpers/ithaca-fixture.mjs';
import {previewBodySmoothing} from '../scripts/lib/body-review.mjs';
import {meshTriangles,sectionLoops} from '../docs/src/character-surface.js';

const bindAt=(m,i)=>new Vector3().fromBufferAttribute(m.geometry.attributes.position,i).applyMatrix4(m.bindMatrix);
const key=p=>p.toArray().map(n=>n.toFixed(6)).join(',');
test('body review has one closed abdominal surface, a shared waistband, and preserves the weapon arm',async()=>{
 for(const sex of ['male','female']){
  const f=await ithacaFixture(sex),e=f.entity;
  try{
   f.pose();let oldTorso;e.clothing.torso.traverse(m=>{if(m.geometry?.userData.bareTorso)oldTorso=m;});
   const oldVertices=Array.from({length:oldTorso.geometry.attributes.position.count},(_,i)=>bindAt(oldTorso,i)).filter(p=>Math.abs(p.x)>.20||p.y>1.361);
   const arm=new Map([...e.rifleHands.values()].map(x=>[x.bone,x.bone.quaternion.toArray()])),weapon=e.weapon.matrixWorld.clone();
   const{torso,legs,waistY,lowY,topY}=previewBodySmoothing(e,sex);
   f.pose();
   for(const[b,q]of arm)assert.deepEqual(b.quaternion.toArray(),q,'review keeps '+b.name+' unchanged');
   assert.ok(e.weapon.matrixWorld.elements.every((n,i)=>Math.abs(n-weapon.elements[i])<1e-7),'approved weapon placement is unchanged');
   const kept=new Set(Array.from({length:torso.geometry.attributes.position.count},(_,i)=>key(bindAt(torso,i))));
   for(const p of oldVertices)assert.ok(kept.has(key(p)),'source arms and chest geometry are retained');
   const triangles=[...meshTriangles(torso),...meshTriangles(legs)];
   if(sex==='female'){
    const width=y=>{const r=sectionLoops(triangles,y).find(r=>r.every(v=>Math.abs(v.p.x)<.19));return Math.max(...r.map(v=>v.p.x))-Math.min(...r.map(v=>v.p.x));};
    const natural=torso.geometry.userData.abdomenProfile.naturalWaistY;
    assert.ok(width(natural)<width(topY-.002)*.9,'female waist remains visibly narrower than the ribcage');
    assert.ok(width(natural)<width(lowY+.002)*.9,'female waist remains visibly narrower than the hips');
   }
   for(let j=1;j<15;j++)for(let i=0;i<48;i++){
    const y=lowY+(topY-lowY)*j/15,angle=(i+.37)/48*Math.PI*2;
    const ray=new Ray(new Vector3(0,y,sex==='male'?.06:.08),new Vector3(Math.sin(angle),0,Math.cos(angle))),hits=[];
    for(const tri of triangles){const p=ray.intersectTriangle(...tri.map(v=>v.p),false,new Vector3());if(p&&p.distanceTo(ray.origin)<.19&&!hits.some(q=>q.distanceTo(p)<1e-5))hits.push(p);}
    assert.equal(hits.length,1,`${sex} ${y} ${i}: no folded second surface or hole`);
   }
   const pairs=torso.geometry.userData.waistIndices.map(i=>[i,legs.geometry.userData.waistIndices.find(j=>bindAt(torso,i).distanceTo(bindAt(legs,j))<1e-6)]);
   assert.ok(pairs.length>=32,'complete waistband');
   for(const[i,j]of pairs){
    assert.notEqual(j,undefined,'both body parts share the seam');
    assert.ok(new Vector3().fromBufferAttribute(torso.geometry.attributes.normal,i).distanceTo(new Vector3().fromBufferAttribute(legs.geometry.attributes.normal,j))<1e-6,'seam has continuous lighting');
   }
   for(const clip of e.actions.keys())for(const progress of [.1,.4,.8]){
    f.models.pose(e,{clip,progress,delta:1,yaw:0});torso.skeleton.update();legs.skeleton.update();
    for(const[i,j]of pairs){
     const p=torso.getVertexPosition(i,new Vector3()).applyMatrix4(torso.matrixWorld),q=legs.getVertexPosition(j,new Vector3()).applyMatrix4(legs.matrixWorld);
     assert.ok(p.distanceTo(q)<1e-6,`${sex} ${clip} ${progress}: no moving seam gap`);
    }
   }
   assert.ok(waistY>lowY&&waistY<topY);
  }finally{f.replay.dispose();}
 }
});
