import assert from "node:assert/strict";
import { test } from "node:test";
import { overlapArea, placeTargetPanel } from "../docs/src/target-layout.js";

function phone(width, height, safe = 0) {
  return { bounds: { x: 12 + safe, y: 10, width: width - 24 - safe * 2, height: height - 30 },
    controls: [{ x: 12 + safe, y: 9, width: 212, height: 51 },
      { x: width - safe - 450, y: 9, width: 438, height: 37 },
      { x: width - safe - 210, y: height - 125, width: 194, height: 110 },
      { x: width - safe - 267, y: height - 75, width: 51, height: 51 },
      { x: width / 2 - 81, y: height - 50, width: 162, height: 40 }] };
}
const size = { width: 188, height: 96 };
const actor = (x, y) => ({ x: x - 35, y: y - 80, width: 105, height: 100 });
function assertClear(rect, bounds, obstacles) {
  assert.ok(rect?.clear, "a clear placement must be available");
  assert.ok(rect.x >= bounds.x && rect.y >= bounds.y);
  assert.ok(rect.x + rect.width <= bounds.x + bounds.width);
  assert.ok(rect.y + rect.height <= bounds.y + bounds.height);
  assert.ok(obstacles.every(obstacle => overlapArea(rect, obstacle) === 0), "do not cover controls, actors or status icons");
}

test("target cards fit phone landscape viewports including safe-area insets", () => {
  for (const [width, height, safe] of [[667, 280, 0], [812, 375, 44], [932, 430, 59], [1024, 768, 0]]) {
    const { bounds, controls } = phone(width, height, safe);
    const focus = [actor(width / 2, height * .55), actor(width / 2 + 75, height * .6)];
    const rect = placeTargetPanel(bounds, size, controls, focus);
    assertClear(rect, bounds, [...controls, ...focus]);
  }
});

test("camera movement toward a target card moves it to another clear slot", () => {
  const { bounds, controls } = phone(812, 375, 44);
  const previous = placeTargetPanel(bounds, size, controls, [actor(406, 205)]);
  assert.ok(previous.clear);
  const focus = [actor(previous.x + 60, previous.y + 90), actor(406, 205)];
  const moved = placeTargetPanel(bounds, size, controls, focus, previous);
  assertClear(moved, bounds, [...controls, ...focus]);
  assert.ok(moved.x !== previous.x || moved.y !== previous.y);
});

test("clear target cards stay stable rather than chasing every actor movement", () => {
  const { bounds, controls } = phone(812, 375, 44);
  const previous = placeTargetPanel(bounds, size, controls, [actor(406, 205)]);
  const next = placeTargetPanel(bounds, size, controls, [actor(415, 212)], previous);
  assert.deepEqual(next, previous);
});

test("enemy and object information avoid each other and visible vehicles", () => {
  const { bounds, controls } = phone(812, 375, 44);
  const focus = [actor(406, 205), actor(480, 240), { x: 340, y: 92, width: 130, height: 95 }];
  const enemy = placeTargetPanel(bounds, size, controls, focus);
  assertClear(enemy, bounds, [...controls, ...focus]);
  const label = placeTargetPanel(bounds, { width: 150, height: 22 }, [...controls, enemy], focus);
  assertClear(label, bounds, [...controls, enemy, ...focus]);
});

test("interior fallback retains usable information when all perimeter slots are occupied", () => {
  const bounds = { x: 10, y: 10, width: 792, height: 355 };
  const controls = [{ x: 10, y: 10, width: 792, height: 32 }, { x: 10, y: 333, width: 792, height: 32 },
    { x: 10, y: 10, width: 35, height: 355 }, { x: 767, y: 10, width: 35, height: 355 }];
  assertClear(placeTargetPanel(bounds, size, controls, []), bounds, controls);
});

test("changed card sizes and viewports invalidate positions that no longer fit", () => {
  const { bounds, controls } = phone(667, 280);
  const old = { x: 620, y: 255, width: 90, height: 20 };
  assertClear(placeTargetPanel(bounds, size, controls, [actor(340, 170)], old), bounds, controls);
  assert.equal(placeTargetPanel(bounds, { width: 900, height: 96 }, controls, []), null);
});
