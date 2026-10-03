import assert from "node:assert/strict";
import { test } from "node:test";
import { World } from "../docs/src/world.js";
import { CoverMap } from "../docs/src/cover.js";
import { Renderer } from "../docs/src/render.js";
import { buildCoverDisplay, coverDisplayKey, coverDisplayPaths, COVER_DISPLAY_STEP as step } from "../docs/src/cover-display.js";

function fixture() {
  const world = new World();
  world.objects = []; world.objectGrid.clear(); world.vehicleCollisionCells.clear(); world.vehicles = [];
  world.tiles = Array.from({ length: 48 }, () => Array(48).fill("grass"));
  world.coverMap = new CoverMap(world);
  return world;
}
const center = cell => ({ x: (cell.x + .5) * step, y: (cell.y + .5) * step });
function marked(surface, x, y) {
  return surface.cells.find(cell => cell.x === Math.floor(x / step) && cell.y === Math.floor(y / step));
}

test("display samples the real hide geometry and reachable ground for every cover shape", () => {
  for (const [type, extras] of [["tree", {}], ["bush", {}], ["car", { orientation: "x" }],
    ["car", { orientation: "y" }], ["wall", { building: "fixture", side: "north" }], ["shed", {}]]) {
    const world = fixture();
    world.addObject(type, 10, 10, { solid: true, cover: .75, ...extras });
    const surface = buildCoverDisplay(world, { x: 10, y: 10 });
    assert.ok(surface.cells.length > 0, type);
    for (const cell of surface.cells) {
      const point = center(cell);
      assert.ok(world.coverMap.at(point), `${type}: advertised point has real cover`);
      assert.ok(world.isWalkable(point.x, point.y, .27), `${type}: advertised point is reachable`);
    }
    assert.equal(marked(surface, 10, 10), undefined, `${type}: solid interior excluded`);
    assert.equal(marked(surface, 12, 10), undefined, `${type}: open ground excluded`);
    for (let y = 8; y < 12; y += step) for (let x = 8; x < 12; x += step) {
      const point = { x: x + step / 2, y: y + step / 2 };
      assert.equal(Boolean(marked(surface, point.x, point.y)),
        Boolean(world.coverMap.at(point) && world.isWalkable(point.x, point.y, .27)));
    }
  }
});

test("overlapping cover forms one surface; separated cover keeps a visible gap", () => {
  const world = fixture();
  world.addObject("bush", 10, 10, { cover: .74 });
  world.addObject("bush", 12, 10, { cover: .74 });
  world.addObject("bush", 16, 10, { cover: .74 });
  const surface = buildCoverDisplay(world, { x: 12, y: 10 });
  assert.ok(marked(surface, 11, 10));
  assert.equal(marked(surface, 14, 10), undefined);
  const cells = new Set(surface.cells.map(cell => `${cell.x},${cell.y}`));
  for (const edge of surface.borders) {
    const [x1, y1, x2, y2] = edge;
    const neighbors = y1 === y2 ? [[Math.min(x1, x2), y1 - 1], [Math.min(x1, x2), y1]]
      : [[x1 - 1, Math.min(y1, y2)], [x1, Math.min(y1, y2)]];
    assert.equal(neighbors.filter(([x, y]) => cells.has(`${x},${y}`)).length, 1,
      "no internal grid or overlap seams are advertised as boundaries");
  }
});

test("wall highlight respects the known building side and face", () => {
  const world = fixture();
  for (let x = 9; x <= 11; x++) world.addObject("wall", x, 10,
    { solid: true, cover: .92, building: "fixture", side: "north" });
  const id = world.coverMap.at({ x: 10, y: 9 }).id;
  const surface = buildCoverDisplay(world, { x: 10, y: 9 }, id);
  assert.ok(marked(surface, 10, 9).active);
  assert.equal(marked(surface, 10, 11).active, false);
  for (const cell of surface.cells.filter(cell => cell.active)) {
    assert.ok(world.coverMap.contains(id, center(cell)));
  }
});

