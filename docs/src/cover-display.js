import { COVER_RULES, coverAreaId, coverFootprint, distanceToFootprint, usableCover } from "./cover.js";

// Display resolution only: detection remains continuous, using cover.js geometry.
// One eighth of a tile projects to at most four CSS pixels on either ground axis.
export const COVER_DISPLAY_STEP = 1 / 8;
export const COVER_DISPLAY_RADIUS = 5.2;

export function coverDisplayKey(world, player, state) {
  return `${Math.round(player.x)},${Math.round(player.y)}:${world.sightRevision}:${state.source === "cover" ? state.coverId : ""}`;
}

export function buildCoverDisplay(world, player, activeCoverId = null) {
  const step = COVER_DISPLAY_STEP;
  const cells = new Map();
  const objects = world.objectsNear(Math.round(player.x), Math.round(player.y), COVER_DISPLAY_RADIUS)
    .filter(usableCover);
  for (const object of objects) {
    const shape = coverFootprint(object);
    const extentX = (shape.radius ?? shape.x) + COVER_RULES.margin;
    const extentY = (shape.radius ?? shape.y) + COVER_RULES.margin;
    for (let y = Math.floor((object.y - extentY) / step); y <= Math.ceil((object.y + extentY) / step); y++) {
      for (let x = Math.floor((object.x - extentX) / step); x <= Math.ceil((object.x + extentX) / step); x++) {
        const point = { x: (x + .5) * step, y: (y + .5) * step };
        if (distanceToFootprint(point, object) > COVER_RULES.margin) continue;
        const key = `${x},${y}`;
        let cell = cells.get(key);
        if (!cell) {
          // Match the player's collision radius; never advertise solid interiors or water.
          if (!world.isWalkable(point.x, point.y, .27)) continue;
          cell = { x, y, active: false };
          cells.set(key, cell);
        }
        if (activeCoverId && coverAreaId(object, point) === activeCoverId) cell.active = true;
      }
    }
  }
  return { cells: [...cells.values()], borders: borders(cells, false), activeBorders: borders(cells, true) };
}

function borders(cells, activeOnly) {
  const result = [];
  const present = (x, y) => activeOnly ? cells.get(`${x},${y}`)?.active : cells.has(`${x},${y}`);
  for (const cell of cells.values()) {
    if (activeOnly && !cell.active) continue;
    const { x, y } = cell;
    if (!present(x, y - 1)) result.push([x, y, x + 1, y]);
    if (!present(x + 1, y)) result.push([x + 1, y, x + 1, y + 1]);
    if (!present(x, y + 1)) result.push([x + 1, y + 1, x, y + 1]);
    if (!present(x - 1, y)) result.push([x, y + 1, x, y]);
  }
  return result;
}

// Trace the union boundary, including holes; do not draw internal cell edges.
function loops(edges) {
  const outgoing = new Map(), used = new Set(), result = [];
  edges.forEach((edge, index) => {
    const key = `${edge[0]},${edge[1]}`;
    if (!outgoing.has(key)) outgoing.set(key, []);
    outgoing.get(key).push(index);
  });
  const direction = edge => edge[2] > edge[0] ? 0 : edge[3] > edge[1] ? 1 : edge[2] < edge[0] ? 2 : 3;
  const priority = [1, 0, 3, 2]; // At diagonal contacts, keep the two surfaces separate.
  edges.forEach((first, index) => {
    if (used.has(index)) return;
    const loop = [], start = `${first[0]},${first[1]}`;
    let current = index;
    while (current !== undefined && !used.has(current)) {
      const edge = edges[current];
      used.add(current); loop.push([edge[0], edge[1]]);
      const end = `${edge[2]},${edge[3]}`;
      if (end === start) { if (loop.length >= 3) result.push(loop); break; }
      const candidates = (outgoing.get(end) || []).filter(next => !used.has(next));
      candidates.sort((a, b) => priority.indexOf((direction(edges[a]) - direction(edge) + 4) % 4)
        - priority.indexOf((direction(edges[b]) - direction(edge) + 4) % 4));
      current = candidates[0];
    }
  });
  return result;
}

export function coverDisplayPaths(surface, project, Path = Path2D) {
  const fill = new Path(), activeFill = new Path();
  for (const [edges, path] of [[surface.borders, fill], [surface.activeBorders, activeFill]]) {
    for (const loop of loops(edges)) {
      const points = loop.map(([x, y]) => project(x * COVER_DISPLAY_STEP, y * COVER_DISPLAY_STEP));
      const first = points[0], last = points.at(-1);
      path.moveTo((last.x + first.x) / 2, (last.y + first.y) / 2);
      for (let i = 0; i < points.length; i++) {
        const current = points[i], next = points[(i + 1) % points.length];
        // Round only the sub-tile display corners; continuous gameplay geometry is untouched.
        path.quadraticCurveTo(current.x, current.y, (current.x + next.x) / 2, (current.y + next.y) / 2);
      }
      path.closePath();
    }
  }
  return { fill, activeFill, outline: fill, activeOutline: activeFill };
}
