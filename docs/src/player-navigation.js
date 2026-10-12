import { MinHeap } from "./navigation.js";
import { canInteract } from "./interaction.js";

export const PLAYER_PATH_RULES = Object.freeze({ step: .25, radius: .27, coverDetour: 1.25, coverAllowance: .5 });
const directions = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
const caches = new WeakMap();
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export function playerSegmentClear(world, start, end, options = {}) {
  const width = world.tiles[0].length, height = world.tiles.length;
  if ([start, end].some(point => point.x < 1 || point.y < 1 || point.x > width - 2 || point.y > height - 2)) return false;
  return world.canWalkSegment(start, end, PLAYER_PATH_RULES.radius, options);
}

function covered(world, start, end) {
  const count = Math.max(1, Math.ceil(distance(start, end) / .125));
  for (let i = 0; i <= count; i++) {
    const amount = i / count;
    if (!world.coverMap.at({ x: start.x + (end.x - start.x) * amount,
      y: start.y + (end.y - start.y) * amount })) return false;
  }
  return true;
}

function allowedSegment(world, start, end, options) {
  return (!options.requireCover || covered(world, start, end))
    && (!options.segmentAllowed || options.segmentAllowed(start, end));
}

function gridFor(world, options) {
  let cache = caches.get(world);
  if (!cache || cache.map !== world.coverMap || cache.revision !== world.sightRevision || cache.objects !== world.objectGrid) {
    cache = { map: world.coverMap, revision: world.sightRevision, objects: world.objectGrid, layers: new Map() };
    caches.set(world, cache);
  }
  const key = Boolean(options.allowDoors);
  if (cache.layers.has(key)) return cache.layers.get(key);
  const step = PLAYER_PATH_RULES.step, width = Math.ceil(world.tiles[0].length / step) + 1;
  const height = Math.ceil(world.tiles.length / step) + 1, count = width * height;
  const cells = new Uint8Array(count), shelters = new Uint8Array(count), edges = new Map();
  const grid = {
    width, height, count, edges,
    point: id => ({ x: id % width * step, y: Math.floor(id / width) * step }),
    id: (x, y) => y * width + x,
    walk(x, y) {
      if (x < 4 || y < 4 || x > width - 9 || y > height - 9) return false;
      const id = this.id(x, y);
      if (!cells[id]) cells[id] = world.isWalkable(x * step, y * step, PLAYER_PATH_RULES.radius, null, options) ? 2 : 1;
      return cells[id] === 2;
    },
    shelter(id) {
      if (!shelters[id]) shelters[id] = world.coverMap.at(this.point(id)) ? 2 : 1;
      return shelters[id] === 2;
    },
    edge(a, b, preferCover) {
      const key = Math.min(a, b) * count + Math.max(a, b);
      let entry = edges.get(key);
      if (!entry) {
        entry = { clear: playerSegmentClear(world, this.point(a), this.point(b), options), cover: null };
        if (edges.size > 30000) edges.clear();
        edges.set(key, entry);
      }
      if (entry.clear && preferCover && entry.cover === null) {
        const pa = this.point(a), pb = this.point(b);
        entry.cover = this.shelter(a) && this.shelter(b) && Boolean(world.coverMap.at({ x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 }));
      }
      return entry;
    },
  };
  cache.layers.set(key, grid);
  return grid;
}

function nearby(grid, point, radius) {
  const step = PLAYER_PATH_RULES.step, result = [];
  for (let y = Math.floor((point.y - radius) / step); y <= Math.ceil((point.y + radius) / step); y++) {
    for (let x = Math.floor((point.x - radius) / step); x <= Math.ceil((point.x + radius) / step); x++) {
      if (grid.walk(x, y)) {
        const id = grid.id(x, y), candidate = grid.point(id);
        if (distance(point, candidate) <= radius) result.push({ id, point: candidate });
      }
    }
  }
  return result;
}

