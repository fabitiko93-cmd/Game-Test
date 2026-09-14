import { gainSkill, skillValue } from "./character.js?v=8";
import { activeWeapon, itemDefinition } from "./inventory.js?v=8";
import { behindTarget } from "./perception.js?v=8";
import { clamp, distance, vibrate } from "./util.js?v=8";

export const STEALTH_RULES = Object.freeze({
  minimumCover: 0.42,
  baseHiddenSteps: 3.4,
  hiddenStepsPerSkill: 0.065,
  rehideCooldown: 1.8,
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
  state.reserve ??= 0;
  state.maxReserve ??= 0;
  state.moved ??= 0;
  state.cooldown ??= 0;
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
    return game.world.coverAt(game.player);
  }

  hiddenNoiseMultiplier(player) {
    return ensureStealthState(player).hidden ? 0.5 : 1;
  }

  hideContext(game) {
    const player = game.player;
    const state = this.state(game);
    const cover = this.cover(game);
    if (state.hidden) {
      return {
        kind: "hidden",
        actionable: false,
        label: "VERBORGEN",
        hint: `${state.coverLabel || "DECKUNG"} · ${Math.max(0, Math.ceil(state.reserve))} SCHRITTE`,
        cover,
      };
    }
    if (player.stance !== "sneak" || cover.score < STEALTH_RULES.minimumCover) return null;
    if (state.cooldown > 0) {
      return { kind: "hide", actionable: false, label: "WARTEN", hint: "DECKUNG NEU FINDEN", cover };
    }
    const closePursuer = game.zombies.some(zombie => !zombie.removed
      && zombie.state === "chase"
      && distance(zombie, player) < 8.5);
    if (closePursuer) {
      return { kind: "hide", actionable: false, label: "BEOBACHTET", hint: "SICHTKONTAKT ABBRECHEN", cover };
    }
    return { kind: "hide", actionable: true, label: "VERBERGEN", hint: `AKTION DRÜCKEN · ${cover.label}`, cover };
  }

  action(game) {
    const state = this.state(game);
    if (state.execution) {
      game.ui?.showToast(state.execution.phase === "windup" ? "NICHT BEWEGEN" : "ANSCHLEICHEN LÄUFT");
      return true;
    }
    if (state.hidden) {
      this.breakHidden(game, "DECKUNG VERLASSEN", true);
      return true;
    }
    const execution = this.executionContext(game);
    if (execution) {
      this.executionAction(game);
      return true;
    }
    const hide = this.hideContext(game);
    if (hide) {
      this.beginHide(game);
      return true;
    }
    return false;
  }

  beginHide(game) {
    const context = this.hideContext(game);
    if (!context?.actionable) {
      game.ui?.showToast(context?.hint || "HIER FEHLT DECKUNG");
      return false;
    }
    const player = game.player;
    const state = this.state(game);
    const skill = skillValue(player, "stealth");
    state.hidden = true;
    state.coverId = context.cover.sourceId;
    state.coverLabel = context.cover.label;
    state.maxReserve = STEALTH_RULES.baseHiddenSteps + skill * STEALTH_RULES.hiddenStepsPerSkill;
    state.reserve = state.maxReserve;
    state.moved = 0;
    state.cooldown = 0;
    state.execution = null;
    player.combat.enabled = false;
    player.navigation.runRequested = false;
    gainSkill(player, "stealth", 0.2);
    game.ui?.showMessage(`VERBORGEN · ${context.cover.label} · ZIEL ANTIPPEN · † AUSSCHALTEN`, 2.1);
    game.sound?.("hide");
    vibrate(8);
    return true;
  }

  breakHidden(game, reason = "", notify = false) {
    const state = this.state(game);
    const wasHidden = state.hidden;
    state.hidden = false;
    state.coverId = null;
    state.coverLabel = null;
    state.reserve = 0;
    state.maxReserve = 0;
    state.moved = 0;
    state.cooldown = Math.max(state.cooldown, STEALTH_RULES.rehideCooldown);
    state.execution = null;
    if (game.player.navigation?.source === "execution") game.clearNavigation?.();
    if (wasHidden && notify && reason) game.ui?.showToast(reason);
    return wasHidden;
  }

  onMove(game, movedDistance, mode) {
    const state = this.state(game);
    if (!(movedDistance > 0)) return;
    if (mode === "run") {
      this.breakHidden(game, "RENNEN HEBT DECKUNG AUF", true);
      return;
    }
    if (!state.hidden) return;
    const cost = movedDistance * (mode === "sneak" ? 1 : 2.2);
    state.moved += movedDistance;
    state.reserve = Math.max(0, state.reserve - cost);
    if (state.reserve <= 0) this.breakHidden(game, "ZU WEIT AUS DER DECKUNG", true);
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
        hint: player.stance === "sneak" ? "DECKUNG SUCHEN · VERBERGEN" : "SCHLEICHEN AKTIVIEREN",
        ready: false,
      };
    }
    if (player.stance !== "sneak") return { kind: "execution", actionable: false, label: "NICHT MÖGLICH", hint: "SCHLEICHEN AKTIVIEREN", ready: false };
    if (!executionWeapon(player)) {
      return { kind: "execution", actionable: false, label: "MESSER FEHLT", hint: "KÜCHENMESSER AUSWÄHLEN", ready: false };
    }
    if (target.state === "chase" || (target.awareness || 0) >= 0.72) {
      return { kind: "execution", actionable: false, label: "NICHT MÖGLICH", hint: "ZIEL IST AUF DER SUCHE", ready: false };
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
      && (target.awareness || 0) < 0.72
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
    if (!candidate || candidate.path.length > state.reserve + 1) {
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
    state.cooldown = Math.max(0, state.cooldown - delta);
    if (state.hidden && player.stance !== "sneak") this.breakHidden(game, "DECKUNG VERLASSEN", true);
    const execution = state.execution;
    if (!execution) return;
    const target = game.zombies.find(zombie => zombie.id === execution.targetId && !zombie.removed);
    if (!target || !state.hidden || target.state === "chase" || (target.awareness || 0) >= 0.82) {
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
    if (distance(player, target) > STEALTH_RULES.executionRange + 0.14 || !behindTarget(player, target)) {
      this.cancelExecution(game, "ZIEL HAT SICH GEDREHT", true);
      return;
    }
    if (execution.timer > 0) return;
    state.execution = null;
    game.combat.execute(game, target);
    this.breakHidden(game);
  }

  cancelExecution(game, message, breakCover = false) {
    const state = this.state(game);
    state.execution = null;
    if (game.player.navigation?.source === "execution") game.clearNavigation?.();
    if (breakCover) this.breakHidden(game);
    if (message) game.ui?.showToast(message);
  }

  coverStatus(game) {
    const state = this.state(game);
    if (state.hidden) {
      return {
        label: "VERBORGEN",
        detail: `${Math.max(0, Math.ceil(state.reserve))} SCHRITTE`,
        value: state.maxReserve > 0 ? clamp(state.reserve / state.maxReserve, 0, 1) : 0,
        hidden: true,
      };
    }
    const cover = this.cover(game);
    return {
      label: cover.score >= STEALTH_RULES.minimumCover ? cover.label : "KEINE",
      detail: cover.score >= STEALTH_RULES.minimumCover ? "VERBERGEN MÖGLICH" : "UNGESCHÜTZT",
      value: clamp(cover.score, 0, 1),
      hidden: false,
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
