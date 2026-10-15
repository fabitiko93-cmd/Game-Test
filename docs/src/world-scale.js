import { VIEW } from "./config.js";
import REFERENCE from "../assets/reference-scale.json" with { type: "json" };

// Shared metric reference for people, architecture, collision and rendering.
// Terrain cells stay at 2 m; construction and movement also use fractional cells.
export const WORLD_SCALE = REFERENCE;
export const metersToTiles = meters => meters / REFERENCE.metersPerTile;
export const tilesToMeters = tiles => tiles * REFERENCE.metersPerTile;
export const PLAYER_BODY_RADIUS = metersToTiles(REFERENCE.player.shoulderWidth / 2 + .025);
export const ZOMBIE_WORLD_RADIUS = metersToTiles(.30);
export const pixelsPerMeter = VIEW.tileW / Math.SQRT2 / REFERENCE.metersPerTile;
export const cameraElevationSine = VIEW.tileH / VIEW.tileW;
export const cameraElevationCosine = Math.sqrt(1 - cameraElevationSine ** 2);
export const heightPixels = meters => meters * pixelsPerMeter * cameraElevationCosine;

export function playerDisplayScale(height = REFERENCE.player.height) {
  // Hair top -38, boot sole +3: the placeholder spans 41 local units.
  return { x: REFERENCE.player.shoulderWidth * pixelsPerMeter / 22,
    y: heightPixels(height) / 41 };
}
