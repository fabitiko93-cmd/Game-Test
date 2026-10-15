import { zombieVariant } from "./zombie-animation.js";
import { WORLD_SCALE } from "./world-scale.js";

function stableFraction(text) {
  let value = 2166136261;
  for (let i = 0; i < text.length; i++) value = Math.imul(value ^ text.charCodeAt(i), 16777619);
  return (value >>> 0) / 4294967295;
}

export function zombieBodyProfile(zombie) {
  const variant = zombieVariant(zombie);
  const female = variant < 5;
  const heights = female ? WORLD_SCALE.zombies.femaleHeights : WORLD_SCALE.zombies.maleHeights;
  const variation = zombie.id ? (stableFraction(zombie.id) * 2 - 1) * WORLD_SCALE.zombies.individualVariation : 0;
  const height = heights[variant % 5] + variation;
  return { variant, sex: female ? "female" : "male", height,
    scale: height / WORLD_SCALE.zombies.sourceReferenceHeights[variant] };
}

export function zombieCorpseAppearance(zombie) {
  // Keep the original ID: both initial variants and individual height use it.
  return { id: zombie.id, variant: zombieVariant(zombie),
    facingX: zombie.facingX ?? 0, facingY: zombie.facingY ?? 1 };
}
