import assert from "node:assert/strict";
import { test } from "node:test";
import { Game } from "../docs/src/game.js";
import { World } from "../docs/src/world.js";
import { CoverMap } from "../docs/src/cover.js";
import { createPlayer, totalBleeding, updateCharacter, woundTreatmentOptions } from "../docs/src/character.js";
import { CombatSystem } from "../docs/src/combat.js";
import { StealthSystem } from "../docs/src/stealth.js";
import { createZombie, ZombieSystem } from "../docs/src/ai.js";
import { Navigator } from "../docs/src/navigation.js";
import { addItem, createItem, equipItem } from "../docs/src/inventory.js";
import { canInteract } from "../docs/src/interaction.js";
import { findPlayerPath, pathToPlayerInteraction, playerSegmentClear, playerPathLength, PLAYER_PATH_RULES } from "../docs/src/player-navigation.js";
import { pointSegmentDistance } from "../docs/src/collision.js";
import { behindTarget } from "../docs/src/perception.js";

function fixture(realWorld = false) {
  const world = new World();
  if (!realWorld) {
    world.objects = []; world.objectGrid.clear(); world.vehicleCollisionCells.clear(); world.vehicles = [];
    world.tiles = Array.from({ length: 48 }, () => Array(48).fill("grass"));
    world.coverMap = new CoverMap(world);
  }
  const game = Object.create(Game.prototype), navigator = new Navigator(), messages = [], opened = [];
  Object.assign(game, { world, player: createPlayer({ background: "citizen" }), zombies: [], navigator,
    stealth: new StealthSystem(), combat: new CombatSystem(), zombieSystem: new ZombieSystem(navigator),
    started: true, dead: false, paused: false, elapsed: 0, minutes: 500, mission: 1, stepTimer: 0,
    input: { keyboardMovement: () => ({ magnitude: 0 }) },
    renderer: { burst() {}, rejectDestination() {} }, random: () => .5,
    ui: { hasBlockingPanel: () => false, showMessage: text => messages.push(text), showToast: text => messages.push(text),
      refreshAll() {}, openContainerPanel: object => opened.push(object.id) },
    sound() {}, save() {} });
  return { game, world, messages, opened };
}
function runMovement(game, limit = 1500) {
  for (let i = 0; i < limit && game.player.navigation.path.length; i++) {
    game.elapsed += .05; game.updateMovement(.05); game.stealth.update(game, .05);
  }
  assert.equal(game.player.navigation.path.length, 0, "route must finish or report a block");
}
function assertRoute(world, start, path, allowDoors = false) {
  assert.ok(path.length);
  let previous = start;
  for (const point of path) {
    assert.ok(playerSegmentClear(world, previous, point, { allowDoors }), "every path segment respects the player's body");
    previous = point;
  }
}
function allCovered(world, start, path) {
  let previous = start;
  for (const point of path) {
    const steps = Math.max(1, Math.ceil(Math.hypot(point.x - previous.x, point.y - previous.y) / .025));
    for (let i = 0; i <= steps; i++) {
      const amount = i / steps;
      if (!world.coverMap.at({ x: previous.x + (point.x - previous.x) * amount,
        y: previous.y + (point.y - previous.y) * amount })) return false;
    }
    previous = point;
  }
  return true;
}

test("short taps keep exact sub-tile positions instead of snapping to the current tile center", () => {
  const { game } = fixture(), end = { x: 8.17, y: 36.19 };
  assert.equal(game.setDestination(end), true);
  assert.deepEqual(game.player.navigation.destination, end);
  runMovement(game);
  assert.ok(Math.hypot(game.player.x - end.x, game.player.y - end.y) < .003);
});

test("player routes pass a narrow usable gap between tree trunks", () => {
  const { game, world } = fixture();
  world.addObject("tree", 10, 9, { solid: true, cover: .7 });
  world.addObject("tree", 10, 10.5, { solid: true, cover: .7 });
  const start = { x: 9, y: 9.75 }, end = { x: 11, y: 9.75 };
  Object.assign(game.player, start, { stance: "sneak" });
  assert.equal(world.isWalkable(10, 10, .27), false);
  assert.equal(game.setDestination(end), true);
  assertRoute(world, start, game.player.navigation.path);
  runMovement(game);
  assert.ok(Math.hypot(game.player.x - end.x, game.player.y - end.y) < .003);
});

test("sneaking chooses a short continuous cover connection rather than crossing an open gap", () => {
  const { world } = fixture(), start = { x: 10, y: 10 }, end = { x: 13, y: 10 };
  for (const [x, y] of [[10, 10], [11.5, 11.2], [13, 10]]) world.addObject("bush", x, y, { cover: .74 });
  assert.equal(world.coverMap.at({ x: 11.5, y: 10 }), null);
  const path = findPlayerPath(world, start, end, { preferCover: true });
  assertRoute(world, start, path);
  assert.equal(allCovered(world, start, path), true);
  assert.ok(playerPathLength(start, path) <= 3 * PLAYER_PATH_RULES.coverDetour + PLAYER_PATH_RULES.coverAllowance);
});

