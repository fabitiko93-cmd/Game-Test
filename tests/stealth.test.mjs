import assert from "node:assert/strict";
import { World } from "../docs/src/world.js";
import { CoverMap } from "../docs/src/cover.js";
import { Game } from "../docs/src/game.js";
import { createPlayer, inflictZombieAttack } from "../docs/src/character.js";
import { StealthSystem, ensureStealthState } from "../docs/src/stealth.js";
import { ZombieSystem, createZombie } from "../docs/src/ai.js";
import { Navigator } from "../docs/src/navigation.js";
import { CombatSystem } from "../docs/src/combat.js";
import { coverAwareExposure, beginCoverSearch, updateCoverSearch } from "../docs/src/cover-awareness.js";
import { visionExposure } from "../docs/src/perception.js";
import { playerStatusIcons, zombieStatusIcons } from "../docs/src/status-icons.js";
import { addItem, createItem, equipItem } from "../docs/src/inventory.js";
import { SaveStore } from "../docs/src/save.js";

function fixture(background = "citizen") {
  const world = new World();
  world.objects = []; world.objectGrid.clear(); world.vehicleCollisionCells.clear();
  world.vehicles = [];
  world.tiles = Array.from({ length: 48 }, () => Array(48).fill("grass"));
  world.coverMap = new CoverMap(world);
  const navigator = new Navigator();
  const game = { world, navigator, player: createPlayer({ background }), zombies: [],
    stealth: new StealthSystem(), combat: new CombatSystem(), zombieSystem: new ZombieSystem(navigator),
    elapsed: 0, minutes: 800, random: () => .5, ui: { showToast() {}, showMessage() {} },
    renderer: { burst() {} }, sound() {}, clearNavigation() { this.player.navigation.path = []; },
    killZombie(z) { z.removed = true; }, onZombieAttack() { inflictZombieAttack(this.player, this.minutes, () => .5); },
    moveEntity: Game.prototype.moveEntity,
  };
  Object.assign(game.player, { x: 11, y: 10 });
  return game;
}
function bush(game, x = 10, y = 10) {
  return game.world.addObject("bush", x, y, { cover: .74, coverLabel: "GEBÜSCH", blocksSight: true });
}
function watcher(game, x = 11, y = 6) {
  const z = createZombie(x, y);
  Object.assign(z, { facingX: 0, facingY: 1, desiredFacingX: 0, desiredFacingY: 1, stateTime: 0 });
  game.zombies.push(z); return z;
}
function duck(game) { game.player.stance = "sneak"; game.stealth.refresh(game); }
let checks = 0;
function scenario(name, run) { run(); checks++; console.log(`✓ ${name}`); }

scenario("normal walking and open-ground sneaking retain baseline perception", () => {
  const g = fixture(), z = watcher(g);
  for (const stance of ["walk", "sneak"]) {
    g.player.stance = stance; g.stealth.refresh(g);
    assert.equal(g.player.stealthState.hidden, false);
    assert.equal(coverAwareExposure(z, g, .1), visionExposure(z, g.player, g.world, g.minutes));
  }
});

scenario("crouching hides immediately and fixes each witness's last-known position", () => {
  const g = fixture(); bush(g); const z = watcher(g), unknowing = watcher(g, 40, 40);
  g.zombieSystem.update(g, .1);
  const silhouette = { ...z.lastSeen };
  duck(g); assert.equal(g.player.stealthState.hidden, true);
  g.zombieSystem.update(g, .1);
  assert.equal(z.state, "search"); assert.deepEqual(z.coverSearch.anchor, silhouette);
  Object.assign(g.player, { x: 10.8, y: 10.4 }); g.stealth.refresh(g);
  for (let i = 0; i < 30; i++) g.zombieSystem.update(g, .03);
  assert.deepEqual(z.lastSeen, silhouette);
  assert.equal(unknowing.coverSearch, undefined);
  assert.equal(g.player.stealthState.hidden, true);
});

