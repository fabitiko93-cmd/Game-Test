import { COLORS, VIEW } from "./config.js";
import { LOOT_TABLES, OBJECT_LABELS } from "./data.js";
import { createItem } from "./inventory.js";
import { distance, hash2, lineCells, mulberry32, uid } from "./util.js";

export const BUILDINGS = [
  { id: "house", name: "REIHENHAUS", x: 3, y: 3, w: 10, h: 11, floor: "floor", door: { x: 8, y: 13 }, wall: "#78695e", roof: "#4b4039", locked: true, lockDifficulty: 14 },
  { id: "police", name: "POLIZEIPOSTEN", x: 16, y: 3, w: 10, h: 11, floor: "policeFloor", door: { x: 21, y: 13 }, wall: "#68726d", roof: "#34423d" },
  { id: "market", name: "NAHKAUF", x: 35, y: 3, w: 10, h: 11, floor: "floor", door: { x: 40, y: 13 }, wall: "#777565", roof: "#4c5148" },
  { id: "safehouse", name: "UNTERSCHLUPF", x: 3, y: 34, w: 10, h: 11, floor: "floor", door: { x: 8, y: 34 }, wall: "#6e6658", roof: "#354237" },
  { id: "club", name: "JAGDVEREIN", x: 16, y: 34, w: 10, h: 11, floor: "clubFloor", door: { x: 21, y: 34 }, wall: "#71634f", roof: "#453d31", locked: true, lockDifficulty: 22 },
  { id: "pharmacy", name: "APOTHEKE", x: 35, y: 34, w: 10, h: 11, floor: "pharmacyFloor", door: { x: 40, y: 34 }, wall: "#6f786d", roof: "#314239", locked: true, keyId: "pharmacy", lockDifficulty: 24 },
];

const deepCopy = value => JSON.parse(JSON.stringify(value));

export class World {
  constructor(seed = 981013) {
    this.seed = seed;
    this.random = mulberry32(seed);
    this.tiles = [];
    this.objects = [];
    this.buildings = [];
    this.noises = [];
    this.blood = [];
    this.objectCounter = 0;
    this.generate();
  }

  reset(seed = this.seed) {
    this.seed = seed;
    this.random = mulberry32(seed);
    this.tiles = [];
    this.objects = [];
    this.noises = [];
    this.blood = [];
    this.objectCounter = 0;
    this.generate();
  }

  generate() {
    this.buildings = BUILDINGS.map(building => deepCopy(building));
    for (let y = 0; y < VIEW.worldH; y++) {
      const row = [];
      for (let x = 0; x < VIEW.worldW; x++) row.push(this.baseTile(x, y));
      this.tiles.push(row);
    }
    for (const building of this.buildings) this.addBuilding(building);
    this.addStreetDetails();
    this.addVegetation();
    this.addContainers();
  }

  baseTile(x, y) {
    if (x === 0 || y === 0 || x === VIEW.worldW - 1 || y === VIEW.worldH - 1) return "water";
    if (x >= 29 && x <= 33) return "road";
    if (y >= 18 && y <= 22) return "road";
    if (x === 28 || x === 34 || y === 17 || y === 23) return "sidewalk";
    return hash2(x, y, this.seed) > 0.85 ? "dirt" : "grass";
  }

  addBuilding(building) {
    for (let y = building.y; y < building.y + building.h; y++) {
      for (let x = building.x; x < building.x + building.w; x++) this.tiles[y][x] = building.floor;
    }
    for (let x = building.x; x < building.x + building.w; x++) {
      this.addWallUnlessDoor(x, building.y, building, "north");
      this.addWallUnlessDoor(x, building.y + building.h - 1, building, "south");
    }
    for (let y = building.y + 1; y < building.y + building.h - 1; y++) {
      this.addWallUnlessDoor(building.x, y, building, "west");
      this.addWallUnlessDoor(building.x + building.w - 1, y, building, "east");
    }
    const door = this.addObject("door", building.door.x, building.door.y, {
      solid: true,
      blocksSight: true,
      interactable: true,
      closed: true,
      locked: Boolean(building.locked),
      keyId: building.keyId || null,
      lockDifficulty: building.lockDifficulty || 0,
      building: building.id,
      orientation: building.door.y === building.y || building.door.y === building.y + building.h - 1 ? "x" : "y",
      name: `${building.name}: Eingang`,
    });
    building.doorId = door.id;
  }