test("opened doors, removed cover, weak cover and water are not shown", () => {
  const world = fixture();
  const door = world.addObject("door", 10, 10, { closed: true, solid: true, cover: .92 });
  const player = { x: 10, y: 10 }, state = { source: "cover", coverId: door.id };
  const before = coverDisplayKey(world, player, state);
  assert.ok(buildCoverDisplay(world, player).cells.length);
  door.closed = false; door.solid = false; world.touchSight();
  assert.notEqual(coverDisplayKey(world, player, state), before);
  assert.equal(buildCoverDisplay(world, player).cells.length, 0);
  door.closed = true; door.removed = true;
  world.addObject("bush", 10, 10, { cover: .2 });
  assert.equal(buildCoverDisplay(world, player).cells.length, 0);
  world.addObject("tree", 10, 10, { cover: .75 });
  world.tiles = Array.from({ length: 48 }, () => Array(48).fill("water"));
  assert.equal(buildCoverDisplay(world, player).cells.length, 0);
});

test("display cache key stays stable within a neighborhood and distinguishes cover from the perk", () => {
  const world = fixture(), state = { source: "cover", coverId: "tree-1" };
  assert.equal(coverDisplayKey(world, { x: 10.1, y: 10.1 }, state),
    coverDisplayKey(world, { x: 10.2, y: 10.2 }, state));
  assert.notEqual(coverDisplayKey(world, { x: 10, y: 10 }, state),
    coverDisplayKey(world, { x: 10, y: 10 }, { ...state, source: "openfield" }));
});

test("projected cached paths use the ground geometry and separate current cover", () => {
  class Path {
    commands = [];
    moveTo(x, y) { this.commands.push(["move", x, y]); }
    lineTo(x, y) { this.commands.push(["line", x, y]); }
    quadraticCurveTo(...values) { this.commands.push(["curve", ...values]); }
    closePath() { this.commands.push(["close"]); }
  }
  const paths = coverDisplayPaths({ cells: [{ x: 8, y: 16, active: true }],
    borders: [[8, 16, 9, 16], [9, 16, 9, 17], [9, 17, 8, 17], [8, 17, 8, 16]],
    activeBorders: [[8, 16, 9, 16], [9, 16, 9, 17], [9, 17, 8, 17], [8, 17, 8, 16]] },
  (x, y) => ({ x: (x - y) * 32, y: (x + y) * 16 }), Path);
  assert.deepEqual(paths.fill.commands[0], ["move", -34, 49]);
  assert.deepEqual(paths.activeFill.commands, paths.fill.commands);
  assert.deepEqual(paths.outline.commands, paths.activeOutline.commands);
});

test("renderer reuses geometry across frames and camera pans but rebuilds after world reset", () => {
  class Path { moveTo() {} quadraticCurveTo() {} closePath() {} }
  const previousPath = globalThis.Path2D;
  globalThis.Path2D = Path;
  try {
    const world = fixture();
    world.addObject("tree", 10, 10, { solid: true, cover: .75 });
    const game = { world, player: { x: 11, y: 10, stance: "sneak" },
      stealth: { state: () => ({ source: "cover", coverId: world.objects[0].id }) } };
    const renderer = { coverHintCache: { key: "", map: null }, width: 812, height: 375,
      camera: { x: 0, y: 0 }, rawIso: (x, y) => ({ x: (x - y) * 32, y: (x + y) * 16 }),
      ctx: { save() {}, restore() {}, translate() {}, fill() {}, stroke() {} } };
    Renderer.prototype.drawCoverHints.call(renderer, game);
    const first = renderer.coverHintCache.paths;
    renderer.camera.x = 100;
    Renderer.prototype.drawCoverHints.call(renderer, game);
    assert.equal(renderer.coverHintCache.paths, first);
    world.coverMap = new CoverMap(world);
    Renderer.prototype.drawCoverHints.call(renderer, game);
    assert.notEqual(renderer.coverHintCache.paths, first);
    const second = renderer.coverHintCache.paths;
    game.player.stance = "walk";
    Renderer.prototype.drawCoverHints.call(renderer, game);
    assert.equal(renderer.coverHintCache.paths, second, "ordinary walking does not rebuild or draw cover");
  } finally { globalThis.Path2D = previousPath; }
});
