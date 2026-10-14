import { clamp, lerp } from "./util.js";

const QUIET_COLOR = [222, 207, 153];
const SPOTTED_COLOR = [227, 79, 60];

// All cones share one transparent layer, bounding even dense overlaps.
export const VISION_LAYER_ALPHA = .25;

// Read existing perception only: sound suspicion must not look like visual detection.
// Recognition covers the brief crossing window before awareness starts increasing.
export function visionConeStyle(zombie, tacticalVision, selected = false) {
  const memory = zombie.sightMemory;
  const awareness = memory?.visible && zombie.stimulus === "vision" ? zombie.awareness || 0 : 0;
  const progress = zombie.state === "chase" ? 1
    : clamp(Math.max(awareness, memory?.recognition || 0), 0, 1);
  const channels = QUIET_COLOR.map((value, index) => Math.round(lerp(value, SPOTTED_COLOR[index], progress)));
  return {
    progress,
    visibleByState: zombie.state === "chase"
      || (zombie.stimulus === "vision" && (zombie.awareness || 0) >= .12)
      || (memory?.recognition || 0) >= .12,
    color: `rgb(${channels.join(",")})`,
    alpha: Math.min(VISION_LAYER_ALPHA, lerp(tacticalVision ? .15 : .12, .225, progress) + (selected ? .025 : 0)),
  };
}

function smoothstep(from, to, value) {
  const t = clamp((value - from) / (to - from), 0, 1);
  return t * t * (3 - 2 * t);
}

// One reusable soft beam, never a blur of the clipped image: no light can
// bleed across an occluder. The exact geometric extent remains unchanged.
export function beamOpacity(radius, angle, halfAngle) {
  return smoothstep(0, .07, radius) * (1 - smoothstep(.84, 1, radius))
    * (1 - smoothstep(halfAngle - .14, halfAngle, Math.abs(angle)));
}
