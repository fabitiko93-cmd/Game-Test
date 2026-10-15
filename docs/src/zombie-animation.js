import { ZOMBIE_ATTACK } from "./ai.js";

export const ZOMBIE_ANIMATION = Object.freeze({
  variants: 10, directions: 8, attackDuration: 1.4,
  // Fractions of the authored clip speed, never multiplied by travel speed.
  gaitRate: Object.freeze({ idle: .5, search: .65, investigate: .75, chase: .8 }),
});
const TAU = Math.PI * 2;
const wrap = angle => Math.atan2(Math.sin(angle), Math.cos(angle));
const modulo = (value, count) => ((value % count) + count) % count;

export function zombieVariant(zombie) {
  // Existing Save-v4 initial zombies used only variants 0..4. Their stable IDs
  // now distribute all ten appearances without changing or resetting the save.
  const initial = /^zombie-(\d+)$/.exec(zombie.id || "");
  const index = initial ? Number(initial[1]) - 1 : Math.trunc(zombie.variant || 0);
  return modulo(index, ZOMBIE_ANIMATION.variants);
}

export function zombieAnimationState(zombie) {
  const attackAge = ZOMBIE_ATTACK.cooldown - (zombie.attackCooldown || 0);
  if (zombie.attackWindup > 0 || (attackAge >= 0 && attackAge < ZOMBIE_ANIMATION.attackDuration)) return "attack";
  if (zombie.moving) {
    if (zombie.state === "chase" || zombie.state === "investigate") return "walk";
    return "shuffle";
  }
  return zombie.state === "idle" ? "rest" : "alert";
}

export function zombieDirection(zombie, previous = null) {
  const angle = Math.atan2(zombie.facingY ?? 1, zombie.facingX ?? 0);
  // Keep the last view for a small overlap around octant boundaries.
  if (previous !== null && Math.abs(wrap(angle - previous*TAU/8)) < TAU/16 + .07) return previous;
  return modulo(Math.round(angle*8/TAU), 8);
}

export class ZombieAnimator {
  constructor(metadata) { this.entities = new WeakMap(); this.metadata = metadata; }

  sample(zombie, time) {
    let record = this.entities.get(zombie);
    const variant = zombieVariant(zombie);
    if (!record || time < record.time) {
      record = { time, start: time,
        key: null, state: zombie.state, progress: (zombie.phase || 0)/6,
        lastMoving: -Infinity, cooldown: zombie.attackCooldown || 0, side: variant % 2 };
      this.entities.set(zombie, record);
    }
    let key = zombieAnimationState(zombie);
    if (zombie.moving) record.lastMoving = time;
    if ((key === "rest" || key === "alert") && zombie.state === record.state
        && (record.key === "walk" || record.key === "shuffle") && time-record.lastMoving < .12) key = record.key;
    if (key !== record.key) {
      record.start = time;
      record.progress = (zombie.phase || 0)/6;
    }
    if (key === "attack" && zombie.attackCooldown > record.cooldown+.05) record.side = 1-record.side;
    if (key === "walk" || key === "shuffle") {
      const duration = this.metadata?.variants[variant][key].sourceDuration || (key === "walk" ? 64/30 : 85/30);
      const delta = Math.max(0, Math.min(.1, time-record.time));
      if (zombie.moving) record.progress += delta*(ZOMBIE_ANIMATION.gaitRate[zombie.state] ?? .65)/duration;
    } else if (key === "attack") {
      const age = zombie.attackCooldown > 0 ? ZOMBIE_ATTACK.cooldown-zombie.attackCooldown
        : ZOMBIE_ATTACK.windup-zombie.attackWindup;
      record.progress = Math.max(0, Math.min(.999999, age/ZOMBIE_ANIMATION.attackDuration));
    } else {
      record.progress = (time-record.start)/(221/30) + (zombie.phase || 0)/6;
    }
    record.direction = zombieDirection(zombie, record.direction ?? null);
    Object.assign(record, { time, key, state: zombie.state,
      cooldown: zombie.attackCooldown || 0 });
    return { variant, clip: key === "attack" ? (record.side ? "attack_right" : "attack_left") : key,
      progress: modulo(record.progress, 1), direction: record.direction };
  }
}
