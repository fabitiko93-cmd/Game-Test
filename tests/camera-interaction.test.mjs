import assert from 'node:assert/strict';
import test from 'node:test';
import {Renderer} from '../docs/src/render.js';
import {InputController} from '../docs/src/input.js';
import {VIEW} from '../docs/src/config.js';
import {World} from '../docs/src/world.js';
import {createPlayer} from '../docs/src/character.js';
import {canInteract,interactionDistance,CONTAINER_REACH} from '../docs/src/interaction.js';
import {pathToPlayerInteraction,playerSegmentClear} from '../docs/src/player-navigation.js';
import {takeItem} from '../docs/src/item-actions.js';
import {createItem,addItem,equipItem} from '../docs/src/inventory.js';
import {PlayerMotion} from '../docs/src/player-motion.js';
import {CombatSystem} from '../docs/src/combat.js';
import {furnishingDimensions} from '../docs/src/quaternius-catalog.js';

function camera(zoom=VIEW.zoomDefault){const renderer=Object.create(Renderer.prototype);Object.assign(renderer,{zoom,width:812,height:375,scale:3,camera:{x:0,y:0},cameraTarget:{x:0,y:0},cameraFollowing:true,cameraPanning:false});return renderer;}

test('zoom keeps projected taps exact, scales drag distance and preserves the player anchor at every level',()=>{
 const renderer=camera(),player=createPlayer();
 for(const zoom of VIEW.zoomLevels){renderer.zoom=zoom;renderer.follow(player,true);const anchor=renderer.iso(player.x,player.y);
  assert.ok(Math.abs(anchor.x-406)<1e-8&&Math.abs(anchor.y-221.5)<1e-8);
  for(const point of [{x:8.17,y:36.19},{x:12.34,y:33.2},{x:5,y:41}]){const screen=renderer.iso(point.x,point.y),world=renderer.screenToWorld(screen.x,screen.y);assert.ok(Math.hypot(world.x-point.x,world.y-point.y)<1e-10);}
  renderer.beginPan();const before=renderer.iso(player.x,player.y);renderer.panBy(90,-35);const after=renderer.iso(player.x,player.y);assert.ok(Math.abs(after.x-before.x-90)<1e-8&&Math.abs(after.y-before.y+35)<1e-8);renderer.recenter(player,true);
 }
 for(let i=0;i<20;i++)renderer.stepZoom(1,player);assert.equal(renderer.zoom,2.5);
 for(let i=0;i<20;i++)renderer.stepZoom(-1,player);assert.equal(renderer.zoom,1);
});

test('the world render uses native zoom resolution while hotspots, status icons and HUD retain screen coordinates',()=>{
 const renderer=camera(1.75),player=createPlayer();renderer.follow(player,true);const calls=[];
 renderer.ctx={save(){},restore(){}};renderer.hotspots=[];
 renderer.drawWorld=()=>{assert.equal(renderer.scale,5.25);assert.equal(renderer.width,812/1.75);const point=renderer.iso(player.x,player.y);renderer.hotspots=[{...point,radius:20,ref:player}];return[{kind:'player',ref:player}];};
 renderer.drawVignette=()=>calls.push('vignette');renderer.drawEntityStatuses=()=>{assert.equal(renderer.width,812);assert.equal(renderer.scale,3);calls.push('icons');};
 renderer.render({player},0);const projected=renderer.iso(player.x,player.y);assert.equal(renderer.hotspots[0].x,projected.x);assert.equal(renderer.hotspots[0].y,projected.y);assert.equal(renderer.pick(projected.x,projected.y).ref,player);assert.deepEqual(calls,['vignette','icons']);
});