test("cover preference does not send the player on an excessive detour", () => {
  const { world } = fixture(), start = { x: 10, y: 10 }, end = { x: 15, y: 10 };
  for (let y = 10; y <= 17; y++) {
    world.addObject("bush", 10, y, { cover: .74 }); world.addObject("bush", 15, y, { cover: .74 });
  }
  for (let x = 11; x < 15; x++) world.addObject("bush", x, 17, { cover: .74 });
  const path = findPlayerPath(world, start, end, { preferCover: true });
  assert.ok(playerPathLength(start, path) <= 5 * PLAYER_PATH_RULES.coverDetour + PLAYER_PATH_RULES.coverAllowance);
});

test("vehicle corner shortcuts are rejected even when both endpoints are free", () => {
  for (const orientation of ["x", "y"]) {
    const { world } = fixture();
    world.addObject("car", 10, 10, { orientation, solid: true });
    const flip = point => orientation === "x" ? point : { x: point.y, y: point.x };
    const a = flip({ x: 10.88, y: 10.85 }), b = flip({ x: 11.15, y: 10.48 });
    assert.ok(world.isWalkable(a.x, a.y, .27)); assert.ok(world.isWalkable(b.x, b.y, .27));
    assert.equal(playerSegmentClear(world, a, b), false);
    assertRoute(world, a, findPlayerPath(world, a, b));
  }
});

test("real-world hunting car and cabinet can be reached and opened through an automatic door", () => {
  for (const name of ["ALTES JAGDFAHRZEUG", "KÜCHENSCHRANK"]) {
    const { game, world, messages, opened } = fixture(true);
    game.player.stance = "sneak";
    const object = world.objects.find(entry => entry.name === name);
    const path = pathToPlayerInteraction(world, game.player, object, { allowDoors: true, preferCover: true });
    assertRoute(world, game.player, path, true);
    game.queueInteraction(object); runMovement(game);
    assert.ok(canInteract(world, game.player, object));
    assert.deepEqual(opened, [object.id]);
    assert.equal(messages.some(message => message.includes("blockiert")), false);
  }
});

test("loot cannot be reached through a wall or a closed intervening door", () => {
  const { world } = fixture();
  const door = world.addObject("door", 10, 10, { solid: true, closed: true });
  const loot = world.addObject("groundloot", 10, 10.5, { interactable: true, items: [] });
  const player = { x: 10, y: 9.3 };
  assert.equal(canInteract(world, player, loot), false);
  door.closed = false; door.solid = false; world.touchSight();
  assert.equal(canInteract(world, player, loot), true);
});

function executionFixture() {
  const { game, world, messages } = fixture();
  Object.assign(game.player, { x: 10, y: 10, stance: "sneak" });
  world.addObject("bush", 10, 10, { cover: .74 });
  const knife = createItem("kitchen_knife"); addItem(game.player, knife); equipItem(game.player, knife.id);
  const target = createZombie(10, 11.15);
  Object.assign(target, { facingX: 0, facingY: 1, state: "search", sightMemory: { visible: false } });
  game.zombies.push(target); game.combat.selectTarget(game, target); game.stealth.refresh(game);
  return { game, world, target, messages };
}

test("the ready execution kills immediately at the advertised range and cancels a pending normal swing", () => {
  const { game, target } = executionFixture();
  Object.assign(game.player.combat, { enabled: true, pendingAttack: .001, pendingTargetId: target.id });
  const context = game.stealth.executionContext(game), hp = game.player.hp;
  assert.equal(context.label, "AUSSCHALTEN"); assert.equal(context.ready, true);
  game.executeAction();
  assert.equal(target.removed, true);
  assert.equal(game.player.combat.enabled, false); assert.equal(game.player.combat.pendingAttack, 0);
  game.combat.update(game, .1); game.zombieSystem.update(game, .1);
  assert.equal(game.player.hp, hp);
});

test("execution approach can be cancelled by a new manual destination", () => {
  const { game, world, target } = executionFixture();
  world.addObject("bush", 10, 8.5, { cover: .74 }); game.player.y = 8.5; game.stealth.refresh(game);
  Object.assign(game.player.combat, { enabled: true, pendingAttack: .001, pendingTargetId: target.id });
  assert.equal(game.stealth.executionContext(game).label, "ANSCHLEICHEN");
  assert.equal(game.stealth.executionAction(game), true);
  assert.equal(game.player.combat.pendingAttack, 0);
  assert.equal(game.player.navigation.source, "execution");
  game.setDestination({ x: 9, y: 8.5 });
  assert.equal(game.player.stealthState.execution, null);
  runMovement(game);
  assert.equal(target.removed, false);
});