  addWallUnlessDoor(x, y, building, side) {
    if (x === building.door.x && y === building.door.y) return;
    this.addObject("wall", x, y, {
      solid: true,
      blocksSight: true,
      side,
      building: building.id,
      color: building.wall,
    });
  }

  addContainers() {
    const starter = this.addObject("cabinet", 5.2, 37.0, { interactable: true, solid: true, container: "kitchen", name: "KÜCHENSCHRANK", tutorial: true });
    this.ensureItem(starter, createItem("kitchen_knife"));
    this.ensureItem(starter, createItem("bandage"));
    this.ensureItem(starter, createItem("water"));
    this.addObject("fridge", 5.2, 39.2, { interactable: true, solid: true, container: "fridge", name: "KÜHLSCHRANK" });
    this.addObject("radio", 10.7, 42.0, { interactable: true, solid: true, name: "KOFFERRADIO", used: false });
    this.addObject("bed", 10.3, 36.5, { solid: true, name: "MATRATZE" });

    this.addObject("cabinet", 5.1, 5.2, { interactable: true, solid: true, container: "kitchen", name: "HÄNGESCHRANK" });
    this.addObject("fridge", 5.1, 7.2, { interactable: true, solid: true, container: "fridge", name: "KÜHLSCHRANK" });
    this.addObject("toolbox", 10.5, 11.2, { interactable: true, solid: true, container: "tools", name: "WERKZEUGKISTE" });
    const houseCorpse = this.addObject("corpse", 8.2, 8.4, { interactable: true, solid: false, container: "corpse", name: "REGLOSE PERSON" });
    this.ensureItem(houseCorpse, createItem("pharmacy_key"));

    this.addObject("desk", 18.2, 5.2, { interactable: true, solid: true, container: "police", name: "DIENSTSCHREIBTISCH" });
    const policeLocker = this.addObject("gunlocker", 23.5, 5.2, {
      interactable: true, solid: true, container: "police", name: "GESICHERTER WAFFENSCHRANK",
      locked: true, keyId: "police", lockDifficulty: 30,
    });
    policeLocker.items.push(
      createItem("pistol_9mm", 1, { loadedRounds: 5 }),
      createItem("mag_9mm_12", 1, { rounds: 8 }),
      createItem("ammo_9mm", 10),
      createItem("revolver_38", 1, { rounds: 3 }),
      createItem("ammo_38", 6),
      createItem("reflex_sight"),
    );
    const policeCorpse = this.addObject("corpse", 21.2, 9.2, { interactable: true, solid: false, container: "corpse", name: "POLIZIST" });
    this.ensureItem(policeCorpse, createItem("police_key"));

    for (const [x, y] of [[37,5],[40,5],[42.5,5],[37,8],[40,8],[42.5,8],[37,11],[42.5,11]]) {
      this.addObject("shelf", x, y, { interactable: true, solid: true, container: "grocery", name: "VERKAUFSREGAL" });
    }
    this.addObject("counter", 42, 12.2, { solid: true, name: "KASSE" });
    this.addObject("locker", 36.5, 12, { interactable: true, solid: true, container: "clothing", name: "PERSONALSPIND" });

    const clubLocker = this.addObject("gunlocker", 18.1, 36.4, {
      interactable: true, solid: true, container: "hunting", name: "VEREINSSCHRANK",
      locked: true, lockDifficulty: 26,
    });
    clubLocker.items.push(
      createItem("shotgun_12g", 1, { rounds: 1 }),
      createItem("shell_12g", 6),
      createItem("hunting_rifle", 1, { rounds: 1 }),
      createItem("ammo_rifle", 5),
      createItem("shotgun_choke"),
      createItem("recoil_pad"),
      createItem("weapon_sling"),
      createItem("shell_holder"),
    );
    this.addObject("toolbox", 23.4, 36.4, { interactable: true, solid: true, container: "tools", name: "WERKBANK" });
    this.addObject("locker", 23.4, 41.3, { interactable: true, solid: true, container: "clothing", name: "UMKLEIDESPIND" });

    const medicine = this.addObject("shelf", 37.2, 36.2, { interactable: true, solid: true, container: "pharmacy", name: "MEDIKAMENTENSCHRANK" });
    medicine.items.push(createItem("sealed_antibiotics"));
    this.addObject("shelf", 37.2, 39.2, { interactable: true, solid: true, container: "pharmacy", name: "VERBANDSSCHRANK" });
    this.addObject("shelf", 42.5, 36.2, { interactable: true, solid: true, container: "pharmacy", name: "APOTHEKENREGAL" });
    this.addObject("counter", 40, 42.1, { solid: true, name: "TRESEN" });
    this.addObject("corpse", 41.6, 39.3, { interactable: true, solid: false, container: "corpse", name: "APOTHEKERIN" });
  }

