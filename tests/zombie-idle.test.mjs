import assert from "node:assert/strict";
import { test } from "node:test";
import { Game } from "../docs/src/game.js";
import { World } from "../docs/src/world.js";
import { CoverMap } from "../docs/src/cover.js";
import { createPlayer } from "../docs/src/character.js";
import { createZombie, createInitialZombies, ZombieSystem } from "../docs/src/ai.js";
import { ZOMBIE_IDLE } from "../docs/src/zombie-idle.js";
import { Navigator } from "../docs/src/navigation.js";
import { StealthSystem } from "../docs/src/stealth.js";
import { CombatSystem } from "../docs/src/combat.js";
import { SaveStore } from "../docs/src/save.js";
import { visionExposure } from "../docs/src/perception.js";

const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
function fixture(random = () => .5) {
  const world = new World(), navigator = new Navigator(), game = Object.create(Game.prototype);
  world.objects = []; world.objectGrid.clear(); world.vehicles = []; world.vehicleCollisionCells.clear();
  world.tiles = Array.from({ length: 48 }, () => Array(48).fill("grass")); world.coverMap = new CoverMap(world);
  Object.assign(game, { world, navigator, random, player: createPlayer(), zombies: [createZombie(20, 20)],
    zombieSystem: new ZombieSystem(navigator), stealth: new StealthSystem(), combat: new CombatSystem(),
    minutes: 700, elapsed: 0, started: true, mission: 0, survivorCount: 1, migrationTimer: 78,
    renderer: {}, ui: { showToast() {} }, onZombieAttack() {} });
  Object.assign(game.player, { x: 44, y: 44, dead: true });
  return game;
}
function tick(game, count = 1) {
  for (let i = 0; i < count; i++) {
    game.elapsed += .05; game.world.update(.05); game.zombieSystem.update(game, .05);
  }
}
function until(game, accept, maximum = 700) {
  for (let i = 0; i < maximum && !accept(); i++) tick(game);
  assert.ok(accept(), "the ambient cycle must make progress");
}

test("unalert zombies stand through a full rest instead of changing destinations every few seconds", () => {
  const game = fixture(), z = game.zombies[0], start = { x: z.x, y: z.y };
  tick(game, 119);
  assert.equal(z.state, "idle"); assert.equal(z.idleBehavior.phase, "pause");
  assert.deepEqual({ x: z.x, y: z.y }, start); assert.equal(z.target, null); assert.equal(z.moving, false);
  until(game, () => z.idleBehavior.phase !== "pause");
  assert.ok(game.elapsed >= 6 && game.elapsed <= 14);
});

test("a short shuffle finishes at its original goal and is followed by a new complete rest", () => {
  const game = fixture(), z = game.zombies[0], start = { x: z.x, y: z.y };
  until(game, () => z.idleBehavior?.phase === "turn");
  const goal = { ...z.target };
  assert.ok(d(start, goal) >= .5 && d(start, goal) <= 1.5);
  let walked = 0;
  while (z.idleBehavior.phase !== "pause") {
    const previous = { x: z.x, y: z.y }; tick(game);
    const amount = d(previous, z); walked += amount;
    assert.ok(amount <= .2 * .05 + .000001, "idle steps retain the slower speed");
    if (z.idleBehavior.phase !== "pause") assert.deepEqual(z.target, goal, "never replace an unfinished ambient goal");
  }
  assert.ok(d(z, goal) < .003); assert.ok(Math.abs(walked - d(start, goal)) < .01);
  assert.ok(z.idleBehavior.remaining >= 6 && z.idleBehavior.remaining <= 14);
  const end = { x: z.x, y: z.y }; tick(game, 119);
  assert.deepEqual({ x: z.x, y: z.y }, end);
});

test("small resting glances happen once and a zombie turns before moving off", () => {
  const game = fixture(() => .9), z = game.zombies[0], initial = Math.atan2(z.facingY, z.facingX);
  tick(game);
  until(game, () => z.idleBehavior.looked === true);
  tick(game, 20);
  assert.ok(Math.abs(Math.atan2(z.facingY, z.facingX) - initial) <= ZOMBIE_IDLE.lookAngle + .000001);
  const desired = { x: z.desiredFacingX, y: z.desiredFacingY }; tick(game, 20);
  assert.deepEqual({ x: z.desiredFacingX, y: z.desiredFacingY }, desired);
  until(game, () => z.idleBehavior.phase === "turn");
  const start = { x: z.x, y: z.y }; tick(game);
  if (z.idleBehavior.phase === "turn") assert.deepEqual({ x: z.x, y: z.y }, start);
  until(game, () => z.idleBehavior.phase === "walk");
  const dot = z.facingX * z.desiredFacingX + z.facingY * z.desiredFacingY;
  assert.ok(dot >= Math.cos(.3) - .000001);
});

test("blocked ambient routes pause without pathfinding thrash or wall clipping", () => {
  const game = fixture(), z = game.zombies[0], start = { x: z.x, y: z.y };
  game.world.addObject("wall", 19.5, 20, { solid: true, blocksSight: true });
  let routes = 0; const findPath = game.navigator.findPath.bind(game.navigator);
  game.navigator.findPath = (...args) => { routes++; return findPath(...args); };
  tick(game, 600);
  assert.deepEqual({ x: z.x, y: z.y }, start); assert.equal(routes, 0); assert.equal(z.target, null);
  assert.equal(z.idleBehavior.phase, "pause");
});

