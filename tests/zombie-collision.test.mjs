import assert from "node:assert/strict";
import { test } from "node:test";
import { Game } from "../docs/src/game.js";
import { World } from "../docs/src/world.js";
import { CoverMap } from "../docs/src/cover.js";
import { createPlayer } from "../docs/src/character.js";
import { createZombie, createInitialZombies, ZombieSystem } from "../docs/src/ai.js";
import { Navigator } from "../docs/src/navigation.js";
import { PlayerVisibility, PLAYER_VIEW } from "../docs/src/player-visibility.js";
import { ZOMBIE_BODY, zombieBodyRadius, separateZombieBodies } from "../docs/src/zombie-collision.js";
import { metersToTiles } from "../docs/src/world-scale.js";
import { mulberry32 } from "../docs/src/util.js";

const distance = (a, b) => Math.hypot(a.x-b.x, a.y-b.y);
function fixture() {
  const world = new World(), navigator = new Navigator(), game = Object.create(Game.prototype);
  world.objects = []; world.objectGrid.clear(); world.vehicles = []; world.vehicleCollisionCells.clear();
  world.tiles = Array.from({ length: 48 }, () => Array(48).fill("grass")); world.coverMap = new CoverMap(world);
  Object.assign(game, { world, navigator, zombies: [], zombieSystem: new ZombieSystem(navigator),
    player: createPlayer(), playerVisibility: new PlayerVisibility(), elapsed: 0, minutes: 700,
    random: () => .75, onZombieAttack() {} });
  Object.assign(game.player, { x: 44, y: 44, dead: true });
  return game;
}
function add(game, x, y, target) {
  const zombie = createZombie(x, y, game.zombies.length, `crowd-${game.zombies.length}`);
  if (target) Object.assign(zombie, { state: "search", stateTimer: 1000, target });
  game.zombies.push(zombie); return zombie;
}
function assertBodies(game, tolerance = .000003) {
  const active = game.zombies.filter(zombie => !zombie.removed);
  for (let i = 0; i < active.length; i++) {
    assert.ok(game.world.isWalkable(active[i].x, active[i].y, zombieBodyRadius(active[i])), "body must remain outside solid scenery");
    for (let j = i+1; j < active.length; j++) {
      assert.ok(distance(active[i], active[j]) >= zombieBodyRadius(active[i])+zombieBodyRadius(active[j])-tolerance,
        `${active[i].id}/${active[j].id} must have separate physical bodies`);
    }
  }
}
function moveTick(game, delta) {
  game.elapsed += delta;
  for (const zombie of game.zombies) {
    zombie.repathTimer -= delta;
    game.zombieSystem.updateMovement(zombie, game, delta);
  }
  separateZombieBodies(game, delta);
}

test("opposing zombies sidestep and pass without crossing bodies at 30/60 Hz", () => {
  for (const fps of [30, 60]) {
    const game = fixture(), a = add(game, 20, 20, { x: 23, y: 20 }),
      b = add(game, 22, 20, { x: 19, y: 20 });
    for (let frame = 0; frame < fps*10; frame++) { moveTick(game, 1/fps); assertBodies(game); }
    assert.ok(a.x > 22.5 && b.x < 19.5, "both directions must make progress, without a permanent head-on jam");
  }
});

test("a converging crowd stays distinct and passes a one-cell doorway", () => {
  const game = fixture();
  for (let x = 14; x <= 26; x++) if (x !== 20) game.world.addObject("wall", x, 18, { solid: true });
  for (let row = 0; row < 4; row++) for (let column = 0; column < 3; column++)
    add(game, 19.55+column*.45, 20+row*.45, { x: 20, y: 14 });
  for (let frame = 0; frame < 60*30; frame++) { moveTick(game, 1/60); assertBodies(game); }
  assert.ok(game.zombies.filter(zombie => zombie.y < 17.7).length >= 8,
    "the crowd must queue/flow through the gap rather than merge or stay stuck outside");
});

test("swept contacts reject tunneling, corpses release space and player movement stays unchanged", () => {
  const game = fixture(), blocker = add(game, 21, 20), mover = add(game, 20, 20);
  // A narrow corridor prevents a legitimate detour around the standing body.
  for (let x = 19; x <= 23; x++) for (const y of [19, 21])
    game.world.addObject("wall", x, y, { solid: true });
  game.moveEntity(mover, 2, 0, .25);
  assert.ok(mover.x < blocker.x, "even a long request cannot teleport through a body"); assertBodies(game);
  Object.assign(mover, { x: 20, y: 20 }); blocker.removed = true;
  game.moveEntity(mover, 2, 0, .25); assert.equal(mover.x, 22);
  Object.assign(game.player, { x: 21, y: 20 });
  game.moveEntity(game.player, 1, 0, .27); assert.equal(game.player.x, 22);
});

