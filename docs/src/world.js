import { VIEW, LOOT_TABLES } from "./config.js";
import { choose, distance, hash2, lineCells, mulberry32, uid } from "./util.js";

const BUILDINGS = [
  { id: "safehouse", name: "UNTERSCHLUPF", x: 3, y: 23, w: 9, h: 9, floor: "floor", door: { x: 8, y: 23 }, wall: "#6e6658", roof: "#354237" },
  { id: "house", name: "REIHENHAUS", x: 3, y: 3, w: 9, h: 10, floor: "floor", door: { x: 8, y: 12 }, wall: "#78695e", roof: "#4b4039" },
  { id: "market", name: "NAHKAUF", x: 22, y: 3, w: 11, h: 10, floor: "floor", door: { x: 27, y: 12 }, wall: "#777565", roof: "#4c5148" },
  { id: "pharmacy", name: "APOTHEKE", x: 22, y: 23, w: 11, h: 9, floor: "pharmacyFloor", door: { x: 27, y: 23 }, wall: "#6f786d", roof: "#314239" },
];

export class World {
  constructor(seed = 981013) {
    this.seed = seed;
    this.random = mulberry32(seed);
    this.tiles = [];
    this.objects = [];
    this.buildings = BUILDINGS.map(b => ({ ...b }));
    this.noises = [];
    this.blood = [];
    this.generate();
  }

  generate() {
    this.tiles.length = 0;
    this.objects.length = 0;
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
    if (x >= 15 && x <= 19) return "road";
    if (y >= 15 && y <= 19) return "road";
    if ((x === 14 || x === 20) || (y === 14 || y === 20)) return "sidewalk";
    return hash2(x, y, this.seed) > 0.84 ? "dirt" : "grass";
  }

  addBuilding(b) {
    for (let y = b.y; y < b.y + b.h; y++) {
      for (let x = b.x; x < b.x + b.w; x++) this.tiles[y][x] = b.floor;
    }
    for (let x = b.x; x < b.x + b.w; x++) {
      this.addWallUnlessDoor(x, b.y, b, "north");
      this.addWallUnlessDoor(x, b.y + b.h - 1, b, "south");
    }
    for (let y = b.y + 1; y < b.y + b.h - 1; y++) {
      this.addWallUnlessDoor(b.x, y, b, "west");
      this.addWallUnlessDoor(b.x + b.w - 1, y, b, "east");
    }
    const door = this.addObject("door", b.door.x, b.door.y, {
      solid: true, interactable: true, closed: true, building: b.id,
      orientation: b.door.y === b.y || b.door.y === b.y + b.h - 1 ? "x" : "y",
      label: `${b.name}: Tür öffnen`
    });
    b.doorId = door.id;
  }

  addWallUnlessDoor(x, y, b, side) {
    if (x === b.door.x && y === b.door.y) return;
    this.addObject("wall", x, y, { solid: true, side, building: b.id, color: b.wall });
  }

  addContainers() {
    const starterCabinet = this.addObject("cabinet", 5.2, 25.1, { interactable: true, solid: true, container: "kitchen", name: "KÜCHENSCHRANK", tutorial: true });
    if (!starterCabinet.items.some(item => item.type === "kitchen_knife")) starterCabinet.items.push({ id: uid("item"), type: "kitchen_knife", count: 1 });
    if (!starterCabinet.items.some(item => item.type === "water")) starterCabinet.items.push({ id: uid("item"), type: "water", count: 1 });
    this.addObject("fridge", 5.2, 27.0, { interactable: true, solid: true, container: "fridge", name: "KÜHLSCHRANK" });
    this.addObject("radio", 10.2, 29.8, { interactable: true, solid: true, name: "KOFFERRADIO", used: false });
    this.addObject("bed", 9.8, 25.5, { solid: true, name: "MATRATZE" });

    this.addObject("cabinet", 5.1, 5.0, { interactable: true, solid: true, container: "kitchen", name: "HÄNGESCHRANK" });
    this.addObject("fridge", 5.1, 7.0, { interactable: true, solid: true, container: "fridge", name: "KÜHLSCHRANK" });
    this.addObject("toolbox", 10.2, 10.6, { interactable: true, solid: true, container: "tools", name: "WERKZEUGKISTE" });
    this.addObject("corpse", 8.2, 7.9, { interactable: true, solid: false, container: "corpse", name: "REGLOSE PERSON" });

    for (const [x, y] of [[24,5],[27,5],[30,5],[24,8],[27,8],[30,8],[24,10.5],[30,10.5]]) {
      this.addObject("shelf", x, y, { interactable: true, solid: true, container: "grocery", name: "VERKAUFSREGAL" });
    }
    this.addObject("counter", 27.5, 11, { solid: true, name: "KASSE" });

    const medicine = this.addObject("shelf", 24.2, 25.2, { interactable: true, solid: true, container: "pharmacy", name: "MEDIKAMENTENSCHRANK" });
    medicine.items.push({ id: uid("item"), type: "antibiotics", count: 1 });
    this.addObject("shelf", 24.2, 27.5, { interactable: true, solid: true, container: "pharmacy", name: "VERBANDSSCHRANK" });
    this.addObject("shelf", 30.7, 25.2, { interactable: true, solid: true, container: "pharmacy", name: "APOTHEKENREGAL" });
    this.addObject("counter", 27.4, 29.7, { solid: true, name: "TRESEN" });
    this.addObject("corpse", 28.8, 26.8, { interactable: true, solid: false, container: "corpse", name: "APOTHEKERIN" });
  }

