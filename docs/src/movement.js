import { GAME, STANCES } from "./config.js";
import { skillValue } from "./character.js";
import { activeWeapon, itemDefinition, inventoryWeight, carryCapacity } from "./inventory.js";
import { clamp, distance } from "./util.js";

export function updateMovement(game, delta) {
  const player = game.player;
  const keyboard = game.input.keyboardMovement();
  let dx = 0;
  let dy = 0;
  let moving = false;
  let requestedRun = false;

  if (keyboard.magnitude > 0) {
    player.navigation.path = [];
    player.navigation.destination = null;
    player.navigation.interactionId = null;
    player.navigation.manualUntil = game.elapsed + 0.9;
    dx = keyboard.y + keyboard.x;
    dy = keyboard.y - keyboard.x;
    const length = Math.hypot(dx, dy) || 1;
    dx /= length;
    dy /= length;
    moving = true;
    requestedRun = keyboard.run;
  } else {
    const target = game.combat.target(game);
    const weapon = activeWeapon(player);
    const stats = weapon ? itemDefinition(weapon) : null;
    if (target && stats?.weaponKind === "melee" && distance(player, target) <= (stats.range || 0.9) + 0.08
      && player.navigation.source === "combat") {
      game.clearNavigation();
    }

    const node = player.navigation.path?.[0];
    if (node) {
      const door = game.world.doorAtCell(node.x, node.y);
      if (door?.closed) {
        if (door.locked) {
          game.clearNavigation();
          game.renderer.selectedId = door.id;
          game.ui.showMessage("Die Tür ist verschlossen.", 1.4);
        } else if (distance(player, door) <= GAME.interactionRange + 0.2) {
          game.openDoor(door, true);
        }
      }
    }

    const next = player.navigation.path?.[0];
    if (next) {
      const tx = next.x - player.x;
      const ty = next.y - player.y;
      const length = Math.hypot(tx, ty);
      if (length < 0.13) {
        player.x = next.x;
        player.y = next.y;
        player.navigation.path.shift();
        if (!player.navigation.path.length) game.arriveAtDestination();
      } else {
        dx = tx / length;
        dy = ty / length;
        moving = true;
        requestedRun = player.navigation.runRequested;
      }
    }
  }

  const canRun = requestedRun && player.stance !== "sneak" && player.stamina > 4;
  const mode = player.stance === "sneak" ? "sneak" : canRun ? "run" : "walk";
  const stance = STANCES[mode];
  player.moving = moving;
  player.running = moving && mode === "run";
  if (moving) {
    player.facingX = dx;
    player.facingY = dy;
    const burden = inventoryWeight(player) / Math.max(1, carryCapacity(player));
    const burdenFactor = clamp(1.08 - burden * 0.16, 0.72, 1);
    const stealthFactor = 1 - skillValue(player, "stealth") * 0.003;
    const hiddenNoise = game.stealth.hiddenNoiseMultiplier(player);
    player.noiseRadius = stance.noise * stealthFactor * hiddenNoise;
    const previousX = player.x;
    const previousY = player.y;
    const moved = game.moveEntity(player, dx * stance.speed * burdenFactor * delta, dy * stance.speed * burdenFactor * delta, 0.27);
    game.stealth.onMove(game, Math.hypot(player.x - previousX, player.y - previousY), mode);
    if (!moved && player.navigation.path.length) {
      const interaction = game.world.objects.find(object => object.id === player.navigation.interactionId && !object.removed);
      if (interaction && distance(player, interaction) <= GAME.interactionRange + 0.2) game.arriveAtDestination();
      else game.clearNavigation();
    }
    player.stamina = clamp(player.stamina + stance.stamina * delta * (player.hunger < 20 ? 0.48 : 1), 0, 100);
    game.stepTimer -= delta;
    if (game.stepTimer <= 0) {
      const noise = stance.noise * stealthFactor * hiddenNoise;
      game.world.emitNoise(player.x, player.y, noise, "step", 1.1, 0.45);
      player.noisePulse = Math.max(player.noisePulse, clamp(noise / 7, 0, 1));
      game.stepTimer = mode === "run" ? 0.28 : mode === "sneak" ? 0.68 : 0.46;
    }
  } else {
    player.noiseRadius = Math.max(0, (player.noiseRadius || 0) - delta * 4.5);
    player.stamina = clamp(player.stamina + 10.5 * delta * (player.hunger < 20 ? 0.48 : 1), 0, 100);
    game.stepTimer = 0;
  }
}

