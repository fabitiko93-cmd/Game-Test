import { COVER_RULES, coverAreaId, coverClearance, usableCover } from "./cover.js";
import { obstacleClearance } from "./collision.js";

// Signed distance shared with cover membership and collision, sampled only when
// the display cache changes. Interpolated contours remove square stair steps.
export function coverSurfaceValues(world, point, activeId, displayed = null) {
  let all = -1, active = -1, clearance = 1;
  const neighbors = world.coverMap.neighbors(point);
  for (const object of neighbors) {
    if (usableCover(object) && (!displayed || displayed.has(object))) {
      const value = coverClearance(point, object, neighbors);
      all = Math.max(all, value);
      if (activeId && coverAreaId(object, point) === activeId) active = Math.max(active, value);
    }
    if (!object.removed && object.solid) clearance = Math.min(clearance, obstacleClearance(point, object, COVER_RULES.playerRadius));
  }
  if (world.tileAt(point.x, point.y) === "water") clearance = -1;
  return { all: Math.min(all, clearance), active: Math.min(active, clearance) };
}

const pairs = {
  1: [[3,0]], 2: [[0,1]], 3: [[3,1]], 4: [[1,2]], 6: [[0,2]], 7: [[3,2]],
  8: [[2,3]], 9: [[2,0]], 11: [[2,1]], 12: [[1,3]], 13: [[1,0]], 14: [[0,3]],
};

export function coverSurfaceContours(world, candidates, step, activeId, objects) {
  const cells = [...candidates], displayed = objects ? new Set(objects) : null;
  const samples = new Map(), edgeCache = new Map();
  const sample = (x, y) => {
    const key = `${x},${y}`;
    if (!samples.has(key)) samples.set(key, coverSurfaceValues(world, { x: x * step, y: y * step }, activeId, displayed));
    return samples.get(key);
  };
  const trace = field => {
    const result = [];
    for (const { x, y } of cells) {
      const corners = [[x,y],[x+1,y],[x+1,y+1],[x,y+1]];
      const values = corners.map(([cx,cy]) => sample(cx,cy)[field]);
      const mask = values.reduce((bits, value, i) => bits | (value > 0 ? 1 << i : 0), 0);
      if (mask === 0 || mask === 15) continue;
      const connected = values.reduce((sum, value) => sum + value, 0) > 0;
      const segments = mask === 5 ? connected ? [[3,2],[1,0]] : [[3,0],[1,2]]
        : mask === 10 ? connected ? [[0,3],[2,1]] : [[0,1],[2,3]] : pairs[mask];
      const edge = index => {
        // Shared endpoints use the same direction to avoid floating-point gaps.
        const indices = [[0,1],[1,2],[3,2],[0,3]][index], a = corners[indices[0]], b = corners[indices[1]];
        const key = `${field}:${a}:${b}`;
        if (!edgeCache.has(key)) {
          const va = values[indices[0]], vb = values[indices[1]], t = va / (va - vb);
          edgeCache.set(key, [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
        }
        return edgeCache.get(key);
      };
      for (const [from,to] of segments) result.push([...edge(from), ...edge(to)]);
    }
    return result;
  };
  return { contours: trace("all"), activeContours: activeId ? trace("active") : [] };
}
