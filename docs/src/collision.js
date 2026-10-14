import { coverFootprint, distanceToFootprint, segmentHitsBox } from "./cover.js";

export const obstacleRadius = object => object.type === "tree" || object.type === "streetlamp" ? .34 : .43;

export const boxObstacle = object => ["car", "wall", "door"].includes(object.type);

export function obstacleClearance(point, object, radius = .27) {
  return (boxObstacle(object) ? distanceToFootprint(point, object)
    : Math.hypot(point.x - object.x, point.y - object.y) - obstacleRadius(object)) - radius;
}

export function pointSegmentDistance(point, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, square = dx * dx + dy * dy;
  const amount = square ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / square)) : 0;
  return Math.hypot(point.x - a.x - amount * dx, point.y - a.y - amount * dy);
}

export function segmentBlocked(a, b, object, radius) {
  if (!boxObstacle(object)) return pointSegmentDistance(object, a, b) < obstacleRadius(object) + radius - .000001;
  const shape = coverFootprint(object);
  if (distanceToFootprint(a, object) < radius || distanceToFootprint(b, object) < radius || segmentHitsBox(a, b, object, shape)) return true;
  for (const dx of [-shape.x, shape.x]) for (const dy of [-shape.y, shape.y]) {
    if (pointSegmentDistance({ x: object.x + dx, y: object.y + dy }, a, b) < radius - .000001) return true;
  }
  return false;
}
