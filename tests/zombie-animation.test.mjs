import assert from "node:assert/strict";
import test from "node:test";
import { readFile, readdir, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
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
  z.state = "chase"; assert.equal(zombieAnimationState(z), "walk");
  z.moving = false; assert.equal(zombieAnimationState(z), "alert");
  z.state = "suspicious"; assert.equal(zombieAnimationState(z), "alert");
});

test("attack pose follows the actual windup, hit and recovery without changing damage timing", () => {
  const z = createZombie(0, 0), animator = new ZombieAnimator(metadata), system = new ZombieSystem(null);
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
  assert.ok(Math.abs(animator.sample(z, .29).progress-.29/1.4) < 1e-9);
  z.attackCooldown = ZOMBIE_ATTACK.cooldown-.28;
  const contact = animator.sample(z, .29);
  const clip = metadata.variants[contact.variant][contact.clip];
  assert.equal(Math.floor(contact.progress*clip.frames+1e-9), clip.hitFrame);
  assert.equal(clip.hitTime, ZOMBIE_ATTACK.windup);
  assert.ok(Math.abs(clip.sourceHit-clip.sourceStart-ZOMBIE_ATTACK.windup) < 1e-9,
    "the windup uses authored speed instead of fast-forwarding the entire action");
  assert.ok((clip.sourceDuration-clip.sourceHit)/(clip.playbackDuration-clip.hitTime) < 1.4,
    "recovery is calm rather than the old 3.2x playback");
  z.attackCooldown = ZOMBIE_ATTACK.cooldown-1.41;
  assert.equal(zombieAnimationState(z), "alert");
  z.attackCooldown = 0; animator.sample(z, 1.42);
  system.updateAttack(z, game, 0, .5, 1);
  assert.notEqual(animator.sample(z, 1.42).clip, attack.clip, "successive strikes alternate arms");
  const second = animator.sample(z, 1.42);
  z.attackCooldown = .04; animator.sample(z, 2.8);
  z.attackCooldown = ZOMBIE_ATTACK.cooldown;
  assert.notEqual(animator.sample(z, 2.84).clip, second.clip,
    "alternate even when a render frame misses the short pause between attacks");
});

test("gait has a calm simulation-time cadence at 30/60 FPS and never accelerates with travel speed", () => {
  const simulate = (fps, speed) => {
    const z = createZombie(0, 0), a = new ZombieAnimator(metadata);
    Object.assign(z, { phase: 0, state: "chase", moving: true });
    a.sample(z, 0);
    let pose;
    for (let i = 1; i <= fps; i++) { z.x = i/fps*speed; pose = a.sample(z, i/fps); }
    assert.deepEqual(a.sample(z, 1), pose, "rendering paused time cannot advance the animation");
    z.moving = false; const stopped = a.sample(z, 1.04);
    assert.equal(stopped.clip, "walk"); assert.equal(stopped.progress, pose.progress);
    assert.equal(a.sample(z, 1.2).clip, "alert");
    return pose.progress;
  };
  const slow = simulate(30, .2), fast = simulate(60, 2);
  assert.ok(Math.abs(slow-fast) < 1e-12);
  assert.ok(Math.abs(fast-.8/metadata.variants[0].walk.sourceDuration) < 1e-12);
  assert.ok(fast < .4, "at most a calm fraction of the authored walking cycle per second");
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

test("the actual baked forward vector follows the projected sight direction in every octant", () => {
  assert.deepEqual([...metadata.directionRows].sort(), [0,1,2,3,4,5,6,7]);
  for (let d = 0; d < 8; d++) {
    const z = { facingX: Math.cos(d*Math.PI/4), facingY: Math.sin(d*Math.PI/4) };
    const row = metadata.directionRows[zombieDirection(z)];
    const actual = metadata.viewForwards[row];
    // Same tile projection as Renderer.rawIso and the cone geometry, compared
    // against the asset preparer's projected +Z anatomical forward vector.
    const expected = [(z.facingX-z.facingY)*32, (z.facingX+z.facingY)*16];
    const dot = (actual[0]*expected[0]+actual[1]*expected[1])/(Math.hypot(...actual)*Math.hypot(...expected));
    assert.ok(dot > Math.cos(3*Math.PI/180), `model row ${row} must face the cone in octant ${d}`);
  }
});

test("only walking sources ship for locomotion, with valid hashed PNGs and complete frame grids", async () => {
  const sources = new Set();
  const activeFiles = [];
  assert.equal(metadata.variants.length, 10);
  for (const variant of metadata.variants) {
    assert.equal(variant.run, undefined, "running is not a currently implemented zombie behavior");
    assert.equal(variant.walk.source, "Walk");
    for (const clip of Object.values(variant)) {
    activeFiles.push(clip.file);
    sources.add(clip.source);
    const filename = new URL(`../docs/assets/zombies/${clip.file}`, import.meta.url);
    const bytes = await readFile(filename);
    assert.equal(bytes.subarray(1, 4).toString(), "PNG");
    assert.equal(bytes.readUInt32BE(16), metadata.width*clip.frames);
    assert.equal(bytes.readUInt32BE(20), metadata.height*metadata.directions);
    const digest = createHash("sha256").update(bytes).digest("hex").slice(0, 10);
    assert.ok(clip.file.endsWith(`-${digest}.png`), "new content never reuses an old cached image URL");
    assert.ok((await stat(filename)).size < 160000, "individual states remain small downloads");
    }
  }
  assert.deepEqual([...sources].sort(), ["attack_left", "attack_right", "idle", "idle2_alert", "idle3",
    "slowWalk", "Walk", "Walk2_limp"].sort());
  const installed = (await readdir(new URL("../docs/assets/zombies/", import.meta.url))).filter(name => name.endsWith(".png"));
  assert.deepEqual(installed.sort(), activeFiles.sort(), "unused running/legacy atlases do not enter the offline cache");
});

test("sheet transitions retain the loaded model and inactive sheets are evicted from memory", async () => {
  const images = [], draws = [];
  const sprites = new ZombieSprites({ metadata,
    createImage: () => { const image = { src: "" }; images.push(image); return image; } });
  const ctx = { globalAlpha: 1, save() {}, restore() {}, drawImage(...args) { draws.push(args); } };
  const z = createZombie(0, 0);
  sprites.beginFrame(); assert.equal(sprites.draw(ctx, z, 0, { x: 100, y: 100 }), false);
  images[0].onload();
  z.facingX = 1; z.facingY = 0;
  assert.equal(sprites.draw(ctx, z, 0, { x: 100, y: 100 }), true);
  assert.equal(draws.at(-1)[2], metadata.directionRows[0]*metadata.height);
  z.moving = true;
  z.facingX = z.facingY = Math.SQRT1_2;
  assert.equal(sprites.draw(ctx, z, .1, { x: 100, y: 100 }), true, "a loading clip keeps the previous real model");
  assert.equal(draws.at(-1)[0], images[0]); images[1].onload();
  assert.equal(draws.at(-1)[2], metadata.directionRows[1]*metadata.height,
    "a loading clip may retain the old pose but must turn with the sight cone immediately");
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
