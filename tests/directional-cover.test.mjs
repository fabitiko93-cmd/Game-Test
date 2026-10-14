import assert from "node:assert/strict";
import { test } from "node:test";
import { World } from "../docs/src/world.js";
import { CoverMap, COVER_RULES } from "../docs/src/cover.js";
import { createPlayer } from "../docs/src/character.js";
import { StealthSystem } from "../docs/src/stealth.js";
import { createZombie, ZombieSystem } from "../docs/src/ai.js";
import { Navigator } from "../docs/src/navigation.js";
import { coverAwareExposure, ensureSightMemory } from "../docs/src/cover-awareness.js";
import { coverSegmentSafe, hiddenFrom } from "../docs/src/cover-protection.js";
import { visionExposure } from "../docs/src/perception.js";
import { playerStatusIcons } from "../docs/src/status-icons.js";
import { buildCoverDisplay, coverDisplayPaths, COVER_DISPLAY_STEP } from "../docs/src/cover-display.js";
import { addItem, createItem, equipItem } from "../docs/src/inventory.js";

function fixture() {
  const world = new World();
  world.objects = []; world.objectGrid.clear(); world.vehicles = []; world.vehicleCollisionCells.clear();
  world.tiles = Array.from({ length: 48 }, () => Array(48).fill("grass")); world.coverMap = new CoverMap(world);
  const player = createPlayer({ background: "citizen" }); Object.assign(player, { x: 10, y: 9, stance: "sneak" });
  const game = { world, player, zombies: [], minutes: 800, stealth: new StealthSystem() };
  return game;
}
function wall(game, first = 9, last = 15) {
  for (let x = first; x <= last; x++) game.world.addObject("wall", x, 10,
    { solid: true, blocksSight: true, cover: .58, building: "test", side: "north" });
}
function watcher(game, x, y) {
  const z = createZombie(x, y); const dx = game.player.x - x, dy = game.player.y - y, d = Math.hypot(dx,dy);
  Object.assign(z, { facingX: dx/d, facingY: dy/d }); game.zombies.push(z); return z;
}

test("a wall protects the opposite observer but grants no hide/reduced visibility on its own side", () => {
  const game = fixture(); wall(game);
  const front = watcher(game,10,6), opposite = watcher(game,10,14); game.stealth.refresh(game);
  assert.equal(game.world.hasLineOfSight(front,game.player),true);
  assert.equal(game.world.coverMap.at(game.player,null,front),null);
  assert.equal(game.world.concealmentAt(game.player,front),0);
  const baseline = visionExposure(front,game.player,game.world,game.minutes,true);
  assert.equal(visionExposure(front,game.player,game.world,game.minutes),baseline);
  assert.ok(baseline>0); assert.equal(coverAwareExposure(front,game,.1),baseline);
  assert.equal(front.sightMemory.visible,true);
  assert.equal(coverAwareExposure(opposite,game,.1),0);
  assert.equal(game.world.coverMap.at(game.player,null,opposite)?.kind,"occlusion");
  assert.equal(playerStatusIcons(game)[0].id,"shield");
  assert.equal(game.stealth.coverStatus(game).directional,true);
});

test("both car orientations use their actual blocking footprint per observer", () => {
  for (const orientation of ["x","y"]) {
    const game=fixture();
    game.world.addObject("car",10,10,{solid:true,blocksSight:true,cover:.56,orientation});
    Object.assign(game.player,orientation==="x"?{x:10,y:9}:{x:9,y:10});
    const front=watcher(game,orientation==="x"?10:6,orientation==="x"?6:10);
    const opposite=watcher(game,orientation==="x"?10:14,orientation==="x"?14:10);
    game.stealth.refresh(game);
    assert.ok(coverAwareExposure(front,game,.1)>0); assert.equal(coverAwareExposure(opposite,game,.1),0);
    assert.equal(hiddenFrom(game,front),false); assert.equal(hiddenFrom(game,opposite),true);
  }
});

