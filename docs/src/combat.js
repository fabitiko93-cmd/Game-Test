import { gainSkill, skillValue } from "./character.js";
import { activeWeapon, ammoLabel, consumeShot, itemDefinition, missingWeaponPart, reloadWeapon, weaponFireMode, weaponStats } from "./inventory.js";
import { behindTarget } from "./perception.js";
import { clamp, distance, vibrate } from "./util.js";
import { executionBlockReason, STEALTH_RULES } from "./stealth.js";
import { playerCanSee } from "./player-visibility.js";

export class CombatSystem {
  target(game) {
    return game.zombies.find(zombie => zombie.id === game.player.combat.targetId && !zombie.removed && playerCanSee(game, zombie)) || null;
  }

  selectTarget(game, zombie) {
    if (zombie && !playerCanSee(game, zombie)) return;
    this.stopFiring(game);
    game.player.combat.targetId = zombie?.id || null;
    game.player.combat.waitingForTarget = false;
    game.renderer.selectedId = zombie?.id || null;
    game.player.combat.aim = 0;
  }

  toggle(game) {
    const combat = game.player.combat;
    combat.enabled = !combat.enabled;
    if (combat.enabled && !this.target(game)) {
      const nearby = game.nearestZombie(7);
      if (nearby && game.world.hasLineOfSight(game.player, nearby)) this.selectTarget(game, nearby);
    }
    if (!combat.enabled) this.end(game);
    else {
      combat.hadPursuit = false; combat.waitingForTarget = !this.target(game);
      if (game.player.navigation?.source === "manual") game.clearNavigation?.();
    }
    game.ui.showMessage(combat.enabled ? (this.target(game) ? "Kampfmodus · Ziel erfasst" : "Kampfmodus · Ziel antippen") : "Kampfmodus beendet", 1.5);
    game.sound("equip");
  }

  end(game, { keepTarget = false } = {}) {
    this.stopFiring(game);
    const combat = game.player.combat, targetId = combat.targetId;
    combat.enabled = false;
    combat.pendingTargetId = null; combat.pendingAttack = 0;
    combat.attackTimer = 0; combat.aim = 0;
    combat.hadPursuit = false; combat.waitingForTarget = false;
    if (!keepTarget) {
      combat.targetId = null;
      if (game.renderer.selectedId === targetId) game.renderer.selectedId = null;
    }
    if (game.player.navigation?.source === "combat") game.clearNavigation?.();
  }

  update(game, delta) {
    const player = game.player;
    const combat = player.combat;
    combat.attackCooldown = combat.triggerHeld ? combat.attackCooldown - delta : Math.max(0, combat.attackCooldown - delta);
    combat.attackTimer = Math.max(0, combat.attackTimer - delta);
    combat.recoil = Math.max(0, combat.recoil - delta * (weaponStats(activeWeapon(player))?.recoilRecovery || 1.5));

    const manualMovement = game.player.navigation?.source === "manual"
      && (game.player.navigation.path.length || player.moving || game.player.navigation.manualUntil > game.elapsed);
    if (combat.triggerHeld && (manualMovement || player.moving || game.paused || player.dead || game.ui?.hasBlockingPanel?.()
      || activeWeapon(player)?.id !== combat.triggerWeaponId || combat.targetId !== combat.triggerTargetId)) this.stopFiring(game);
    const pursuit = game.zombies.some(z => !z.removed && (z.state === "chase" || z.sightMemory?.visible));
    if (combat.enabled && pursuit) combat.hadPursuit = true;
    if (combat.enabled && ((!this.target(game) && !combat.waitingForTarget) || (combat.hadPursuit && !pursuit))) this.end(game);
    if (manualMovement) { combat.pendingAttack = 0; combat.pendingTargetId = null; }

    if (combat.pendingAttack > 0) {
      combat.pendingAttack -= delta;
      if (combat.pendingAttack <= 0) this.resolveMelee(game);
    }

    const target = this.target(game);
    if (!combat.enabled || !target || manualMovement || player.stealthState?.execution) {
      this.stopFiring(game);
      combat.aim = Math.max(0, combat.aim - delta * 1.7);
      return;
    }

    const weapon = activeWeapon(player);
    const definition = itemDefinition(weapon);
    const stats = weaponStats(weapon);
    if (!weapon || definition?.weaponKind === "melee") {
      combat.aim = 0;
      const range = stats?.range || 0.88;
      const d = distance(player, target);
      if (d > range + 0.1) game.approachCombatTarget(target, range);
      if (d <= range + 0.12 && combat.attackCooldown <= 0 && combat.pendingAttack <= 0) {
        this.beginMelee(game, target, weapon, stats);
      }
      return;
    }

    const d = distance(player, target);
    const clear = d <= stats.range && game.world.hasLineOfSight(player, target);
    if (clear && !player.moving) {
      const skill = skillValue(player, "firearms");
      const aimTime = Math.max(0.35, stats.aimTime * (1 - skill * 0.0042));
      combat.aim = clamp(combat.aim + delta / aimTime, 0, 1);
      this.facePlayer(player, target);
    } else {
      combat.aim = Math.max(0, combat.aim - delta * (player.moving ? 2.8 : 1.1));
    }
    if (combat.triggerHeld && combat.attackCooldown <= .000001) {
      const result = this.fire(game);
      if (!result.ok) { this.stopFiring(game); game.ui?.showToast?.(result.message); }
    }
  }

