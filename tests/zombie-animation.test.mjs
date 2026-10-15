import assert from "node:assert/strict";
import test from "node:test";
import { readFile, stat } from "node:fs/promises";
import { createInitialZombies, createZombie, ZombieSystem, ZOMBIE_ATTACK } from "../docs/src/ai.js";
import { ZombieAnimator, zombieAnimationState, zombieDirection, zombieVariant } from "../docs/src/zombie-animation.js";
import { ZombieSprites } from "../docs/src/zombie-sprites.js";

const metadata = JSON.parse(await readFile(new URL("../docs/assets/zombies/atlas.json", import.meta.url)));

test("all ten appearances work for fresh zombies and existing Save-v4 IDs", () => {
  const zombies = createInitialZombies();
  assert.deepEqual(zombies.slice(0, 10).map(zombieVariant), [0,1,2,3,4,5,6,7,8,9]);
  const old = zombies.map((z, i) => ({ ...z, variant: i % 5 }));
  const snapshot = JSON.stringify(old);
  assert.deepEqual(old.map(zombieVariant), zombies.map(zombieVariant));
  assert.equal(JSON.stringify(old), snapshot, "appearance lookup never mutates saved entities");
  assert.equal(zombieVariant({ id: "migrant", variant: 19 }), 9);
});

test("states distinguish rest, alert, ambient shuffle, investigation and pursuit", () => {
  const z = createZombie(0, 0);
  assert.equal(zombieAnimationState(z), "rest");
  z.moving = true; assert.equal(zombieAnimationState(z), "shuffle");
  z.state = "search"; assert.equal(zombieAnimationState(z), "shuffle");
  z.state = "investigate"; assert.equal(zombieAnimationState(z), "walk");
  z.state = "chase"; assert.equal(zombieAnimationState(z), "run");
  z.moving = false; assert.equal(zombieAnimationState(z), "alert");
  z.state = "suspicious"; assert.equal(zombieAnimationState(z), "alert");
});

test("attack pose follows the actual windup, hit and recovery without changing damage timing", () => {
  const z = createZombie(0, 0), animator = new ZombieAnimator(), system = new ZombieSystem(null);
  const game = { player: { x: .5, y: 0 }, world: { hasLineOfSight: () => true }, hits: 0,
    onZombieAttack() { this.hits++; } };
  z.state = "chase";
  animator.sample(z, 0);
  system.updateAttack(z, game, 0, .5, 1);
  const attack = animator.sample(z, 0);
  assert.match(attack.clip, /^attack_/); assert.equal(attack.progress, 0);
  z.attackCooldown -= .27; system.updateAttack(z, game, .27, .5, 1);
  assert.equal(game.hits, 0);
  z.attackCooldown -= .02; system.updateAttack(z, game, .02, .5, 1);
  assert.equal(game.hits, 1);
  assert.ok(Math.abs(animator.sample(z, .29).progress-.29/.73) < 1e-9);
  z.attackCooldown = ZOMBIE_ATTACK.cooldown-.74;
  assert.equal(zombieAnimationState(z), "alert");
  z.attackCooldown = 0; animator.sample(z, 1.42);
  system.updateAttack(z, game, 0, .5, 1);
  assert.notEqual(animator.sample(z, 1.42).clip, attack.clip, "successive strikes alternate arms");
});

test("gait follows distance at 30 and 60 FPS, remains fixed in pause and ignores tiny waypoint stops", () => {
  const simulate = fps => {
    const z = createZombie(0, 0), a = new ZombieAnimator();
    Object.assign(z, { phase: 0, state: "chase", moving: true });
    a.sample(z, 0);
    let pose;
    for (let i = 1; i <= fps; i++) { z.x = i/fps*.5; pose = a.sample(z, i/fps); }
    assert.deepEqual(a.sample(z, 1), pose, "rendering paused time cannot advance the animation");
    z.moving = false; assert.equal(a.sample(z, 1.04).clip, "run");
    assert.equal(a.sample(z, 1.2).clip, "alert");
    return pose.progress;
  };
  assert.ok(Math.abs(simulate(30)-simulate(60)) < 1e-12);
});

test("eight views agree with world headings and do not flicker at an octant seam", () => {
  for (let d = 0; d < 8; d++) {
    assert.equal(zombieDirection({ facingX: Math.cos(d*Math.PI/4), facingY: Math.sin(d*Math.PI/4) }), d);
  }
  const z = { facingX: Math.cos(Math.PI/8+.02), facingY: Math.sin(Math.PI/8+.02) };
  assert.equal(zombieDirection(z, 0), 0);
  z.facingX = Math.cos(Math.PI/8+.1); z.facingY = Math.sin(Math.PI/8+.1);
  assert.equal(zombieDirection(z, 0), 1);
});

test("every assigned source is present, with a valid transparent PNG sheet and complete frame grid", async () => {
  const sources = new Set();
  assert.equal(metadata.variants.length, 10);
  for (const variant of metadata.variants) for (const clip of Object.values(variant)) {
    sources.add(clip.source);
    const filename = new URL(`../docs/assets/zombies/${clip.file}`, import.meta.url);
    const bytes = await readFile(filename);
    assert.equal(bytes.subarray(1, 4).toString(), "PNG");
    assert.equal(bytes.readUInt32BE(16), metadata.width*clip.frames);
    assert.equal(bytes.readUInt32BE(20), metadata.height*metadata.directions);
    assert.ok((await stat(filename)).size < 160000, "individual states remain small downloads");
  }
  assert.deepEqual([...sources].sort(), ["attack_left", "attack_right", "idle", "idle2_alert", "idle3",
    "running", "slowWalk", "Walk", "Walk_Agressive", "Walk2_limp"].sort());
});

test("sheet transitions retain the loaded model and inactive sheets are evicted from memory", async () => {
  const images = [], draws = [];
  const sprites = new ZombieSprites({ fetchAsset: async () => ({ ok: true, json: async () => metadata }),
    createImage: () => { const image = { src: "" }; images.push(image); return image; } });
  await sprites.ready;
  const ctx = { globalAlpha: 1, save() {}, restore() {}, drawImage(...args) { draws.push(args); } };
  const z = createZombie(0, 0);
  sprites.beginFrame(); assert.equal(sprites.draw(ctx, z, 0, { x: 100, y: 100 }), false);
  images[0].onload();
  assert.equal(sprites.draw(ctx, z, 0, { x: 100, y: 100 }), true);
  z.moving = true;
  assert.equal(sprites.draw(ctx, z, .1, { x: 100, y: 100 }), true, "a loading clip keeps the previous real model");
  assert.equal(draws.at(-1)[0], images[0]); images[1].onload();
  sprites.draw(ctx, z, .2, { x: 100, y: 100 }); assert.equal(draws.at(-1)[0], images[1]);
  for (let i = 1; i < 10; i++) {
    sprites.beginFrame();
    for (const state of ["idle", "suspicious", "chase"]) {
      const other = createZombie(0, 0, i); other.state = state; other.moving = state === "chase";
      sprites.draw(ctx, other, i, { x: 0, y: 0 }); images.at(-1).onload?.();
    }
    sprites.endFrame();
  }
  assert.ok(sprites.cache.size <= 14);
  assert.ok(images.some(image => image.src === ""), "evicted images release their decoded sheet");
});
