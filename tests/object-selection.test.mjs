import assert from 'node:assert/strict';
import test from 'node:test';
import { Renderer } from '../docs/src/render.js';
import { objectPickPolygon, polygonDistance, pickHotspots } from '../docs/src/object-selection.js';
import { World } from '../docs/src/world.js';
import { Game } from '../docs/src/game.js';
import { createPlayer } from '../docs/src/character.js';
import { createItem,addItem,equipItem,removeItem } from '../docs/src/inventory.js';
import { playerModelAppearance,furnishingDimensions } from '../docs/src/quaternius-catalog.js';
import { tapWorld,doubleTapWorld,startGuidedMovement } from '../docs/src/world-input.js';
import { VIEW } from '../docs/src/config.js';

const camera=zoom=>Object.assign(Object.create(Renderer.prototype),{zoom,width:812,height:375,camera:{x:0,y:0},hotspots:[]});
const hotspot=(renderer,object)=>{
 const polygon=objectPickPolygon(renderer,object);
 return {id:object.id,kind:'object',ref:object,polygon,x:polygon.reduce((sum,p)=>sum+p.x,0)/polygon.length,y:polygon.reduce((sum,p)=>sum+p.y,0)/polygon.length};
};

test('real cabinet bodies have precise elevated hit regions at every zoom, with a constant screen-space touch allowance',()=>{
 const world=new World(),fridge=world.objects.find(o=>o.type==='fridge');
 const below=world.objects.find(o=>o.name==='SPÜLENSCHRANK'&&o.building==='safehouse'),above=world.objects.find(o=>o.name==='HÄNGESCHRANK'&&Math.abs(o.y-below.y)<.01);
 for(const zoom of VIEW.zoomLevels){
  const renderer=camera(zoom),low=hotspot(renderer,below),high=hotspot(renderer,{...above,interactable:true});
  const fridgeHit=hotspot(renderer,fridge),tallPoint={x:fridgeHit.x,y:Math.min(...fridgeHit.polygon.map(p=>p.y))+8};
  assert.equal(pickHotspots([fridgeHit],tallPoint.x,tallPoint.y)[0].id,fridge.id,'upper fridge body is selectable');
  assert.ok(high.y<low.y-15*zoom,'mounted body follows its actual height');
  const right=Math.max(...fridgeHit.polygon.map(p=>p.x)),p=fridgeHit.polygon.find(p=>p.x===right);
  assert.equal(pickHotspots([fridgeHit],p.x+9,p.y).length,1);assert.equal(pickHotspots([fridgeHit],p.x+11,p.y).length,0,'no oversized zoom-scaled circle');
  const rect=[{x:0,y:0},{x:20,y:0},{x:20,y:20},{x:0,y:20}];assert.equal(polygonDistance({x:10,y:10},rect),0);
  const one={...low,polygon:rect},two={...high,polygon:rect};
  assert.deepEqual(pickHotspots([one,two],10,10).map(h=>h.id),[two.id,one.id]);
  assert.equal(pickHotspots([one,two],10,10,ref=>ref!==two.ref).length,1,'hidden targets never enter the choices');
 }
});


test('vehicle roofs, loose supplies and lying bodies retain selectable physical surfaces',()=>{
 const renderer=camera(1.75),world=new World(),car=world.vehicles[0];
 for(const object of [car,{id:'body',type:'corpse',x:8,y:36},{id:'radio',type:'radio',x:8,y:36}]){
  const hit=hotspot(renderer,object);assert.equal(pickHotspots([hit],hit.x,hit.y)[0].id,object.id);
  assert.ok(Math.max(...hit.polygon.map(p=>p.x))-Math.min(...hit.polygon.map(p=>p.x))>20,'body footprint is not reduced to a tiny point');
 }
 const hit=hotspot(renderer,car),point=renderer.iso(car.x,car.y,30);
 assert.equal(pickHotspots([hit],point.x,point.y)[0].id,car.id,'roof can be tapped, not just the ground below the car');
});

