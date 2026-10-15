import SCALE from "../assets/reference-scale.json" with { type: "json" };

// Physical speeds in m/s. Collision/pathfinding continue to use existing tiles.
export const LOCOMOTION = Object.freeze({
  player: Object.freeze({ sneak: .78, walk: 1.35, run: 3.2 }),
  zombie: Object.freeze({ idle: .32, search: .7, investigate: 1, chase: 1.44 }),
});
export const speedInTiles = metersPerSecond => metersPerSecond / SCALE.metersPerTile;
