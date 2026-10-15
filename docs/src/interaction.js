import { GAME } from "./config.js";
import { coverFootprint } from "./cover.js";
import { metersToTiles } from "./world-scale.js";

export const CONTAINER_REACH = metersToTiles(.5);
export const interactionReach=(object,range=GAME.interactionRange)=>object.items||object.container?Math.min(range,CONTAINER_REACH):range;
export const interactionFootprint=object=>object.footprint||(["car","shed"].includes(object.type)?coverFootprint(object):{x:0,y:0});

export function interactionDistance(point, object) {
  const anchor=interactionAnchor(point,object);
  return Math.hypot(point.x-anchor.x,point.y-anchor.y);
}

export function interactionAnchor(point, object) {
  const shape = interactionFootprint(object);
  return { x: Math.max(object.x - shape.x, Math.min(point.x, object.x + shape.x)),
    y: Math.max(object.y - shape.y, Math.min(point.y, object.y + shape.y)) };
}

export function canInteract(world, point, object, range = GAME.interactionRange) {
  if (!object || object.removed || interactionDistance(point, object) > interactionReach(object,range)+1e-6) return false;
  const anchor = interactionAnchor(point, object);
  return world.canWalkSegment(point, anchor, .01, { ignoreId: object.id });
}
