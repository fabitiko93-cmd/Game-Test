import { STANCES } from "./config.js?v=3";
import { skillValue } from "./character.js?v=3";
import { clamp, distance } from "./util.js?v=3";

export function daylight(minutes) {
  const angle = (minutes / 1440) * Math.PI * 2 - Math.PI / 2;
  const sun = clamp((Math.sin(angle) + 0.25) / 1.25, 0, 1);
  return 0.48 + sun * 0.52;
}

export function playerVisibility(player, minutes) {
  const stance = STANCES[player.stance] || STANCES.walk;
  const stealth = skillValue(player, "stealth");
  const skillReduction = 1 - stealth * 0.003;
  const movement = player.running ? 1.28 : player.moving ? 1.06 : 0.82;
  return stance.visibility * skillReduction * movement * daylight(minutes);
}

export function visionExposure(observer, player, world, minutes) {
  const d = distance(observer, player);
  const visibility = playerVisibility(player, minutes) * (1 - world.concealmentAt(player));
  const maxRange = 8.2 * (0.72 + visibility * 0.38);
  if (d > maxRange || !world.hasLineOfSight(observer, player)) return 0;

  const dx = (player.x - observer.x) / Math.max(d, 0.001);
  const dy = (player.y - observer.y) / Math.max(d, 0.001);
  const facing = dx * (observer.facingX || 0) + dy * (observer.facingY || 1);
  const inCone = facing >= -0.12;
  if (!inCone && d > 1.25) return 0;

  const distanceFactor = clamp(1 - d / Math.max(maxRange, 0.01), 0.08, 1);
  const coneFactor = d <= 1.25 ? 1.5 : clamp((facing + 0.12) / 1.12, 0.18, 1);
  return clamp(distanceFactor * coneFactor * visibility * 1.5, 0.04, 1.6);
}

export function strongestNoise(observer, noises) {
  let best = null;
  let score = 0;
  for (const noise of noises) {
    const d = distance(observer, noise);
    if (d > noise.radius) continue;
    const next = (1 - d / Math.max(0.01, noise.radius)) * (noise.strength || 1);
    if (next > score) {
      score = next;
      best = noise;
    }
  }
  return best ? { noise: best, score } : null;
}

export function awarenessForPlayer(zombies) {
  let awareness = 0;
  let pursuing = false;
  let suspicious = false;
  for (const zombie of zombies) {
    if (zombie.removed) continue;
    awareness = Math.max(awareness, zombie.awareness || 0);
    if (zombie.state === "chase") pursuing = true;
    if (["suspicious", "investigate", "search"].includes(zombie.state)) suspicious = true;
  }
  return { awareness: clamp(awareness, 0, 1), pursuing, suspicious };
}

export function behindTarget(attacker, target) {
  const d = distance(attacker, target) || 1;
  const towardAttackerX = (attacker.x - target.x) / d;
  const towardAttackerY = (attacker.y - target.y) / d;
  const dot = towardAttackerX * (target.facingX || 0) + towardAttackerY * (target.facingY || 1);
  return dot < -0.38;
}
