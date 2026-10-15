import { VIEW } from "./config.js";
import REFERENCE from "../assets/reference-scale.json" with { type: "json" };

// Visual reference dimensions, not new collision or body-size gameplay rules.
// Ground coordinates remain in tiles so existing Save-v4 worlds keep working.
export const WORLD_SCALE = REFERENCE;
export const metersToTiles = meters => meters / REFERENCE.metersPerTile;
export const tilesToMeters = tiles => tiles * REFERENCE.metersPerTile;
export const pixelsPerMeter = VIEW.tileW / Math.SQRT2 / REFERENCE.metersPerTile;
export const cameraElevationSine = VIEW.tileH / VIEW.tileW;
export const cameraElevationCosine = Math.sqrt(1 - cameraElevationSine ** 2);
export const heightPixels = meters => meters * pixelsPerMeter * cameraElevationCosine;

export function playerDisplayScale(height = REFERENCE.player.height) {
  // Hair top -38, boot sole +3: the placeholder spans 41 local units.
  return { x: REFERENCE.player.shoulderWidth * pixelsPerMeter / 22,
    y: heightPixels(height) / 41 };
}
