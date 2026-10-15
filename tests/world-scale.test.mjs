import assert from "node:assert/strict";
import test from "node:test";
import { createZombie } from "../docs/src/ai.js";
import { WORLD_SCALE, metersToTiles, tilesToMeters, pixelsPerMeter, heightPixels,
  cameraElevationSine, cameraElevationCosine, playerDisplayScale } from "../docs/src/world-scale.js";
import { zombieBodyProfile } from "../docs/src/zombie-appearance.js";
import { Renderer } from "../docs/src/render.js";

test("reference objects and placeholder share one metric projection", () => {
  assert.equal(WORLD_SCALE.player.height, 1.8);
  assert.equal(WORLD_SCALE.player.futureFemaleHeight, 1.68);
  assert.deepEqual([WORLD_SCALE.door.width, WORLD_SCALE.door.height], [.86, 1.985]);
  assert.deepEqual([WORLD_SCALE.fridge.height, WORLD_SCALE.fridge.width, WORLD_SCALE.fridge.depth], [1.86, .6, .665]);
  assert.equal(cameraElevationSine, .5);
  assert.equal(tilesToMeters(metersToTiles(.86)), .86);
  const renderer = Object.create(Renderer.prototype);
  const floor = renderer.rawIso(metersToTiles(1), 0);
  assert.ok(Math.abs(floor.x - pixelsPerMeter / Math.SQRT2) < 1e-12);
  assert.ok(Math.abs(floor.y - pixelsPerMeter * cameraElevationSine / Math.SQRT2) < 1e-12);
  assert.equal(heightPixels(1), pixelsPerMeter * cameraElevationCosine);
  const player = playerDisplayScale();
  assert.equal(player.y * 41, heightPixels(1.8));
  assert.ok(Math.abs(player.x * 22 / pixelsPerMeter - .48) < 1e-12);
});

test("sex, build and individual height stay consistent across save/load and actions", () => {
  const values = [];
  for (let i = 0; i < 500; i++) {
    const zombie = createZombie(3, 3, i, `measured-${i}`);
    const snapshot = JSON.stringify(zombie);
    const body = zombieBodyProfile(zombie);
    assert.equal(body.sex, i % 10 < 5 ? "female" : "male");
    assert.ok(body.height >= (body.sex === "female" ? 1.58 : 1.70));
    assert.ok(body.height <= (body.sex === "female" ? 1.78 : 1.90));
    assert.ok(Math.abs(body.height - body.scale * WORLD_SCALE.zombies.sourceReferenceHeights[body.variant]) < 1e-12);
    assert.deepEqual(zombieBodyProfile(JSON.parse(snapshot)), body);
    assert.equal(JSON.stringify(zombie), snapshot, "visual profile never mutates Save-v4 entities");
    for (const state of ["idle", "search", "chase"]) {
      zombie.state = state; zombie.moving = true;
      assert.deepEqual(zombieBodyProfile(zombie), body, "animation cannot change physical scale");
    }
    values.push(body);
  }
  const mean = sex => values.filter(v => v.sex === sex).reduce((s,v) => s+v.height,0) / 250;
  assert.ok(mean("male") - mean("female") > .1);
  const female = values.filter(v => v.sex === "female").map(v => v.height);
  const male = values.filter(v => v.sex === "male").map(v => v.height);
  assert.ok(Math.max(...female) > Math.min(...male), "individual ranges overlap naturally");
  for (let i = 0; i < 18; i++) {
    const id = `zombie-${i+1}`;
    assert.deepEqual(zombieBodyProfile({ id, variant: i % 5 }), zombieBodyProfile({ id, variant: i % 10 }));
  }
});