  addStreetDetails() {
    for (let y = 2; y < VIEW.worldH - 2; y += 5) {
      this.addObject("streetlamp", 28.2, y, { solid: true, light: true, blocksSight: false });
      if (y < 17 || y > 23) this.addObject("streetlamp", 34.8, y, { solid: true, light: true, blocksSight: false });
    }
    for (let x = 3; x < VIEW.worldW - 3; x += 7) {
      if (x < 28 || x > 34) this.addObject("streetlamp", x, 23.8, { solid: true, light: true, blocksSight: false });
    }
    this.addObject("car", 31.2, 8.0, { solid: true, blocksSight: true, orientation: "y", color: "#6d392f", name: "ROTER WARTBURG" });
    this.addObject("car", 32.0, 39.0, { solid: true, blocksSight: true, orientation: "y", color: "#455d67", name: "BLAUER GOLF" });
    this.addObject("car", 9.0, 20.0, { solid: true, blocksSight: true, orientation: "x", color: "#77715a", name: "BEIGER TRABANT" });
    this.addObject("car", 39.2, 20.8, { solid: true, blocksSight: true, orientation: "x", color: "#4b5b48", name: "GRÜNER PASSAT" });
    this.addObject("busstop", 34.8, 20.2, { solid: true, blocksSight: true, name: "BUSHALTESTELLE" });
    this.addObject("sign", 34.7, 35.0, { solid: false, name: "APOTHEKE" });
    this.addObject("sign", 34.7, 12.5, { solid: false, name: "NAHKAUF" });
    this.addObject("sign", 15.0, 35.0, { solid: false, name: "JAGDVEREIN" });
    this.addObject("sign", 15.0, 12.5, { solid: false, name: "POLIZEI" });
  }

  addVegetation() {
    for (let y = 2; y < VIEW.worldH - 2; y++) {
      for (let x = 2; x < VIEW.worldW - 2; x++) {
        const tile = this.tiles[y][x];
        if (!["grass", "dirt"].includes(tile) || this.insideAnyBuilding(x, y, 1.3)) continue;
        const r = hash2(x * 3, y * 5, this.seed + 31);
        if (r > 0.93) this.addObject("tree", x + 0.15, y + 0.12, { solid: true, blocksSight: true, variant: Math.floor(r * 10) % 3 });
        else if (r > 0.85) this.addObject("bush", x + 0.2, y + 0.15, { solid: false, cover: 0.28, variant: Math.floor(r * 20) % 2 });
      }
    }
  }

  addObject(type, x, y, options = {}) {
    const object = {
      id: options.id || `world-${++this.objectCounter}`,
      type,
      x,
      y,
      solid: false,
      blocksSight: false,
      interactable: false,
      static: options.static !== false,
      name: options.name || OBJECT_LABELS[type] || type,
      ...options,
    };
    if (options.container && !options.items) object.items = this.rollLoot(options.container);
    this.objects.push(object);
    return object;
  }

  addCorpse(x, y, name, items, metadata = {}) {
    return this.addObject("corpse", x, y, {
      id: uid("corpse"),
      static: false,
      interactable: true,
      solid: false,
      container: "corpse",
      name,
      items: deepCopy(items),
      survivor: true,
      ...metadata,
    });
  }

  ensureItem(container, item) {
    if (!container.items.some(existing => existing.type === item.type)) container.items.push(item);
  }

  rollLoot(tableName) {
    const result = [];
    for (const [type, chance, min, max] of LOOT_TABLES[tableName] || []) {
      if (this.random() <= chance) {
        result.push(createItem(type, min + Math.floor(this.random() * (max - min + 1))));
      }
    }
    return result;
  }

  tileAt(x, y) {
    const tx = Math.round(x);
    const ty = Math.round(y);
    if (tx < 0 || ty < 0 || tx >= VIEW.worldW || ty >= VIEW.worldH) return "water";
    return this.tiles[ty][tx];
  }

  objectAtCell(x, y, predicate = () => true) {
    return this.objects.find(object => !object.removed
      && Math.round(object.x) === Math.round(x)
      && Math.round(object.y) === Math.round(y)
      && predicate(object)) || null;
  }