scenario("cover movement has no step limit, channel or rehide cooldown", () => {
  const g = fixture(); bush(g); duck(g);
  for (let i = 0; i < 200; i++) {
    g.player.x = 10 + Math.cos(i / 5) * .8; g.player.y = 10 + Math.sin(i / 5) * .8;
    g.stealth.onMove(g, .2, "sneak"); g.stealth.update(g, .1);
    assert.equal(g.player.stealthState.hidden, true);
  }
});

scenario("unknown close zombies do not auto-spot; close targeted search can discover", () => {
  const g = fixture(); bush(g); duck(g); const z = watcher(g, 11, 9.5);
  assert.equal(coverAwareExposure(z, g, .1), 0);
  beginCoverSearch(z, g, g.player.stealthState.coverId, { x: 11, y: 10 });
  updateCoverSearch(z, g, .1);
  assert.equal(z.coverSearch.entered, true);
  assert.ok(coverAwareExposure(z, g, .1) > 0);
  assert.equal(z.awareness, 1);
});

scenario("search countdown begins on entry, silhouette precedes area search, search expires", () => {
  const g = fixture(); bush(g); const z = watcher(g, 11, 4);
  const id = g.world.coverMap.at(g.player).id;
  beginCoverSearch(z, g, id, { x: 11, y: 10 });
  updateCoverSearch(z, g, 2);
  assert.equal(z.coverSearch.remaining, 6.5); assert.equal(z.coverSearch.phase, "anchor");
  assert.deepEqual(z.target, { x: 11, y: 10 });
  z.x = 11; z.y = 10; updateCoverSearch(z, g, .1);
  assert.equal(z.coverSearch.entered, true); assert.equal(z.coverSearch.phase, "area");
  assert.ok(g.world.coverMap.contains(id, z.target, .95));
  updateCoverSearch(z, g, 7);
  assert.equal(z.coverSearch, null); assert.equal(z.state, "idle");
});

scenario("unreachable cover search terminates instead of holding combat forever", () => {
  const g = fixture(); bush(g); const z = watcher(g, 11, 4);
  beginCoverSearch(z, g, g.world.coverMap.at(g.player).id, { x: 11, y: 10 });
  updateCoverSearch(z, g, .1); updateCoverSearch(z, g, 6.6);
  assert.equal(z.coverSearch, null); assert.equal(z.state, "idle");
});

scenario("observed crouched crossing grants one second; no live locator during grace", () => {
  const g = fixture(); bush(g); const z = watcher(g);
  g.zombieSystem.update(g, .1); duck(g); g.zombieSystem.update(g, .1);
  const oldAnchor = { ...z.lastSeen };
  g.player.x = 12; g.stealth.refresh(g);
  assert.equal(g.player.stealthState.hidden, false);
  assert.equal(coverAwareExposure(z, g, .5), 0);
  assert.equal(coverAwareExposure(z, g, .49), 0);
  assert.deepEqual(z.lastSeen, oldAnchor);
  assert.ok(coverAwareExposure(z, g, .02) > 0); assert.equal(z.awareness, 1);
});

scenario("short unseen transfer does not contaminate neighboring cover", () => {
  const g = fixture(); bush(g); bush(g, 14, 10); const z = watcher(g);
  g.zombieSystem.update(g, .1); duck(g); g.zombieSystem.update(g, .1);
  const oldId = z.coverSearch.coverId;
  g.player.x = 12; g.stealth.refresh(g); assert.equal(coverAwareExposure(z, g, .2), 0);
  g.player.x = 13; g.stealth.refresh(g); assert.equal(coverAwareExposure(z, g, .1), 0);
  assert.notEqual(g.player.stealthState.coverId, oldId); assert.equal(z.coverSearch.coverId, oldId);
});

scenario("visible standing transfer contaminates new cover when ducking; visible sprint chases", () => {
  const g = fixture(); bush(g); bush(g, 14, 10); const z = watcher(g);
  duck(g); coverAwareExposure(z, g, .1);
  g.player.x = 12; g.player.stance = "walk"; g.stealth.refresh(g);
  assert.ok(coverAwareExposure(z, g, .1) > 0);
  g.player.x = 13; g.zombieSystem.update(g, .1); duck(g); g.zombieSystem.update(g, .1);
  assert.equal(z.coverSearch.coverId, g.player.stealthState.coverId);
  g.player.x = 12; g.player.stance = "walk"; g.player.running = true; g.stealth.refresh(g);
  g.zombieSystem.update(g, .1); assert.equal(z.state, "chase");
});

