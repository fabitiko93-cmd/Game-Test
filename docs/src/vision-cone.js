import { clamp, lerp } from "./util.js";

const QUIET_COLOR = [238, 201, 81];
const SPOTTED_COLOR = [227, 79, 60];

// Read existing perception only: sound suspicion must not look like visual detection.
// Recognition covers the brief crossing window before awareness starts increasing.
export function visionConeStyle(zombie, tacticalVision) {
  const memory = zombie.sightMemory;
  const awareness = memory?.visible && zombie.stimulus === "vision" ? zombie.awareness || 0 : 0;
  const progress = zombie.state === "chase" ? 1
    : clamp(Math.max(awareness, memory?.recognition || 0), 0, 1);
  const channels = QUIET_COLOR.map((value, index) => Math.round(lerp(value, SPOTTED_COLOR[index], progress)));
  return {
    visibleByState: zombie.state === "chase"
      || (zombie.stimulus === "vision" && (zombie.awareness || 0) >= .12)
      || (memory?.recognition || 0) >= .12,
    color: `rgb(${channels.join(",")})`,
    alpha: lerp(tacticalVision ? .14 : .12, .22, progress),
    outlineAlpha: lerp(.70, .90, progress),
    outlineUnderlayAlpha: lerp(.45, .60, progress),
  };
}