  doorAtCell(x, y) {
    return this.objectAtCell(x, y, object => object.type === "door");
  }

  objectsNear(x, y, radius = 1) {
    return this.objects.filter(object => !object.removed && distance({ x, y }, object) <= radius);
  }

  isPathCellWalkable(x, y, options = {}) {
    if (x < 1 || y < 1 || x >= VIEW.worldW - 1 || y >= VIEW.worldH - 1 || this.tileAt(x, y) === "water") return false;
    const blocker = this.objectAtCell(x, y, object => object.solid);
    if (!blocker) return true;
    if (blocker.type === "door" && options.allowDoors && !blocker.locked) return true;
    if (options.ignoreId && blocker.id === options.ignoreId) return true;
    return false;
  }

  isWalkable(x, y, radius = 0.27, ignoreId = null) {
    if (this.tileAt(x, y) === "water") return false;
    for (const object of this.objects) {
      if (object.removed || !object.solid || object.id === ignoreId) continue;
      let objectRadius = 0.43;
      if (object.type === "tree" || object.type === "streetlamp") objectRadius = 0.34;
      if (object.type === "car") objectRadius = 0.72;
      if (distance({ x, y }, object) < radius + objectRadius) return false;
    }
    return true;
  }

  hasLineOfSight(a, b) {
    const cells = lineCells(a.x, a.y, b.x, b.y);
    for (let index = 1; index < cells.length - 1; index++) {
      const blocker = this.objectAtCell(cells[index].x, cells[index].y, object => {
        if (object.type === "door") return object.closed;
        return object.blocksSight;
      });
      if (blocker) return false;
    }
    return true;
  }

  concealmentAt(point) {
    let cover = 0;
    for (const object of this.objectsNear(point.x, point.y, 0.78)) cover = Math.max(cover, object.cover || 0);
    return cover;
  }

  insideBuilding(point, buildingId = null) {
    return this.buildings.find(building => (!buildingId || building.id === buildingId)
      && point.x > building.x
      && point.y > building.y
      && point.x < building.x + building.w - 1
      && point.y < building.y + building.h - 1) || null;
  }

  insideAnyBuilding(x, y, margin = 0) {
    return this.buildings.some(building => x >= building.x - margin
      && y >= building.y - margin
      && x <= building.x + building.w - 1 + margin
      && y <= building.y + building.h - 1 + margin);
  }

  emitNoise(x, y, radius, kind = "noise", duration = 4, strength = 1) {
    const noise = { id: uid("noise"), x, y, radius, kind, life: duration, maxLife: duration, strength };
    this.noises.push(noise);
    return noise;
  }

  update(delta) {
    for (const noise of this.noises) noise.life -= delta;
    this.noises = this.noises.filter(noise => noise.life > 0);
    for (const blood of this.blood) blood.life -= delta * 0.0015;
    this.blood = this.blood.filter(blood => blood.life > 0);
  }

  serialize() {
    return this.objects
      .filter(object => object.interactable || !object.static)
      .map(object => ({
        id: object.id,
        type: object.type,
        x: object.x,
        y: object.y,
        static: object.static,
        interactable: object.interactable,
        solid: object.solid,
        blocksSight: object.blocksSight,
        closed: object.closed,
        locked: object.locked,
        searched: object.searched,
        used: object.used,
        removed: object.removed,
        name: object.name,
        container: object.container,
        items: deepCopy(object.items || []),
        survivor: object.survivor,
        survivorId: object.survivorId,
        deathCause: object.deathCause,
      }));
  }

  restore(saved = []) {
    const byId = new Map(saved.map(state => [state.id, state]));
    for (const object of this.objects) {
      const state = byId.get(object.id);
      if (!state) continue;
      for (const property of ["closed", "locked", "searched", "used", "removed"]) {
        if (typeof state[property] === "boolean") object[property] = state[property];
      }
      if (object.type === "door") {
        object.solid = Boolean(object.closed);
        object.blocksSight = Boolean(object.closed);
      }
      if (Array.isArray(state.items)) object.items = deepCopy(state.items);
      byId.delete(object.id);
    }
    for (const state of byId.values()) {
      if (state.static !== false) continue;
      this.addObject(state.type, state.x, state.y, { ...deepCopy(state), id: state.id, static: false });
    }
  }

  palette(type) {
    return COLORS[type] || COLORS.grass;
  }
}
