// Cover identity is local: adjoining shrubs shelter a crossing without sharing
// enemy knowledge. Building sides are separate areas, not an entire building.
export const COVER_RULES = Object.freeze({ margin: 0.72, minimumScore: 0.42 });

export function vehicleFootprint(object) {
  return object.orientation === "x" ? { x: 0.86, y: 0.47 } : { x: 0.47, y: 0.86 };
}

export function coverFootprint(object) {
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
  const shape = vehicleFootprint(object);
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

export function coverAreaId(object, point) {
  if (object.type !== "wall") return object.id;
  const horizontal = object.side === "north" || object.side === "south";
  const face = (horizontal ? point.y - object.y : point.x - object.x) < 0 ? "negative" : "positive";
  return `wall:${object.building}:${object.side}:${face}`;
}

export class CoverMap {
  constructor(world) { this.world = world; this.areaCache = new Map(); }

  at(point, preferredId = null) {
    let best = null, bestDistance = Infinity;
    for (const object of this.world.objectsNear(point.x, point.y, 2)) {
      if (!usableCover(object)) continue;
      const d = distanceToFootprint(point, object);
      if (d > COVER_RULES.margin) continue;
      const id = coverAreaId(object, point);
      // A slight hysteresis stops overlapping cover from flickering between IDs.
      const score = d - (id === preferredId ? 0.12 : 0);
      if (score >= bestDistance) continue;
      bestDistance = score;
      best = { id, sourceId: object.id, label: object.coverLabel || "DECKUNG", score: object.cover, object };
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
    return Boolean(this.area(id)?.objects.some(object => usableCover(object)
      && coverAreaId(object, point) === id && distanceToFootprint(point, object) <= margin));
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