  beginFiring(game) {
    this.stopFiring(game);
    const weapon = activeWeapon(game.player), target = this.target(game);
    const result = this.fire(game);
    if (result.ok && weaponFireMode(weapon) === "auto" && !target.removed && game.player.combat.enabled) {
      Object.assign(game.player.combat, { triggerHeld: true, triggerWeaponId: weapon.id, triggerTargetId: target.id });
    }
    return result;
  }

  stopFiring(game) {
    Object.assign(game.player.combat, { triggerHeld: false, triggerWeaponId: null, triggerTargetId: null });
    game.player.combat.attackCooldown = Math.max(0, game.player.combat.attackCooldown || 0);
  }

  beginMelee(game, target, weapon, stats) {
    const combat = game.player.combat;
    combat.attackCooldown = stats?.cooldown || 1.2;
    combat.attackTimer = 0.32;
    combat.pendingAttack = 0.14;
    combat.pendingTargetId = target.id;
    game.world.emitNoise(game.player.x, game.player.y, stats?.noise || 2.7, "melee", 2.4);
    game.player.noisePulse = Math.max(game.player.noisePulse, Math.min(1, (stats?.noise || 2.7) / 8));
    game.sound("swing");
    vibrate(10);
  }

  resolveMelee(game) {
    const player = game.player;
    const combat = player.combat;
    const target = game.zombies.find(zombie => zombie.id === combat.pendingTargetId && !zombie.removed);
    combat.pendingTargetId = null;
    if (!target) return;
    const weapon = activeWeapon(player);
    const definition = itemDefinition(weapon);
    const stats = weaponStats(weapon);
    const range = stats?.range || 0.88;
    if (distance(player, target) > range + 0.28 || !game.world.hasLineOfSight(player, target)) return;
    game.stealth?.onAttack(game);

    this.facePlayer(player, target);
    const skill = skillValue(player, definition?.skill || "blunt");
    const stealthStrike = target.state !== "chase" && behindTarget(player, target);
    const staminaPenalty = player.stamina < 25 ? 0.14 : 0;
    const painPenalty = player.pain * 0.0012;
    const chance = clamp((stats?.accuracy || 0.74) + skill * 0.0018 - staminaPenalty - painPenalty + (stealthStrike ? 0.12 : 0), 0.38, 0.97);
    if (game.random() > chance) {
      game.ui.showMessage("Verfehlt", 0.7);
      gainSkill(player, definition?.skill || "blunt", 0.08);
      return;
    }
    const variance = 0.88 + game.random() * 0.22;
    const damage = (stats?.damage || 10) * variance * (1 + skill * 0.0025) * (stealthStrike ? 1.65 : 1);
    this.damageZombie(game, target, damage, stealthStrike ? "HINTERHALT" : null);
    player.stamina = Math.max(0, player.stamina - (definition?.hands === 2 ? 6.5 : 3.5));
    gainSkill(player, definition?.skill || "blunt", stealthStrike ? 0.7 : 0.42);
    if (weapon) weapon.condition = Math.max(0, (weapon.condition ?? 100) - 0.07);
  }

