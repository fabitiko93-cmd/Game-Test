import { STANCES } from "./config.js?v=7";
import { skillValue } from "./character.js?v=7";
import { clamp, distance } from "./util.js?v=7";

export const VISION = Object.freeze({
  range: 8.2,
  halfAngle: Math.PI / 3,
  nearRadius: 0.68,
  renderSamples: 10,
});

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
  const hidden = player.stealthState?.hidden ? 0.28 : 1;
  return stance.visibility * skillReduction * movement * daylight(minutes) * hidden;
}

export function visionGeometry(observer, player, world, minutes) {
  const visibility = playerVisibility(player, minutes) * (1 - world.concealmentAt(player));
  return {
    visibility,
    range: VISION.range * (0.72 + visibility * 0.38),
    halfAngle: VISION.halfAngle,
    nearRadius: VISION.nearRadius,
  };
}

export function visionExposure(observer, player, world, minutes) {
  const d = distance(observer, player);
  const geometry = visionGeometry(observer, player, world, minutes);
  if (d > geometry.range || !world.hasLineOfSight(observer, player)) return 0;

  const dx = (player.x - observer.x) / Math.max(d, 0.001);
  const dy = (player.y - observer.y) / Math.max(d, 0.001);
  const facing = dx * (observer.facingX || 0) + dy * (observer.facingY || 1);
  const coneEdge = Math.cos(geometry.halfAngle);
  const inCone = facing >= coneEdge;
  if (!inCone && d > geometry.nearRadius) return 0;

  const distanceFactor = clamp(1 - d / Math.max(geometry.range, 0.01), 0.08, 1);
  const coneFactor = d <= geometry.nearRadius ? 1.25 : clamp((facing - coneEdge) / (1 - coneEdge), 0.16, 1);
  return clamp(distanceFactor * coneFactor * geometry.visibility * 1.5, 0.04, 1.6);
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
  let source = null;
  for (const zombie of zombies) {
    if (zombie.removed) continue;
    if ((zombie.awareness || 0) >= awareness) {
      awareness = zombie.awareness || 0;
      source = zombie.stimulus || null;
    }
    if (zombie.state === "chase") pursuing = true;
    if (["suspicious", "investigate", "search"].includes(zombie.state)) suspicious = true;
  }
  return { awareness: clamp(awareness, 0, 1), pursuing, suspicious, source };
}

export function behindTarget(attacker, target) {
  const d = distance(attacker, target) || 1;
  const towardAttackerX = (attacker.x - target.x) / d;
  const towardAttackerY = (attacker.y - target.y) / d;
  const dot = towardAttackerX * (target.facingX || 0) + towardAttackerY * (target.facingY || 1);
  return dot < -0.38;
}
