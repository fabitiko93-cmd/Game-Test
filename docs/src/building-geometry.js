import { metersToTiles, WORLD_SCALE } from "./world-scale.js";

// Construction dimensions are independent of the 2 m terrain cells.
// Game dimensions, rather than a building-code simulation.
export const BUILDING_SCALE = Object.freeze({ wallThickness: .24, wallHeight: 2.7,
  floorGrid: .5, frameWidth: .05, roofOverhang: .18, roofThickness: .14 });

export function buildingBounds(building, padding = 0) {
  const half = metersToTiles(BUILDING_SCALE.wallThickness / 2) + padding;
  return { minX: building.x - half, minY: building.y - half,
    maxX: building.x + building.w - 1 + half, maxY: building.y + building.h - 1 + half };
}

export function doorSide(building) {
  if (building.door.y === building.y) return "north";
  if (building.door.y === building.y + building.h - 1) return "south";
  return building.door.x === building.x ? "west" : "east";
}

export function doorGeometry(door) {
  const horizontal = door.orientation !== "y";
  const width = metersToTiles(WORLD_SCALE.door.width), frame = metersToTiles(BUILDING_SCALE.frameWidth);
  const depth = metersToTiles(WORLD_SCALE.door.depth), wallDepth = metersToTiles(BUILDING_SCALE.wallThickness);
  return { horizontal, width, frame, depth, wallDepth, opening: width + 2 * frame,
    footprint: horizontal ? { x: width / 2, y: depth / 2 } : { x: depth / 2, y: width / 2 },
    headHeight: WORLD_SCALE.door.height + BUILDING_SCALE.frameWidth };
}

export function buildingWalls(building) {
  const thickness = metersToTiles(BUILDING_SCALE.wallThickness), half = thickness / 2;
  const maxX = building.x + building.w - 1, maxY = building.y + building.h - 1;
  const side = doorSide(building), door = doorGeometry({ orientation: ["north", "south"].includes(side) ? "x" : "y" });
  const walls = [];
  const addRun = (from, to, across, horizontal, face) => {
    // Short panels keep people and walls in the existing depth sort.
    const count = Math.ceil((to - from) / metersToTiles(2));
    for (let i = 0; i < count; i++) {
      const start = from + (to - from) * i / count, end = from + (to - from) * (i + 1) / count;
      walls.push({ x: horizontal ? (start + end) / 2 : across,
        y: horizontal ? across : (start + end) / 2, side: face,
        footprint: horizontal ? { x: (end - start) / 2, y: half } : { x: half, y: (end - start) / 2 },
        heightMeters: BUILDING_SCALE.wallHeight });
    }
  };
  for (const [face, from, to, across, horizontal] of [
    ["north", building.x - half, maxX + half, building.y, true],
    ["south", building.x - half, maxX + half, maxY, true],
    ["west", building.y + half, maxY - half, building.x, false],
    ["east", building.y + half, maxY - half, maxX, false],
  ]) {
    if (face !== side) { addRun(from, to, across, horizontal, face); continue; }
    const center = horizontal ? building.door.x : building.door.y;
    addRun(from, center - door.opening / 2, across, horizontal, face);
    addRun(center + door.opening / 2, to, across, horizontal, face);
    for (const sign of [-1, 1]) {
      const along = center + sign * (door.width + door.frame) / 2;
      walls.push({ x: horizontal ? along : across, y: horizontal ? across : along, side: face,
        footprint: horizontal ? { x: door.frame / 2, y: half } : { x: half, y: door.frame / 2 },
        heightMeters: door.headHeight, color: "#514938", part: "jamb" });
    }
  }
  return walls;
}