test("the full live population forms a solid crowd around a visible player", () => {
  for (const fps of [30, 60]) {
    const game = fixture(); Object.assign(game.player, { x: 24, y: 24, dead: false });
    for (let i = 0; i < 20; i++) {
      const angle = i/20*Math.PI*2;
      const zombie = add(game, 24+Math.cos(angle)*2.5, 24+Math.sin(angle)*2.5, { x: 24, y: 24 });
      Object.assign(zombie, { state: "chase", awareness: 1, stateTimer: 1000,
        facingX: -Math.cos(angle), facingY: -Math.sin(angle),
        desiredFacingX: -Math.cos(angle), desiredFacingY: -Math.sin(angle) });
    }
    for (let i = 0; i < fps*12; i++) { game.zombieSystem.update(game, 1/fps); assertBodies(game); }
    assert.ok(game.zombies.filter(zombie => distance(zombie, game.player) < 1.5).length >= 16);
  }
});

test("old stacked bodies separate gently without being pushed through walls or vehicles", () => {
  for (const obstacle of [null, "wall", "car"]) {
    const game = fixture();
    if (obstacle) game.world.addObject(obstacle, 18, 20, { solid: true, orientation: "x" });
    const startX = obstacle === "car" ? 20 : obstacle === "wall" ? 18.8 : 20;
    for (let i = 0; i < 8; i++) add(game, startX, 20);
    const delta = 1/60, limit = metersToTiles(ZOMBIE_BODY.recoveryMetersPerSecond)*delta;
    for (let frame = 0; frame < 60*8; frame++) {
      const previous = game.zombies.map(zombie => ({ x: zombie.x, y: zombie.y }));
      separateZombieBodies(game, delta);
      for (let i = 0; i < previous.length; i++) {
        assert.ok(distance(previous[i], game.zombies[i]) <= limit+.000001, "legacy corrections must not pop or accelerate bodies");
        assert.ok(game.world.isWalkable(game.zombies[i].x, game.zombies[i].y, zombieBodyRadius(game.zombies[i])));
      }
    }
    assertBodies(game, .001);
  }
});

test("visible lower-left migrant spawns are rejected even with a panned camera", () => {
  const game = fixture(); Object.assign(game.player, { x: 8, y: 36 });
  // random .75 selects west, y=34: the old routine spawned (1,34) in plain sight.
  assert.equal(game.playerVisibility.canSee({ x: 1, y: 34 }, game.player), true);
  game.renderer = { cameraFollowing: false, camera: { x: 5000, y: 5000 } };
  assert.equal(game.zombieSystem.spawnMigrant(game), null);
  assert.equal(game.zombies.length, 0);
});

test("unseen migrants walk inward calmly and respond only to actual stimuli", () => {
  const game = fixture(); Object.assign(game.player, { x: 24, y: 24 });
  const zombie = game.zombieSystem.spawnMigrant(game);
  assert.ok(zombie); assert.ok(distance(zombie, game.player) > PLAYER_VIEW.radius+2);
  assert.equal(zombie.state, "idle"); assert.equal(zombie.awareness, 0);
  assert.equal(zombie.lastSeen, null); assert.equal(zombie.stimulus, null);
  assert.ok(zombie.migrationTarget.x > zombie.x);
  const start = { x: zombie.x, y: zombie.y };
  for (let i = 0; i < 60; i++) game.zombieSystem.update(game, 1/60);
  assert.equal(zombie.state, "idle"); assert.ok(distance(zombie, start) > .1);
  game.world.emitNoise(zombie.x+2, zombie.y, 4, "impact", 2, 1);
  game.zombieSystem.update(game, 1/60);
  assert.equal(zombie.state, "investigate"); assert.equal(zombie.stimulus, "sound");
  assert.equal(zombie.migrationTarget, null);
});

test("migrants choose a new local home after arrival and never spawn inside an occupied body", () => {
  const game = fixture(); Object.assign(game.player, { x: 24, y: 24 });
  const zombie = game.zombieSystem.spawnMigrant(game), goal = { ...zombie.migrationTarget };
  for (let i = 0; i < 60*120 && zombie.migrationTarget; i++) game.zombieSystem.update(game, 1/60);
  assert.equal(zombie.migrationTarget, null); assert.equal(zombie.state, "idle");
  assert.ok(distance(zombie, goal) < .21);
  assert.ok(distance({ x: zombie.spawnX, y: zombie.spawnY }, goal) < .21);
  Object.assign(zombie, { x: 1, y: 34 });
  assert.equal(game.zombieSystem.spawnMigrant(game), null);
});

test("real map migration still finds unseen reachable edges without changing population limits", () => {
  for (const player of [{ x: 8, y: 36 }, { x: 24, y: 24 }, { x: 1, y: 34 }, { x: 46, y: 46 }]) {
    const game = fixture(); game.world = new World(); game.zombies = createInitialZombies();
    Object.assign(game.player, player); game.random = mulberry32(98015);
    const migrant = game.zombieSystem.spawnMigrant(game);
    assert.ok(migrant, "migration must keep working on the actual map's water, cars and buildings");
    assert.equal(game.playerVisibility.canSee(migrant, game.player), false);
    assert.ok(game.world.isWalkable(migrant.x, migrant.y, .25));
    assert.ok(migrant.path.length);
    game.zombies.push(createZombie(30, 30));
    const population = game.zombies.length;
    game.migrationTimer = 0; game.updateMigration(.1);
    assert.equal(game.zombies.length, population, "existing twenty-zombie cap must remain in effect");
  }
});
