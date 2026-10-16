import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { Group, Vector3 } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { createPlayer } from "../docs/src/character.js";
import { CombatSystem } from "../docs/src/combat.js";
import { ITEMS } from "../docs/src/data.js";
import { InputController } from "../docs/src/input.js";
import { serialize, load } from "../docs/src/game-state.js";
import { updateMovement } from "../docs/src/movement.js";
import { Navigator } from "../docs/src/navigation.js";
import { PlayerVisibility } from "../docs/src/player-visibility.js";
import { StealthSystem } from "../docs/src/stealth.js";
import { addItem, activeWeapon, consumeShot, countType, createItem, cycleFireMode, ejectMagazine,
  emptyMagazine, equipItem, fillMagazine, findItem, insertMagazine, installMod, inventoryWeight,
  itemWeight, reloadWeapon, removeMod, weaponFireMode, weaponStats } from "../docs/src/inventory.js";
import { PlayerModels } from "../docs/src/player-models.js";
import { AK_MODEL, WeaponModels, weaponModelBounds } from "../docs/src/weapon-models.js";
import { World } from "../docs/src/world.js";

const makeWeapon = options => createItem("ak_762", 1, options);
const withMagazine = rounds => makeWeapon({magazine: createItem("mag_ak_30", 1, {rounds})});
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
function combatFixture(rounds = 30) {
  const player = createPlayer(), weapon = withMagazine(rounds), combat = new CombatSystem(), noises = [];
  addItem(player, weapon); equipItem(player, weapon.id);
  const target = {id: "target", x: player.x + 3, y: player.y, hp: 100000, removed: false, state: "chase"};
  Object.assign(player.combat, {enabled: true, targetId: target.id, aim: 1});
  const game = {player, combat, zombies: [target], elapsed: 0, paused: false,
    world: {hasLineOfSight: () => true, emitNoise: (...event) => noises.push(event), blood: []},
    renderer: {trace() {}, burst() {}}, random: () => .99, attractMigration() {}, sound() {},
    ui: {hasBlockingPanel: () => false, showToast() {}, showMessage() {}},
    killZombie(zombie) {zombie.removed = true; combat.end(game);}, clearNavigation() {}, approachCombatTarget() {}};
  return {game, player, weapon: activeWeapon(player), target, combat, noises};
}

test("AK starts as the selected stockless model with semi/auto and separate compatible test supplies", () => {
  const weapon = makeWeapon(), crate = new World().objects.find(object => object.type === "weaponcrate");
  assert.equal(weapon.magazine, null); assert.deepEqual(weapon.mods, {}); assert.equal(weaponFireMode(weapon), "semi");
  assert.equal(AK_MODEL.userVariant, 2); assert.equal(AK_MODEL.sourceBase, "AssaultRifle_3");
  for (const type of ["ak_762", "ak_fixed_stock", "ak_frame_stock", "ak_acog_3x", "ak_suppressor", "mag_ak_30", "ammo_762x39"]) {
    assert.ok(crate.items.some(item => item.type === type), type);
    near(ITEMS[type].weight / .05, Math.round(ITEMS[type].weight / .05));
  }
  assert.ok(crate.items.some(item => item.type === "mag_ak_30" && item.rounds === 30));
  assert.ok(crate.items.some(item => item.type === "mag_ak_30" && item.rounds === 0));
});

test("magazines use exactly two fill-weight bands and installed rounds are never double-counted", () => {
  for (const [type, definition] of Object.entries(ITEMS).filter(([, item]) => item.type === "magazine")) {
    for (let rounds = 0; rounds <= definition.capacity; rounds++) {
      near(itemWeight(createItem(type, 1, {rounds})), definition.weight + (rounds >= definition.capacity / 2 ? .05 : 0));
    }
  }
  const weapon = withMagazine(15);
  near(itemWeight(weapon), 3.3);
  assert.equal(consumeShot(weapon), true); near(itemWeight(weapon), 3.25);
  near(itemWeight(createItem("ammo_762x39", 30)), .5);
  near(itemWeight(createItem("ammo_762x39", 3)), .05);
});

