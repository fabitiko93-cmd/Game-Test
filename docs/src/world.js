import { COLORS, VIEW } from "./config.js";
import { CoverMap, distanceToFootprint, segmentHitsVehicle, segmentHitsBox } from "./cover.js";
import { LOOT_TABLES, OBJECT_LABELS } from "./data.js";
import { createItem } from "./inventory.js";
import { clamp, distance, hash2, lineCells, mulberry32, uid } from "./util.js";
import { obstacleClearance, segmentBlocked } from "./collision.js";
import { buildingWalls, doorSide, doorGeometry } from "./building-geometry.js";
import { PLAYER_BODY_RADIUS, ZOMBIE_WORLD_RADIUS, metersToTiles, WORLD_SCALE } from "./world-scale.js";
import { furnishingDimensions, furnishingFootprint } from "./quaternius-catalog.js";
import { furnishBuildings } from "./interior-layout.js";
import { createWeaponTestItems } from "./weapon-test-crate.js";

export const BUILDINGS = [
  { id: "police", name: "POLIZEIPOSTEN", x: 16, y: 5, w: 8, h: 8, floor: "policeFloor", door: { x: 20, y: 12 }, wall: "#68726d", roof: "#34423d" },
  { id: "market", name: "NAHKAUF", x: 37, y: 5, w: 8, h: 9, floor: "floor", door: { x: 40, y: 13 }, wall: "#777565", roof: "#4c5148" },
  { id: "safehouse", name: "UNTERSCHLUPF", x: 6, y: 35, w: 6, h: 7, floor: "floor", door: { x: 8, y: 35 }, wall: "#6e6658", roof: "#354237" },
  { id: "pharmacy", name: "APOTHEKE", x: 37, y: 35, w: 8, h: 9, floor: "pharmacyFloor", door: { x: 40, y: 35 }, wall: "#6f786d", roof: "#314239", locked: true, keyId: "pharmacy", lockDifficulty: 24 },
];

export const OPEN_POIS = [
  { id: "residential-yard", name: "WOHNHOF", x: 3, y: 3, w: 10, h: 11, theme: "residential" },
  { id: "hunting-yard", name: "JAGDGELÄNDE", x: 15, y: 34, w: 11, h: 11, theme: "hunting" },
];

const deepCopy = value => JSON.parse(JSON.stringify(value));

export class World {
  constructor(seed = 981013) {
    this.seed = seed;
    this.random = mulberry32(seed);
    this.tiles = [];
    this.objects = [];
    this.objectGrid = new Map();
    this.vehicleCollisionCells = new Map();
    this.vehicles = [];
    this.buildings = [];
    this.openPOIs = [];
    this.noises = [];
    this.blood = [];
    this.objectCounter = 0;
    this.sightRevision = 0;
    this.generate();
    this.coverMap = new CoverMap(this);
  }

  reset(seed = this.seed) {
    this.seed = seed;
    this.random = mulberry32(seed);
    this.tiles = [];
    this.objects = [];
    this.objectGrid = new Map();
    this.vehicleCollisionCells = new Map();
    this.vehicles = [];
    this.noises = [];
    this.blood = [];
    this.objectCounter = 0;
    this.sightRevision = 0;
    this.generate();
    this.coverMap = new CoverMap(this);
  }

  generate() {
    this.buildings = BUILDINGS.map(building => deepCopy(building));
    this.openPOIs = OPEN_POIS.map(poi => deepCopy(poi));
    for (let y = 0; y < VIEW.worldH; y++) {
      const row = [];
      for (let x = 0; x < VIEW.worldW; x++) row.push(this.baseTile(x, y));
      this.tiles.push(row);
    }
    for (const building of this.buildings) this.addBuilding(building);
    this.addStreetDetails();
    this.addOutdoorLots();
    this.addVegetation();
    this.addContainers();
    furnishBuildings(this);
    const safehouse = this.buildings.find(building => building.id === "safehouse");
    this.addObject("weaponcrate", safehouse.door.x - .45, safehouse.door.y + 1.05, {
      id: "starter-weapon-test-crate", name: "WAFFEN-TESTKISTE", building: safehouse.id,
      interactable: true, solid: true, locked: false,
      footprint: { x: metersToTiles(.45), y: metersToTiles(.325) }, heightMeters: .5,
      items: createWeaponTestItems(),
    });
  }

