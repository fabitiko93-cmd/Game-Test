import { pointSegmentDistance } from "./collision.js";
import { zombieBodyProfile } from "./zombie-appearance.js";
import { metersToTiles } from "./world-scale.js";

// Torso/shoulder space, independent of animated arms and of the larger
// clearance used by the existing world-obstacle navigation.
export const ZOMBIE_BODY = Object.freeze({ radiusMeters: .30, referenceHeight: 1.80,
  recoveryMetersPerSecond: .45, recoveryPasses: 4 });
const EPSILON = .000001;
const length = (a, b) => Math.hypot(a.x-b.x, a.y-b.y);

export const zombieBodyRadius = zombie => metersToTiles(ZOMBIE_BODY.radiusMeters
  * zombieBodyProfile(zombie).height / ZOMBIE_BODY.referenceHeight);

function pairHash(a, b) {
  const text = [a.id || "a", b.id || "b"].sort().join("|");
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return hash >>> 0;
}

export function zombieSpaceFree(game, point, radius, ignore = null) {
  return game.zombies.every(other => other === ignore || other.removed
    || length(point, other) >= radius + zombieBodyRadius(other) - EPSILON);
}

function bodyBlocks(start, end, other, radius) {
  const clearance = radius + zombieBodyRadius(other), before = length(start, other);
  // Old saves may already overlap. Permit escape, never motion deeper into
  // the other body or crossing through its center to the opposite side.
  if (before < clearance - EPSILON) return (end.x-start.x)*(start.x-other.x)
    + (end.y-start.y)*(start.y-other.y) < -EPSILON;
  return pointSegmentDistance(other, start, end) < clearance - EPSILON;
}

function worldFree(game, start, end, radius) {
  return game.world.isWalkable(end.x, end.y, radius, start.id)
    && game.world.canWalkSegment(start, end, radius, { ignoreId: start.id });
}

// Hard, swept body contacts plus local sidestepping. No forces that accelerate
// a crowd, no random steering, and no change to player movement or perception.
export function zombieStep(game, zombie, requested, worldRadius) {
  const dx = requested.x-zombie.x, dy = requested.y-zombie.y, travel = Math.hypot(dx, dy);
  if (travel < EPSILON) return { x: zombie.x, y: zombie.y };
  const radius = zombieBodyRadius(zombie);
  const neighbors = game.zombies.filter(other => other !== zombie && !other.removed
    && length(zombie, other) < travel + radius + zombieBodyRadius(other) + EPSILON);
  const blockers = neighbors.filter(other => bodyBlocks(zombie, requested, other, radius))
    .sort((a, b) => length(zombie, a)-length(zombie, b) || String(a.id).localeCompare(String(b.id)));
  const free = point => worldFree(game, zombie, point, worldRadius)
    && neighbors.every(other => !bodyBlocks(zombie, point, other, radius));
  if (!blockers.length) return free(requested) ? requested : { x: zombie.x, y: zombie.y };
  // Both members of a head-on pair choose the same hand relative to their
  // respective direction, so they pass on opposite sides instead of oscillating.
  const side = pairHash(zombie, blockers[0]) & 1 ? 1 : -1;
  // At a person-wide opening two front bodies can form an arch against the
  // jambs. A stable lower-priority body may step back, letting the other pass.
  const yielding = String(zombie.id).localeCompare(String(blockers[0].id)) > 0;
  const doorway = yielding && game.world.objectsNear(zombie.x, zombie.y, 1.5)
    .some(object => object.type === "door" && object.footprint && !object.closed);
  const angles = doorway ? [2.4, 1.9, Math.PI, Math.PI/2, 1.1, .8, .5, .25]
    : yielding ? [.25, .5, .8, 1.1, Math.PI/2, 1.9, 2.4, Math.PI] : [.25, .5, .8, 1.1, Math.PI/2];
  for (const angle of angles) for (const hand of [side, -side]) {
    const cos = Math.cos(angle), sin = Math.sin(angle)*hand;
    const point = { x: zombie.x + dx*cos-dy*sin, y: zombie.y + dx*sin+dy*cos };
    if (free(point)) return point;
  }
  // A tight passage can require waiting. Use the remaining clear distance
  // without jumping into the body that blocks the end of this frame's step.
  let low = 0, high = 1;
  for (let i = 0; i < 12; i++) {
    const amount = (low+high)/2;
    if (free({ x: zombie.x+dx*amount, y: zombie.y+dy*amount })) low = amount;
    else high = amount;
  }
  return { x: zombie.x+dx*low, y: zombie.y+dy*low };
}

// Repair pre-patch stacks gently in place. Corrections are bounded per body
// and per simulation tick; they must still respect walls, cars and water.
export function separateZombieBodies(game, delta) {
  if (delta <= 0) return;
  const bodies = game.zombies.filter(zombie => !zombie.removed)
    .map(zombie => ({ zombie, radius: zombieBodyRadius(zombie), remaining:
      metersToTiles(ZOMBIE_BODY.recoveryMetersPerSecond)*delta }));
  for (let pass = 0; pass < ZOMBIE_BODY.recoveryPasses; pass++) {
    for (let i = 0; i < bodies.length; i++) for (let j = i+1; j < bodies.length; j++) {
      const a = bodies[i], b = bodies[j], d = length(a.zombie, b.zombie);
      const overlap = a.radius+b.radius-d;
      if (overlap <= EPSILON) continue;
      const angle = pairHash(a.zombie, b.zombie)/4294967296*Math.PI*2;
      const nx = d > EPSILON ? (a.zombie.x-b.zombie.x)/d : Math.cos(angle);
      const ny = d > EPSILON ? (a.zombie.y-b.zombie.y)/d : Math.sin(angle);
      let resolved = 0;
      for (const [body, sign] of [[a, 1], [b, -1]]) {
        const amount = Math.min(body.remaining, overlap/2);
        const point = { x: body.zombie.x+nx*amount*sign, y: body.zombie.y+ny*amount*sign };
        if (amount > EPSILON && worldFree(game, body.zombie, point, body.radius)) {
          Object.assign(body.zombie, point); body.remaining -= amount; resolved += amount;
        }
      }
      // If one member is pinned against a solid obstacle, the other can yield.
      if (resolved < overlap/2) for (const [body, sign] of [[a, 1], [b, -1]]) {
        const amount = Math.min(body.remaining, overlap-resolved);
        const point = { x: body.zombie.x+nx*amount*sign, y: body.zombie.y+ny*amount*sign };
        if (amount > EPSILON && worldFree(game, body.zombie, point, body.radius)) {
          Object.assign(body.zombie, point); body.remaining -= amount; resolved += amount;
        }
      }
    }
  }
}