test('zoom HUD presses cancel held world input and cannot become a tap, move or accidental sprint',()=>{
 const oldWindow=globalThis.window,oldDocument=globalThis.document,listeners={},elements={};
 for(const id of ['zoom-in-button','zoom-out-button'])elements[id]={addEventListener:(name,fn)=>listeners[id+name]=fn,disabled:false};
 globalThis.window={addEventListener(){},setTimeout:()=>1,clearTimeout(){}};globalThis.document={getElementById:id=>elements[id]};
 try{
  const input=new InputController({addEventListener(){},setPointerCapture(){},getBoundingClientRect:()=>({left:0,top:0})});input.enabled=true;
  let zoom=0,taps=0,moves=0,ended=0;input.callbacks={zoom:direction=>zoom+=direction,holdEnd:()=>ended++,tap:()=>taps++,doubleTap:()=>taps++,holdMove:()=>moves++};
  const event={pointerId:1,pointerType:'touch',button:0,clientX:250,clientY:150,preventDefault(){}};
  input.pointerDown(event);input.beginHold(1);input.lastTap.time=performance.now();listeners['zoom-in-buttonpointerdown']({preventDefault(){},stopPropagation(){}});
  input.pointerMove({...event,clientX:450});input.pointerUp(event);assert.equal(zoom,1);assert.equal(ended,1);assert.equal(moves+taps,0);assert.equal(input.lastTap.time,0);
  elements['zoom-in-button'].disabled=true;listeners['zoom-in-buttonpointerdown']({preventDefault(){},stopPropagation(){}});assert.equal(zoom,1);
 }finally{globalThis.window=oldWindow;globalThis.document=oldDocument;}
});

test('containers require half a metre from their real edge, including broad furniture and vehicle sides',()=>{
 const world=new World(),fridge=world.objects.find(o=>o.type==='fridge');
 const near={x:fridge.x+fridge.footprint.x+CONTAINER_REACH-.01,y:fridge.y},far={...near,x:near.x+.03};
 assert.equal(canInteract(world,near,fridge),true);assert.equal(canInteract(world,far,fridge),false);assert.equal(canInteract(world,far,fridge,100),false,'callers cannot bypass the physical maximum');
 const car=world.vehicles[0],point={x:car.x+.47+.2,y:car.y};assert.ok(interactionDistance(point,car)<CONTAINER_REACH);assert.equal(canInteract(world,point,car),true);
 const item=createItem('apple'),container={type:'groundloot',x:10,y:10,items:[item]},player=createPlayer();let toasts=0;
 const game={world,player,ui:{showToast(){toasts++;}}};takeItem(game,container,item.id);assert.equal(container.items.length,1);assert.equal(toasts,1,'an old open panel cannot take remote loot');
});

test('all furnished rooms, mission objects and outdoor storage remain reachable at the new physical range',()=>{
 const world=new World(),player=createPlayer();assert.ok(world.objects.filter(o=>o.type==='furniture').length>=60);
 for(const door of world.objects.filter(o=>o.type==='door')){door.closed=false;door.solid=false;door.locked=false;}world.touchSight();
 for(const building of world.buildings){const furniture=world.objects.filter(o=>o.type==='furniture'&&o.building===building.id);assert.ok(furniture.length>=10,building.name);for(const object of furniture){const size=furnishingDimensions(object);assert.ok(size&&object.lootable===true||object.modelAsset.startsWith('Carpet'));}}
 for(const object of world.objects.filter(o=>o.interactable)){
  const path=pathToPlayerInteraction(world,player,object,{allowDoors:true});assert.ok(path.length,object.name);
  let previous=player;for(const point of path){assert.ok(playerSegmentClear(world,previous,point,{allowDoors:true}),object.name);previous=point;}
  assert.ok(canInteract(world,path.at(-1),object),object.name);
 }
});

test('real melee events use the authored punch and weapon clips; crouch switches to its own idle and walking clips',()=>{
 const player=createPlayer(),motion=new PlayerMotion(),combat=new CombatSystem();let time=0;motion.sample(player,time);
 const game={player,world:{emitNoise(){}},sound(){}};combat.beginMelee(game,{id:'target'},null,null);assert.equal(motion.sample(player,time+=.01).clip,'Punch_Right');
 const knife=createItem('kitchen_knife');addItem(player,knife);equipItem(player,knife.id);player.combat.attackTimer=0;motion.sample(player,time+=2);combat.beginMelee(game,{id:'target'},knife,null);assert.equal(motion.sample(player,time+=.01).clip,'Sword_Slash');
 player.combat.attackTimer=0;player.stance='sneak';assert.equal(motion.sample(player,time+=2).clip,'Crouch_Idle');player.moving=true;assert.equal(motion.sample(player,time+=.01).clip,'Crouch_Walk');player.running=true;assert.equal(motion.sample(player,time+=.01).clip,'Run');
});
