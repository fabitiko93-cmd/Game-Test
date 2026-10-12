import { gainSkill } from "./character.js";
import { activeWeapon, itemDefinition, inventoryWeight, carryCapacity } from "./inventory.js";
import { behindTarget } from "./perception.js";
import { STANCES } from "./config.js";
import { pointSegmentDistance } from "./collision.js";
import { clamp, distance, vibrate } from "./util.js";
import { pathToPlayerRegion, playerPathLength } from "./player-navigation.js";

export const STEALTH_RULES = Object.freeze({
  minimumCover: 0.42,
  transitionRecognition: 1,
  openfieldDuration: 10,
  openfieldCooldown: 30,
  executionRange: 1.18,
  executionApproachRange: 6.5,
  executionStamina: 18,
  executionWindup: 0.58,
});

export function ensureStealthState(player) {
  player.stealthState ||= {};
  const state = player.stealthState;
  state.hidden = Boolean(state.hidden);
  state.coverId ??= null;
  state.coverLabel ??= null;
  state.source ??= null;
  state.coverSourceId ??= null;
  state.openfieldRemaining ??= 0;
  state.openfieldCooldown ??= 0;
  state.attackLock ??= 0;
  state.departureTime ??= 0;
  state.recentCoverId ??= null;
  // v11 saves carried a hidden step budget; it has no meaning in v12.
  delete state.reserve;
  delete state.maxReserve;
  delete state.moved;
  delete state.cooldown;
  state.execution ??= null;
  return state;
}

export function executionWeapon(player) {
  const weapon = activeWeapon(player);
  return itemDefinition(weapon)?.execution ? weapon : null;
}

// One contract for the ready indicator and the actual committed execution.
export function executionBlockReason(game, target) {
  const player = game.player;
  if (!target || target.removed) return "KEIN GÜLTIGES ZIEL";
  if (!ensureStealthState(player).hidden || player.stance !== "sneak") return "VERBORGEN ANSCHLEICHEN";
  if (!executionWeapon(player)) return "MESSER FEHLT";
  if (player.stamina < STEALTH_RULES.executionStamina) return "ZU WENIG AUSDAUER";
  if (target.state === "chase" || target.sightMemory?.visible) return "ZIEL HAT DICH ENTDECKT";
  if (distance(player, target) > STEALTH_RULES.executionRange) return "NÄHER AN DAS ZIEL";
  if (!behindTarget(player, target)) return "HINTER DAS ZIEL GEHEN";
  if (!game.world.hasLineOfSight(player, target)) return "KEIN FREIER ZUGRIFF";
  return null;
}

export class StealthSystem {
  state(game) {
    return ensureStealthState(game.player);
  }

  cover(game) {
    return game.world.coverMap.at(game.player, this.state(game).coverId);
  }

  hiddenNoiseMultiplier(player) {
    return ensureStealthState(player).hidden ? 0.5 : 1;
  }

  hasOpenfield(player) {
    return Boolean(player.perks?.openfieldStealth || player.background === "burglar");
  }

  openfieldContext(game) {
    const state = this.state(game);
    const inCombat = game.zombies.some(z => !z.removed && z.state === "chase");
    const hint = !this.hasOpenfield(game.player) ? "EINBRECHER-PERK BENÖTIGT"
      : state.openfieldRemaining > 0 ? "TARNUNG AKTIV"
      : state.openfieldCooldown > 0 ? `BEREIT IN ${Math.ceil(state.openfieldCooldown)} S`
      : inCombat ? "IM KAMPF NICHT VERFÜGBAR"
      : game.player.stance !== "sneak" ? "ZUERST SCHLEICHEN AKTIVIEREN" : "10 S VERBORGEN · 30 S COOLDOWN";
    return { visible: this.hasOpenfield(game.player), hint,
      actionable: this.hasOpenfield(game.player) && !inCombat && game.player.stance === "sneak"
        && state.openfieldCooldown <= 0 && state.openfieldRemaining <= 0 };
  }

