import assert from "node:assert/strict";
import { test } from "node:test";
import { InputController } from "../docs/src/input.js";
import { Game } from "../docs/src/game.js";
import { PlayerVisibility, PLAYER_VIEW, playerCanSee } from "../docs/src/player-visibility.js";
import { Renderer } from "../docs/src/render.js";
import { CombatSystem } from "../docs/src/combat.js";
import { StealthSystem } from "../docs/src/stealth.js";
import { World } from "../docs/src/world.js";
import { Navigator } from "../docs/src/navigation.js";
import { createPlayer } from "../docs/src/character.js";
import { playerEdgeMarker } from "../docs/src/camera-overlay.js";

function withInput(run) {
  const oldWindow = globalThis.window, oldDocument = globalThis.document;
  const listeners = {}, button = { addEventListener: (type, callback) => { listeners[type] = callback; } };
  globalThis.window = { addEventListener() {}, setTimeout: () => 1, clearTimeout() {} };
  globalThis.document = { getElementById: id => id === "recenter-button" ? button : null };
  try {
    const input = new InputController({ addEventListener() {}, setPointerCapture() {}, getBoundingClientRect: () => ({ left: 0, top: 0 }) });
    input.enabled = true;
    run(input, () => listeners.pointerdown({ preventDefault() {}, stopPropagation() {} }));
  } finally {
    globalThis.window = oldWindow; globalThis.document = oldDocument;
  }
}
const finger = (id = 1, x = 300, y = 200) => ({ pointerId: id, pointerType: "touch", button: 0,
  clientX: x, clientY: y, preventDefault() {} });

test("one finger pans only in free mode; holding, taps and release never move the player", () => withInput(input => {
  let worldCommands = 0, starts = 0, ends = 0; const pans = [];
  for (const name of ["tap", "doubleTap", "holdStart", "holdMove"]) input.callbacks[name] = () => worldCommands++;
  input.callbacks.panStart = () => starts++; input.callbacks.panEnd = () => ends++;
  input.callbacks.panMove = (x, y) => pans.push([x, y]);
  input.setCameraFree(true);
  input.pointerDown(finger()); input.beginHold(1);
  input.pointerMove(finger(1, 345, 180)); input.pointerUp(finger(1, 345, 180));
  input.pointerDown(finger()); input.pointerUp(finger());
  assert.equal(worldCommands, 0); assert.deepEqual(pans, [[45, -20]]);
  assert.equal(starts, 2); assert.equal(ends, 2); assert.equal(input.cameraFree, true);
}));

test("camera HUD toggle preserves a running route and ignores the older finger's release", () => withInput((input, press) => {
  let followed = 0, taps = 0;
  const navigation = { path: [{ x: 12, y: 36 }], destination: { x: 12, y: 36 }, source: "manual", runRequested: true };
  const game = { canAct: () => true, input, player: { x: 8, y: 36, navigation },
    renderer: { beginPan() {}, endPan() {}, recenter: () => followed++ }, ui: { showToast() {} } };
  input.callbacks.recenter = () => Game.prototype.recenterCamera.call(game);
  input.callbacks.tap = () => taps++;
  const before = structuredClone(navigation);
  press(); input.pointerDown(finger()); input.pointerMove(finger(1, 340));
  press(); input.pointerMove(finger(1, 400)); input.pointerUp(finger(1, 400));
  assert.deepEqual(navigation, before); assert.equal(followed, 1);
  assert.equal(taps, 0); assert.equal(input.cameraFree, false); assert.equal(input.lastTap.time, 0);
}));

test("extra fingers cannot change the pan anchor or fall through into walk/sprint", () => withInput(input => {
  let commands = 0; const pans = [];
  input.callbacks.tap = input.callbacks.doubleTap = input.callbacks.holdStart = () => commands++;
  input.callbacks.panMove = (x, y) => pans.push([x, y]);
  input.setCameraFree(true);
  input.pointerDown(finger()); input.pointerDown(finger(2, 600));
  input.pointerMove(finger(2, 700)); input.pointerMove(finger(1, 320)); input.pointerUp(finger());
  input.pointerMove(finger(2, 710)); input.pointerUp(finger(2));
  assert.deepEqual(pans, [[20, 0]]); assert.equal(commands, 0);
  input.setCameraFree(false);
  input.pointerDown(finger()); input.pointerDown(finger(2)); input.pointerUp(finger()); input.pointerUp(finger(2));
  assert.equal(commands, 0); assert.equal(input.panning, false);
}));

test("normal single tap and double tap remain available after leaving camera mode", () => withInput(input => {
  let taps = 0, doubles = 0;
  input.callbacks.tap = () => taps++; input.callbacks.doubleTap = () => doubles++;
  input.setCameraFree(true); input.setCameraFree(false);
  input.pointerDown(finger()); input.pointerUp(finger()); input.pointerDown(finger()); input.pointerUp(finger());
  assert.equal(taps, 1); assert.equal(doubles, 1);
}));

