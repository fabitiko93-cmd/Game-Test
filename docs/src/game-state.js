import { GAME } from "./config.js";
import { createInitialZombies } from "./ai.js";
import { ensureStealthState } from "./stealth.js";
import { totalBleeding } from "./character.js";
import { PlayerVisibility } from "./player-visibility.js";
import { PLAYER_BODY_RADIUS } from "./world-scale.js";

const deepCopy = value => JSON.parse(JSON.stringify(value));

export function serialize(game) {
  game.playerVisibility?.update(game.player);
  const player = deepCopy(game.player);
  player.combat.triggerHeld = false;
  player.combat.triggerWeaponId = null;
  player.combat.triggerTargetId = null;
  // A reload is interrupted on leaving the session. Only rounds/magazines
  // already transferred at animation events belong in the saved inventory.
  if(player.combat.reload)player.combat.attackCooldown=Math.min(player.combat.attackCooldown||0,.12);
  delete player.combat.reload;
  delete player.combat.shotImpulse;
  player.navigation = {
    path: [],
    destination: null,
    interactionId: null,
    runRequested: false,
    guided: false,
    manualUntil: 0,
    source: null,
  };
  const zombies = deepCopy(game.zombies).map(zombie => ({ ...zombie, path: [] }));
  return {
    seed: game.world.seed,
    minutes: game.minutes,
    mission: game.mission,
    survivorCount: game.survivorCount,
    migrationTimer: game.migrationTimer,
    player,
    zombies,
    world: game.world.serialize(),
    exploration: game.playerVisibility?.serialize(),
  };
}

export function save(game) {
  if (!game.started) return false;
  const ok = game.saveStore.write(game.serialize());
  if (!ok) game.ui.showToast("AUTOSAVE FEHLGESCHLAGEN");
  return ok;
}

export function load(game) {
  const saved = game.saveStore.read();
  if (!saved?.player) return false;
  game.world.reset(saved.seed || GAME.seed);
  game.world.restore(saved.world || []);
  game.minutes = saved.minutes ?? GAME.startMinutes;
  game.mission = saved.mission ?? 0;
  game.survivorCount = saved.survivorCount ?? saved.player.survivorNumber ?? 1;
  game.migrationTimer = saved.migrationTimer ?? GAME.migrationSeconds;
  game.player = saved.player;
  game.playerVisibility = new PlayerVisibility();
  game.playerVisibility.restore(saved.exploration);
  game.playerVisibility.update(game.player);
  ensureStealthState(game.player);
  game.player.stealthState.hidden = false;
  game.player.stealthState.execution = null;
  game.zombies = Array.isArray(saved.zombies) ? saved.zombies : createInitialZombies();
  for (const zombie of game.zombies) {
    zombie.desiredFacingX ??= zombie.facingX ?? 0;
    zombie.desiredFacingY ??= zombie.facingY ?? 1;
    zombie.stimulus ??= null;
    zombie.hitKick ??= 0;
  }
  game.player.navigation ||= { path: [], destination: null, interactionId: null, runRequested: false, guided: false, manualUntil: 0 };
  game.player.combat ||= { enabled: false, targetId: null, attackCooldown: 0, attackTimer: 0, pendingAttack: 0, pendingTargetId: null, aim: 0, recoil: 0 };
  game.combat.end(game, { keepTarget: true });
  game.player.bleeding = totalBleeding(game.player);
  game.player.equipment ||= { mainHand: null, offHand: null, head: null, torso: null, legs: null, back: null };
  game.player.noiseRadius ??= 0;
  game.player.hitKick ??= 0;
  // Preserve old saves while moving only entities now intersecting a corrected
  // vehicle footprint (or an old invalid spawn) to the nearest free cell.
  for (const entity of [game.player, ...game.zombies]) {
    const radius = entity === game.player ? PLAYER_BODY_RADIUS : .27;
    if (entity.removed || game.world.isWalkable(entity.x, entity.y, radius)) continue;
    const point = game.navigator.nearestWalkable(game.world, entity, { allowDoors: false });
    if (point && game.world.isWalkable(point.x, point.y, radius)) {
      entity.x = point.x;
      entity.y = point.y;
      if (entity !== game.player) { entity.path = []; entity.repathTimer = 0; }
    }
  }
  game.renderer.destination = null;
  game.renderer.destinationRun = false;
  game.stealth.refresh(game);
  return true;
}
