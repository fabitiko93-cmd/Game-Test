import assert from "node:assert/strict";
import test from "node:test";
import { createPlayer } from "../docs/src/character.js";
import { ITEMS } from "../docs/src/data.js";
import { canInteract, CONTAINER_REACH, interactionDistance } from "../docs/src/interaction.js";
import { addItem, createItem, equipItem, installMod, reloadWeapon } from "../docs/src/inventory.js";
import { takeItem } from "../docs/src/item-actions.js";
import { playerSegmentClear } from "../docs/src/player-navigation.js";
import { weaponTestLoadout } from "../docs/src/weapon-test-crate.js";
import { World } from "../docs/src/world.js";

const crateIn = world => world.objects.find(object => object.id === "starter-weapon-test-crate");

test("the starter crate is immediately usable and leaves the entrance clear in fresh worlds", () => {
  for (const seed of [981013, 17, 420]) {
    const world = new World(seed), player = createPlayer(), crate = crateIn(world);
    assert.equal(world.objects.filter(object => object.type === "weaponcrate").length, 1);
    assert.equal(crate.building, "safehouse");
    assert.equal(crate.locked, false);
    assert.equal(crate.interactable, true);
    assert.equal(canInteract(world, player, crate), true);
    assert.ok(interactionDistance(player, crate) <= CONTAINER_REACH);
    assert.equal(world.isWalkable(player.x, player.y), true);
    const door = world.buildings.find(building => building.id === "safehouse").door;
    assert.equal(playerSegmentClear(world, player, { x: door.x, y: door.y - .5 }, { allowDoors: true }), true);
  }
});

test("every implemented weapon has loose, usable attachments, magazines and ammunition in the crate", () => {
  const crate = crateIn(new World()), types = crate.items.map(item => item.type);
  assert.equal(new Set(crate.items.map(item => item.id)).size, crate.items.length);
  for (const [type, definition] of Object.entries(ITEMS).filter(([, item]) => item.type === "weapon")) {
    const weapon = crate.items.find(item => item.type === type);
    assert.ok(weapon, type);
    assert.equal(types.filter(entry => entry === type).length, 1);
    assert.deepEqual(weapon.mods, {});
    if (definition.feed === "magazine") assert.equal(weapon.magazine, null);
    if (definition.feed === "internal") assert.equal(weapon.rounds, 0);
    for (const [modType, mod] of Object.entries(ITEMS)) {
      if (mod.type !== "mod" || !mod.compatible?.includes(type) || !definition.modSlots?.includes(mod.modSlot)) continue;
      const attachment = crate.items.find(item => item.type === modType);
      assert.ok(attachment, `${type}: ${modType}`);
      const player = createPlayer();
      assert.equal(addItem(player, weapon), true);
      assert.equal(addItem(player, attachment), true);
      assert.equal(installMod(player, weapon.id, attachment.id).ok, true, `${type}: ${modType}`);
    }
    for (const magazineType of definition.magazineTypes || []) {
      const magazines = crate.items.filter(item => item.type === magazineType);
      const capacity = ITEMS[magazineType].capacity;
      assert.ok(magazines.some(item => item.rounds === capacity), `${magazineType}: full`);
      assert.ok(magazines.some(item => item.rounds === 0), `${magazineType}: empty`);
      const player = createPlayer();
      addItem(player, weapon);
      addItem(player, magazines.find(item => item.rounds === capacity));
      equipItem(player, weapon.id);
      assert.equal(reloadWeapon(player).ok, true, `${type}: ${magazineType}`);
    }
    if (definition.feed === "internal") {
      const player = createPlayer();
      addItem(player, weapon);
      addItem(player, crate.items.find(item => item.type === definition.ammoType));
      equipItem(player, weapon.id);
      assert.equal(reloadWeapon(player).ok, true, `${type}: loose ammunition`);
    }
  }
  for (const item of crate.items.filter(item => ITEMS[item.type].type === "ammo")) {
    assert.ok(item.count > 0 && item.count <= ITEMS[item.type].stack, item.type);
  }
  for (const [modType, mod] of Object.entries(ITEMS).filter(([, item]) => item.type === "mod")) {
    const compatibleWeapons = Object.entries(ITEMS).filter(([type, weapon]) => weapon.type === "weapon"
      && mod.compatible?.includes(type) && weapon.modSlots?.includes(mod.modSlot));
    assert.equal(types.filter(type => type === modType).length, compatibleWeapons.length, modType);
  }
});

test("new catalog weapons automatically receive only compatible test parts", () => {
  const loadout = weaponTestLoadout({
    new_weapon: { type: "weapon", feed: "magazine", magazineTypes: ["new_mag"], modSlots: ["optic"] },
    new_mag: { type: "magazine", capacity: 30, ammoType: "new_ammo", compatible: ["new_weapon"] },
    new_ammo: { type: "ammo", stack: 40 },
    new_optic: { type: "mod", modSlot: "optic", compatible: ["new_weapon"] },
    wrong_weapon: { type: "mod", modSlot: "optic", compatible: ["other_weapon"] },
    wrong_slot: { type: "mod", modSlot: "stock", compatible: ["new_weapon"] },
    unrelated_ammo: { type: "ammo", stack: 20 },
  });
  assert.deepEqual(loadout.map(item => item.type), ["new_weapon", "new_optic", "new_mag", "new_mag", "new_ammo", "new_ammo", "new_ammo"]);
  assert.deepEqual(loadout.filter(item => item.type === "new_mag").map(item => item.options.rounds), [30, 0]);
  assert.equal(loadout.filter(item => item.type === "new_ammo").reduce((sum, item) => sum + item.count, 0), 120);
});

test("taking starter equipment persists without refilling; a new world gets a fresh crate", () => {
  const world = new World(), player = createPlayer(), crate = crateIn(world);
  const weapon = crate.items.find(item => item.type === "pistol_9mm"), originalCount = crate.items.length;
  let saves = 0;
  takeItem({ world, player, mission: 0, sound() {}, save() { saves++; },
    ui: { showToast() {}, renderContainer() {}, refreshAll() {} } }, crate, weapon.id);
  assert.equal(saves, 1);
  assert.ok(player.inventory.some(item => item.id === weapon.id));
  assert.equal(crate.items.length, originalCount - 1);
  crate.items.push(createItem("cloth"));
  const restored = new World(world.seed);
  restored.restore(JSON.parse(JSON.stringify(world.serialize())));
  assert.deepEqual(crateIn(restored).items, crate.items);
  crate.items = [];
  restored.restore(JSON.parse(JSON.stringify(world.serialize())));
  assert.deepEqual(crateIn(restored).items, []);
  world.reset();
  assert.equal(crateIn(world).items.length, originalCount);
  assert.ok(crateIn(world).items.some(item => item.type === "pistol_9mm" && item.id !== weapon.id));
});
