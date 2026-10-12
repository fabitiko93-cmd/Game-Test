import { distanceToFootprint, segmentHitsVehicle, vehicleFootprint } from "./cover.js";

export const obstacleRadius = object => object.type === "tree" || object.type === "streetlamp" ? .34 : .43;

export function pointSegmentDistance(point, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, square = dx * dx + dy * dy;
  const amount = square ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / square)) : 0;
  return Math.hypot(point.x - a.x - amount * dx, point.y - a.y - amount * dy);
}

export function segmentBlocked(a, b, object, radius) {
  if (object.type !== "car") return pointSegmentDistance(object, a, b) < obstacleRadius(object) + radius - .000001;
  if (distanceToFootprint(a, object) < radius || distanceToFootprint(b, object) < radius || segmentHitsVehicle(a, b, object)) return true;
  const shape = vehicleFootprint(object);
  for (const dx of [-shape.x, shape.x]) for (const dy of [-shape.y, shape.y]) {
    if (pointSegmentDistance({ x: object.x + dx, y: object.y + dy }, a, b) < radius - .000001) return true;
  }
  return false;
}