  baseTile(x, y) {
    if (x === 0 || y === 0 || x === VIEW.worldW - 1 || y === VIEW.worldH - 1) return "water";

    const mainRoad = (x >= 29 && x <= 33) || (y >= 18 && y <= 22);
    const ringRoad = ((y >= 14 && y <= 15) || (y >= 30 && y <= 31)) && x >= 2 && x <= 45;
    const sideRoad = ((x >= 13 && x <= 14) || (x >= 34 && x <= 35)) && y >= 14 && y <= 31;
    if (mainRoad || ringRoad || sideRoad) return "road";

    const sidewalk = (x >= 28 && x <= 34 && (y === 17 || y === 23))
      || (y >= 17 && y <= 23 && (x === 28 || x === 34))
      || ((y === 13 || y === 16 || y === 29 || y === 32) && x >= 2 && x <= 45)
      || ((x === 12 || x === 15 || x === 33 || x === 36) && y >= 14 && y <= 31);
    if (sidewalk) return "sidewalk";

    return hash2(x, y, this.seed) > 0.82 ? "dirt" : "grass";
  }

  addBuilding(building) {
    for (let y = building.y; y < building.y + building.h; y++) {
      for (let x = building.x; x < building.x + building.w; x++) this.tiles[y][x] = building.floor;
    }
    for (const wall of buildingWalls(building)) this.addObject("wall", wall.x, wall.y, {
      solid: true, blocksSight: true, cover: .58, coverLabel: "MAUER",
      building: building.id, color: building.wall, ...wall,
    });
    const side = doorSide(building), orientation = ["north", "south"].includes(side) ? "x" : "y";
    const door = this.addObject("door", building.door.x, building.door.y, {
      solid: true,
      blocksSight: true,
      cover: 0.52,
      coverLabel: "TÜRRAHMEN",
      interactable: true,
      closed: true,
      locked: Boolean(building.locked),
      keyId: building.keyId || null,
      lockDifficulty: building.lockDifficulty || 0,
      building: building.id,
      orientation, side, wallColor: building.wall,
      footprint: doorGeometry({ orientation }).footprint,
      name: `${building.name}: Eingang`,
    });
    building.doorId = door.id;
  }

