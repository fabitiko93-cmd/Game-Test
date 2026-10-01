import assert from "node:assert/strict";
import { Game } from "../docs/src/game.js";
import { World } from "../docs/src/world.js";
import { createPlayer } from "../docs/src/character.js";
import { createItem, addItem, activeWeapon, roundsInWeapon } from "../docs/src/inventory.js";
import { Navigator } from "../docs/src/navigation.js";
import { StealthSystem } from "../docs/src/stealth.js";
import { CombatSystem } from "../docs/src/combat.js";
import { GAME, SAVE } from "../docs/src/config.js";

function fixture() {
  const g = Object.create(Game.prototype);
  const world = new World();
  world.objects = []; world.objectGrid.clear(); world.vehicles = []; world.vehicleCollisionCells.clear();
  world.tiles = world.tiles.map(row => row.map(() => "grass"));
  let saved;
  let saves = 0;
  const messages = [];
  const noises = [];
  const emitNoise = world.emitNoise.bind(world);
  world.emitNoise = (...args) => { noises.push(args); emitNoise(...args); };
  const ui = { selectedItemId: null, hasBlockingPanel: () => false,
    showToast: text => messages.push(text), showMessage: text => messages.push(text),
    refreshAll() {}, renderContainer() {}, openWeaponPanel() {} };
  Object.assign(g, { world, ui, renderer: { pick: () => null, screenToWorld: (x, y) => ({ x, y }),
    rejectDestination() {}, beginPan() {}, panBy() {}, endPan() {}, recenter() {} },
    input: { keyboardMovement: () => ({ magnitude: 0 }) }, player: createPlayer({ background: "burglar" }),
    navigator: new Navigator(), stealth: new StealthSystem(), combat: new CombatSystem(), zombies: [],
    started: true, paused: false, dead: false, minutes: GAME.startMinutes, elapsed: 0, mission: 0,
    survivorCount: 1, migrationTimer: GAME.migrationSeconds, stepTimer: 0, combatPathTick: 0,
    audio: null, holdBlocked: false, saveStore: { write: state => { saved = structuredClone(state); saves++; return true; },
      read: () => structuredClone(saved) } });
  g.player.inventory = []; g.player.equipment = Object.fromEntries(Object.keys(g.player.equipment).map(k => [k, null]));
  return { g, messages, noises, saved: () => saved, saves: () => saves };
}

// Public Game methods remain usable by input, AI, combat, UI and existing fixtures.
{
  const { g, noises } = fixture();
  g.tapWorld(10, 36);
  assert.equal(g.player.navigation.runRequested, false);
  g.updateMovement(.05);
  assert.equal(g.player.running, false);
  const walkingNoise = noises.at(-1)[2];
  g.doubleTapWorld(12, 36);
  g.stepTimer = 0;
  const stamina = g.player.stamina;
  g.updateMovement(.05);
  assert.equal(g.player.running, true);
  assert.ok(g.player.stamina < stamina);
  assert.ok(noises.at(-1)[2] > walkingNoise);
  g.player.stance = "sneak";
  g.doubleTapWorld(14, 36); g.updateMovement(.05);
  assert.equal(g.player.running, false);
  g.clearNavigation(); g.player.stance = "walk";
  g.startGuidedMovement(12, 36);
  assert.equal(g.player.navigation.guided, true);
  g.updateMovement(.05);
  assert.equal(g.player.running, false);
  g.endGuidedMovement();
  assert.equal(g.player.navigation.path.length, 0);
}

{
  const { g } = fixture();
  g.setDestination({ x: 10, y: 36 });
  const manualPath = structuredClone(g.player.navigation.path);
  g.approachCombatTarget({ x: 18, y: 36 }, 1);
  assert.deepEqual(g.player.navigation.path, manualPath, "manual movement takes priority over combat following");
  g.elapsed = 2;
  g.approachCombatTarget({ x: 18, y: 36 }, 1);
  assert.equal(g.player.navigation.source, "combat");
  g.input.keyboardMovement = () => ({ magnitude: 1, x: 1, y: 0, run: false });
  const { x, y } = g.player;
  g.updateMovement(.05);
  assert.equal(g.player.navigation.path.length, 0);
  assert.ok(g.player.x > x && g.player.y < y);
  assert.ok(g.player.navigation.manualUntil > g.elapsed);
}