function search(world, start, target, goals, options, preferCover = false, lengthLimit = Infinity) {
  const grid = gridFor(world, options), starts = nearby(grid, start, .45)
    .filter(entry => playerSegmentClear(world, start, entry.point, options)
      && allowedSegment(world, start, entry.point, options));
  if (!starts.length || !goals.size) return [];
  const goalRadius = Math.max(...[...goals.values()].map(goal => distance(goal.point, target)));
  const estimate = point => Math.max(0, distance(point, target) - goalRadius);
  const costs = new Float64Array(grid.count).fill(Infinity), lengths = new Float64Array(grid.count).fill(Infinity);
  const parent = new Int32Array(grid.count).fill(-1), closed = new Uint8Array(grid.count), open = new MinHeap();
  for (const entry of starts) {
    const length = distance(start, entry.point), cost = length * (preferCover && !covered(world, start, entry.point) ? 1.5 : 1);
    costs[entry.id] = cost; lengths[entry.id] = length;
    open.push({ id: entry.id, f: cost + estimate(entry.point) });
  }
  let examined = 0;
  while (open.length && examined < (options.maxNodes || (preferCover ? 8000 : 24000))) {
    const current = open.pop(), id = current.id;
    if (closed[id]) continue;
    examined++; closed[id] = 1;
    const point = grid.point(id), goal = goals.get(id);
    if (goal && lengths[id] + distance(point, goal.point) <= lengthLimit + .00001
      && allowedSegment(world, point, goal.point, options)) {
      const path = [];
      for (let cursor = id; cursor !== -1; cursor = parent[cursor]) path.push(grid.point(cursor));
      path.reverse();
      if (distance(path[0], start) < .00001) path.shift();
      if (!path.length || distance(path.at(-1), goal.point) > .00001) path.push({ ...goal.point });
      return simplify(world, start, path, options, preferCover);
    }
    const x = id % grid.width, y = Math.floor(id / grid.width);
    for (const [dx, dy] of directions) {
      const nx = x + dx, ny = y + dy;
      if (!grid.walk(nx, ny)) continue;
      const nextId = grid.id(nx, ny);
      if (closed[nextId]) continue;
      const nextPoint = grid.point(nextId), segment = Math.hypot(dx, dy) * PLAYER_PATH_RULES.step;
      const length = lengths[id] + segment;
      if (length + estimate(nextPoint) > lengthLimit) continue;
      const edge = grid.edge(id, nextId, preferCover);
      if (!edge.clear || !allowedSegment(world, point, nextPoint, options)) continue;
      const cost = costs[id] + segment * (preferCover && !edge.cover ? 1.5 : 1);
      if (cost >= costs[nextId]) continue;
      costs[nextId] = cost; lengths[nextId] = length; parent[nextId] = id;
      open.push({ id: nextId, f: cost + estimate(nextPoint) });
    }
  }
  return [];
}

function simplify(world, start, path, options, preferCover) {
  const result = [];
  let from = start, index = 0;
  while (index < path.length) {
    let next = index;
    for (let candidate = Math.min(index + 16, path.length - 1); candidate > index; candidate--) {
      const end = path[candidate];
      const collinear = path.slice(index, candidate + 1).every(point => Math.abs((point.x - from.x) * (end.y - from.y)
        - (point.y - from.y) * (end.x - from.x)) < .000001);
      if (playerSegmentClear(world, from, end, options) && allowedSegment(world, from, end, options)
        && (!preferCover || collinear || covered(world, from, end))) {
        next = candidate; break;
      }
    }
    result.push(path[next]); from = path[next]; index = next + 1;
  }
  return result;
}

export function playerPathLength(start, path) {
  let total = 0, previous = start;
  for (const point of path) { total += distance(previous, point); previous = point; }
  return total;
}

function route(world, start, target, goals, options, shortest = null) {
  const lengthLimit = options.maxLength ?? Infinity;
  const base = shortest || search(world, start, target, goals, { ...options, requireCover: false }, false, lengthLimit);
  if (options.requireCover && base.length) {
    const limit = Math.min(lengthLimit, playerPathLength(start, base) * PLAYER_PATH_RULES.coverDetour + PLAYER_PATH_RULES.coverAllowance);
    return search(world, start, target, goals, options, true, limit);
  }
  if (!base.length || !options.preferCover) return base;
  const limit = Math.min(lengthLimit, playerPathLength(start, base) * PLAYER_PATH_RULES.coverDetour + PLAYER_PATH_RULES.coverAllowance);
  const alternative = search(world, start, target, goals, options, true, limit);
  return alternative.length && playerPathLength(start, alternative) <= limit + .00001 ? alternative : base;
}

export function findPlayerPath(world, start, requested, options = {}) {
  const end = world.clampPoint(requested), grid = gridFor(world, options);
  const direct = playerSegmentClear(world, start, end, options) && allowedSegment(world, start, end, options)
    && distance(start, end) <= (options.maxLength ?? Infinity);
  if (direct && (!options.preferCover || covered(world, start, end))) return [{ ...end }];
  const exact = world.isWalkable(end.x, end.y, PLAYER_PATH_RULES.radius, null, options);
  const goals = new Map();
  for (const entry of nearby(grid, end, exact ? .45 : .9)) {
    if (exact && (!playerSegmentClear(world, entry.point, end, options)
      || !allowedSegment(world, entry.point, end, options))) continue;
    goals.set(entry.id, { point: exact ? end : entry.point });
  }
  return route(world, start, end, goals, options, direct ? [{ ...end }] : null);
}

export function pathToPlayerRegion(world, start, target, radius, accept, options = {}) {
  const grid = gridFor(world, options), goals = new Map();
  for (const entry of nearby(grid, target, radius)) {
    if (!world.isWalkable(entry.point.x, entry.point.y, PLAYER_PATH_RULES.radius) || !accept(entry.point)) continue;
    goals.set(entry.id, { point: entry.point });
  }
  return route(world, start, target, goals, options);
}

export function pathToPlayerInteraction(world, start, object, options = {}) {
  const radius = (options.interactionRange || 1.38) + (object.type === "car" ? 1 : object.type === "shed" ? .3 : 0);
  return pathToPlayerRegion(world, start, object, radius,
    point => canInteract(world, point, object, options.interactionRange), options);
}
