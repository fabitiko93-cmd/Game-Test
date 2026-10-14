import { GAME, STANCES } from "./config.js";
import { skillValue } from "./character.js";
import { activeWeapon, itemDefinition, inventoryWeight, carryCapacity } from "./inventory.js";
import { clamp, distance } from "./util.js";
import { findPlayerPath, pathToPlayerInteraction } from "./player-navigation.js";
import { canInteract } from "./interaction.js";

export function updateMovement(game, delta) {
  const player = game.player, navigation = player.navigation;
  if (navigation.source === "combat" && !game.combat.target(game)) game.clearNavigation();
  const keyboard = game.input.keyboardMovement();
  if (keyboard.magnitude <= 0 && navigation.source === "execution") game.stealth.updateExecution?.(game);
  if (!navigation.path.length && keyboard.magnitude <= 0 && navigation.source === "manual"
    && game.elapsed >= navigation.manualUntil) navigation.source = null;
  let dx = 0, dy = 0, waypoint = null, requestedRun = navigation.runRequested;
  if (keyboard.magnitude > 0) {
    game.stealth.cancelExecution?.(game);
    game.clearNavigation();
    navigation.source = "manual";
    navigation.manualUntil = game.elapsed + .9;
    dx = keyboard.y + keyboard.x; dy = keyboard.y - keyboard.x;
    const length = Math.hypot(dx, dy) || 1;
    dx /= length; dy /= length; requestedRun = keyboard.run;
  } else {
    const target = game.combat.target(game), weapon = activeWeapon(player), stats = itemDefinition(weapon);
    if (target && navigation.source === "combat" && distance(player, target) <= (stats?.range || .88) + .08) game.clearNavigation();
    while (navigation.path?.length && distance(player, navigation.path[0]) < .003) {
      const next = navigation.path.shift();
      if (game.world.isWalkable(next.x, next.y, .27)) { player.x = next.x; player.y = next.y; }
      if (!navigation.path.length) game.arriveAtDestination();
    }
    waypoint = navigation.path?.[0];
    if (waypoint) {
      dx = waypoint.x - player.x; dy = waypoint.y - player.y;
      const length = Math.hypot(dx, dy) || 1;
      dx /= length; dy /= length;
    }
  }
  const canRun = requestedRun && player.stance !== "sneak" && player.stamina > 4;
  const mode = player.stance === "sneak" ? "sneak" : canRun ? "run" : "walk", stance = STANCES[mode];
  const previous = { x: player.x, y: player.y };
  if (Math.hypot(dx, dy) > 0) {
    const burden = inventoryWeight(player) / Math.max(1, carryCapacity(player));
    let budget = stance.speed * clamp(1.08 - burden * .16, .72, 1) * delta;
    if (waypoint) {
      for (let leg = 0; leg < 6 && budget > .00001 && navigation.path.length; leg++) {
        const next = navigation.path[0], door = game.world.doorAtCell(next.x, next.y)
          || game.world.objectsNear(player.x, player.y, GAME.interactionRange + .2).find(object => {
            if (object.type !== "door" || !object.closed) return false;
            const sx = next.x - player.x, sy = next.y - player.y, square = sx * sx + sy * sy;
            const amount = square ? ((object.x - player.x) * sx + (object.y - player.y) * sy) / square : 0;
            return amount >= 0 && amount <= 1 && Math.hypot(player.x + sx * amount - object.x,
              player.y + sy * amount - object.y) < .7;
          });
        if (door?.closed) {
          if (door.locked) { game.clearNavigation(); game.ui.showMessage("Die Tür ist verschlossen.", 1.4); break; }
          if (distance(player, door) <= GAME.interactionRange + .2) game.openDoor(door, true);
        }
        const tx = next.x - player.x, ty = next.y - player.y, length = Math.hypot(tx, ty);
        if (length < .003) { navigation.path.shift(); if (!navigation.path.length) game.arriveAtDestination(); continue; }
        dx = tx / length; dy = ty / length;
        const travel = Math.min(budget, length), before = { x: player.x, y: player.y };
        const moved = game.moveEntity(player, dx * travel, dy * travel, .27);
        budget -= distance(before, player);
        if (distance(player, next) < .003) {
          navigation.path.shift();
          if (!navigation.path.length) game.arriveAtDestination();
        }
        if (!moved) {
          const object = game.world.objects.find(entry => entry.id === navigation.interactionId && !entry.removed);
          if (object && canInteract(game.world, player, object)) game.arriveAtDestination();
          else { game.clearNavigation(); game.ui.showMessage("Weg blockiert · neues Ziel wählen.", 1.2); }
          break;
        }
      }
    } else game.moveEntity(player, dx * budget, dy * budget, .27);
  }
  const movedDistance = distance(previous, player);
  player.moving = movedDistance > .000001;
  player.running = player.moving && mode === "run";
  if (player.moving) {
    player.facingX = dx; player.facingY = dy;
    const stealthFactor = 1 - skillValue(player, "stealth") * .003;
    const hiddenNoise = game.stealth.hiddenNoiseMultiplier(player);
    player.noiseRadius = stance.noise * stealthFactor * hiddenNoise;
    game.stealth.onMove(game, movedDistance, mode);
    player.stamina = clamp(player.stamina + stance.stamina * delta * (player.hunger < 20 ? .48 : 1), 0, 100);
    game.stepTimer -= delta;
    if (game.stepTimer <= 0) {
      const noise = stance.noise * stealthFactor * hiddenNoise;
      game.world.emitNoise(player.x, player.y, noise, "step", 1.1, .45);
      player.noisePulse = Math.max(player.noisePulse, clamp(noise / 7, 0, 1));
      game.stepTimer = mode === "run" ? .28 : mode === "sneak" ? .68 : .46;
    }
  } else {
    player.noiseRadius = Math.max(0, (player.noiseRadius || 0) - delta * 4.5);
    player.stamina = clamp(player.stamina + 10.5 * delta * (player.hunger < 20 ? .48 : 1), 0, 100);
    game.stepTimer = 0;
  }
}