test("vegetation retains immediate roundabout concealment and overrides a nearer wall", () => {
  const game=fixture(); wall(game); game.player.y=9.1;
  const tree=game.world.addObject("tree",10,8.2,{solid:true,blocksSight:true,cover:.68});
  const front=watcher(game,12,7); game.stealth.refresh(game);
  assert.equal(game.world.coverMap.at(game.player).sourceId,tree.id);
  assert.equal(game.player.stealthState.coverKind,"concealment");
  assert.equal(coverAwareExposure(front,game,.1),0); assert.equal(playerStatusIcons(game)[0].id,"hide");
  const open=fixture(), source=open.world.addObject("tree",20,20,{solid:true,cover:.68,blocksSight:true});
  for(let i=0;i<24;i++) {
    Object.assign(open.player,{x:20+Math.cos(i*Math.PI/12)*.9,y:20+Math.sin(i*Math.PI/12)*.9});
    open.stealth.refresh(open);
    assert.equal(open.world.coverMap.at(open.player)?.sourceId,source.id);
    assert.equal(open.player.stealthState.hidden,true);
    assert.equal(coverAwareExposure(watcher(open,open.player.x+2,open.player.y),open,.1),0);
  }
});

test("loss of sight anchors a wall search; other-side proximity cannot discover through it", () => {
  const game=fixture(); wall(game); const z=watcher(game,10,14);
  const memory=ensureSightMemory(z); memory.visible=true; z.lastSeen={x:9,y:11.5};
  game.stealth.refresh(game); coverAwareExposure(z,game,.1);
  assert.deepEqual(z.coverSearch.anchor,{x:9,y:11.5}); assert.equal(z.coverSearch.remaining,6.5);
  assert.equal(z.coverSearch.entered,false);
  z.coverSearch.entered=true; Object.assign(z,{x:10,y:10.8});
  assert.equal(coverAwareExposure(z,game,.1),0); assert.deepEqual(z.lastSeen,{x:9,y:11.5});
  Object.assign(z,{x:10,y:8.5,facingY:1});
  assert.ok(coverAwareExposure(z,game,.1)>0,"a close seeker on the player's side still discovers immediately");
  assert.equal(z.awareness,1);
});

test("leaving a wall shadow gets the established crouched recognition window, not permanent hide", () => {
  const game=fixture(); wall(game); const z=watcher(game,10,14);
  game.stealth.refresh(game); coverAwareExposure(z,game,.1);
  Object.assign(z,{x:10,y:6,facingX:0,facingY:1});
  for(let i=0;i<9;i++) assert.equal(coverAwareExposure(z,game,.1),0);
  assert.ok(coverAwareExposure(z,game,.11)>0); assert.equal(z.awareness,1);
  game.player.stance="walk"; game.stealth.refresh(game);
  assert.ok(coverAwareExposure(z,game,.1)>0);
});

test("execution eligibility and approach segments do not treat exposed wall strips as concealment", () => {
  const game=fixture(); wall(game); const z=watcher(game,10,7);
  const knife=createItem("kitchen_knife"); addItem(game.player,knife); equipItem(game.player,knife.id);
  game.combat={target:()=>z}; game.stealth.refresh(game);
  assert.equal(game.stealth.executionContext(game).actionable,false);
  assert.equal(coverSegmentSafe(game,z,{x:9.5,y:9},{x:10.5,y:9}),false);
  Object.assign(z,{x:10,y:14,facingY:-1});
  assert.equal(coverSegmentSafe(game,z,{x:9.5,y:9},{x:10.5,y:9}),true);
  Object.assign(z,{x:10,y:8,facingX:0,facingY:-1});
  assert.equal(hiddenFrom(game,z),true,"a genuine approach from behind remains possible");
  assert.equal(game.stealth.isExecutionReady(game,z),true);
});

