import assert from "node:assert/strict";
import { test } from "node:test";
import { VisionGeometry } from "../docs/src/vision-geometry.js";
import { beamOpacity, visionConeStyle, VISION_LAYER_ALPHA } from "../docs/src/vision-cone.js";
import { VISION } from "../docs/src/perception.js";

const scene = objects => ({ objects, sightRevision: 1, coverMap: {} });
const origin = { x: 10, y: 10 };
const cone = (geometry, world, observer = origin, angle = 0) => [observer,
  ...geometry.polygon(world, observer, angle, 8, VISION.halfAngle)];
function contains(polygon, point) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a.y > point.y) !== (b.y > point.y)
      && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

test("one wall casts a continuous shadow with precise intersections and visible flanks", () => {
  const world = scene([{ type: "wall", x: 13, y: 10, blocksSight: true }]), geometry = new VisionGeometry();
  const polygon = cone(geometry, world);
  assert.equal(contains(polygon, { x: 16, y: 10 }), false);
  assert.equal(contains(polygon, { x: 16, y: 12 }), true);
  assert.ok(polygon.some(p => Math.abs(p.y - 10) < .000001 && Math.abs(p.x - 12.5) < .000001));
  for (let y = 9.4; y < 10.6; y += .04) assert.equal(contains(polygon, { x: 16, y }), false);
});

test("tiny motion and turns update immediately instead of snapping at quarter tiles or angle buckets", () => {
  const geometry = new VisionGeometry(), world = scene([]);
  const first = cone(geometry, world);
  assert.notDeepEqual(cone(geometry, world, { x: 10.001, y: 10 }), first);
  assert.notDeepEqual(cone(geometry, world, origin, .001), first);
  const last = cone(geometry, world, origin, .001).at(-1);
  assert.ok(Math.abs(Math.atan2(last.y - 10, last.x - 10) - VISION.halfAngle - .001) < .000001);
});

test("adjoining wall cells form one straight boundary rather than dozens of tile corners", () => {
  const world = scene(Array.from({ length: 9 }, (_, i) => ({ type: "wall", x: 13, y: 6 + i, blocksSight: true })));
  const geometry = new VisionGeometry(); geometry.prepare(world);
  const face = geometry.segments.filter(s => s.axis === "x" && s.at === 12.5);
  assert.deepEqual(face, [{ axis: "x", at: 12.5, from: 5.5, to: 14.5 }]);
  assert.equal(geometry.segments.length, 8, "four wall faces plus four map boundaries");
});

test("open doors create exact gaps and a closed or removed door refreshes the same scene", () => {
  const door = { type: "door", x: 13, y: 10, closed: true, blocksSight: true };
  const world = scene([door, ...[8, 9, 11, 12].map(y => ({ type: "wall", x: 13, y, blocksSight: true }))]);
  const geometry = new VisionGeometry(), point = { x: 16, y: 10 };
  assert.equal(contains(cone(geometry, world), point), false);
  door.closed = false; world.sightRevision++;
  const open = cone(geometry, world);
  assert.equal(contains(open, point), true);
  assert.equal(contains(open, { x: 16, y: 12 }), false);
  door.closed = true; world.sightRevision++;
  assert.equal(contains(cone(geometry, world), point), false);
  door.removed = true; world.sightRevision++;
  assert.equal(contains(cone(geometry, world), point), true);
});

test("both vehicle orientations cast their actual rectangular footprint, including fractional positions", () => {
  for (const [orientation, halfX] of [["x", .86], ["y", .47]]) {
    const world = scene([{ type: "car", x: 13.1, y: 10, orientation, blocksSight: true }]);
    const polygon = cone(new VisionGeometry(), world);
    assert.ok(polygon.some(p => Math.abs(p.y - 10) < .000001 && Math.abs(p.x - (13.1 - halfX)) < .000001));
    assert.equal(contains(polygon, { x: 16, y: 10 }), false);
    assert.equal(contains(polygon, { x: 16, y: 13 }), true);
  }
});

test("vegetation follows existing sight cells while world changes cannot reuse stale blocker geometry", () => {
  const world = scene([{ type: "tree", x: 13.15, y: 10.12, blocksSight: true }]), geometry = new VisionGeometry();
  const first = cone(geometry, world), revision = geometry.revision;
  assert.ok(first.some(p => Math.abs(p.y - 10) < .000001 && Math.abs(p.x - 12.5) < .000001));
  cone(geometry, world); assert.equal(geometry.revision, revision);
  world.objects = []; world.coverMap = {};
  assert.equal(contains(cone(geometry, world), { x: 16, y: 10 }), true);
  assert.ok(geometry.revision > revision);
  assert.deepEqual(geometry.polygon(scene([{ type: "bush", ...origin, blocksSight: true }]), origin, 0, 8, VISION.halfAngle), []);
});

test("cones stay inside the existing world edge and retain horizontal facing", () => {
  const geometry = new VisionGeometry(), world = scene([]);
  const points = geometry.polygon(world, { x: 1.1, y: 20 }, Math.PI, 8, VISION.halfAngle);
  assert.ok(points.every(p => p.x >= 1 - .000001));
  const clear = cone(geometry, world);
  assert.equal(contains(clear, { x: 15, y: 10 }), true);
  assert.equal(contains(clear, { x: 10, y: 15 }), false);
});

test("beam edges and range fade smoothly inside the geometric limit without an outline", () => {
  assert.equal(beamOpacity(.5, 0, VISION.halfAngle), 1);
  assert.equal(beamOpacity(.5, VISION.halfAngle, VISION.halfAngle), 0);
  assert.equal(beamOpacity(1, 0, VISION.halfAngle), 0);
  assert.equal(beamOpacity(1.1, 0, VISION.halfAngle), 0);
  assert.ok(beamOpacity(.5, VISION.halfAngle - .07, VISION.halfAngle) > 0);
  assert.ok(beamOpacity(.94, 0, VISION.halfAngle) > 0 && beamOpacity(.94, 0, VISION.halfAngle) < 1);
});

test("visual detection and selection increase emphasis without confusing hearing or modifying AI", () => {
  const zombie = { state: "idle", stimulus: "sound", awareness: .9, sightMemory: { visible: false, recognition: 0 } };
  const saved = structuredClone(zombie), quiet = visionConeStyle(zombie, true);
  assert.equal(quiet.progress, 0); assert.equal(quiet.visibleByState, false);
  assert.ok(visionConeStyle(zombie, true, true).alpha > quiet.alpha);
  assert.deepEqual(zombie, saved);
  zombie.stimulus = "vision"; zombie.sightMemory.visible = true;
  let previous = 0;
  for (let i = 0; i <= 20; i++) {
    zombie.awareness = i / 20;
    const style = visionConeStyle(zombie, true);
    assert.equal(style.progress, i / 20); assert.ok(style.alpha >= previous); previous = style.alpha;
  }
  zombie.awareness = 0; zombie.sightMemory.recognition = .5;
  assert.equal(visionConeStyle(zombie, true).progress, .5);
  zombie.state = "chase";
  assert.equal(visionConeStyle(zombie, true, true).alpha, VISION_LAYER_ALPHA);
});