scenario("same wall side has a stable ID; corners and adjacent bushes keep separate knowledge", () => {
  const w = new World();
  const a = w.coverMap.at({ x: 14, y: 7 }), b = w.coverMap.at({ x: 14, y: 9 });
  assert.equal(a.id, b.id);
  assert.notEqual(a.id, w.coverMap.at({ x: 17, y: 3 }).id);
  const g = fixture(); bush(g); bush(g, 11, 10); duck(g);
  const first = g.world.coverMap.at({ x: 9.5, y: 10 });
  const second = g.world.coverMap.at({ x: 11.5, y: 10 });
  assert.notEqual(first.id, second.id);
});

scenario("burglar alone gets immediate 10-second hide / 30-second cooldown", () => {
  const g = fixture("burglar"), z = watcher(g, 11, 9.6); duck(g);
  assert.equal(g.stealth.activateOpenfield(g), true);
  assert.equal(g.player.stealthState.hidden, true);
  assert.equal(coverAwareExposure(z, g, .1), 0);
  g.stealth.update(g, 10);
  assert.equal(g.player.stealthState.hidden, false);
  assert.equal(g.player.stealthState.openfieldCooldown, 20);
  assert.equal(g.stealth.activateOpenfield(g), false);
  g.stealth.update(g, 20); assert.equal(g.stealth.activateOpenfield(g), true);
  const citizen = fixture(); duck(citizen);
  assert.equal(citizen.stealth.openfieldContext(citizen).visible, false);
  assert.equal(citizen.stealth.activateOpenfield(citizen), false);
});

scenario("combat denies perk without cost; manually enabled war mode alone does not", () => {
  const g = fixture("burglar"), z = watcher(g); duck(g); z.state = "chase";
  assert.equal(g.stealth.activateOpenfield(g), false);
  assert.equal(g.player.stealthState.openfieldCooldown, 0);
  z.state = "search"; g.player.combat.enabled = true;
  assert.equal(g.stealth.activateOpenfield(g), true);
});

scenario("incoming attack damages without cancelling perk or reacquiring player", () => {
  const g = fixture("burglar"), z = watcher(g, 11, 9.6); duck(g); g.stealth.activateOpenfield(g);
  z.attackWindup = .01; g.zombieSystem.update(g, .03);
  assert.ok(g.player.hp < 100);
  assert.equal(g.player.stealthState.openfieldRemaining, 10);
  assert.equal(g.player.stealthState.hidden, true); assert.equal(z.sightMemory.visible, false);
});

scenario("perk expiry flows into cover hide; cooldown never blocks ordinary cover", () => {
  const g = fixture("burglar"); duck(g); g.stealth.activateOpenfield(g); bush(g);
  g.stealth.update(g, 10);
  assert.equal(g.player.stealthState.source, "cover"); assert.equal(g.player.stealthState.openfieldCooldown, 20);
  g.player.stance = "walk"; g.stealth.refresh(g); assert.equal(g.player.stealthState.hidden, false);
  duck(g); assert.equal(g.player.stealthState.hidden, true);
});

scenario("searching zombie remains executable from behind; attack, not approach, ends perk", () => {
  const g = fixture("burglar"), z = watcher(g, 11, 10.8);
  z.state = "search"; z.awareness = .98;
  const knife = createItem("kitchen_knife"); addItem(g.player, knife); equipItem(g.player, knife.id);
  duck(g); g.stealth.activateOpenfield(g); g.combat.selectTarget(g, z);
  assert.equal(g.stealth.isExecutionReady(g, z), true);
  assert.equal(g.stealth.beginExecution(g, z), true);
  assert.equal(g.player.stealthState.openfieldRemaining, 10);
  g.stealth.update(g, .6);
  assert.equal(z.removed, true); assert.equal(g.player.stealthState.hidden, false);
  assert.ok(g.player.stealthState.openfieldCooldown > 29);
});

