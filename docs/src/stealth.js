import { gainSkill } from "./character.js?v=12";
import { activeWeapon, itemDefinition } from "./inventory.js?v=12";
import { behindTarget } from "./perception.js?v=12";
import { clamp, distance, vibrate } from "./util.js?v=12";

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
        ready: true,
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

  executionAction(game) {
    const context = this.executionContext(game);
    if (!context?.actionable) {
      if (context?.hint) game.ui?.showToast(context.hint);
      return false;
    }
    const target = game.combat.target(game);
    return context.ready ? this.beginExecution(game, target) : this.queueExecution(game, target);
  }

  isExecutionReady(game, target) {
    const player = game.player;
    const state = this.state(game);
    return Boolean(target
      && !target.removed
      && state.hidden
      && player.stance === "sneak"
      && executionWeapon(player)
      && player.stamina >= STEALTH_RULES.executionStamina
      && target.state !== "chase"
      && !target.sightMemory?.visible
      && distance(player, target) <= STEALTH_RULES.executionRange
      && behindTarget(player, target)
      && game.world.hasLineOfSight(player, target));
  }

  approachCandidates(game, target) {
    const player = game.player;
    const candidates = [];
    const centerX = Math.round(target.x);
    const centerY = Math.round(target.y);
    for (let y = centerY - 2; y <= centerY + 2; y++) {
      for (let x = centerX - 2; x <= centerX + 2; x++) {
        const point = { x, y };
        const targetDistance = distance(point, target);
        if (targetDistance < 0.55 || targetDistance > STEALTH_RULES.executionRange) continue;
        if (!behindTarget(point, target) || !game.world.isPathCellWalkable(x, y, { allowDoors: false })) continue;
        if (!game.world.hasLineOfSight(point, target)) continue;
        const path = game.navigator.findPath(game.world, player, point, { allowDoors: false, maxNodes: 1800 });
        const sameCell = Math.round(player.x) === x && Math.round(player.y) === y;
        if (!path.length && !sameCell) continue;
        candidates.push({ point, path, score: path.length + targetDistance * 0.15 });
      }
    }
    return candidates.sort((a, b) => a.score - b.score);
  }

  queueExecution(game, target, replanning = false) {
    if (!target || target.removed) return false;
    const state = this.state(game);
    const candidate = this.approachCandidates(game, target)[0];
    if (!candidate) {
      if (!replanning) game.ui?.showToast("KEIN LEISER WEG HINTER DAS ZIEL");
      state.execution = null;
      return false;
    }
    game.clearNavigation?.();
    game.player.navigation.path = candidate.path;
    game.player.navigation.destination = { ...candidate.point };
    game.player.navigation.interactionId = null;
    game.player.navigation.runRequested = false;
    game.player.navigation.guided = false;
    game.player.navigation.source = "execution";
    game.player.combat.enabled = false;
    game.renderer.destination = { ...candidate.point };
    game.renderer.destinationRun = false;
    state.execution = {
      targetId: target.id,
      phase: "approach",
      timer: 0,
      repathAt: (game.elapsed || 0) + 0.65,
    };
    if (!replanning) game.ui?.showMessage("LAUTLOSER ANSATZ · BLEIB VERBORGEN", 1.6);
    return true;
  }

  beginExecution(game, target) {
    if (!this.isExecutionReady(game, target)) return false;
    const state = this.state(game);
    game.clearNavigation?.();
    state.execution = {
      targetId: target.id,
      phase: "windup",
      timer: STEALTH_RULES.executionWindup,
      repathAt: 0,
    };
    game.player.combat.enabled = false;
    game.player.combat.attackTimer = STEALTH_RULES.executionWindup;
    this.facePlayer(game.player, target);
    game.ui?.showMessage("LAUTLOSER ZUGRIFF", 0.7);
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
    const execution = state.execution;
    if (!execution) return;
    const target = game.zombies.find(zombie => zombie.id === execution.targetId && !zombie.removed);
    if (!target || !state.hidden || target.state === "chase" || target.sightMemory?.visible) {
      this.cancelExecution(game, "ZIEL HAT DICH BEMERKT", true);
      return;
    }
    if (execution.phase === "approach") {
      if (this.isExecutionReady(game, target)) {
        this.beginExecution(game, target);
        return;
      }
      if (!player.navigation.path.length && (game.elapsed || 0) >= execution.repathAt) {
        if (!this.queueExecution(game, target, true)) this.cancelExecution(game, "POSITION VERLOREN", false);
      }
      return;
    }
    this.facePlayer(player, target);
    execution.timer -= delta;
    if (distance(player, target) > STEALTH_RULES.executionRange + 0.14 || !behindTarget(player, target) || !game.world.hasLineOfSight(player, target)) {
      this.cancelExecution(game, "ZIEL HAT SICH GEDREHT", true);
      return;
    }
    if (execution.timer > 0) return;
    state.execution = null;
    game.combat.execute(game, target);
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