test("filling, emptying, inserting, swapping and removing preserve magazine identity and ammunition", () => {
  const player = createPlayer(), weapon = makeWeapon(), magazine = createItem("mag_ak_30"), spare = createItem("mag_ak_30", 1, {rounds: 14});
  for (const item of [weapon, magazine, spare, createItem("ammo_762x39", 30), createItem("mag_9mm_12", 1, {rounds: 12})]) addItem(player, item);
  const live = findItem(player, weapon.id);
  assert.equal(reloadWeapon(player, live).ok, true);
  assert.equal(live.magazine.id, spare.id); assert.equal(live.magazine.rounds, 14);
  assert.equal(countType(player, "ammo_762x39"), 30, "reload only swaps, never fills");
  assert.equal(fillMagazine(player, magazine.id).ok, true);
  assert.equal(countType(player, "ammo_762x39"), 0);
  const weight = inventoryWeight(player);
  assert.equal(insertMagazine(player, live.id, magazine.id).ok, true);
  assert.equal(live.magazine.id, magazine.id); assert.equal(live.magazine.rounds, 30);
  assert.equal(findItem(player, spare.id).rounds, 14); near(inventoryWeight(player), weight);
  const wrong = player.inventory.find(item => item.type === "mag_9mm_12");
  assert.equal(insertMagazine(player, live.id, wrong.id).ok, false);
  assert.equal(live.magazine.id, magazine.id); assert.equal(findItem(player, wrong.id).rounds, 12);
  assert.equal(ejectMagazine(player, live.id).ok, true); assert.equal(live.magazine, null);
  assert.equal(findItem(player, magazine.id).rounds, 30); near(inventoryWeight(player), weight);
  assert.equal(emptyMagazine(player, magazine.id).ok, true);
  assert.equal(findItem(player, magazine.id).rounds, 0); assert.equal(countType(player, "ammo_762x39"), 30);
  assert.equal(fillMagazine(player, magazine.id).ok, true);
  player.baseCapacity = 0; // Moving already-carried magazines must also work while overloaded.
  assert.equal(insertMagazine(player, live.id, magazine.id).ok, true);
  assert.equal(insertMagazine(player, live.id, spare.id).ok, true);
  assert.equal(findItem(player, magazine.id).rounds, 30);
});

test("AK mods change their agreed handling, retain old stocks, and the suppressor keeps damage/penetration", () => {
  const player = createPlayer(), weapon = withMagazine(30);
  addItem(player, weapon);
  const live = findItem(player, weapon.id), base = weaponStats(live), originalWeight = itemWeight(live);
  const mount = type => {const item = createItem(type); addItem(player, item); assert.equal(installMod(player, live.id, item.id).ok, true); return item;};
  const fixed = mount("ak_fixed_stock"), fixedStats = weaponStats(live);
  assert.ok(fixedStats.mobility < base.mobility && fixedStats.aimTime > base.aimTime && fixedStats.recoilPerShot < base.recoilPerShot);
  const frame = mount("ak_frame_stock"), frameStats = weaponStats(live);
  assert.ok(findItem(player, fixed.id));
  assert.ok(frameStats.mobility > fixedStats.mobility && frameStats.recoilPerShot > fixedStats.recoilPerShot);
  assert.equal(removeMod(player, live.id, "stock").ok, true); assert.ok(findItem(player, frame.id));
  mount("ak_acog_3x"); assert.ok(weaponStats(live).range > base.range);
  mount("ak_suppressor"); const suppressed = weaponStats(live);
  assert.ok(suppressed.noise < base.noise); assert.equal(suppressed.damage, base.damage); assert.equal(suppressed.penetration, base.penetration);
  near(itemWeight(live), originalWeight + .3 + .4);
  const wrong = createItem("pistol_suppressor"); addItem(player, wrong);
  assert.equal(installMod(player, live.id, wrong.id).ok, false); assert.ok(findItem(player, wrong.id));
});