function executionTick(game, ai = false) {
  game.elapsed += .05; game.world.update(.05);
  game.updateMovement(.05); game.combat.update(game, .05); game.stealth.update(game, .05);
  if (ai) game.zombieSystem.update(game, .05);
}

test("automatic execution completes its covered approach before the zombie can attack", () => {
  const { game, world, target } = executionFixture(), hp = game.player.hp;
  world.addObject("bush", 10, 8.5, { cover: .74 }); game.player.y = 8.5;
  target.stateTimer = 100; target.stateTime = 0; game.stealth.refresh(game);
  assert.equal(game.stealth.executionAction(game), true);
  for (let i = 0; i < 100 && !target.removed; i++) executionTick(game, true);
  assert.equal(target.removed, true);
  assert.equal(game.player.hp, hp); assert.equal(game.player.combat.enabled, false);
  assert.equal(game.player.navigation.path.length, 0); assert.equal(game.player.stealthState.execution, null);
});

test("automatic approach stays put when reaching the target's back would lose hide", () => {
  const { game, target, messages } = executionFixture(), start = { x: game.player.x, y: game.player.y };
  target.y = 10.8; target.facingY = -1;
  game.setDestination({ x: 9, y: 10 });
  Object.assign(game.player.combat, { enabled: true, pendingAttack: .001, pendingTargetId: target.id });
  assert.equal(game.stealth.executionAction(game), false);
  assert.equal(game.player.navigation.path.length, 0); assert.equal(game.player.stealthState.execution, null);
  assert.equal(game.player.combat.enabled, false); assert.equal(game.player.combat.pendingAttack, 0);
  assert.deepEqual({ x: game.player.x, y: game.player.y }, start);
  assert.ok(messages.some(message => message.includes("WEG")));
});

test("a covered approach circles a nearby target and completes instead of crossing its body", () => {
  const { game, world, target } = executionFixture();
  target.y = 10.3; target.facingY = -1;
  assert.equal(game.stealth.executionAction(game), true);
  const path = game.player.navigation.path, start = { x: game.player.x, y: game.player.y };
  assert.equal(allCovered(world, start, path), true);
  let previous = start;
  for (const point of path) {
    assert.ok(pointSegmentDistance(target, previous, point) >= .3 - .00001);
    previous = point;
  }
  for (let i = 0; i < 100 && !target.removed; i++) executionTick(game);
  assert.equal(target.removed, true);
});

test("turning the target stops an obsolete approach before walking to its old rear position", () => {
  const { game, world, target, messages } = executionFixture();
  world.addObject("bush", 10, 8.5, { cover: .74 }); game.player.y = 8.5; game.stealth.refresh(game);
  assert.equal(game.stealth.executionAction(game), true);
  for (let i = 0; i < 5; i++) executionTick(game);
  target.facingY = -1;
  for (let i = 0; i < 30; i++) executionTick(game);
  assert.equal(target.removed, false); assert.equal(game.player.stealthState.hidden, true);
  assert.ok(game.player.y < 9.2, "do not finish the stale route before replanning");
  assert.equal(game.player.stealthState.execution, null); assert.equal(game.player.navigation.path.length, 0);
  assert.ok(messages.some(message => message.includes("WEG")));
});

test("the active openfield perk permits a complete execution approach outside cover", () => {
  const { game, target } = executionFixture();
  target.y = 10.8; target.facingY = -1;
  game.player.perks = { openfieldStealth: true };
  assert.equal(game.stealth.activateOpenfield(game), true);
  assert.equal(game.stealth.executionAction(game), true);
  for (let i = 0; i < 100 && !target.removed; i++) executionTick(game);
  assert.equal(target.removed, true);
  assert.equal(game.player.stealthState.openfieldRemaining, 0);
});

test("an expiring openfield perk does not start a route it cannot conceal", () => {
  const { game, target } = executionFixture();
  target.y = 10.8; target.facingY = -1;
  game.player.perks = { openfieldStealth: true }; game.stealth.activateOpenfield(game);
  game.player.stealthState.openfieldRemaining = .15;
  assert.equal(game.stealth.executionAction(game), false);
  assert.equal(game.player.navigation.path.length, 0);
});

test("an approach follows a walking zombie to its current rear and finishes", () => {
  const { game, world, target } = executionFixture();
  for (const y of [8.5, 10, 11.5, 13, 14.5]) world.addObject("bush", 10, y, { cover: .74 });
  game.player.y = 8.5; game.stealth.refresh(game);
  assert.equal(game.stealth.executionAction(game), true);
  for (let i = 0; i < 200 && !target.removed; i++) {
    target.y += .025;
    executionTick(game);
  }
  assert.equal(target.removed, true);
  assert.equal(game.player.stealthState.execution, null); assert.equal(game.player.navigation.path.length, 0);
});