export function moveEntity(game, entity, dx, dy, radius) {
  const previousX = entity.x, previousY = entity.y;
  const nx = entity.x + dx;
  const ny = entity.y + dy;
  if (game.world.isWalkable(nx, ny, radius, entity.id)) {
    entity.x = nx; entity.y = ny;
    return Math.hypot(entity.x - previousX, entity.y - previousY) > .00001;
  }
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
  const path = findPlayerPath(game.world, game.player, point, { allowDoors: true, preferCover: game.player.stance === "sneak" });
  if (!path.length) {
    game.renderer.rejectDestination(point);
    game.ui.showMessage("Kein begehbarer Weg.", 1.1);
    return false;
  }
  game.stealth.cancelExecution?.(game);
  navigation.path = path;
  navigation.destination = { ...path.at(-1) };
  navigation.interactionId = options.interactionId || null;
  navigation.runRequested = Boolean(options.run);
  navigation.guided = Boolean(options.guided);
  navigation.source = options.source || "manual";
  if (navigation.source === "manual") navigation.manualUntil = game.elapsed + 1.25;
  game.renderer.destination = navigation.destination;
  game.renderer.destinationRun = navigation.runRequested;
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
    if (game.player.navigation.source === "manual") game.player.navigation.manualUntil = game.elapsed + .35;
    else game.player.navigation.source = null;
  }
}

export function queueInteraction(game, object) {
  if (!object?.interactable) return;
  game.stealth.cancelExecution?.(game);
  game.renderer.selectedId = object.id;
  if (canInteract(game.world, game.player, object)) {
    game.interact(object);
    return;
  }
  const path = pathToPlayerInteraction(game.world, game.player, object, {
    allowDoors: true,
    interactionRange: GAME.interactionRange,
    preferCover: game.player.stance === "sneak",
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
  if ((game.player.navigation.source === "manual" && game.player.navigation.path.length)
    || game.player.navigation.manualUntil > game.elapsed || game.player.navigation.guided) return;
  if (game.player.navigation.source === "combat" && game.player.navigation.path.length && game.elapsed < game.combatPathTick) return;
  if (distance(game.player, target) <= range + 0.04) return;
  const path = findPlayerPath(game.world, game.player, target, { allowDoors: true });
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
