import { GAME } from "./config.js";
import { coverFootprint, distanceToFootprint } from "./cover.js";

export function interactionDistance(point, object) {
  // Preserve normal item reach; measure large objects from their usable edge.
  return object.type === "car" || object.type === "shed"
    ? distanceToFootprint(point, object) + .42 : Math.hypot(point.x - object.x, point.y - object.y);
}

export function interactionAnchor(point, object) {
  if (object.type !== "car" && object.type !== "shed") return object;
  const shape = coverFootprint(object);
  return { x: Math.max(object.x - shape.x, Math.min(point.x, object.x + shape.x)),
    y: Math.max(object.y - shape.y, Math.min(point.y, object.y + shape.y)) };
}

export function canInteract(world, point, object, range = GAME.interactionRange) {
  if (!object || object.removed || interactionDistance(point, object) > range) return false;
  const anchor = interactionAnchor(point, object);
  return world.canWalkSegment(point, anchor, .01, { ignoreId: object.id });
}