  execute(game, target) {
    const player = game.player;
    const weapon = activeWeapon(player);
    const definition = itemDefinition(weapon);
    const stats = weaponStats(weapon);
    if (!target || target.removed || !weapon || !definition?.execution || !stats) return { ok: false, message: "KEIN AUSFÜHRUNGSWERKZEUG" };
    const blocked = executionBlockReason(game, target);
    if (blocked) return { ok: false, message: blocked };
    this.end(game, { keepTarget: true });
    game.stealth?.onAttack(game);
    player.stamina = Math.max(0, player.stamina - STEALTH_RULES.executionStamina);
    const skill = skillValue(player, definition.skill || "blades");
    const damage = Math.max(target.hp + 1, stats.damage * (2.6 + skill * 0.012));
    this.facePlayer(player, target);
    this.damageZombie(game, target, damage, null, { silent: true, execution: true });
    gainSkill(player, definition.skill || "blades", 1.1);
    gainSkill(player, "stealth", 0.85);
    if (weapon) weapon.condition = Math.max(0, (weapon.condition ?? 100) - 0.18);
    game.ui?.showMessage("LAUTLOS AUSGESCHALTET", 1.1);
    game.sound("execution");
    vibrate(16);
    return { ok: true, message: "LAUTLOS AUSGESCHALTET" };
  }

  fire(game) {
    const player = game.player;
    const combat = player.combat;
    const target = this.target(game);
    const weapon = activeWeapon(player);
    const definition = itemDefinition(weapon);
    const stats = weaponStats(weapon);
    if (!combat.enabled || !target || definition?.weaponKind !== "firearm") {
      return { ok: false, message: "KEIN SCHUSSZIEL" };
    }
    if (combat.attackCooldown > .000001) return { ok: false, message: "WAFFE NOCH NICHT STABIL" };
    const d = distance(player, target);
    if (d > stats.range || !game.world.hasLineOfSight(player, target)) return { ok: false, message: "KEINE FREIE SCHUSSLINIE" };
    const missing = missingWeaponPart(weapon);
    if (missing) return { ok: false, message: `${missing} FEHLT` };
    if (!consumeShot(weapon)) return { ok: false, message: definition.feed === "magazine" && !weapon.magazine ? "KEIN MAGAZIN EINGESETZT" : "WAFFE LEER · NACHLADEN" };
    game.stealth?.onAttack(game);

    this.facePlayer(player, target);
    const skill = skillValue(player, "firearms");
    const distancePenalty = Math.max(0, d - stats.range * 0.45) / stats.range * 0.32;
    const closePenalty = stats.closePenalty && d < 3 ? stats.closePenalty * (1 - d / 3) : 0;
    const painPenalty = player.pain * 0.0014;
    const hitChance = clamp(
      stats.accuracy * (0.38 + combat.aim * 0.62) * (0.72 + (weapon.condition ?? 100) * 0.0028)
        + skill * 0.0018 - distancePenalty - closePenalty - painPenalty - (stats.recoilPerShot ? combat.recoil * .18 : 0),
      0.12,
      0.98,
    );
    const hit = game.random() <= hitChance;
    const endPoint = hit ? target : {
      x: target.x + (game.random() - 0.5) * (2.2 - combat.aim),
      y: target.y + (game.random() - 0.5) * (2.2 - combat.aim),
    };
    game.renderer.trace(player, endPoint, hit);
    game.world.emitNoise(player.x, player.y, stats.noise, "gunshot", 5.2, 1.3);
    game.attractMigration(Math.min(18, stats.noise * 0.42));
    player.noisePulse = 1;
    player.shots += 1;
    game.sound(stats.shotSound || "gunshot");
    vibrate(stats.shotSound === 'magnum' ? [36, 16, 24] : weapon.type === "shotgun_12g" ? [28, 18, 24] : 22);

    if (hit) {
      const impact = { x: target.x, y: target.y };
      const headshotChance = clamp(stats.headshot + combat.aim * 0.4 + skill * 0.0015, 0.08, 0.82);
      const headshot = game.random() < headshotChance;
      const baseDamage = stats.damage * (0.9 + game.random() * 0.2);
      const damage = baseDamage * (headshot ? 2.25 : 1);
      this.damageZombie(game, target, damage, headshot ? "KOPFTREFFER" : null);
      gainSkill(player, "firearms", headshot ? 0.68 : 0.46);
      if (definition.spread) this.shotgunSplash(game, target, stats, damage);
      if (stats.penetration) this.penetrate(game, target.id, impact, stats, baseDamage);
    } else {
      game.ui.showMessage("Schuss verfehlt", 0.8);
      gainSkill(player, "firearms", 0.16);
    }
    combat.attackCooldown = stats.fireInterval ? stats.fireInterval + Math.min(0, combat.attackCooldown) : stats.recovery;
    combat.recoil = stats.recoilPerShot ? Math.min(1.5, combat.recoil + stats.recoilPerShot) : 1;
    combat.aim = Math.max(0.04, combat.aim * (stats.aimRetention || .18));
    return { ok: true, message: `${ammoLabel(weapon)} · ${Math.round(hitChance * 100)} %` };
  }