test("view is player-centered, independent of camera, stance, hide and blocked sightlines", () => {
  const visibility = new PlayerVisibility(), player = { x: 10, y: 10, stance: "sneak", stealthState: { hidden: true } };
  const game = { player, playerVisibility: visibility, world: { hasLineOfSight: () => false }, renderer: { camera: { x: 999, y: 999 } } };
  const near = { x: 14, y: 10 }, far = { x: 10 + PLAYER_VIEW.radius + .01, y: 10 };
  assert.equal(playerCanSee(game, near), true); assert.equal(playerCanSee(game, far), false);
  visibility.update(player); const saved = visibility.serialize();
  game.renderer.camera.x += 900; visibility.update(player);
  assert.deepEqual(visibility.serialize(), saved, "camera movement never explores the map");
  player.x = 32; visibility.update(player);
  assert.equal(visibility.hasExplored(near), true); assert.equal(playerCanSee(game, near), false);
  assert.equal(visibility.hasExplored({ x: 45, y: 10 }), true);
});

test("moving enemies and stale hotspots cannot bypass the range limit while player stands still", () => {
  const player = { x: 10, y: 10, combat: { targetId: "z" } }, zombie = { id: "z", x: 12, y: 10 };
  const visibility = new PlayerVisibility(), game = { player, playerVisibility: visibility, zombies: [zombie] };
  const combat = new CombatSystem(), renderer = Object.create(Renderer.prototype);
  Object.assign(renderer, { playerVisibility: visibility, viewPlayer: player,
    hotspots: [{ ref: zombie, id: "z", x: 200, y: 200, radius: 25 }] });
  assert.equal(combat.target(game), zombie); assert.equal(renderer.pick(200, 200)?.id, "z");
  zombie.x = 40;
  assert.equal(combat.target(game), null); assert.equal(renderer.pick(200, 200), null);
  zombie.x = 12; assert.equal(combat.target(game), zombie);
});

test("render keeps nearby covered enemies, remembers scenery and hides distant zombies/loose loot", () => {
  const visibility = new PlayerVisibility(), player = { x: 10, y: 10 }, draws = [];
  visibility.update(player); visibility.update({ x: 35, y: 10 });
  const objects = [{ id: "known-car", type: "car", x: 35, y: 10 }, { id: "loose", type: "groundloot", x: 35, y: 10 },
    { id: "unknown", type: "car", x: 45, y: 45 }];
  const game = { player, playerVisibility: visibility, minutes: 600, world: { objectsInBounds: () => objects },
    zombies: [{ id: "near-covered", x: 12, y: 10 }, { id: "far", x: 35, y: 10 }], contextObject: () => null };
  const renderer = Object.create(Renderer.prototype);
  Object.assign(renderer, { frame: 0, width: 960, height: 500, scale: 1, cameraFollowing: true,
    ctx: { setTransform() {}, fillRect() {}, save() {}, restore() {}, beginPath() {}, rect() {}, ellipse() {}, fill() {} },
    hotspots: [], metrics: {}, iso: (x, y) => ({ x: x * 10, y: y * 10 }), visibleWorldBounds: () => ({ minX: 0, minY: 0, maxX: 47, maxY: 47 }) });
  for (const method of ["updateMetrics", "updateParticles", "updateTracers", "follow", "drawGround", "drawBlood", "drawPlayerNoise",
    "drawCoverHints", "drawVisionCones", "drawDestination", "drawRoofs", "drawParticles", "drawTracers", "drawNoiseHints",
    "drawLighting", "drawVignette", "drawEntityStatuses"]) renderer[method] = () => {};
  renderer.drawObject = object => draws.push(object.id); renderer.drawZombie = zombie => draws.push(zombie.id); renderer.drawPlayer = () => {};
  renderer.render(game, .016);
  assert.deepEqual(draws.sort(), ["known-car", "near-covered"]);
});

test("exploration roundtrips through Game save/load; old and malformed exploration remain compatible", () => {
  const game = Object.create(Game.prototype), world = new World();
  Object.assign(game, { world, player: createPlayer({ background: "citizen" }), playerVisibility: new PlayerVisibility(),
    zombies: [], combat: new CombatSystem(), stealth: new StealthSystem(), navigator: new Navigator(), renderer: {}, minutes: 500 });
  game.playerVisibility.update({ x: 40, y: 5 });
  const saved = game.serialize(); game.saveStore = { read: () => saved };
  assert.equal(game.load(), true); assert.equal(game.playerVisibility.hasExplored({ x: 40, y: 5 }), true);
  delete saved.exploration;
  assert.equal(game.load(), true); assert.equal(game.playerVisibility.hasExplored({ x: 40, y: 5 }), false);
  assert.equal(game.playerVisibility.canSee(game.player, game.player), true);
  game.playerVisibility.restore({ version: 1, width: 48, height: 48, explored: "garbage" });
  assert.equal(game.playerVisibility.hasExplored({ x: 40, y: 5 }), false);
});

test("offscreen player marker points toward the player; never appears for an onscreen player", () => {
  assert.equal(playerEdgeMarker({ x: 300, y: 200 }, 812, 375), null);
  const left = playerEdgeMarker({ x: -800, y: 200 }, 812, 375);
  assert.ok(left.x >= 60 && left.x < 100); assert.ok(Math.abs(left.angle) > 3);
  const down = playerEdgeMarker({ x: 406, y: 900 }, 812, 375);
  assert.equal(down.x, 406); assert.ok(down.y < 375); assert.equal(down.angle, Math.PI / 2);
});
