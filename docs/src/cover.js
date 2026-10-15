import { PLAYER_BODY_RADIUS } from "./world-scale.js";

// Cover identity is local: adjoining shrubs shelter a crossing without sharing
// enemy knowledge. Building sides are separate areas, not an entire building.
export const COVER_RULES = Object.freeze({ margin: 0.72, minimumScore: 0.42, playerRadius: PLAYER_BODY_RADIUS });

export const coverKind = object => ["tree", "bush"].includes(object.type) ? "concealment" : "occlusion";

export function vehicleFootprint(object) {
  return object.orientation === "x" ? { x: 0.86, y: 0.47 } : { x: 0.47, y: 0.86 };
}

export function coverFootprint(object) {
  if (object.footprint) return object.footprint;
  if (object.type === "car") return vehicleFootprint(object);
  if (object.type === "wall" || object.type === "door") return { x: 0.5, y: 0.5 };
  if (object.type === "shed") return { x: 0.65, y: 0.65 };
  return { radius: object.type === "tree" ? 0.34 : 0.42 };
}

export function distanceToFootprint(point, object) {
  const shape = coverFootprint(object);
  const dx = Math.abs(point.x - object.x), dy = Math.abs(point.y - object.y);
  return shape.radius !== undefined ? Math.max(0, Math.hypot(dx, dy) - shape.radius)
    : Math.hypot(Math.max(0, dx - shape.x), Math.max(0, dy - shape.y));
}

export function segmentHitsVehicle(a, b, object) {
  return segmentHitsBox(a, b, object, vehicleFootprint(object));
}

export function segmentHitsBox(a, b, object, shape) {
  let enter = 0, leave = 1;
  for (const axis of ["x", "y"]) {
    const direction = b[axis] - a[axis], start = a[axis] - object[axis];
    if (Math.abs(direction) < .00001) {
      if (Math.abs(start) > shape[axis]) return false;
      continue;
    }
    const t1 = (-shape[axis] - start) / direction, t2 = (shape[axis] - start) / direction;
    enter = Math.max(enter, Math.min(t1, t2)); leave = Math.min(leave, Math.max(t1, t2));
    if (enter > leave) return false;
  }
  return leave > .001 && enter < .999;
}

export function usableCover(object) {
  return !object.removed && (object.cover || 0) >= COVER_RULES.minimumScore
    && (object.type !== "door" || object.closed);
}

export function coverClearance(point, object, neighbors = [], margin = COVER_RULES.margin) {
  let value = margin - distanceToFootprint(point, object);
  if (object.type !== "wall") return value;
  const horizontal = object.side === "north" || object.side === "south";
  const along = horizontal ? "x" : "y", across = horizontal ? "y" : "x";
  for (const door of neighbors) {
    if (door.type !== "door" || door.closed || door.removed
      || (door.orientation && door.orientation !== (horizontal ? "x" : "y"))
      || (door.building && object.building && door.building !== object.building)
      || Math.abs(door[across] - object[across]) > .51
      || Math.abs(point[across] - door[across]) > coverFootprint(object)[across] + margin) continue;
    // An open doorway interrupts the wall band; vegetation can still conceal it.
    value = Math.min(value, Math.abs(point[along] - door[along]) - coverFootprint(door)[along]);
  }
  return value;
}

export function coverAreaId(object, point) {
  if (object.type !== "wall") return object.id;
  const horizontal = object.side === "north" || object.side === "south";
  const face = (horizontal ? point.y - object.y : point.x - object.x) < 0 ? "negative" : "positive";
  return `wall:${object.building}:${object.side}:${face}`;
}

export class CoverMap {
  constructor(world) {
    this.world = world; this.areaCache = new Map(); this.neighborCache = new Map();
    this.neighborRevision = world.sightRevision;
  }

  neighbors(point) {
    if (this.neighborRevision !== this.world.sightRevision) {
      this.neighborCache.clear(); this.neighborRevision = this.world.sightRevision;
    }
    const x = Math.round(point.x), y = Math.round(point.y), key = `${x},${y}`;
    if (!this.neighborCache.has(key)) this.neighborCache.set(key, this.world.objectsInBounds(x - 2, y - 2, x + 2, y + 2));
    return this.neighborCache.get(key);
  }

  at(point, preferredId = null, observer = null, allowOccupied = false) {
    if (!allowOccupied && !this.world.isWalkable(point.x, point.y, COVER_RULES.playerRadius)) return null;
    let best = null, bestDistance = Infinity, blocked = null;
    const neighbors = this.neighbors(point);
    for (const object of neighbors) {
      if (Math.hypot(point.x - object.x, point.y - object.y) > 2) continue;
      if (!usableCover(object)) continue;
      const d = distanceToFootprint(point, object);
      if (coverClearance(point, object, neighbors) < 0) continue;
      const id = coverAreaId(object, point);
      const kind = coverKind(object);
      if (observer && kind === "occlusion") {
        blocked ??= !this.world.hasLineOfSight(observer, point);
        if (!blocked) continue;
        const blockers = object.type === "wall" ? this.area(id)?.objects || [object] : [object];
        if (!blockers.some(blocker => usableCover(blocker) && blocker.blocksSight
          && segmentHitsBox(observer, point, blocker, blocker.type === "car" ? vehicleFootprint(blocker) : { x: .5, y: .5 }))) continue;
      }
      // A slight hysteresis stops overlapping cover from flickering between IDs.
      // Vegetation always keeps its concealment even beside a nearer wall/car.
      const score = d - (id === preferredId ? 0.12 : 0) - (kind === "concealment" ? 2 : 0);
      if (score >= bestDistance) continue;
      bestDistance = score;
      best = { id, sourceId: object.id, label: object.coverLabel || "DECKUNG", score: object.cover, kind, object };
    }
    if (best && !this.areaCache.has(best.id)) {
      const objects = best.object.type === "wall"
        ? this.world.objects.filter(o => o.type === "wall" && o.building === best.object.building && o.side === best.object.side)
        : [best.object];
      this.areaCache.set(best.id, { id: best.id, objects });
    }
    return best;
  }

  area(id) {
    if (this.areaCache.has(id)) return this.areaCache.get(id);
    // Saves store IDs, not object references or derived navigation geometry.
    const wall = id?.startsWith("wall:") ? id.split(":") : null;
    const objects = this.world.objects.filter(o => wall
      ? o.type === "wall" && o.building === wall[1] && o.side === wall[2] : o.id === id);
    if (!objects.length) return null;
    const area = { id, objects };
    this.areaCache.set(id, area);
    return area;
  }

  contains(id, point, margin = COVER_RULES.margin) {
    if (!this.world.isWalkable(point.x, point.y, COVER_RULES.playerRadius)) return false;
    return Boolean(this.area(id)?.objects.some(object => usableCover(object)
      && coverAreaId(object, point) === id && coverClearance(point, object, this.neighbors(point), margin) >= 0));
  }

  searchPoints(id) {
    const area = this.area(id);
    if (!area) return [];
    const points = new Map();
    for (const object of area.objects) {
      for (let y = Math.floor(object.y - 2); y <= Math.ceil(object.y + 2); y++) {
        for (let x = Math.floor(object.x - 2); x <= Math.ceil(object.x + 2); x++) {
          const point = { x, y };
          if (this.contains(id, point, 0.95) && this.world.isPathCellWalkable(x, y, { allowDoors: false })
              && this.world.isWalkable(x, y, 0.25)) points.set(`${x},${y}`, point);
        }
      }
    }
    return [...points.values()];
  }
}