  addStreetDetails() {
    for (let y = 1; y < VIEW.worldH - 1; y += 4) {
      this.addObject("streetlamp", 14.2, y + 0.5, { solid: true, light: true });
      if (y < 14 || y > 20) this.addObject("streetlamp", 20.8, y + 0.5, { solid: true, light: true });
    }
    this.addObject("car", 16.8, 8.2, { solid: true, orientation: "y", color: "#6d392f", name: "ROTER WARTBURG" });
    this.addObject("car", 18.0, 25.6, { solid: true, orientation: "y", color: "#455d67", name: "BLAUER GOLF" });
    this.addObject("car", 8.3, 17.1, { solid: true, orientation: "x", color: "#77715a", name: "BEIGER TRABANT" });
    this.addObject("busstop", 20.8, 17.2, { solid: true, name: "BUSHALTESTELLE" });
    this.addObject("sign", 21.1, 24.0, { solid: false, name: "APOTHEKE" });
    this.addObject("sign", 21.2, 11.5, { solid: false, name: "NAHKAUF" });
  }

  addVegetation() {
    for (let y = 2; y < VIEW.worldH - 2; y++) {
      for (let x = 2; x < VIEW.worldW - 2; x++) {
        const tile = this.tiles[y][x];
        if (tile !== "grass" && tile !== "dirt") continue;
        if (this.insideAnyBuilding(x, y, 1.2)) continue;
        const r = hash2(x * 3, y * 5, this.seed + 31);
        if (r > 0.89) this.addObject("tree", x + .15, y + .12, { solid: true, variant: Math.floor(r * 10) % 3 });
        else if (r > 0.82) this.addObject("bush", x + .2, y + .15, { solid: false, variant: Math.floor(r * 20) % 2 });
      }
    }
  }

  addObject(type, x, y, options = {}) {
    const object = { id: uid(type), type, x, y, solid: false, interactable: false, ...options };
    if (options.container) object.items = this.rollLoot(options.container);
    this.objects.push(object);
    return object;
  }

  rollLoot(tableName) {
    const result = [];
    for (const [type, chance, min, max] of LOOT_TABLES[tableName] || []) {
      if (this.random() <= chance) {
        result.push({ id: uid("item"), type, count: min + Math.floor(this.random() * (max - min + 1)) });
      }
    }
    return result;
  }

  tileAt(x, y) {
    const tx = Math.floor(x), ty = Math.floor(y);
    if (tx < 0 || ty < 0 || tx >= VIEW.worldW || ty >= VIEW.worldH) return "water";
    return this.tiles[ty][tx];
  }

  objectsNear(x, y, radius = 1) {
    return this.objects.filter(o => !o.removed && Math.hypot(o.x - x, o.y - y) <= radius);
  }

  objectAtCell(x, y) {
    return this.objects.find(o => !o.removed && o.solid && Math.floor(o.x) === Math.floor(x) && Math.floor(o.y) === Math.floor(y));
  }

  isWalkable(x, y, radius = .27, ignoreId = null) {
    const tile = this.tileAt(x, y);
    if (tile === "water") return false;
    for (const o of this.objects) {
      if (o.removed || !o.solid || o.id === ignoreId) continue;
      let objectRadius = .43;
      if (o.type === "tree" || o.type === "streetlamp") objectRadius = .34;
      if (o.type === "car") objectRadius = .72;
      if (distance({x,y}, o) < radius + objectRadius) return false;
    }
    return true;
  }

  hasLineOfSight(a, b) {
    const cells = lineCells(a.x, a.y, b.x, b.y);
    for (let i = 1; i < cells.length - 1; i++) {
      const blocker = this.objectAtCell(cells[i].x, cells[i].y);
      if (blocker && ["wall", "door"].includes(blocker.type)) return false;
    }
    return true;
  }

  insideBuilding(point, buildingId = null) {
    return this.buildings.find(b => (!buildingId || b.id === buildingId) && point.x > b.x && point.y > b.y && point.x < b.x + b.w - 1 && point.y < b.y + b.h - 1) || null;
  }

  insideAnyBuilding(x, y, margin = 0) {
    return this.buildings.some(b => x >= b.x - margin && y >= b.y - margin && x <= b.x + b.w - 1 + margin && y <= b.y + b.h - 1 + margin);
  }

  emitNoise(x, y, radius, kind = "noise") {
    this.noises.push({ x, y, radius, kind, life: 1.2, maxLife: 1.2 });
  }

  update(delta) {
    for (const noise of this.noises) noise.life -= delta;
    this.noises = this.noises.filter(n => n.life > 0);
    for (const blood of this.blood) blood.life -= delta * .002;
    this.blood = this.blood.filter(b => b.life > 0);
  }

  serialize() {
    return this.objects.filter(o => o.interactable).map(o => ({ id: o.id, closed: o.closed, used: o.used, removed: o.removed, items: o.items }));
  }

  restore(saved = []) {
    const byId = new Map(saved.map(s => [s.id, s]));
    for (const object of this.objects) {
      const state = byId.get(object.id);
      if (!state) continue;
      if (typeof state.closed === "boolean") { object.closed = state.closed; object.solid = state.closed; }
      object.used = state.used;
      object.removed = state.removed;
      if (Array.isArray(state.items)) object.items = state.items;
    }
  }
}

export { BUILDINGS };