  activateOpenfield(game) {
    const context = this.openfieldContext(game);
    if (!context.actionable) { game.ui?.showToast(context.hint); return false; }
    const state = this.state(game);
    state.openfieldRemaining = STEALTH_RULES.openfieldDuration;
    state.openfieldCooldown = STEALTH_RULES.openfieldCooldown;
    state.attackLock = 0;
    game.player.navigation.runRequested = false;
    this.refresh(game);
    game.ui?.showToast("FREIFELDTARNUNG · 10 SEKUNDEN");
    return true;
  }

  // Called before perception, and immediately by the crouch button. There is no
  // channel or movement allowance. Damage deliberately does not call this API.
  refresh(game) {
    const player = game.player, state = this.state(game);
    const previousCover = state.coverId;
    const cover = this.cover(game);
    state.coverId = cover?.id || null;
    state.coverSourceId = cover?.sourceId || null;
    state.coverLabel = cover?.label || null;
    if (player.stance !== "sneak" || player.running) {
      state.openfieldRemaining = 0;
      state.departureTime = 0;
      state.recentCoverId = null;
    } else if (previousCover && !state.coverId) {
      state.recentCoverId = previousCover;
      state.departureTime = 2;
    }
    state.source = player.stance !== "sneak" || player.running || state.attackLock > 0 ? null
      : state.openfieldRemaining > 0 ? "openfield" : cover ? "cover" : null;
    state.hidden = Boolean(state.source);
  }

  breakHidden(game, reason = "", notify = false) {
    const state = this.state(game), wasHidden = state.hidden;
    state.openfieldRemaining = 0;
    state.hidden = false;
    state.source = null;
    state.execution = null;
    if (game.player.navigation?.source === "execution") game.clearNavigation?.();
    if (wasHidden && notify && reason) game.ui?.showToast(reason);
    return wasHidden;
  }

  onAttack(game) {
    this.breakHidden(game);
    // Prevent re-hiding during the attack animation, not while approaching.
    this.state(game).attackLock = Math.max(0.35, game.player.combat.attackTimer || 0);
  }

  onMove(game, movedDistance, mode) {
    if (mode === "run") this.breakHidden(game);
    this.refresh(game);
  }

  executionContext(game) {
    const player = game.player;
    const state = this.state(game);
    const target = game.combat.target(game);
    if (state.execution) {
      return {
        kind: "execution",
        actionable: false,
        label: state.execution.phase === "windup" ? "AUSSCHALTEN" : "ANSCHLEICHEN",
        hint: state.execution.phase === "windup" ? "NICHT BEWEGEN" : "VERBORGENER ANSATZ",
        ready: false,
      };
    }
    if (!target || target.removed) return null;
    if (!state.hidden) {
      return {
        kind: "execution",
        actionable: false,
        label: "NICHT MÖGLICH",
        hint: player.stance === "sneak" ? "GEDUCKT IN DECKUNG GEHEN" : "SCHLEICHEN AKTIVIEREN",
        ready: false,
      };
    }
    if (player.stance !== "sneak") return { kind: "execution", actionable: false, label: "NICHT MÖGLICH", hint: "SCHLEICHEN AKTIVIEREN", ready: false };
    if (!executionWeapon(player)) {
      return { kind: "execution", actionable: false, label: "MESSER FEHLT", hint: "KÜCHENMESSER AUSWÄHLEN", ready: false };
    }
    if (target.state === "chase" || target.sightMemory?.visible) {
      return { kind: "execution", actionable: false, label: "NICHT MÖGLICH", hint: "ZIEL HAT DICH ENTDECKT", ready: false };
    }
    const d = distance(player, target);
    if (player.stamina < STEALTH_RULES.executionStamina) {
      return { kind: "execution", actionable: false, label: "ERSCHÖPFT", hint: "18 AUSDAUER BENÖTIGT", ready: false };
    }
    if (d > STEALTH_RULES.executionApproachRange) {
      return { kind: "execution", actionable: false, label: "ZU WEIT", hint: "NÄHER AN DAS ZIEL", ready: false };
    }
    const ready = this.isExecutionReady(game, target);
    return {
      kind: "execution",
      actionable: true,
      label: ready ? "AUSSCHALTEN" : "ANSCHLEICHEN",
      hint: ready ? "LAUTLOSER ZUGRIFF" : "AUTOMATISCH HINTER DAS ZIEL",
      ready,
    };
  }

