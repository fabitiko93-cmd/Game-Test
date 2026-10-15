import assert from "node:assert/strict";
import test from "node:test";
import { World } from "../docs/src/world.js";
import { Game } from "../docs/src/game.js";
import { createPlayer } from "../docs/src/character.js";
import { createZombie, ZombieSystem } from "../docs/src/ai.js";
import { Navigator } from "../docs/src/navigation.js";
import { findPlayerPath, pathToPlayerInteraction, playerSegmentClear } from "../docs/src/player-navigation.js";
import { zombieBodyRadius, separateZombieBodies } from "../docs/src/zombie-collision.js";
import { BUILDING_SCALE, buildingBounds, doorGeometry } from "../docs/src/building-geometry.js";
import { heightPixels, PLAYER_BODY_RADIUS, tilesToMeters, WORLD_SCALE } from "../docs/src/world-scale.js";
import { VisionGeometry } from "../docs/src/vision-geometry.js";
import { Renderer } from "../docs/src/render.js";
import { canInteract } from "../docs/src/interaction.js";

const distance = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
const routeClear = (world,start,path,options={}) => {
  assert.ok(path.length, "destination must have a route");
  for (const point of path) { assert.ok(playerSegmentClear(world,start,point,options)); start=point; }
};

test("buildings have continuous thin walls, a fitted door and solid jambs in all four orientations", () => {
  for (const side of ["north","south","west","east"]) {
    const world=new World(); world.objects=[]; world.objectGrid.clear(); world.vehicles=[]; world.vehicleCollisionCells.clear();
    const doorPoint={north:{x:10,y:10},south:{x:10,y:14},west:{x:8,y:12},east:{x:12,y:12}}[side];
    const building={id:"measured",x:8,y:10,w:5,h:5,floor:"floor",door:doorPoint,wall:"#777"};
    world.addBuilding(building);
    const door=world.objects.find(o=>o.type==="door"), shape=doorGeometry(door);
    const horizontal=side==="north"||side==="south";
    const a={x:door.x+(horizontal?0:-1),y:door.y+(horizontal?-1:0)};
    const b={x:door.x+(horizontal?0:1),y:door.y+(horizontal?1:0)};
    assert.equal(tilesToMeters(shape.width),.86);
    assert.ok(PLAYER_BODY_RADIUS*2<shape.width);
    assert.equal(world.canWalkSegment(a,b),false); assert.equal(world.hasLineOfSight(a,b),false);
    door.closed=false;door.solid=false;door.blocksSight=false;world.touchSight();
    assert.equal(world.canWalkSegment(a,b),true); assert.equal(world.hasLineOfSight(a,b),true);
    const offset=shape.width/2+.01;
    const sideA={x:a.x+(horizontal?offset:0),y:a.y+(horizontal?0:offset)};
    const sideB={x:b.x+(horizontal?offset:0),y:b.y+(horizontal?0:offset)};
    assert.equal(world.canWalkSegment(sideA,sideB),false,"opening a door never removes its frame");
    assert.equal(world.hasLineOfSight(sideA,sideB),false,"sight must not leak through the jamb");
    for(const wall of world.objects.filter(o=>o.type==="wall"&&o.part!=="jamb")) {
      assert.ok(Math.abs(tilesToMeters(Math.min(wall.footprint.x,wall.footprint.y)*2)-.24)<1e-9);
      assert.equal(wall.heightMeters,2.7);
    }
    const ray=new VisionGeometry().polygon(world,a,Math.atan2(b.y-a.y,b.x-a.x),4,.25);
    assert.ok(ray.some(point=>distance(point,a)>3.5),"the displayed cone also passes through the open leaf width");
  }
});

test("player routes and real zombie movement pass every actual building entrance", () => {
  for (const building of new World().buildings) {
    const world=new World(), door=world.objects.find(o=>o.id===world.buildings.find(b=>b.id===building.id).doorId);
    door.closed=false;door.solid=false;door.blocksSight=false;door.locked=false;world.touchSight();
    const inward=door.side==="north"?1:-1, start={x:door.x,y:door.y-inward}, end={x:door.x,y:door.y+inward};
    routeClear(world,start,findPlayerPath(world,start,end));
    const zombie=createZombie(start.x,start.y,0,"door-walker"), navigator=new Navigator();
    Object.assign(zombie,{state:"search",stateTimer:1000,target:end});
    const game=Object.create(Game.prototype);
    Object.assign(game,{world,player:createPlayer(),zombies:[zombie],navigator});
    const system=new ZombieSystem(navigator);
    for(let frame=0;frame<60*10;frame++) {
      zombie.repathTimer-=1/60; system.updateMovement(zombie,game,1/60);
      assert.ok(world.isWalkable(zombie.x,zombie.y,zombieBodyRadius(zombie)));
    }
    assert.ok(distance(zombie,end)<.21,`${building.id}: zombie must get through the fitted door`);
  }
});