test("rounded ammo stacks merge at their real extra weight and failed magazine actions never consume rounds", () => {
  const player = createPlayer(); player.inventory = []; player.equipment.back = null; player.baseCapacity = .05;
  assert.equal(addItem(player, createItem("ammo_762x39", 1)), true);
  assert.equal(addItem(player, createItem("ammo_762x39", 2)), true);
  assert.equal(countType(player, "ammo_762x39"), 3); near(inventoryWeight(player), .05);
  assert.equal(addItem(player, createItem("ammo_762x39", 1)), false);
  player.inventory = []; player.baseCapacity = .12;
  const magazine = createItem("mag_9mm_12", 1, {rounds: 5});
  addItem(player, magazine); addItem(player, createItem("ammo_9mm", 1));
  assert.equal(fillMagazine(player, magazine.id).ok, false);
  assert.equal(findItem(player, magazine.id).rounds, 5); assert.equal(countType(player, "ammo_9mm"), 1);
  player.inventory = []; player.baseCapacity = .35;
  const full = createItem("mag_ak_30", 1, {rounds: 30}); addItem(player, full);
  assert.equal(emptyMagazine(player, full.id).ok, false);
  assert.equal(findItem(player, full.id).rounds, 30); assert.equal(countType(player, "ammo_762x39"), 0);
});

test("semi fires once per press; held auto keeps its cadence at 30, 60 and 120 Hz and stops on release", () => {
  const semi = combatFixture(); assert.equal(semi.combat.beginFiring(semi.game).ok, true);
  for (let frame = 0; frame < 60; frame++) semi.combat.update(semi.game, 1 / 60);
  assert.equal(semi.player.shots, 1); assert.equal(semi.weapon.magazine.rounds, 29);
  for (const hz of [30, 60, 120]) {
    const {game, player, weapon, combat} = combatFixture(); cycleFireMode(weapon);
    assert.equal(combat.beginFiring(game).ok, true);
    for (let frame = 0; frame < hz; frame++) {game.elapsed += 1 / hz; combat.update(game, 1 / hz);}
    assert.equal(player.shots, 11, `${hz} Hz`); assert.equal(weapon.magazine.rounds, 19);
    combat.stopFiring(game);
    for (let frame = 0; frame < hz; frame++) combat.update(game, 1 / hz);
    assert.equal(player.shots, 11); assert.equal(player.combat.triggerHeld, false);
  }
});

test("a fitted stock reduces real movement speed at the same carried mass without changing stamina or noise rules", () => {
  function travel(stock) {
    const f = combatFixture(), mod = createItem("ak_fixed_stock"); addItem(f.player, mod);
    if (stock) installMod(f.player, f.weapon.id, mod.id);
    Object.assign(f.game, {input: {keyboardMovement: () => ({magnitude: 1, x: 1, y: 0, run: false})},
      stealth: {cancelExecution() {}, hiddenNoiseMultiplier: () => 1, onMove() {}}, stepTimer: 0,
      clearNavigation() {this.player.navigation.path = [];},
      moveEntity(entity, dx, dy) {entity.x += dx; entity.y += dy; return true;}});
    const x = f.player.x, y = f.player.y; updateMovement(f.game, .1);
    return {distance: Math.hypot(f.player.x - x, f.player.y - y), mass: inventoryWeight(f.player), stamina: f.player.stamina, noise: f.player.noiseRadius};
  }
  const base = travel(false), fixed = travel(true);
  near(base.mass, fixed.mass); near(fixed.distance / base.distance, .94);
  near(base.stamina, fixed.stamina); near(base.noise, fixed.noise);
});

