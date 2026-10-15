import { zombieAnimationState, zombieVariant, ZOMBIE_ANIMATION } from "./zombie-animation.js";
import { ZOMBIE_ATTACK } from "./ai.js";
import { WORLD_SCALE } from "./world-scale.js";
import { zombieBodyProfile } from "./zombie-appearance.js";

const modulo = value => ((value % 1) + 1) % 1;

// The model's authored +Z becomes the game's (facingX, facingY) direction.
export const zombieModelYaw = zombie => Math.atan2(zombie.facingX ?? 0, zombie.facingY ?? 1);

export class ZombieMotion {
  constructor(metadata) { this.metadata = metadata; this.entities = new WeakMap(); }

  sample(zombie, time) {
    const variant = zombieVariant(zombie), definition = this.metadata.variants[variant];
    let record = this.entities.get(zombie);
    if (!record || time < record.time) {
      record = { time, x: zombie.x, y: zombie.y, phase: modulo((zombie.phase || 0)/6),
        key: null, cooldown: zombie.attackCooldown || 0, side: variant % 2 };
      this.entities.set(zombie, record);
    }
    let key = zombieAnimationState(zombie);
    // Deliberate walking for active search as well; shuffle remains ambient.
    if (key === "shuffle" && zombie.state !== "idle") key = "walk";
    if (key === "attack" && zombie.attackCooldown > record.cooldown+.05) record.side = 1-record.side;
    const clip = key === "attack" ? (record.side ? "attack_right" : "attack_left") : key;
    const data = definition.clips[clip], body = zombieBodyProfile(zombie);
    const delta = Math.max(0, time-record.time);
    const distance = Math.hypot(zombie.x-record.x, zombie.y-record.y) * WORLD_SCALE.metersPerTile;
    if (key === "walk" || key === "shuffle") {
      // A blocked/stationary zombie cannot tread in place. Size changes stride,
      // not navigation speed; larger people consequently take fewer steps.
      if (delta > 0 && distance < 3) record.phase = modulo(record.phase + distance/(data.distance*body.scale));
    } else if (key === "attack") {
      const age = zombie.attackCooldown > 0 ? ZOMBIE_ATTACK.cooldown-zombie.attackCooldown
        : ZOMBIE_ATTACK.windup-zombie.attackWindup;
      record.phase = Math.max(0, Math.min(.999999, age/ZOMBIE_ANIMATION.attackDuration));
    } else if (delta > 0) record.phase = modulo(record.phase + delta/data.duration);
    Object.assign(record, { time, x: zombie.x, y: zombie.y, key, cooldown: zombie.attackCooldown || 0 });
    return { variant, clip, progress: record.phase, delta: Math.min(.1, delta),
      yaw: zombieModelYaw(zombie), scale: body.scale };
  }
}