test("the roomier fresh map keeps all mission containers reachable and entrances at their established locations", () => {
  const world=new World(), start=createPlayer();
  assert.ok(world.isWalkable(start.x,start.y)); assert.equal(world.insideBuilding(start)?.id,"safehouse");
  const safe=world.buildings.find(b=>b.id==="safehouse"), bounds=buildingBounds(safe);
  assert.ok(Math.abs(tilesToMeters(bounds.maxX-bounds.minX)-10.24)<1e-9);
  assert.ok(Math.abs(tilesToMeters(bounds.maxY-bounds.minY)-12.24)<1e-9);
  for(const door of world.objects.filter(o=>o.type==="door")) {door.locked=false;door.closed=false;door.solid=false;door.blocksSight=false;}
  world.touchSight();
  for(const name of ["KÜCHENSCHRANK","KÜHLSCHRANK","KOFFERRADIO","DIENSTSCHREIBTISCH","GESICHERTER WAFFENSCHRANK","MEDIKAMENTENSCHRANK"]) {
    const object=world.objects.find(o=>o.name===name);
    assert.ok(world.insideBuilding(object),`${name}: furniture remains inside a building`);
    const path=pathToPlayerInteraction(world,start,object,{allowDoors:true});
    routeClear(world,start,path,{allowDoors:true}); assert.ok(canInteract(world,path.at(-1),object),name);
  }
});

test("rendered door leaf, header and lintel share the exact wall and door heights", () => {
  const renderer=Object.create(Renderer.prototype), calls=[];
  renderer.drawBlock=(...args)=>calls.push(args);renderer.iso=()=>({x:0,y:0});renderer.ctx={fillRect(){}};
  for(const orientation of ["x","y"])for(const closed of [true,false]) {
    calls.length=0;renderer.drawDoor({x:10,y:10,orientation,side:"north",closed});
    const [lintel,header,leaf]=calls;
    assert.ok(Math.abs(lintel[4]+lintel[6]-heightPixels(2.7))<1e-8);
    assert.equal(header[6],heightPixels(WORLD_SCALE.door.height));
    assert.equal(leaf[4],heightPixels(WORLD_SCALE.door.height));
    assert.equal(Math.max(leaf[2],leaf[3]),WORLD_SCALE.door.width/WORLD_SCALE.metersPerTile);
    assert.equal(BUILDING_SCALE.floorGrid,.5);
  }
});

test("thin-wall neighbors can see and navigate along the wall without occupying its whole terrain cell", () => {
  const world=new World(), a={x:6.7,y:34.7}, b={x:9.2,y:34.7};
  assert.equal(world.hasLineOfSight(a,b),true);
  const start={x:7.1,y:34.75}, target={x:10.5,y:33};
  assert.ok(world.isWalkable(start.x,start.y,.15));
  const path=new Navigator().findPath(world,start,target,{radius:.15});
  assert.ok(path.length);
  let previous=start;
  for(const point of path) {assert.ok(world.canWalkSegment(previous,point,.15));previous=point;}
  assert.equal(world.hasLineOfSight({x:7,y:34.7},{x:7,y:35.3}),false);
});

test("a zombie crowd queues through an 86 cm entrance without overlapping bodies or crossing its jambs", () => {
  for (const fps of [30,60]) {
  const world=new World(); world.objects=[];world.objectGrid.clear();world.vehicles=[];world.vehicleCollisionCells.clear();
  world.tiles=Array.from({length:48},()=>Array(48).fill("grass"));
  world.addBuilding({id:"queue",x:8,y:10,w:5,h:5,floor:"floor",door:{x:10,y:10},wall:"#777"});
  const door=world.objects.find(o=>o.type==="door");door.closed=false;door.solid=false;door.blocksSight=false;world.touchSight();
  const navigator=new Navigator(), system=new ZombieSystem(navigator), game=Object.create(Game.prototype);
  Object.assign(game,{world,player:createPlayer(),navigator,zombies:[]});
  for(let row=0;row<3;row++)for(let column=0;column<3;column++) {
    const z=createZombie(9.5+column*.5,8-row*.5,row*3+column,`entrance-${row}-${column}`);
    Object.assign(z,{state:"search",stateTimer:1000,target:{x:9.5+column*.5,y:12+row*.4}});game.zombies.push(z);
  }
  for(let frame=0;frame<fps*30;frame++) {
    for(const z of game.zombies) {z.repathTimer-=1/fps;system.updateMovement(z,game,1/fps);}
    separateZombieBodies(game,1/fps);
    for(let i=0;i<game.zombies.length;i++) {
      const a=game.zombies[i];assert.ok(world.isWalkable(a.x,a.y,zombieBodyRadius(a)));
      for(const b of game.zombies.slice(i+1))assert.ok(distance(a,b)>=zombieBodyRadius(a)+zombieBodyRadius(b)-.000003);
    }
  }
  assert.ok(game.zombies.filter(z=>z.y>10.3).length>=6,"the doorway must flow rather than permanently jam");
  }
});
