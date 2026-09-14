const DIRECTIONS = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
];

const key = (x, y) => `${x},${y}`;
const cell = point => ({ x: Math.round(point.x), y: Math.round(point.y) });
const heuristic = (a, b) => {
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);
  return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
};

class MinHeap {
  constructor() {
    this.items = [];
  }

  get length() {
    return this.items.length;
  }

  push(value) {
    const items = this.items;
    items.push(value);
    let index = items.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (items[parent].f <= value.f) break;
      items[index] = items[parent];
      index = parent;
    }
    items[index] = value;
  }

  pop() {
    const items = this.items;
    if (!items.length) return null;
    const first = items[0];
    const last = items.pop();
    if (!items.length) return first;
    let index = 0;
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      if (left >= items.length) break;
      const smallest = right < items.length && items[right].f < items[left].f ? right : left;
      if (items[smallest].f >= last.f) break;
      items[index] = items[smallest];
      index = smallest;
    }
    items[index] = last;
    return first;
  }
}

function reconstruct(nodes, endKey) {
  const path = [];
  let current = nodes.get(endKey);
  while (current) {
    path.push({ x: current.x, y: current.y });
    current = current.parent ? nodes.get(current.parent) : null;
  }
  path.reverse();
  return path.slice(1);
}

export class Navigator {
  findPath(world, startPoint, endPoint, options = {}) {
    const start = cell(startPoint);
    const desired = cell(world.clampPoint ? world.clampPoint(endPoint) : endPoint);
    const end = world.isPathCellWalkable(desired.x, desired.y, options)
      ? desired
      : this.nearestWalkable(world, desired, options);
    if (!end) return [];
    if (start.x === end.x && start.y === end.y) return [];

    const open = new MinHeap();
    const first = { ...start, g: 0, f: heuristic(start, end), parent: null };
    open.push(first);
    const nodes = new Map([[key(start.x, start.y), first]]);
    const closed = new Set();
    let examined = 0;

    while (open.length && examined < (options.maxNodes || 3500)) {
      const current = open.pop();
      const currentKey = key(current.x, current.y);
      if (closed.has(currentKey)) continue;
      examined += 1;
      if (current.x === end.x && current.y === end.y) return reconstruct(nodes, currentKey);
      closed.add(currentKey);

      for (const [dx, dy, cost] of DIRECTIONS) {
        const nx = current.x + dx;
        const ny = current.y + dy;
        const nextKey = key(nx, ny);
        if (closed.has(nextKey) || !world.isPathCellWalkable(nx, ny, options)) continue;
        if (dx && dy) {
          if (!world.isPathCellWalkable(current.x + dx, current.y, options)
            || !world.isPathCellWalkable(current.x, current.y + dy, options)) continue;
        }
        const g = current.g + cost;
        const known = nodes.get(nextKey);
        if (known && known.g <= g) continue;
        const next = { x: nx, y: ny, g, f: g + heuristic({ x: nx, y: ny }, end), parent: currentKey };
        nodes.set(nextKey, next);
        open.push(next);
      }
    }
    return [];
  }

  nearestWalkable(world, origin, options = {}, radius = 4) {
    for (let distance = 1; distance <= radius; distance++) {
      const candidates = [];
      for (let y = origin.y - distance; y <= origin.y + distance; y++) {
        for (let x = origin.x - distance; x <= origin.x + distance; x++) {
          if (Math.max(Math.abs(x - origin.x), Math.abs(y - origin.y)) !== distance) continue;
          if (world.isPathCellWalkable(x, y, options)) candidates.push({ x, y });
        }
      }
      candidates.sort((a, b) => heuristic(a, origin) - heuristic(b, origin));
      if (candidates.length) return candidates[0];
    }
    return null;
  }

  pathToInteraction(world, start, object, options = {}) {
    const candidates = [];
    const range = options.interactionRange || 1.5;
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const target = { x: Math.round(object.x) + dx, y: Math.round(object.y) + dy };
        const targetDistance = Math.hypot(target.x - object.x, target.y - object.y);
        if (targetDistance > range || !world.isPathCellWalkable(target.x, target.y, options)) continue;
        const path = this.findPath(world, start, target, options);
        const sameCell = Math.round(start.x) === target.x && Math.round(start.y) === target.y;
        const alreadyInRange = Math.hypot(start.x - object.x, start.y - object.y) <= range;
        if (path.length || (sameCell && alreadyInRange)) candidates.push({ path, targetDistance });
      }
    }
    candidates.sort((a, b) => a.path.length - b.path.length || a.targetDistance - b.targetDistance);
    return candidates[0]?.path || [];
  }
}
