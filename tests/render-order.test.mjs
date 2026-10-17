import assert from 'node:assert/strict';
import test from 'node:test';
import {World} from '../docs/src/world.js';
import {Renderer} from '../docs/src/render.js';
import {sortWorldDrawables,projectedBodyBounds,isFloorObject} from '../docs/src/render-order.js';

const entry=ref=>({kind:'object',ref,depth:ref.renderDepth??ref.x+ref.y});
const overlap=(a,b)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;

test('the real shelter rug is below its coffee table and all standing furniture at every camera position',()=>{
 const world=new World(),drawables=world.objects.map(entry),rug=world.objects.find(o=>o.placementRole==='rug'),table=world.objects.find(o=>o.name==='COUCHTISCH');
 assert.ok(rug.x+rug.y>table.x+table.y,'reproduce the centre-depth inversion');
 assert.ok(overlap(projectedBodyBounds(entry(rug)),projectedBodyBounds(entry(table))));
 const sorted=sortWorldDrawables(drawables,world),index=object=>sorted.findIndex(d=>d.ref===object);
 assert.ok(index(rug)<index(table));
 for(const object of world.objects.filter(o=>o.building==='safehouse'&&!isFloorObject(entry(o))))assert.ok(index(rug)<index(object));
 assert.equal(new Set(sorted.map(d=>d.ref)).size,world.objects.length);
});

test('all overlapping interior bodies draw in front of rear walls, behind front walls and below supported decor',()=>{
 const world=new World(),sorted=sortWorldDrawables(world.objects.map(entry),world),indices=new Map(sorted.map((d,i)=>[d.ref.id,i]));
 const kitchen=world.objects.find(o=>o.tutorial),coveringWall=world.objects.find(o=>o.type==='wall'&&o.side==='west'&&o.building==='safehouse'&&o.x+o.y>kitchen.x+kitchen.y&&overlap(projectedBodyBounds(entry(o)),projectedBodyBounds(entry(kitchen))));
 assert.ok(coveringWall,'reproduce a rear wall panel painting over the original kitchen cabinet');
 assert.ok(indices.get(coveringWall.id)<indices.get(kitchen.id),'the complete cabinet must paint after the rear wall');
 let checked=0;
 for(const drawable of sorted){
  const o=drawable.ref;if(['wall','door'].includes(o.type)||isFloorObject(drawable))continue;
  const building=o.building||world.insideBuilding(o)?.id;if(!building)continue;
  for(const wall of world.objects.filter(w=>['wall','door'].includes(w.type)&&w.building===building)){
   if(!overlap(projectedBodyBounds(entry(wall)),projectedBodyBounds(drawable)))continue;
   if(['north','west'].includes(wall.side)){assert.ok(indices.get(wall.id)<indices.get(o.id),o.name+' must stand in front of rear wall');checked++;}
   if(['south','east'].includes(wall.side))assert.ok(indices.get(o.id)<indices.get(wall.id),o.name+' must remain behind front wall');
  }
  if(o.supportId)assert.ok(indices.get(o.supportId)<indices.get(o.id),'support remains below its decoration');
 }
 assert.ok(checked>40,'check real room overlaps across all four buildings');
});

test('outside figures retain their relative depth order and partial views never lose objects',()=>{
 const world=new World(),entities=[{id:'outside-1',x:14,y:19},{id:'outside-2',x:20,y:18},{id:'outside-3',x:30,y:22}];
 const drawables=[...world.objects.map(entry),...entities.map(ref=>({kind:'zombie',ref,depth:ref.x+ref.y+.06}))];
 assert.deepEqual(sortWorldDrawables(drawables,world).filter(d=>d.kind==='zombie').map(d=>d.ref.id),entities.map(o=>o.id));
 const prop=world.objects.find(o=>o.supportId),partial=[entry(prop)];assert.equal(sortWorldDrawables(partial,world).length,1);
});

test('the actual renderer paints rugs once between terrain and floor effects, before any raised object',()=>{
 const world=new World(),calls=[],r=Object.create(Renderer.prototype);
 Object.assign(r,{ctx:{setTransform(){},fillRect(){}},frame:0,scale:1,width:844,height:390,metrics:{},iso:(x,y)=>({x:400+(x-y)*10,y:180+(x+y-46)*5}),hotspots:[],particles:[],tracers:[],camera:{x:0,y:0},
  zombieSprites:{beginFrame(){},endFrame(){}},visibleWorldBounds:()=>({minX:5,minY:34,maxX:13,maxY:43}),drawObject(o){calls.push(o.placementRole==='rug'?'rug':'body');},drawPlayer(){calls.push('player');}});
 for(const name of ['updateMetrics','updateParticles','updateTracers','follow','drawRoofs','drawParticles','drawTracers','drawNoiseHints','drawLighting'])r[name]=()=>{};
 for(const name of ['drawGround','drawBlood','drawCharacterShadows','drawPlayerNoise','drawCoverHints','drawVisionCones','drawDestination'])r[name]=()=>calls.push(name);
 const game={world,player:{id:'player',x:8,y:38},zombies:[],minutes:400,contextObject:()=>null};
 r.drawWorld(game,0);
 assert.equal(calls.filter(c=>c==='rug').length,1);assert.ok(calls.indexOf('drawGround')<calls.indexOf('rug'));
 assert.ok(calls.indexOf('rug')<calls.indexOf('drawBlood'));assert.ok(calls.indexOf('rug')<calls.indexOf('drawDestination'));assert.ok(calls.indexOf('rug')<calls.indexOf('body'));
 assert.ok(calls.indexOf('rug')<calls.indexOf('drawCharacterShadows'));
 assert.ok(calls.indexOf('drawCharacterShadows')<calls.indexOf('body'));
 assert.ok(calls.indexOf('drawCharacterShadows')<calls.indexOf('player'));
});
