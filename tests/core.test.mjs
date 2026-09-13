import assert from "node:assert/strict";
import { createInitialZombies } from "../docs/src/ai.js";
import { createPlayer, gainSkill, inflictZombieAttack, updateCharacter } from "../docs/src/character.js";
import { CombatSystem } from "../docs/src/combat.js";
import { ITEMS } from "../docs/src/data.js";
import {
  addItem,
  ammoLabel,
  createItem,
  equipItem,
  findItem,
  installMod,
  reloadWeapon,
  weaponStats,
} from "../docs/src/inventory.js";
import { Navigator } from "../docs/src/navigation.js";
import { SaveStore } from "../docs/src/save.js";
import { World } from "../docs/src/world.js";

const world = new World();
const navigator = new Navigator();
assert.equal(world.tiles.length, 48);
assert.equal(world.buildings.length, 6);
assert.ok(world.objects.length > 300);

const start = { x: 8, y: 36 };
assert.ok(navigator.findPath(world, start, { x: 40, y: 12 }, { allowDoors: true }).length > 0);
const pharmacy = world.buildings.find(building => building.id === "pharmacy");
const pharmacyDoor = world.objects.find(object => object.id === pharmacy.doorId);
assert.equal(pharmacyDoor.locked, true);
assert.ok(navigator.pathToInteraction(world, start, pharmacyDoor, { allowDoors: true }).length > 0);
assert.equal(navigator.findPath(world, start, { x: 40, y: 36 }, { allowDoors: true }).length, 0);
const starterCabinet = world.objects.find(object => object.name === "KÜCHENSCHRANK");
const cabinetPath = navigator.pathToInteraction(world, start, starterCabinet, { allowDoors: true, interactionRange: 1.38 });
const cabinetDestination = cabinetPath.at(-1);
assert.ok(cabinetPath.length > 0);
assert.ok(Math.hypot(cabinetDestination.x - starterCabinet.x, cabinetDestination.y - starterCabinet.y) <= 1.38);

const citizen = createPlayer({ name: "A", background: "citizen" });
const hunter = createPlayer({ name: "B", background: "hunter" });
assert.ok(hunter.skills.firearms > citizen.skills.firearms);
const beforeSkill = hunter.skills.stealth;
gainSkill(hunter, "stealth", 1);
assert.ok(hunter.skills.stealth > beforeSkill);

const pistol = createItem("pistol_9mm", 1, { loadedRounds: 0 });
const suppressor = createItem("pistol_suppressor");
const ammo = createItem("ammo_9mm", 14);
assert.equal(addItem(hunter, pistol), true);
assert.equal(addItem(hunter, suppressor), true);
assert.equal(addItem(hunter, ammo), true);
assert.equal(equipItem(hunter, pistol.id).ok, true);
assert.equal(installMod(hunter, pistol.id, suppressor.id).ok, true);
const livePistol = findItem(hunter, pistol.id);
assert.ok(weaponStats(livePistol).noise < ITEMS.pistol_9mm.noise);
assert.equal(reloadWeapon(hunter, livePistol).ok, true);
assert.equal(ammoLabel(livePistol), "12/12");

const combat = new CombatSystem();
const target = { id: "test-zombie", x: hunter.x + 2, y: hunter.y, hp: 200, maxHp: 200, removed: false, path: [] };
hunter.combat.enabled = true;
hunter.combat.targetId = target.id;
let traced = false;
let attracted = 0;
const shot = combat.fire({
  player: hunter,
  zombies: [target],
  world: { hasLineOfSight: () => true, emitNoise: () => {}, blood: [] },
  renderer: { trace: () => { traced = true; }, burst: () => {}, shake: 0 },
  random: () => 0,
  attractMigration: amount => { attracted = amount; },
  sound: () => {},
  ui: { showMessage: () => {} },
  killZombie: zombie => { zombie.removed = true; },
});
assert.equal(shot.ok, true);
assert.equal(ammoLabel(livePistol), "11/12");
assert.ok(target.hp < target.maxHp);
assert.ok(traced && attracted > 0);

const rolls = [0, 0.5, 0, 0.01, 0.9, 0.2, 0.5, 0.5];
const bite = inflictZombieAttack(hunter, 400, () => rolls.shift() ?? 0.5, 0);
assert.equal(bite.kind, "bite");
assert.equal(bite.wound.zombieInfected, true);
bite.wound.deathAt = 401;
bite.wound.symptomAt = 400;
assert.equal(updateCharacter(hunter, 1, 2, 402).dead, true);

const memory = new Map();
const storage = {
  getItem: key => memory.get(key) || null,
  setItem: (key, value) => memory.set(key, value),
  removeItem: key => memory.delete(key),
};
const saves = new SaveStore(storage);
assert.equal(saves.has(), false);
assert.equal(saves.write({ player: hunter, zombies: createInitialZombies() }), true);
assert.equal(saves.has(), true);
assert.equal(saves.read().player.name, "B");
saves.clear();
assert.equal(saves.has(), false);

const policeLocker = world.objects.find(object => object.name === "GESICHERTER WAFFENSCHRANK");
const clubLocker = world.objects.find(object => object.name === "VEREINSSCHRANK");
assert.ok(policeLocker.items.some(item => item.type === "pistol_9mm"));
assert.ok(policeLocker.items.some(item => item.type === "revolver_38"));
assert.ok(clubLocker.items.some(item => item.type === "shotgun_12g"));
assert.ok(clubLocker.items.some(item => item.type === "hunting_rifle"));

console.log("SPERRKREIS 98 core tests passed");