test("execution rear checks preserve a horizontal facing vector's zero component", () => {
  const target = { x: 10, y: 10, facingX: 1, facingY: 0 };
  assert.equal(behindTarget({ x: 10, y: 9 }, target), false, "a side position is not behind");
  assert.equal(behindTarget({ x: 9, y: 10.7 }, target), true);
});

test("combat ends on a kill or lost pursuit and does not attack a later selected zombie", () => {
  const { game, target } = executionFixture();
  Object.assign(game.player.combat, { enabled: true, pendingAttack: .1, pendingTargetId: target.id });
  game.killZombie(target);
  assert.equal(game.player.combat.enabled, false); assert.equal(game.player.combat.pendingAttack, 0);
  const next = createZombie(10, 10.8); game.zombies.push(next); game.combat.selectTarget(game, next);
  game.combat.update(game, .2);
  assert.equal(game.player.combat.pendingAttack, 0);
  next.state = "chase"; game.player.combat.enabled = true; game.player.combat.hadPursuit = false;
  game.combat.update(game, .01);
  next.state = "search"; next.sightMemory = { visible: false };
  game.combat.update(game, .05);
  assert.equal(game.player.combat.enabled, false); assert.equal(game.player.combat.pendingAttack, 0);
});

test("arriving at a manual retreat does not restart a normal attack before perception catches up", () => {
  const { game, target } = executionFixture();
  target.state = "chase"; target.sightMemory = { visible: true }; game.player.combat.enabled = true;
  game.setDestination({ x: 9.85, y: 10 }); runMovement(game);
  game.combat.update(game, .01);
  assert.equal(game.player.combat.pendingAttack, 0);
  target.state = "search"; target.sightMemory.visible = false;
  game.combat.update(game, .01);
  assert.equal(game.player.combat.enabled, false);
});

test("clean dressings stop only their wound, including old saved dressings", () => {
  const { game } = fixture();
  game.player.wounds = [{ id: "old", type: "laceration", bleed: .065, ageMinutes: 0, bandaged: true },
    { id: "open", type: "scratch", bleed: .026, ageMinutes: 0, bandaged: false }];
  assert.equal(totalBleeding(game.player), .026);
  addItem(game.player, createItem("bandage", 2));
  game.ui.hasBlockingPanel = () => true;
  const hp = game.player.hp; game.treatWound("open", "bandage");
  assert.equal(game.player.bleeding, 0);
  assert.equal(game.player.inventory.find(item => item.type === "bandage").count, 1);
  const result = updateCharacter(game.player, 10, 0, 500);
  assert.equal(result.bleeding, 0); assert.equal(game.player.hp, hp);
  game.treatWound("open", "bandage");
  assert.equal(game.player.inventory.find(item => item.type === "bandage").count, 1);
});

test("an improvised dressing can be replaced without consuming material for stale wound IDs", () => {
  const { game } = fixture();
  game.player.wounds = [{ id: "wound", type: "laceration", bleed: .065, ageMinutes: 0, bandaged: false }];
  addItem(game.player, createItem("cloth")); addItem(game.player, createItem("bandage"));
  game.treatWound("wound", "cloth");
  assert.ok(game.player.bleeding > 0);
  assert.ok(woundTreatmentOptions(game.player, game.player.wounds[0]).some(option => option.type === "bandage"));
  game.treatWound("missing", "bandage");
  assert.ok(game.player.inventory.some(item => item.type === "bandage"));
  game.treatWound("wound", "bandage");
  assert.equal(game.player.bleeding, 0); assert.equal(game.player.wounds[0].bandageType, "bandage");
  assert.equal(game.player.inventory.some(item => item.type === "bandage"), false);
});

test("loading an existing save clears stale attack intent and recalculates clean dressing effects", () => {
  const { game, target } = executionFixture();
  Object.assign(game.player.combat, { enabled: true, pendingAttack: .1, pendingTargetId: target.id });
  game.player.wounds = [{ id: "saved", type: "scratch", ageMinutes: 0, bleed: .026, bandaged: true }];
  game.player.bleeding = .026 * .08;
  const saved = game.serialize(); game.saveStore = { read: () => structuredClone(saved) };
  assert.equal(game.load(), true);
  assert.equal(game.player.combat.enabled, false); assert.equal(game.player.combat.pendingAttack, 0);
  assert.equal(game.player.combat.targetId, target.id);
  assert.equal(game.player.bleeding, 0); assert.equal(game.player.wounds[0].id, "saved");
});