test("auto stops on an empty magazine, blocked line, a menu, movement, pause, target or weapon change", () => {
  for (const interrupt of [
    f => {f.game.world.hasLineOfSight = () => false;},
    f => {f.game.ui.hasBlockingPanel = () => true;},
    f => {f.player.moving = true;}, f => {f.game.paused = true;},
    f => {f.player.combat.targetId = "another";}, f => {f.player.equipment.mainHand = null;},
  ]) {
    const f = combatFixture(); cycleFireMode(f.weapon); f.combat.beginFiring(f.game); interrupt(f);
    f.combat.update(f.game, .15); assert.equal(f.player.shots, 1); assert.equal(f.player.combat.triggerHeld, false);
  }
  const f = combatFixture(2); cycleFireMode(f.weapon); f.combat.beginFiring(f.game);
  for (let frame = 0; frame < 60; frame++) f.combat.update(f.game, 1 / 60);
  assert.equal(f.player.shots, 2); assert.equal(f.player.combat.triggerHeld, false); assert.equal(f.weapon.magazine.rounds, 0);
});

test("AK penetration hits one aligned body behind the target, respecting range, offset and walls", () => {
  for (const suppressed of [false, true]) {
    const f = combatFixture(); f.game.random = () => .5;
    if (suppressed) f.weapon.mods.muzzle = createItem("ak_suppressor");
    const behind = {id: "behind", x: f.target.x + 1, y: f.target.y, hp: 1000};
    const third = {id: "third", x: f.target.x + 2, y: f.target.y, hp: 1000};
    const offset = {id: "offset", x: f.target.x + .5, y: f.target.y + .3, hp: 1000};
    f.game.zombies.push(behind, third, offset);
    assert.equal(f.combat.fire(f.game).ok, true);
    near(behind.hp, 1000 - 62 * .6); assert.equal(third.hp, 1000); assert.equal(offset.hp, 1000);
  }
  const f = combatFixture(); f.game.random = () => .5;
  const blocked = {id: "blocked", x: f.target.x + 1, y: f.target.y, hp: 1000};
  f.game.zombies.push(blocked); f.game.world.hasLineOfSight = (_, to) => to.id !== blocked.id;
  f.combat.fire(f.game); assert.equal(blocked.hp, 1000);
});

test("actual HUD release, cancellation, drag-out and blur stop a held trigger without a world tap", () => {
  const oldWindow = globalThis.window, oldDocument = globalThis.document, windowHandlers = {}, handlers = {};
  globalThis.window = {addEventListener: (name, fn) => (windowHandlers[name] ||= []).push(fn), clearTimeout() {}};
  globalThis.document = {getElementById: id => id === "action-button" ? {
    addEventListener: (name, fn) => handlers[name] = fn, setPointerCapture() {}, disabled: false,
    getBoundingClientRect: () => ({left: 0, top: 0, right: 60, bottom: 60}),
  } : null};
  try {
    const input = new InputController({addEventListener() {}}); input.enabled = true;
    let presses = 0, releases = 0, taps = 0;
    input.callbacks = {action: () => presses++, actionEnd: () => releases++, tap: () => taps++};
    const event = {pointerId: 7, clientX: 20, clientY: 20, preventDefault() {}, stopPropagation() {}};
    for (const finish of [() => handlers.pointerup(event), () => handlers.pointercancel(event),
      () => handlers.pointermove({...event, clientX: 80}), () => windowHandlers.blur[0]()]) {
      handlers.pointerdown(event); finish(); assert.equal(presses, releases);
    }
    assert.equal(presses, 4); assert.equal(taps, 0);
  } finally {globalThis.window = oldWindow; globalThis.document = oldDocument;}
});