test("wall collision is flat between segments and doors still leave real openings", () => {
  const game=fixture(); wall(game);
  for(let x=9.2;x<14.8;x+=.05) {
    assert.equal(game.world.isWalkable(x,9.23,.27),true);
    assert.equal(game.world.isWalkable(x,9.24,.27),false);
  }
  assert.equal(game.world.canWalkSegment({x:9.5,y:9.25},{x:14,y:9.25},.27),false);
  assert.equal(game.world.canWalkSegment({x:9.5,y:9.2},{x:14,y:9.2},.27),true);
  const door=fixture(); wall(door,9,9); wall(door,11,11);
  const source=door.world.addObject("door",10,10,{solid:true,closed:true,blocksSight:true,cover:.52});
  assert.equal(door.world.canWalkSegment({x:10,y:9},{x:10,y:11},.27),false);
  source.closed=false;source.solid=false;source.blocksSight=false;door.world.touchSight();
  assert.equal(door.world.canWalkSegment({x:10,y:9},{x:10,y:11},.27),true);
  assert.equal(door.world.coverMap.at({x:10,y:10}),null);
});

test("interpolated contours form smooth round tree rings and straight wall bands, including active areas", () => {
  const game=fixture(); const tree=game.world.addObject("tree",20,20,{solid:true,cover:.68});
  const surface=buildCoverDisplay(game.world,{x:20,y:20},tree.id), step=COVER_DISPLAY_STEP;
  assert.ok(surface.contours.length); assert.ok(surface.activeContours.length);
  assert.ok(surface.contours.some(edge=>edge.some(value=>Math.abs(value-Math.round(value))>.01)));
  for(const edge of surface.contours) for(const [x,y] of [[edge[0],edge[1]],[edge[2],edge[3]]]) {
    const radius=Math.hypot(x*step-20,y*step-20);
    assert.ok(Math.min(Math.abs(radius-.61),Math.abs(radius-(.34+COVER_RULES.margin)))<.008);
  }
  const wallGame=fixture(); wall(wallGame);
  const id=wallGame.world.coverMap.at(wallGame.player).id;
  const band=buildCoverDisplay(wallGame.world,{x:12,y:9},id);
  const flat=band.contours.flatMap(edge=>[[edge[0]*step,edge[1]*step],[edge[2]*step,edge[3]*step]])
    .filter(([x,y])=>x>10&&x<14&&y>9&&y<10);
  assert.ok(flat.length>10); assert.ok(flat.every(([,y])=>Math.abs(y-9.23)<1e-8));
  class Path { commands=[]; moveTo(...v){this.commands.push(["move",...v]);} lineTo(...v){this.commands.push(["line",...v]);} closePath(){this.commands.push(["close"]);} }
  const paths=coverDisplayPaths(surface,(x,y)=>({x,y}),Path);
  const areas=[];let loop=[];
  for(const command of paths.fill.commands) {
    if(command[0]==="move")loop=[command.slice(1)]; else if(command[0]==="line")loop.push(command.slice(1));
    else areas.push(loop.reduce((sum,p,i)=>{const q=loop[(i+1)%loop.length];return sum+p[0]*q[1]-q[0]*p[1];},0)/2);
  }
  assert.equal(areas.length,2); assert.ok(areas[0]*areas[1]<0,"the solid trunk is a hole, not filled cover");
});

test("noise bonus, perk duration/cooldown and nearby player visibility remain unchanged", () => {
  const game=fixture(); wall(game); watcher(game,10,6); game.stealth.refresh(game);
  assert.equal(game.stealth.hiddenNoiseMultiplier(game.player),.5);
  game.player.background="burglar"; game.player.perks={openfieldStealth:true};
  game.ui={showToast(){}}; game.stealth.activateOpenfield(game);
  assert.equal(game.player.stealthState.openfieldRemaining,10);
  assert.equal(game.player.stealthState.openfieldCooldown,30);
  assert.equal(playerStatusIcons(game)[0].id,"hide");
});

test("sound originating inside a closed door still contaminates that cover with the existing search timer", () => {
  const game=fixture();
  const door=game.world.addObject("door",20,20,{solid:true,closed:true,blocksSight:true,cover:.52});
  const z=watcher(game,20,18);
  game.world.emitNoise(20,20,5.4,"door",2.4);
  new ZombieSystem(new Navigator()).updateHearing(z,game);
  assert.equal(z.coverSearch.coverId,door.id); assert.equal(z.coverSearch.remaining,5.5);
  assert.deepEqual(z.coverSearch.anchor,{x:20,y:20});
});