  addContainers() {
    const starter = this.addObject("cabinet", 6.26, 36.2, { interactable: true, solid: true, container: "kitchen", name: "KÜCHENSCHRANK", tutorial: true, yaw:Math.PI/2 });
    this.ensureItem(starter, createItem("kitchen_knife"));
    this.ensureItem(starter, createItem("bandage"));
    this.ensureItem(starter, createItem("water"));
    this.addObject("fridge", 6.3, 37.65, { interactable: true, solid: true, container: "fridge", name: "KÜHLSCHRANK",yaw:Math.PI/2,
      footprint: { x: metersToTiles(WORLD_SCALE.fridge.width / 2), y: metersToTiles(WORLD_SCALE.fridge.depth / 2) } });
    this.addObject("radio", 10.25, 40.2, { interactable: true, solid: true, name: "KOFFERRADIO", used: false });
    this.addObject("bed", 10.35, 36, { solid: true, name: "EINZELBETT" });

    this.addObject("desk", 17.2, 6, { interactable: true, solid: true, container: "police", name: "DIENSTSCHREIBTISCH" });
    const policeLocker = this.addObject("gunlocker", 22, 6, {
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

    for (const [x, y] of [[37.8,5.8],[40.5,5.8],[43.2,5.8],[37.8,8.8],[40.5,8.8],[43.2,8.8],[37.8,11.1],[43.2,11.1]]) {
      this.addObject("shelf", x, y, { interactable: true, solid: true, container: "grocery", name: "VERKAUFSREGAL" });
    }
    this.addObject("counter", 43, 12.2, { solid: true, name: "KASSE" });
    this.addObject("locker", 37.7, 12, { interactable: true, solid: true, container: "clothing", name: "PERSONALSPIND" });

    const medicine = this.addObject("shelf", 38, 36.2, { interactable: true, solid: true, container: "pharmacy", name: "MEDIKAMENTENSCHRANK" });
    medicine.items.push(createItem("sealed_antibiotics"));
    this.addObject("shelf", 38, 39.6, { interactable: true, solid: true, container: "pharmacy", name: "VERBANDSSCHRANK" });
    this.addObject("shelf", 43, 36.2, { interactable: true, solid: true, container: "pharmacy", name: "APOTHEKENREGAL" });
    this.addObject("counter", 41, 41.6, { solid: true, name: "TRESEN" });
    this.addObject("corpse", 42.6, 40.3, { interactable: true, solid: false, container: "corpse", name: "APOTHEKERIN" });
  }

  addStreetDetails() {
    for (let y = 2; y < VIEW.worldH - 2; y += 5) {
      this.addObject("streetlamp", 28.2, y, { solid: true, light: true, blocksSight: false });
      if (y < 17 || y > 23) this.addObject("streetlamp", 34.8, y, { solid: true, light: true, blocksSight: false });
    }
    for (let x = 3; x < VIEW.worldW - 3; x += 7) {
      if (x < 28 || x > 34) this.addObject("streetlamp", x, 23.8, { solid: true, light: true, blocksSight: false });
    }
    this.addVehicle( 31.2, 8.0, { solid: true, blocksSight: true, cover: 0.56, coverLabel: "FAHRZEUG", orientation: "y", color: "#6d392f", name: "ROTER WARTBURG" });
    this.addVehicle( 32.0, 39.0, { solid: true, blocksSight: true, cover: 0.56, coverLabel: "FAHRZEUG", orientation: "y", color: "#455d67", name: "BLAUER GOLF" });
    this.addVehicle( 9.0, 20.0, { solid: true, blocksSight: true, cover: 0.56, coverLabel: "FAHRZEUG", orientation: "x", color: "#77715a", name: "BEIGER TRABANT" });
    this.addVehicle( 39.2, 20.8, { solid: true, blocksSight: true, cover: 0.56, coverLabel: "FAHRZEUG", orientation: "x", color: "#4b5b48", name: "GRÜNER PASSAT" });
    this.addObject("busstop", 34.8, 20.2, { solid: true, blocksSight: true, cover: 0.62, coverLabel: "BUSHALTESTELLE", name: "BUSHALTESTELLE" });
    this.addObject("sign", 34.7, 35.0, { solid: false, name: "APOTHEKE" });
    this.addObject("sign", 34.7, 12.5, { solid: false, name: "NAHKAUF" });
    this.addObject("sign", 15.0, 35.0, { solid: false, name: "JAGDGELÄNDE" });
    this.addObject("sign", 3.0, 3.0, { solid: false, name: "WOHNHOF" });
    this.addObject("sign", 15.0, 12.5, { solid: false, name: "POLIZEI" });
  }

  addOutdoorLots() {
    const residentialShed = this.addObject("shed", 7.1, 8.0, {
      solid: true, blocksSight: true, interactable: true, container: "tools",
      name: "GARTENSCHUPPEN", color: "#665540",
    });
    const residentialCar = this.addVehicle(10.9, 8.2, {
      orientation: "y", color: "#665947", name: "BRAUNER KLEINWAGEN",
    });
    this.ensureItem(residentialCar, createItem("pharmacy_key"));
    this.addVehicle(4.8, 11.6, {
      orientation: "x", color: "#77705a", name: "AUSGEBLICHENER KOMBI",
    });
    this.addObject("groundloot", 10.2, 5.4, {
      interactable: true, solid: false, container: "tools", name: "GARTENWERKZEUGTASCHE",
    });
    this.addObject("corpse", 8.8, 11.1, {
      interactable: true, solid: false, container: "corpse", name: "REGLOSE PERSON",
    });
    this.addObject("fence", 3.2, 14.3, { orientation: "x", color: "#5b5343" });
    this.addObject("fence", 7.0, 14.3, { orientation: "x", color: "#5b5343" });
    this.addObject("fence", 10.8, 14.3, { orientation: "x", color: "#5b5343" });

    const huntingCache = this.addObject("shed", 20.2, 38.4, {
      solid: true, blocksSight: true, interactable: true, container: "hunting",
      items: [], locked: true, lockDifficulty: 26,
      name: "JAGDLAGER", color: "#6d6047",
    });
    huntingCache.items.push(
      createItem("shotgun_12g", 1, { rounds: 1 }),
      createItem("shell_12g", 6),
      createItem("hunting_rifle", 1, { rounds: 1 }),
      createItem("ammo_rifle", 5),
      createItem("shotgun_choke"),
      createItem("recoil_pad"),
      createItem("weapon_sling"),
      createItem("shell_holder"),
    );
    this.addObject("toolbox", 23.5, 37.4, {
      interactable: true, solid: true, container: "tools", name: "WERKBANK",
    });
    this.addObject("groundloot", 17.5, 41.8, {
      interactable: true, solid: false, container: "clothing", name: "JAGDRUCKSACK",
    });
    this.addVehicle(16.3, 39.5, {
      orientation: "x", color: "#49554c", name: "ALTES JAGDFAHRZEUG",
    });
    this.addVehicle(25.1, 42.0, {
      orientation: "y", color: "#5f4e43", name: "ABGESTELLTER TRANSPORTER",
    });
    this.addObject("fence", 15.2, 34.1, { orientation: "x", color: "#5b5343" });
    this.addObject("fence", 19.0, 34.1, { orientation: "x", color: "#5b5343" });
    this.addObject("fence", 24.0, 34.1, { orientation: "x", color: "#5b5343" });

    this.addVehicle(28.3, 15.0, {
      orientation: "x", color: "#4d514e", name: "LIEFERWAGEN",
    });
    this.addVehicle(26.6, 31.0, {
      orientation: "y", color: "#53636a", name: "KLEINER TRANSPORTER",
    });
  }

  addVehicle(x, y, options = {}) {
    return this.addObject("car", x, y, {
      solid: true, blocksSight: true, cover: 0.56, coverLabel: "FAHRZEUG",
      orientation: "x", interactable: true, container: "vehicle",
      color: "#59615b", name: "LIEGEN GEBLIEBENES FAHRZEUG",
      ...options,
    });
  }

  addVegetation() {
    for (let y = 2; y < VIEW.worldH - 2; y++) {
      for (let x = 2; x < VIEW.worldW - 2; x++) {
        const tile = this.tiles[y][x];
        if (!["grass", "dirt"].includes(tile) || this.insideAnyBuilding(x, y, 1.3) || this.objectAtCell(x, y, object => object.solid)) continue;
        const r = hash2(x * 3, y * 5, this.seed + 31);
        if (r > 0.93) this.addObject("tree", x + 0.15, y + 0.12, {
          solid: true, blocksSight: true, cover: 0.68, coverLabel: "BAUM", variant: Math.floor(r * 10) % 3,
        });
        else if (r > 0.85) this.addObject("bush", x + 0.2, y + 0.15, {
          solid: false, blocksSight: true, cover: 0.74, coverLabel: "BUSCH", variant: Math.floor(r * 20) % 2,
        });
      }
    }
  }

  addObject(type, x, y, options = {}) {
    const furnishing=furnishingDimensions({type,...options});
    const object = {
      id: options.id || `world-${++this.objectCounter}`,
      type,
      x,
      y,
      solid: false,
      blocksSight: false,
      interactable: false,
      cover: 0,
      coverLabel: "DECKUNG",
      static: options.static !== false,
      name: options.name || OBJECT_LABELS[type] || type,
      ...options,
      ...(type==='toolbox'&&!options.footprint?{footprint:{x:.31,y:.23}}:{}),
      ...(furnishing ? { footprint: furnishingFootprint({type,...options}), heightMeters: furnishing.height } : {}),
    };
    if (options.container && !options.items) object.items = this.rollLoot(options.container);
    this.objects.push(object);
    if (object.solid || object.cover > 0) this.touchSight();
    const cellKey = this.cellKey(x, y);
    if (!this.objectGrid.has(cellKey)) this.objectGrid.set(cellKey, []);
    this.objectGrid.get(cellKey).push(object);
    if (type === "car") {
      this.vehicles.push(object);
      for (let cy = Math.floor(y - 2); cy <= Math.ceil(y + 2); cy++) {
        for (let cx = Math.floor(x - 2); cx <= Math.ceil(x + 2); cx++) {
          if (distanceToFootprint({ x: cx, y: cy }, object) >= 0.27) continue;
          const key = this.cellKey(cx, cy);
          if (!this.vehicleCollisionCells.has(key)) this.vehicleCollisionCells.set(key, []);
          this.vehicleCollisionCells.get(key).push(object);
        }
      }
    }
    return object;
  }

  cellKey(x, y) {
    return `${Math.round(x)},${Math.round(y)}`;
  }

  clampPoint(point, margin = 1) {
    return {
      x: clamp(Number(point?.x) || margin, margin, VIEW.worldW - 1 - margin),
      y: clamp(Number(point?.y) || margin, margin, VIEW.worldH - 1 - margin),
    };
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
    return this.objectGrid.get(this.cellKey(x, y))?.find(object => !object.removed && predicate(object)) || null;
  }

  doorAtCell(x, y) {
    return this.objectAtCell(x, y, object => object.type === "door");
  }

  objectsNear(x, y, radius = 1) {
    const result = [];
    const reach = Math.ceil(radius + 0.75);
    const centerX = Math.round(x);
    const centerY = Math.round(y);
    for (let cellY = centerY - reach; cellY <= centerY + reach; cellY++) {
      for (let cellX = centerX - reach; cellX <= centerX + reach; cellX++) {
        for (const object of this.objectGrid.get(this.cellKey(cellX, cellY)) || []) {
          if (!object.removed && distance({ x, y }, object) <= radius) result.push(object);
        }
      }
    }
    return result;
  }

  objectsInBounds(minX, minY, maxX, maxY) {
    const result = [];
    for (let y = Math.max(0, Math.floor(minY)); y <= Math.min(VIEW.worldH - 1, Math.ceil(maxY)); y++) {
      for (let x = Math.max(0, Math.floor(minX)); x <= Math.min(VIEW.worldW - 1, Math.ceil(maxX)); x++) {
        for (const object of this.objectGrid.get(this.cellKey(x, y)) || []) {
          if (!object.removed) result.push(object);
        }
      }
    }
    return result;
  }

  isPathCellWalkable(x, y, options = {}) {
    if (x < 1 || y < 1 || x >= VIEW.worldW - 1 || y >= VIEW.worldH - 1 || this.tileAt(x, y) === "water") return false;
    return this.isWalkable(x, y, options.radius ?? ZOMBIE_WORLD_RADIUS, options.ignoreId, options);
  }

  isWalkable(x, y, radius = PLAYER_BODY_RADIUS, ignoreId = null, options = {}) {
    if (this.tileAt(x, y) === "water") return false;
    // A car's footprint can extend beyond the ordinary point-neighbor radius.
    for (const car of this.vehicles) {
      if (!car.removed && car.solid && car.id !== ignoreId
        && distanceToFootprint({ x, y }, car) < radius - .000001) return false;
    }
    const reach = Math.ceil(radius + .5), cx = Math.round(x), cy = Math.round(y);
    for (let oy = cy - reach; oy <= cy + reach; oy++) for (let ox = cx - reach; ox <= cx + reach; ox++) {
      for (const object of this.objectGrid.get(`${ox},${oy}`) || []) {
        if (object.removed || !object.solid || object.id === ignoreId || object.type === "car") continue;
        if (options.allowDoors && object.type === "door" && !object.locked) continue;
        if (obstacleClearance({ x, y }, object, radius) < -.000001) return false;
      }
    }
    return true;
  }

  canWalkSegment(a, b, radius = PLAYER_BODY_RADIUS, options = {}) {
    const count = Math.max(1, Math.ceil(distance(a, b) / .2));
    for (let i = 0; i <= count; i++) {
      const amount = i / count;
      if (this.tileAt(a.x + (b.x - a.x) * amount, a.y + (b.y - a.y) * amount) === "water") return false;
    }
    for (const car of this.vehicles) {
      if (!car.removed && car.solid && car.id !== options.ignoreId && segmentBlocked(a, b, car, radius)) return false;
    }
    const padding = radius + .5;
    for (const object of this.objectsInBounds(Math.min(a.x, b.x) - padding, Math.min(a.y, b.y) - padding,
      Math.max(a.x, b.x) + padding, Math.max(a.y, b.y) + padding)) {
      if (!object.solid || object.type === "car" || object.id === options.ignoreId) continue;
      if (options.allowDoors && object.type === "door" && !object.locked) continue;
      if (segmentBlocked(a, b, object, radius)) return false;
    }
    return true;
  }

  hasLineOfSight(a, b) {
    if (this.vehicles.some(car => !car.removed && car.blocksSight && segmentHitsVehicle(a, b, car))) return false;
    for (const object of this.objectsInBounds(Math.min(a.x, b.x) - .6, Math.min(a.y, b.y) - .6,
      Math.max(a.x, b.x) + .6, Math.max(a.y, b.y) + .6)) {
      if (object.footprint && (object.type === "door" ? object.closed : object.blocksSight)
        && segmentHitsBox(a, b, object, object.footprint)) return false;
    }
    const cells = lineCells(a.x, a.y, b.x, b.y);
    for (let index = 1; index < cells.length - 1; index++) {
      const blocker = this.objectAtCell(cells[index].x, cells[index].y, object => {
        if (object.footprint) return false;
        if (object.type === "door") return object.closed;
        return object.type !== "car" && object.blocksSight;
      });
      if (blocker) return false;
    }
    return true;
  }

  sightDistance(origin, angle, maxDistance) {
    const step = 0.24;
    let previous = 0;
    for (let current = step; current <= maxDistance; current += step) {
      const x = origin.x + Math.cos(angle) * current;
      const y = origin.y + Math.sin(angle) * current;
      if (x < 1 || y < 1 || x >= VIEW.worldW - 1 || y >= VIEW.worldH - 1) return previous;
      if (!this.hasLineOfSight(origin, { x, y })) return Math.max(0, previous);
      previous = current;
    }
    return maxDistance;
  }

  touchSight() {
    this.sightRevision += 1;
  }

  concealmentAt(point, observer = null) {
    return this.coverMap.at(point, null, observer)?.score || 0;
  }

  coverAt(point, radius = 0.92) {
    let best = { score: 0, label: "KEINE DECKUNG", sourceId: null, object: null };
    for (const object of this.objectsNear(point.x, point.y, radius)) {
      if (!object.cover || object.removed) continue;
      if (object.type === "door" && !object.closed) continue;
      if (object.cover > best.score) {
        best = {
          score: object.cover,
          label: object.coverLabel || object.name || "DECKUNG",
          sourceId: object.id,
          object,
        };
      }
    }
    return best;
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
        items: object.items?deepCopy(object.items):undefined,
        survivor: object.survivor,
        survivorId: object.survivorId,
        deathCause: object.deathCause,
        zombieAppearance: object.zombieAppearance,
        playerAppearance: object.playerAppearance,
        facingYaw: object.facingYaw,
        placementRole:object.placementRole,supportId:object.supportId,renderDepth:object.renderDepth,
        modelAsset:object.modelAsset,modelHeight:object.modelHeight,elevationMeters:object.elevationMeters,yaw:object.yaw,lootable:object.lootable,
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