export function moveEntity(game, entity, dx, dy, radius) {
  const previousX = entity.x, previousY = entity.y;
  const nx = entity.x + dx;
  const ny = entity.y + dy;
  if (game.world.isWalkable(nx, entity.y, radius, entity.id)) {
    entity.x = nx;
  }
  if (game.world.isWalkable(entity.x, ny, radius, entity.id)) {
    entity.y = ny;
  }
  return Math.hypot(entity.x - previousX, entity.y - previousY) > 0.00001;
}

export function setDestination(game, requestedPoint, options = {}) {
  if (!game.canAct()) return false;
  const point = game.world.clampPoint(requestedPoint);
  const navigation = game.player.navigation;
  const path = game.navigator.findPath(game.world, game.player, point, { allowDoors: true });
  const sameCell = Math.round(game.player.x) === Math.round(point.x) && Math.round(game.player.y) === Math.round(point.y);
  if (!path.length && !sameCell) {
    game.renderer.rejectDestination(point);
    game.ui.showMessage("Kein begehbarer Weg.", 1.1);
    return false;
  }
  navigation.path = path;
  navigation.destination = { x: Math.round(point.x), y: Math.round(point.y) };
  navigation.interactionId = options.interactionId || null;
  navigation.runRequested = Boolean(options.run);
  navigation.guided = Boolean(options.guided);
  navigation.source = options.source || "manual";
  if (navigation.source === "manual") navigation.manualUntil = game.elapsed + 1.25;
  game.renderer.destination = navigation.destination;
  game.renderer.destinationRun = navigation.runRequested;
  if (sameCell) game.arriveAtDestination();
  return true;
}

export function clearNavigation(game) {
  const navigation = game.player.navigation;
  navigation.path = [];
  navigation.destination = null;
  navigation.interactionId = null;
  navigation.runRequested = false;
  navigation.guided = false;
  navigation.source = null;
  game.renderer.destination = null;
  game.renderer.destinationRun = false;
}

export function arriveAtDestination(game) {
  const interactionId = game.player.navigation.interactionId;
  const wasGuided = game.player.navigation.guided;
  game.player.navigation.path = [];
  game.player.navigation.destination = null;
  game.player.navigation.interactionId = null;
  game.player.navigation.runRequested = false;
  game.renderer.destination = null;
  game.renderer.destinationRun = false;
  if (interactionId) {
    const object = game.world.objects.find(entry => entry.id === interactionId && !entry.removed);
    if (object) game.interact(object);
  } else if (!wasGuided) {
    game.player.navigation.source = null;
  }
}

export function queueInteraction(game, object) {
  if (!object?.interactable) return;
  game.renderer.selectedId = object.id;
  if (distance(game.player, object) <= GAME.interactionRange) {
    game.interact(object);
    return;
  }
  const path = game.navigator.pathToInteraction(game.world, game.player, object, {
    allowDoors: true,
    interactionRange: GAME.interactionRange,
  });
  if (!path.length) {
    game.renderer.rejectDestination(game.world.clampPoint(object));
    game.ui.showMessage("Kein Weg in Reichweite.", 1.2);
    return;
  }
  const destination = path[path.length - 1];
  game.player.navigation.path = path;
  game.player.navigation.destination = { ...destination };
  game.player.navigation.interactionId = object.id;
  game.player.navigation.runRequested = false;
  game.player.navigation.guided = false;
  game.player.navigation.source = "manual";
  game.player.navigation.manualUntil = game.elapsed + 1.25;
  game.renderer.destination = { ...destination };
  game.renderer.destinationRun = false;
  game.ui.showMessage(`GEHE ZU: ${object.name || "OBJEKT"}`, 1.1);
}

export function approachCombatTarget(game, target, range) {
  if (game.player.navigation.manualUntil > game.elapsed || game.player.navigation.guided) return;
  if (game.player.navigation.source === "combat" && game.player.navigation.path.length && game.elapsed < game.combatPathTick) return;
  if (distance(game.player, target) <= range + 0.04) return;
  const path = game.navigator.findPath(game.world, game.player, target, { allowDoors: true, maxNodes: 1800 });
  if (!path.length) return;
  game.player.navigation.path = path;
  game.player.navigation.destination = path[path.length - 1];
  game.player.navigation.interactionId = null;
  game.player.navigation.runRequested = false;
  game.player.navigation.guided = false;
  game.player.navigation.source = "combat";
  game.renderer.destination = null;
  game.combatPathTick = game.elapsed + 0.35;
}