  executionAction(game, command) {
    const target = game.combat.target(game);
    // A displayed AUSSCHALTEN command must never silently turn into a walk
    // because the zombie moved/turned since the last HUD update.
    if ((command?.targetId && command.targetId !== target?.id)
      || (command?.mode === "execute" && !this.isExecutionReady(game, target))) {
      game.combat.end(game, { keepTarget: true }); game.clearNavigation?.();
      this.cancelExecution(game);
      game.ui?.showToast(command.targetId && command.targetId !== target?.id ? "ZIEL GEWECHSELT · ERNEUT AUSWÄHLEN"
        : executionBlockReason(game, target));
      return false;
    }
    const context = this.executionContext(game);
    if (!context?.actionable) {
      game.ui?.showToast(context?.hint || "SCHLEICHEN · MESSER AUSWÄHLEN · ZIEL ANTIPPEN");
      return false;
    }
    return context.ready ? this.beginExecution(game, target) : this.queueExecution(game, target);
  }

  isExecutionReady(game, target) {
    return executionBlockReason(game, target) === null;
  }

  approachCandidates(game, target) {
    const player = game.player, state = this.state(game);
    const clearance = Math.min(.55, distance(player, target));
    const options = { allowDoors: false, preferCover: true,
      segmentAllowed: (a, b) => pointSegmentDistance(target, a, b) >= clearance - .00001 };
    const accepts = point => distance(point, target) >= .55 && behindTarget(point, target)
      && game.world.hasLineOfSight(point, target);
    let path = [];
    if (state.openfieldRemaining > 0) {
      const burden = inventoryWeight(player) / Math.max(1, carryCapacity(player));
      const speed = STANCES.sneak.speed * clamp(1.08 - burden * .16, .72, 1);
      path = pathToPlayerRegion(game.world, player, target, STEALTH_RULES.executionRange, accepts,
        { ...options, maxLength: Math.max(0, state.openfieldRemaining - .1) * speed });
    }
    // Cover preference alone may choose an exposed shortcut. An execution needs
    // usable hide along the whole route, unless the active class perk covers it.
    if (!path.length) path = pathToPlayerRegion(game.world, player, target, STEALTH_RULES.executionRange,
      point => accepts(point) && Boolean(game.world.coverMap.at(point)), { ...options, requireCover: true });
    return path.length ? [{ point: path.at(-1), path, score: playerPathLength(game.player, path) }] : [];
  }

  queueExecution(game, target, replanning = false) {
    if (!target || target.removed) return false;
    const state = this.state(game);
    // Choosing a quiet approach replaces earlier walk/combat orders even when
    // no concealed route is available; never resume an unrelated old order.
    game.combat.end(game, { keepTarget: true });
    game.clearNavigation?.();
    const candidate = this.approachCandidates(game, target)[0];
    if (!candidate) {
      this.cancelExecution(game, "KEIN VERBORGENER WEG HINTER DAS ZIEL");
      return false;
    }
    game.player.navigation.path = candidate.path;
    game.player.navigation.destination = { ...candidate.point };
    game.player.navigation.interactionId = null;
    game.player.navigation.runRequested = false;
    game.player.navigation.guided = false;
    game.player.navigation.source = "execution";
    game.renderer.destination = { ...candidate.point };
    game.renderer.destinationRun = false;
    state.execution = {
      targetId: target.id,
      phase: "approach",
      timer: 0,
      startedAt: replanning ? state.execution?.startedAt ?? (game.elapsed || 0) : (game.elapsed || 0),
      targetPosition: { x: target.x, y: target.y },
      repathAt: (game.elapsed || 0) + .25,
    };
    if (!replanning) game.ui?.showMessage("LAUTLOSER ANSATZ · BLEIB VERBORGEN", 1.6);
    return true;
  }

