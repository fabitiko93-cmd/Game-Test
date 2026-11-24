import {projectilePath,shotgunPath} from './projectile-path.js';
import { gainSkill, skillValue } from "./character.js";
import { activeWeapon, ammoLabel, consumeShot, itemDefinition, missingWeaponPart, weaponFireMode, weaponStats } from "./inventory.js";
import {beginReload,cancelReload,updateReload} from './weapon-reload.js';
import {kickWeapon} from './weapon-recoil.js';
import { behindTarget } from "./perception.js";
import { clamp, distance, vibrate } from "./util.js";
import { executionBlockReason, STEALTH_RULES } from "./stealth.js";
import { playerCanSee } from "./player-visibility.js";
import { CONTACT_EPSILON, RETREAT_DISTANCE, RETREAT_SKILL, inStrikeArc, meleeAttack, meleeTiming } from './melee-attacks.js';

function cancelMelee(combat) {
  combat.retreat = null;
  combat.attackTimer = 0;
  if (combat.meleeAttack) {
    combat.meleeAttack.cancelled = true;
    combat.meleeAttack.retreatQueued = false;
  }
}

const meleeSkill = definition => definition?.skill || "blunt";

export class CombatSystem {
  target(game) {
    return game.zombies.find(zombie => zombie.id === game.player.combat.targetId && !zombie.removed && playerCanSee(game, zombie)) || null;
  }