  penetrate(game, primaryId, impact, stats, damage) {
    const player = game.player, dx = impact.x - player.x, dy = impact.y - player.y, length = Math.hypot(dx, dy);
    if (!length) return;
    const candidates = game.zombies.filter(zombie => {
      if (zombie.removed || zombie.id === primaryId) return false;
      const x = zombie.x - player.x, y = zombie.y - player.y;
      const along = (x * dx + y * dy) / length, across = Math.abs(x * dy - y * dx) / length;
      return along > length + .05 && along <= stats.range && across <= .16 && game.world.hasLineOfSight(player, zombie);
    }).sort((a, b) => distance(player, a) - distance(player, b));
    for (const zombie of candidates.slice(0, stats.penetration)) {
      game.renderer.trace(impact, zombie, true);
      this.damageZombie(game, zombie, damage * stats.penetrationDamage, "DURCHSCHUSS");
    }
  }

  shotgunSplash(game, primary, stats, primaryDamage) {
    const spread = stats.spread || 1;
    for (const zombie of game.zombies) {
      if (zombie.removed || zombie.id === primary.id) continue;
      const separation = distance(zombie, primary);
      const fromPlayer = distance(zombie, game.player);
      if (separation > spread || fromPlayer > stats.range || !game.world.hasLineOfSight(game.player, zombie)) continue;
      this.damageZombie(game, zombie, primaryDamage * clamp(0.5 - separation * 0.16, 0.18, 0.46), null);
    }
  }

  reload(game, weapon = activeWeapon(game.player)) {
    this.stopFiring(game);
    const stats = weaponStats(weapon);
    const result = reloadWeapon(game.player, weapon);
    if (result.ok) {
      game.player.combat.aim = 0;
      game.player.combat.attackCooldown = 0.55 * (stats?.reload || 1);
      game.world.emitNoise(game.player.x, game.player.y, 1.2, "reload", 1.5, 0.45);
      game.sound("reload");
    }
    return result;
  }

  damageZombie(game, target, damage, callout, options = {}) {
    target.hp -= damage;
    target.hurtFlash = options.silent ? 0 : 0.16;
    if (!options.silent) {
      target.coverSearch = null;
      target.sightMemory = { ...target.sightMemory, visible: true, recognition: 0 };
      target.state = "chase";
      target.awareness = 1;
      target.stimulus = "vision";
      target.stateTimer = 1.1;
      target.lastSeen = { x: game.player.x, y: game.player.y };
      target.target = { ...target.lastSeen };
      target.path = [];
      target.repathTimer = 0;
    }
    const dx = target.x - game.player.x;
    const dy = target.y - game.player.y;
    const length = Math.hypot(dx, dy) || 1;
    target.impactX = dx / length;
    target.impactY = dy / length;
    target.hitKick = options.silent ? 0 : 1;
    if (!options.silent) {
      target.x += dx / length * 0.12;
      target.y += dy / length * 0.12;
    }
    game.renderer.burst(target.x, target.y, "#832d29", options.silent ? 4 : 8);
    game.world.blood.push({
      x: target.x + (game.random() - 0.5) * 0.2,
      y: target.y + (game.random() - 0.5) * 0.2,
      size: 0.4 + game.random() * 0.45,
      rotation: game.random() * Math.PI,
      life: 1,
    });
    if (!options.silent) game.sound("hit");
    if (callout) game.ui.showMessage(callout, 0.9);
    if (target.hp <= 0) game.killZombie(target, { silent: Boolean(options.silent) });
  }

  facePlayer(player, target) {
    const dx = target.x - player.x;
    const dy = target.y - player.y;
    const length = Math.hypot(dx, dy) || 1;
    player.facingX = dx / length;
    player.facingY = dy / length;
  }
}