  beginExecution(game, target) {
    if (!this.isExecutionReady(game, target)) return false;
    const state = this.state(game);
    game.clearNavigation?.();
    state.execution = null;
    const result = game.combat.execute(game, target);
    if (!result.ok) { game.ui?.showToast(result.message); return false; }
    // The target is already dead; this timer is presentation, never a vulnerable windup.
    game.player.combat.attackTimer = STEALTH_RULES.executionWindup;
    state.attackLock = Math.max(state.attackLock, STEALTH_RULES.executionWindup);
    return true;
  }

  update(game, delta) {
    const player = game.player;
    const state = this.state(game);
    state.openfieldRemaining = Math.max(0, state.openfieldRemaining - delta);
    state.openfieldCooldown = Math.max(0, state.openfieldCooldown - delta);
    state.attackLock = Math.max(0, state.attackLock - delta);
    state.departureTime = Math.max(0, state.departureTime - delta);
    this.refresh(game);
    this.updateExecution(game);
  }

  // Also called before automatic movement so a turned/moved target never leaves
  // the player following an obsolete rear position for another whole route.
  updateExecution(game) {
    const player = game.player, state = this.state(game);
    const execution = state.execution;
    if (!execution) return;
    const target = game.zombies.find(zombie => zombie.id === execution.targetId && !zombie.removed);
    if (!target) return this.cancelExecution(game, "ZIEL NICHT MEHR VERFÜGBAR");
    if (game.combat.target(game)?.id !== target.id) return this.cancelExecution(game, "ZIEL GEWECHSELT");
    if (!state.hidden) return this.cancelExecution(game, "TARNUNG VERLOREN · ANSATZ ABGEBROCHEN");
    if (target.state === "chase" || target.sightMemory?.visible) return this.cancelExecution(game, "ZIEL HAT DICH BEMERKT");
    if (execution.phase === "approach") {
      if (this.isExecutionReady(game, target)) {
        this.beginExecution(game, target);
        return;
      }
      if ((game.elapsed || 0) - (execution.startedAt ?? game.elapsed) > 12) {
        return this.cancelExecution(game, "KEIN SICHERER ZUGRIFF · ANSATZ ABGEBROCHEN");
      }
      const navigation = player.navigation, destination = navigation.destination, next = navigation.path[0];
      const stale = !destination || !behindTarget(destination, target)
        || distance(destination, target) > STEALTH_RULES.executionRange
        || !game.world.hasLineOfSight(destination, target)
        || (execution.targetPosition && distance(execution.targetPosition, target) > .3)
        || (next && pointSegmentDistance(target, player, next) < Math.min(.55, distance(player, target)) - .00001);
      if (stale || !navigation.path.length) {
        game.clearNavigation?.();
        if ((game.elapsed || 0) >= execution.repathAt) this.queueExecution(game, target, true);
      }
      return;
    }
    // Complete an old saved windup using the same current readiness contract.
    if (!this.beginExecution(game, target)) this.cancelExecution(game, "ZUGRIFF NICHT MEHR MÖGLICH");
  }

  cancelExecution(game, message, breakCover = false) {
    const state = this.state(game);
    state.execution = null;
    if (game.player.navigation?.source === "execution") game.clearNavigation?.();

    if (message) game.ui?.showToast(message);
  }

  coverStatus(game) {
    const state = this.state(game), cover = this.cover(game);
    return {
      label: state.source === "openfield" ? "FREIFELDTARNUNG" : cover?.label || "KEINE",
      detail: state.source === "openfield" ? `${Math.ceil(state.openfieldRemaining)} S`
        : state.hidden ? "VERBORGEN" : cover ? "DUCKEN ZUM VERBERGEN" : "NORMALE SICHTBARKEIT",
      value: state.hidden ? 1 : cover?.score || 0,
      hidden: state.hidden,
    };
  }

  facePlayer(player, target) {
    const dx = target.x - player.x;
    const dy = target.y - player.y;
    const length = Math.hypot(dx, dy) || 1;
    player.facingX = dx / length;
    player.facingY = dy / length;
  }
}