test("closing a route during a shuffle stops it rather than choosing a distant detour", () => {
  const game = fixture(), z = game.zombies[0];
  until(game, () => z.idleBehavior?.phase === "walk");
  const start = { x: z.x, y: z.y }, goal = { ...z.target };
  game.world.addObject("door", goal.x, goal.y, { solid: true, closed: true }); tick(game);
  assert.deepEqual({ x: z.x, y: z.y }, start); assert.equal(z.idleBehavior.phase, "pause");
  assert.equal(z.target, null);
});

test("noise and visible danger interrupt rest immediately without a grace period", () => {
  const game = fixture(), z = game.zombies[0]; tick(game);
  game.world.emitNoise(21, 20, 4, "step", 1, .8); tick(game);
  assert.equal(z.state, "investigate"); assert.equal(z.stimulus, "sound");
  assert.equal(z.idleBehavior, null); assert.deepEqual(z.lastSeen, { x: 21, y: 20 });
  const fresh = fixture(), watcher = fresh.zombies[0]; tick(fresh);
  Object.assign(fresh.player, { x: 20, y: 22, dead: false }); watcher.awareness = .999; tick(fresh);
  assert.equal(watcher.state, "chase"); assert.equal(watcher.idleBehavior, null);
  assert.deepEqual(watcher.target, { x: 20, y: 22 });
});

test("active search, investigation and chase keep their movement and turn rates", () => {
  for (const [state, speed, turnRate] of [["investigate", .82, 3.6], ["search", .58, 3.6], ["chase", 1.1, 5.2]]) {
    const game = fixture(), z = game.zombies[0];
    Object.assign(z, { state, target: { x: 20, y: 22 }, path: [{ x: 20, y: 22 }], repathTimer: 1,
      facingX: 1, facingY: 0, desiredFacingX: 0, desiredFacingY: 1 });
    game.zombieSystem.updateFacing(z, .1);
    assert.ok(Math.abs(Math.atan2(z.facingY, z.facingX) - turnRate * .1) < .000001);
    game.zombieSystem.updateMovement(z, game, .1);
    assert.ok(Math.abs(d({ x: 20, y: 20 }, z) - speed * .1) < .000001);
    assert.equal(z.idleBehavior, null);
  }
});

test("idle turns and vision agree on a horizontal heading without jitter", () => {
  const game = fixture(), z = game.zombies[0];
  Object.assign(z, { facingX: 1, facingY: 0, desiredFacingX: 1, desiredFacingY: 0 });
  for (let i = 0; i < 10; i++) game.zombieSystem.updateFacing(z, .05);
  assert.equal(z.facingX, 1); assert.equal(z.facingY, 0);
  Object.assign(game.player, { x: 22, y: 20, dead: false });
  assert.ok(visionExposure(z, game.player, game.world, 700) > 0);
  game.player.x = 20; game.player.y = 22;
  assert.equal(visionExposure(z, game.player, game.world, 700), 0);
});

test("legacy idle routes convert in place and modern rest/shuffle phases survive save/load", () => {
  const game = fixture(), z = game.zombies[0];
  Object.assign(z, { target: { x: 24, y: 16 }, path: [{ x: 24, y: 16 }], stateTime: 250 });
  delete z.idleBehavior;
  const start = { x: z.x, y: z.y }; tick(game);
  assert.deepEqual({ x: z.x, y: z.y }, start); assert.equal(z.target, null);
  const storage = { data: null, getItem() { return this.data; }, setItem(key, value) { this.data = value; } };
  game.saveStore = new SaveStore(storage);
  // Keep this isolated collision scene while exercising the actual Game save/load API.
  game.world.reset = () => {};
  for (const phase of ["pause", "walk"]) {
    if (phase === "walk") until(game, () => game.zombies[0].idleBehavior.phase === "walk");
    game.save(); const saved = structuredClone(game.zombies[0].idleBehavior);
    assert.equal(game.load(), true); assert.deepEqual(game.zombies[0].idleBehavior, saved);
    const restored = game.zombies[0], previous = { x: restored.x, y: restored.y }; tick(game);
    assert.equal(restored.idleBehavior.phase, phase);
    assert.equal(d(previous, restored) > 0, phase === "walk");
  }
});

test("the initial population has varied rests and spends most unalert time standing", () => {
  let seed = 981013;
  const game = fixture(() => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296));
  game.zombies = createInitialZombies(); tick(game);
  assert.equal(game.zombies.length, 18);
  assert.ok(new Set(game.zombies.map(z => z.idleBehavior.remaining.toFixed(1))).size >= 8);
  let samples = 0, stationary = 0;
  for (let i = 0; i < 1200; i++) {
    tick(game);
    for (const z of game.zombies) { samples++; if (!z.moving) stationary++; }
  }
  assert.ok(stationary / samples > .65, `most time is stationary: ${stationary / samples}`);
  assert.ok(game.zombies.every(z => d(z, { x: z.spawnX, y: z.spawnY }) <= ZOMBIE_IDLE.roamRadius + .00001));
});