{
  const { g } = fixture();
  const object = g.world.addObject("groundloot", 11, 36, { interactable: true, items: [] });
  let used = 0;
  g.interact = target => { assert.equal(target.id, object.id); used++; };
  g.renderer.pick = () => ({ kind: "object", id: object.id, ref: object });
  g.tapWorld(0, 0);
  assert.equal(used, 0, "first tap only selects");
  g.doubleTapWorld(0, 0);
  for (let i = 0; i < 100 && !used; i++) g.updateMovement(.05);
  assert.equal(used, 1, "second tap approaches and interacts once");
  assert.equal(g.player.navigation.interactionId, null);
}

{
  const { g, messages, saves } = fixture();
  const food = createItem("canned_beans", 2);
  addItem(g.player, food); g.player.hunger = 20;
  g.useItem(food.id);
  assert.equal(g.player.hunger, 20);
  assert.equal(g.player.inventory.find(i => i.id === food.id).count, 2);
  assert.match(messages.at(-1), /DOSENÖFFNER/);
  addItem(g.player, createItem("can_opener"));
  g.ui.hasBlockingPanel = () => true;
  g.useItem(food.id);
  assert.equal(g.player.hunger, 65, "item use remains possible inside a menu");
  assert.equal(g.player.inventory.find(i => i.id === food.id).count, 1);
  const dressing = createItem("bandage", 2); addItem(g.player, dressing);
  g.player.wounds.push({ id: "scratch-1", type: "scratch", bleed: .04, ageMinutes: 0, bandaged: false });
  g.treatWound("scratch-1", "bandage");
  assert.equal(g.player.wounds[0].bandaged, true);
  assert.equal(g.player.inventory.find(i => i.id === dressing.id).count, 1);
  assert.equal(saves(), 2);
}

{
  const { g } = fixture();
  const weapon = createItem("pistol_9mm"); addItem(g.player, weapon);
  g.useItem(weapon.id);
  assert.equal(activeWeapon(g.player).id, weapon.id);
  const equipped = activeWeapon(g.player);
  addItem(g.player, createItem("ammo_9mm", 20)); addItem(g.player, createItem("mag_9mm_12"));
  g.reload(); assert.ok(roundsInWeapon(equipped) > 0);
  const mod = createItem("reflex_sight"); addItem(g.player, mod); g.useItem(mod.id);
  assert.equal(equipped.mods.optic.type, "reflex_sight");
  g.unmountMod(weapon.id, "optic"); assert.equal(equipped.mods.optic, undefined);
  const loot = { items: [createItem("apple"), createItem("bandage")] };
  g.takeAll(loot);
  assert.equal(loot.items.length, 0);
  const item = g.player.inventory.find(i => i.type === "apple");
  g.dropItem(item.id);
  assert.ok(g.world.objects.some(o => o.type === "groundloot" && o.items?.some(i => i.id === item.id)));
}

{
  const { g, saved } = fixture();
  const knife = createItem("kitchen_knife"); addItem(g.player, knife); g.useItem(knife.id);
  const cache = g.world.addObject("groundloot", 9, 36, { static: false, interactable: true,
    items: [createItem("bandage")] });
  g.setDestination({ x: 12, y: 36 }); g.mission = 2;
  g.save();
  assert.equal(saved().player.navigation.path.length, 0);
  assert.ok(saved().world.some(o => o.id === cache.id));
  g.player.inventory = []; g.mission = 0;
  assert.equal(g.load(), true);
  assert.equal(g.mission, 2);
  assert.equal(activeWeapon(g.player).id, knife.id);
  assert.ok(g.world.objects.some(o => o.id === cache.id && o.items[0].type === "bandage"));
  assert.equal(g.stealth.hasOpenfield(g.player), true);
  assert.equal(SAVE.version, 4);
}

console.log("Movement, touch, interaction, item actions and save integration passed");
