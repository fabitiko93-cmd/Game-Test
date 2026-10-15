import { ZOMBIE_ATTACK } from "./ai.js";

export const ZOMBIE_ANIMATION = Object.freeze({
  variants: 10, directions: 8, attackDuration: .73,
  // Distance in world tiles per complete gait, independent of render/AI FPS.
  stride: Object.freeze({ shuffle: .36, walk: .7, run: 1.2 }),
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
    if (zombie.state === "chase") return "run";
    if (zombie.state === "investigate") return "walk";
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
  constructor() { this.entities = new WeakMap(); }

  sample(zombie, time) {
    let record = this.entities.get(zombie);
    const variant = zombieVariant(zombie);
    if (!record || time < record.time) {
      record = { time, x: zombie.x, y: zombie.y, start: time,
        key: null, state: zombie.state, progress: (zombie.phase || 0)/6,
        lastMoving: -Infinity, cooldown: zombie.attackCooldown || 0, side: variant % 2 };
      this.entities.set(zombie, record);
    }
    let key = zombieAnimationState(zombie);
    if (zombie.moving) record.lastMoving = time;
    if ((key === "rest" || key === "alert") && zombie.state === record.state
        && ZOMBIE_ANIMATION.stride[record.key] && time-record.lastMoving < .12) key = record.key;
    if (key !== record.key) {
      record.start = time;
      record.progress = (zombie.phase || 0)/6;
    }
    if (key === "attack" && record.key !== "attack" && zombie.attackCooldown > record.cooldown) record.side = 1-record.side;
    const distance = Math.hypot(zombie.x-record.x, zombie.y-record.y);
    if (ZOMBIE_ANIMATION.stride[key]) {
      if (distance < 2) record.progress += distance/ZOMBIE_ANIMATION.stride[key];
    } else if (key === "attack") {
      const age = zombie.attackCooldown > 0 ? ZOMBIE_ATTACK.cooldown-zombie.attackCooldown
        : ZOMBIE_ATTACK.windup-zombie.attackWindup;
      record.progress = Math.max(0, Math.min(.999999, age/ZOMBIE_ANIMATION.attackDuration));
    } else {
      record.progress = (time-record.start)/(221/30) + (zombie.phase || 0)/6;
    }
    record.direction = zombieDirection(zombie, record.direction ?? null);
    Object.assign(record, { time, x: zombie.x, y: zombie.y, key, state: zombie.state,
      cooldown: zombie.attackCooldown || 0 });
    return { variant, clip: key === "attack" ? (record.side ? "attack_right" : "attack_left") : key,
      progress: modulo(record.progress, 1), direction: record.direction };
  }
}