test("the real CC0 AK mesh has independent magazine/stock/optic/muzzle nodes and updates the held weapon", async () => {
  const compressed = await readFile(new URL(`../docs/assets/weapons/${AK_MODEL.file}`, import.meta.url));
  assert.equal(createHash("sha256").update(compressed).digest("hex"), AK_MODEL.sha256);
  const raw = gunzipSync(compressed), asset = await new GLTFLoader().parseAsync(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength), "");
  const library = new WeaponModels({loadAsset: async () => asset}); await library.request();
  const weapon = makeWeapon(), base = library.create(weapon), baseSize = weaponModelBounds(base).getSize(new Vector3());
  for (const [name, metadata] of Object.entries(AK_MODEL.parts)) {
    const part = base.getObjectByName(name); assert.ok(part, name);
    let vertices = 0; part.traverse(mesh => {if (mesh.isMesh) vertices += mesh.geometry.attributes.position.count;});
    assert.equal(vertices, metadata.triangles * 3, name);
    assert.equal(part.visible, ["Receiver", "Handguard", "Barrel"].includes(name), name);
  }
  assert.ok(baseSize.z > .55 && baseSize.z < .65);
  weapon.magazine = createItem("mag_ak_30");
  weapon.mods = {stock: createItem("ak_fixed_stock"), optic: createItem("ak_acog_3x"), muzzle: createItem("ak_suppressor")};
  const configured = library.create(weapon), size = weaponModelBounds(configured).getSize(new Vector3());
  assert.ok(size.z > baseSize.z + .4 && size.z < 1.2);
  for (const name of ["Magazine", "FixedStock", "Optic3x", "Suppressor"]) assert.equal(configured.getObjectByName(name).visible, true, name);
  assert.equal(configured.getObjectByName("SkeletonStock").visible, false);
  const player = createPlayer(); player.equipment.back = null; addItem(player, weapon); equipItem(player, weapon.id);
  const wrist = new Group(); wrist.name = "WristR";
  const model = new Group(); model.add(wrist);
  const entity = {model, weapon: null, weaponKind: null}, models = Object.create(PlayerModels.prototype); models.weapons = library;
  models.equip(entity, player); assert.equal(wrist.children.length, 1);
  const live = activeWeapon(player); live.magazine = null; live.mods.stock = createItem("ak_frame_stock");
  models.equip(entity, player); assert.equal(wrist.children.length, 1);
  assert.equal(entity.weapon.getObjectByName("Magazine").visible, false);
  assert.equal(entity.weapon.getObjectByName("FixedStock").visible, false);
  assert.equal(entity.weapon.getObjectByName("SkeletonStock").visible, true);
});

test("a normal save preserves AK configuration, fill state and mode, but never resumes a held trigger", () => {
  const world = new World(), player = createPlayer(), crate = world.objects.find(object => object.type === "weaponcrate");
  const weapon = crate.items.find(item => item.type === "ak_762");
  crate.items = crate.items.filter(item => item.id !== weapon.id);
  weapon.magazine = createItem("mag_ak_30", 1, {rounds: 14}); weapon.fireMode = "auto";
  weapon.mods = {stock: createItem("ak_frame_stock"), optic: createItem("ak_acog_3x"), muzzle: createItem("ak_suppressor")};
  addItem(player, weapon); equipItem(player, weapon.id); player.combat.triggerHeld = true;
  const game = {world, player, combat: new CombatSystem(), navigator: new Navigator(), stealth: new StealthSystem(),
    zombies: [], playerVisibility: new PlayerVisibility(), renderer: {}, minutes: 400, mission: 0, survivorCount: 1, migrationTimer: 60};
  const saved = serialize(game);
  assert.equal(saved.player.combat.triggerHeld, false);
  game.saveStore = {read: () => JSON.parse(JSON.stringify(saved))};
  assert.equal(load(game), true);
  assert.deepEqual(activeWeapon(game.player), findItem(player, weapon.id));
  assert.equal(game.player.combat.triggerHeld, false);
  assert.equal(game.player.x, player.x); assert.equal(game.player.y, player.y);
  assert.equal(world.objects.find(object => object.type === "weaponcrate").items.some(item => item.type === "ak_762"), false);
});