test('a real tap, double tap or hold on overlapping cabinets asks for a target without walking, opening or sprinting',()=>{
 const world=new World(),objects=world.objects.filter(o=>o.interactable&&o.items).slice(0,2),hits=objects.map(ref=>({kind:'object',id:ref.id,ref}));
 for(const gesture of [tapWorld,doubleTapWorld,startGuidedMovement]){
  let choices=0,moves=0,opens=0;const game={canAct:()=>true,input:{},renderer:{pickCandidates:()=>hits},ui:{showObjectChoices(actual){choices++;assert.deepEqual(actual,hits);}},queueInteraction(){opens++;},setDestination(){moves++;},updateGuidedMovement(){moves++;}};
  gesture(game,10,10);assert.equal(choices,1);assert.equal(moves+opens,0);
 }
});

test('an explicit distant target cannot be silently replaced by the nearest other container',()=>{
 const world=new World(),player=createPlayer(),near=world.objects.find(o=>o.type==='fridge'),chosen=world.objects.find(o=>o.name==='MEDIKAMENTENSCHRANK');
 Object.assign(player,{x:near.x+near.footprint.x+.2,y:near.y});
 const game=Object.assign(Object.create(Game.prototype),{world,player,renderer:{selectedId:chosen.id}});
 assert.equal(game.selectedObject(),chosen);assert.equal(game.contextObject(),null);
 game.renderer.selectedId=null;assert.ok(game.contextObject());
});

test('all small room props rest inside real support surfaces and retain support/depth after saving',()=>{
 const world=new World(),props=world.objects.filter(o=>o.placementRole==='prop');assert.ok(props.length>=9);
 for(const prop of props){
  const support=world.objects.find(o=>o.id===prop.supportId);assert.ok(support,prop.name);assert.equal(prop.solid,false);
  assert.ok(Math.abs(prop.elevationMeters-furnishingDimensions(support).height-.002)<1e-9,prop.name);
  assert.ok(Math.abs(prop.x-support.x)+prop.footprint.x<=support.footprint.x+.001,prop.name+' must fit in width');
  assert.ok(Math.abs(prop.y-support.y)+prop.footprint.y<=support.footprint.y+.001,prop.name+' must fit in depth');
  assert.ok(prop.renderDepth>support.x+support.y,'decor draws after its support');
 }
 assert.ok(world.objects.filter(o=>o.modelAsset?.startsWith('Houseplant')).every(o=>o.supportId),'tiny pots never stand alone on the floor');
 const restored=new World();restored.restore(JSON.parse(JSON.stringify(world.serialize())));
 for(const prop of props){const copy=restored.objects.find(o=>o.id===prop.id);assert.equal(copy.supportId,prop.supportId);assert.equal(copy.renderDepth,prop.renderDepth);assert.equal(copy.elevationMeters,prop.elevationMeters);}
});

test('found outfits are transferable clothing and equipping loot changes only the relevant part',()=>{
 const player=createPlayer({appearance:{sex:'female',style:'Suit'}}),original=playerModelAppearance(player);
 assert.deepEqual(original.bare,['torso','legs','feet']);assert.equal(player.inventory.length,0);
 const trousers=createItem('suit_trousers_f');addItem(player,trousers);equipItem(player,trousers.id);
 const jacket=createItem('work_jacket');addItem(player,jacket);equipItem(player,jacket.id);
 assert.equal(playerModelAppearance(player).torso,'female-Worker');assert.equal(playerModelAppearance(player).legs,'female-Suit');
 const jeans=createItem('jeans');addItem(player,jeans);equipItem(player,jeans.id);assert.equal(playerModelAppearance(player).legs,'female-Casual');
 const suit=removeItem(player,trousers.id);addItem(player,suit);equipItem(player,suit.id);assert.equal(playerModelAppearance(player).legs,'female-Suit');
 assert.deepEqual(playerModelAppearance(JSON.parse(JSON.stringify(player))),playerModelAppearance(player));
});