  selectTarget(game, zombie) {
    if (zombie && !playerCanSee(game, zombie)) return;
    this.stopFiring(game);
    if (game.player.combat.targetId !== zombie?.id) cancelMelee(game.player.combat);
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
    if(game.player.dead||game.dead)cancelReload(game);
    const combat = game.player.combat, targetId = combat.targetId;
    combat.enabled = false;
    cancelMelee(combat);
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
    if(combat.shotImpulse)combat.shotImpulse.age+=delta;
    if(updateReload(game,delta)){this.stopFiring(game);combat.aim=0;return;}

    const manualMovement = game.player.navigation?.source === "manual"
      && (game.player.navigation.path.length || player.moving || game.player.navigation.manualUntil > game.elapsed);
    if (combat.triggerHeld && (manualMovement || player.moving || game.paused || player.dead || game.ui?.hasBlockingPanel?.()
      || activeWeapon(player)?.id !== combat.triggerWeaponId || combat.targetId !== combat.triggerTargetId)) this.stopFiring(game);
    const pursuit = game.zombies.some(z => !z.removed && (z.state === "chase" || z.sightMemory?.visible));
    if (combat.enabled && pursuit) combat.hadPursuit = true;
    if (combat.enabled && ((!this.target(game) && !combat.waitingForTarget) || (combat.hadPursuit && !pursuit))) this.end(game);
    const attack = this.activeMelee(game);
    const committed = attack || (combat.retreat && combat.meleeAttack);
    const interrupted = player.dead || game.dead || game.paused || game.ui?.hasBlockingPanel?.()
      || !combat.enabled || (committed && (committed.weaponId !== (activeWeapon(player)?.id ?? null)
        || committed.targetId !== combat.targetId || (player.running && !committed.direction)));
    if (interrupted) {
      cancelMelee(combat);
    } else if (attack) {
      this.advanceMelee(game, attack);
    }

    const target = this.target(game);
    if (!combat.enabled || !target || manualMovement || game.paused || player.dead || game.dead || game.ui?.hasBlockingPanel?.() || player.stealthState?.execution) {
      this.stopFiring(game);
      combat.aim = Math.max(0, combat.aim - delta * 1.7);
      return;
    }

    const weapon = activeWeapon(player);
    const definition = itemDefinition(weapon);
    const stats = weaponStats(weapon);
    if (definition?.weaponKind !== "firearm") {
      combat.aim = 0;
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

  cancelMeleeAttack(game) {
    cancelMelee(game.player.combat);
  }

  meleeContext(game, target = this.target(game)) {
    if (!game.player.combat.enabled || !target) return null;
    const weapon = activeWeapon(game.player);
    const definition = itemDefinition(weapon);
    if (weapon && definition?.weaponKind !== "melee") return null;
    return { target, weapon, definition, stats: weaponStats(weapon) };
  }

  activeMelee(game) {
    const attack = game.player.combat.meleeAttack;
    return attack && !attack.cancelled && attack.elapsed < attack.duration ? attack : null;
  }

  nextMeleeEventAt(game) {
    const attack = this.activeMelee(game);
    if (!attack) return Infinity;
    const offset = !attack.direction ? attack.lockAt
      : attack.contacts[attack.nextContact] ?? (attack.elapsed < attack.releaseAt ? attack.releaseAt : attack.duration);
    return attack.startedAt + offset;
  }

  strike(game, context) {
    const { player } = game;
    if (player.combat.attackCooldown > CONTACT_EPSILON) return { ok: false, message: "NOCH IN ERHOLUNG" };
    if (player.running) return { ok: false, message: "ZUM SCHLAGEN GEHEN ODER STEHEN" };
    return this.beginMelee(game, context.target, context.weapon, context.stats);
  }

  beginMelee(game, target, weapon, stats) {
    const { player } = game, { combat } = player;
    const definition = itemDefinition(weapon);
    const cost = definition?.staminaCost ?? (definition?.hands === 2 ? 6.5 : 3.5);
    if (player.stamina < cost) return { ok: false, message: "ZU WENIG AUSDAUER" };
    const previous = combat.meleeAttack, weaponId = weapon?.id ?? null;
    const variant = previous?.weaponId === weaponId ? previous.variant + 1 : 1;
    const duration = stats?.cooldown ?? 1.2;
    const profile = meleeAttack(weapon?.type ?? 'unarmed', variant)
      || { clip: 'Sword_Slash', contact: .14 / duration };
    const timing = meleeTiming(profile, duration, skillValue(player, meleeSkill(definition)));
    combat.retreat = null;
    combat.attackCooldown = duration;
    combat.attackTimer = timing.contacts.at(-1) + .12;
    this.facePlayer(player, target);
    combat.meleeAttack = {
      ...timing,
      sequence: (previous?.sequence ?? 0) + 1, variant, weaponId, targetId: target.id,
      clip: profile.clip, interrupts: profile.interrupts === true,
      startedAt: game.elapsed ?? 0, elapsed: 0, nextContact: 0,
      direction: timing.lockAt > 0 ? null : { x: player.facingX, y: player.facingY },
      retreatQueued: false, cancelled: false,
    };
    player.stamina -= cost;
    game.world.emitNoise(player.x, player.y, stats?.noise || 2.7, "melee", 2.4);
    player.noisePulse = Math.max(player.noisePulse, Math.min(1, (stats?.noise || 2.7) / 8));
    game.sound("swing");
    vibrate(10);
    return { ok: true };
  }

  advanceMelee(game, attack) {
    const player = game.player;
    const target = this.target(game);
    if (!target) return;
    attack.elapsed = clamp(game.elapsed - attack.startedAt, 0, attack.duration);
    if (!attack.direction) {
      this.facePlayer(player, target);
      if (attack.elapsed + CONTACT_EPSILON >= attack.lockAt) {
        attack.direction = { x: player.facingX, y: player.facingY };
      }
    }
    while (!attack.cancelled && attack.contacts[attack.nextContact] <= attack.elapsed + CONTACT_EPSILON) {
      attack.nextContact++;
      this.resolveMelee(game, target, attack);
    }
    if (!attack.cancelled && attack.retreatQueued && attack.elapsed + CONTACT_EPSILON >= attack.releaseAt) {
      attack.retreatQueued = false;
      const dx = player.x - target.x, dy = player.y - target.y;
      const length = Math.hypot(dx, dy);
      if (length <= CONTACT_EPSILON) return;
      game.clearNavigation();
      game.renderer.destination = null;
      player.combat.retreat = { x: dx / length, y: dy / length, remaining: RETREAT_DISTANCE };
    }
    if (attack.elapsed + CONTACT_EPSILON >= attack.duration) attack.elapsed = attack.duration;
  }

  canRetreat(game, context = this.meleeContext(game)) {
    return !!context && skillValue(game.player, meleeSkill(context.definition)) >= RETREAT_SKILL;
  }

  queueRetreat(game) {
    if (!this.canRetreat(game)) return { ok: false, message: "RÜCKSCHRITT AB KAMPFSKILL 30" };
    const attack = this.activeMelee(game);
    if (!attack || attack.elapsed >= attack.releaseAt) return { ok: false, message: "RÜCKSCHRITT WÄHREND DES HIEBS WÄHLEN" };
    attack.retreatQueued = true;
    return { ok: true };
  }

  cancelRetreat(game) {
    const { combat } = game.player;
    combat.retreat = null;
    if (combat.meleeAttack) combat.meleeAttack.retreatQueued = false;
  }

  resolveMelee(game, target, attack) {
    const player = game.player;
    const weapon = activeWeapon(player);
    const definition = itemDefinition(weapon);
    const stats = weaponStats(weapon);
    if (!inStrikeArc(player, target, attack.direction, stats?.range ?? .88, .5)
        || !game.world.hasLineOfSight(player, target)) {
      game.ui.showMessage("HIEB GEHT INS LEERE", .7);
      return;
    }
    const stealthStrike = target.state !== "chase" && behindTarget(player, target);
    const strikeShare = 1 / attack.contacts.length;
    game.stealth?.onAttack(game);
    if (attack.interrupts) game.zombieSystem?.interruptAttack(target);
    const damage = (stats?.damage ?? 10) * strikeShare * (stealthStrike ? 1.65 : 1);
    this.damageZombie(game, target, damage, stealthStrike ? "HINTERHALT" : null);
    gainSkill(player, meleeSkill(definition), (stealthStrike ? 2.8 : 2.4) * strikeShare);
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
    if(combat.reload?.kind==='tube'&&weapon?.rounds>0){cancelReload(game);combat.attackCooldown=0;}
    if(combat.reload)return {ok:false,message:'WAFFE WIRD NACHGELADEN'};
    if(player.running)return {ok:false,message:'IM SPRINT KEIN SCHUSS'};
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
    const path=stats.shotgun?shotgunPath(game,endPoint,stats):projectilePath(game,endPoint,stats);
    if(game.renderer.firearmShot)game.renderer.firearmShot(game,weapon,path.end,path.hits.length>0,path.pelletPaths);
    else game.renderer.trace(player,path.end,path.hits.length>0);
    game.world.emitNoise(player.x, player.y, stats.noise, "gunshot", 5.2, 1.3);
    game.attractMigration(Math.min(18, stats.noise * 0.42));
    player.noisePulse = 1;
    player.shots += 1;
    game.sound(stats.shotSound || "gunshot");
    vibrate(stats.shotSound === 'magnum' ? [36, 16, 24] : 22);

    if(path.hits.length){
      const headshotChance=clamp(stats.headshot+combat.aim*.4+skill*.0015,.08,.82);
      const headshot=!stats.shotgun&&game.random()<headshotChance,baseDamage=stats.damage*(.9+game.random()*.2);
      for(let i=0;i<path.hits.length;i++){
        const contact=path.hits[i];
        this.damageZombie(game,contact.zombie,baseDamage*contact.attenuation*(i===0&&headshot?2.25:1),i>0?(stats.shotgun?'STREUTREFFER':'DURCHSCHUSS'):headshot?'KOPFTREFFER':null);
      }
      gainSkill(player,"firearms",headshot?.68:.46);
    }else{
      game.ui.showMessage("Schuss verfehlt",.8);gainSkill(player,"firearms",.16);
    }
    combat.attackCooldown = stats.fireInterval ? stats.fireInterval + Math.min(0, combat.attackCooldown) : stats.recovery;
    combat.recoil = stats.recoilPerShot ? Math.min(1.5, combat.recoil + stats.recoilPerShot) : 1;
    kickWeapon(player,weapon);
    combat.aim = Math.max(0.04, combat.aim * (stats.aimRetention || .18));
    return { ok: true, message: `${ammoLabel(weapon)} · ${Math.round(hitChance * 100)} %` };
  }

  reload(game, weapon = activeWeapon(game.player), magazineId = null) {
    this.stopFiring(game);
    return beginReload(game,weapon,magazineId);
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