scenario("save migration removes steps while preserving active perk and cooldown", () => {
  const g = fixture("burglar"); duck(g); g.stealth.activateOpenfield(g); g.stealth.update(g, 2);
  const storage = { data: null, getItem() { return this.data; }, setItem(key, value) { this.data = value; } };
  const save = new SaveStore(storage); save.write({ player: g.player });
  const restored = save.read().player; restored.stealthState.reserve = 1;
  ensureStealthState(restored);
  assert.equal(restored.stealthState.reserve, undefined);
  assert.equal(restored.stealthState.openfieldRemaining, 8);
  assert.equal(restored.stealthState.openfieldCooldown, 28);
});

scenario("icons stay contextual: needs only critical, search and hide coexist", () => {
  const g = fixture(); bush(g); duck(g); const z = watcher(g, 11, 10.8); z.state = "search";
  assert.ok(playerStatusIcons(g).some(i => i.id === "hide"));
  assert.ok(zombieStatusIcons(z, g).some(i => i.id === "search"));
  assert.ok(zombieStatusIcons(z, g).some(i => i.id === "execute"));
  assert.equal(playerStatusIcons(g).some(i => i.id === "hunger" || i.id === "thirst"), false);
  g.player.hunger = 17; g.player.thirst = 17;
  assert.equal(playerStatusIcons(g).filter(i => i.id === "hunger" || i.id === "thirst").length, 2);
});

scenario("hearing contaminates only the actual sound position's cover", () => {
  const g = fixture(); const oldCover = bush(g); bush(g, 15, 10); const z = watcher(g, 11, 8.5);
  g.world.emitNoise(10.5, 10, 5.4, "step", 1.1, .45);
  g.player.x = 15; g.player.y = 10; duck(g);
  g.zombieSystem.update(g, .1);
  assert.equal(z.coverSearch.coverId, oldCover.id);
  assert.deepEqual(z.lastSeen, { x: 10.5, y: 10 });
  assert.notEqual(z.coverSearch.coverId, g.player.stealthState.coverId);
});

scenario("cover concealment and attacks never grant sight through an opaque wall", () => {
  const g = fixture(); bush(g); const z = watcher(g, 11, 7);
  g.world.addObject("wall", 11, 9, { solid: true, blocksSight: true });
  duck(g); beginCoverSearch(z, g, g.player.stealthState.coverId, { x: 11, y: 10 });
  z.coverSearch.entered = true;
  assert.equal(g.world.hasLineOfSight(z, g.player), false);
  assert.equal(coverAwareExposure(z, g, .1), 0);
});

scenario("solid vehicle footprint, sight and routes agree in both orientations", () => {
  for (const orientation of ["x", "y"]) {
    const g = fixture();
    g.world.addObject("car", 20, 20, { solid: true, blocksSight: true, cover: .56, orientation });
    assert.equal(g.world.isWalkable(20, 20, .27), false);
    assert.equal(g.world.hasLineOfSight({ x: 18, y: 20 }, { x: 22, y: 20 }), false);
    const path = g.navigator.findPath(g.world, { x: 18, y: 18 }, { x: 22, y: 22 }, { allowDoors: false });
    assert.ok(path.length);
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i];
      for (let t = 0; t <= 1; t += .1) assert.equal(g.world.isWalkable(a.x + (b.x-a.x)*t, a.y + (b.y-a.y)*t, .27), true);
    }
  }
});

scenario("v11 save loads without reset and repairs the old car-overlap spawn", () => {
  const g = fixture("burglar"); g.player.x = 31; g.player.y = 9;
  g.player.inventory.push(createItem("kitchen_knife"));
  g.saveStore = { read: () => ({ seed: 981013, mission: 2, player: JSON.parse(JSON.stringify(g.player)), zombies: [] }) };
  assert.equal(Game.prototype.load.call(g), true);
  assert.equal(g.mission, 2); assert.ok(g.player.inventory.some(i => i.type === "kitchen_knife"));
  assert.equal(g.world.isWalkable(g.player.x, g.player.y, .27), true);
  assert.equal(g.stealth.hasOpenfield(g.player), true);
});

console.log(`${checks} stealth scenarios passed`);
