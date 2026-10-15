import { distance } from "./util.js";
import { LOCOMOTION, speedInTiles } from "./locomotion.js";
import { zombieBodyRadius } from "./zombie-collision.js";

// Ambient behavior only. Awareness, investigation and chase stay in ai.js.
export const ZOMBIE_IDLE = Object.freeze({
  pauseMin: 6, pauseMax: 14,
  stepMin: .5, stepMax: 1.5,
  speed: speedInTiles(LOCOMOTION.zombie.idle), turnRate: .7,
  lookAngle: .35, roamRadius: 3.5,
});

function pause(zombie, game) {
  const wait = ZOMBIE_IDLE.pauseMin + game.random() * (ZOMBIE_IDLE.pauseMax - ZOMBIE_IDLE.pauseMin);
  zombie.idleBehavior = { version: 1, phase: "pause", remaining: wait,
    lookAt: wait * (.25 + game.random() * .3), looked: false };
  zombie.target = null; zombie.wanderTarget = null; zombie.path = [];
  zombie.moving = false;
  zombie.desiredFacingX = zombie.facingX ?? 0;
  zombie.desiredFacingY = zombie.facingY ?? 1;
  return zombie.idleBehavior;
}

function validState(zombie, state) {
  if (state?.version !== 1) return false;
  if (state.phase === "pause") return Number.isFinite(state.remaining) && Number.isFinite(state.lookAt);
  return ["turn", "walk"].includes(state.phase) && Number.isFinite(state.goal?.x) && Number.isFinite(state.goal?.y)
    && distance(zombie, state.goal) <= ZOMBIE_IDLE.stepMax + .05;
}

function chooseStep(zombie, game) {
  const home = { x: zombie.spawnX ?? zombie.x, y: zombie.spawnY ?? zombie.y };
  const fromHome = distance(zombie, home);
  for (let attempt = 0; attempt < 8; attempt++) {
    const angle = fromHome > ZOMBIE_IDLE.roamRadius
      ? Math.atan2(home.y - zombie.y, home.x - zombie.x) + (game.random() - .5) * 1.4
      : game.random() * Math.PI * 2;
    const length = ZOMBIE_IDLE.stepMin + game.random() * (ZOMBIE_IDLE.stepMax - ZOMBIE_IDLE.stepMin);
    const goal = game.world.clampPoint({ x: zombie.x + Math.cos(angle) * length,
      y: zombie.y + Math.sin(angle) * length });
    const step = distance(zombie, goal), toHome = distance(home, goal);
    if (step < ZOMBIE_IDLE.stepMin - .00001 || step > ZOMBIE_IDLE.stepMax + .00001
      || (toHome > ZOMBIE_IDLE.roamRadius && toHome >= fromHome)) continue;
    if (!game.world.isWalkable(goal.x, goal.y, zombieBodyRadius(zombie))
      || !game.world.canWalkSegment(zombie, goal, zombieBodyRadius(zombie))) continue;
    zombie.idleBehavior = { version: 1, phase: "turn", goal, revision: game.world.sightRevision };
    zombie.target = goal; zombie.wanderTarget = goal; zombie.path = [];
    return true;
  }
  pause(zombie, game);
  return false;
}

export function updateIdleZombie(zombie, game, delta) {
  // Old saves drop only their restless ambient route, without moving the zombie
  // or resetting any world, injury, awareness or active search state.
  let state = zombie.idleBehavior;
  if (!validState(zombie, state)) state = pause(zombie, game);
  if (state.phase === "pause") {
    zombie.moving = false; zombie.target = null; zombie.path.length = 0;
    state.remaining = Math.max(0, state.remaining - delta);
    if (!state.looked && state.remaining <= state.lookAt) {
      const angle = Math.atan2(zombie.facingY ?? 1, zombie.facingX ?? 0)
        + (game.random() * 2 - 1) * ZOMBIE_IDLE.lookAngle;
      zombie.desiredFacingX = Math.cos(angle); zombie.desiredFacingY = Math.sin(angle);
      state.looked = true;
    }
    if (state.remaining > 0 || !chooseStep(zombie, game)) return;
    state = zombie.idleBehavior;
  }
  const goal = state.goal, d = distance(zombie, goal);
  if (d < .003) { pause(zombie, game); return; }
  if (state.revision !== game.world.sightRevision) {
    if (!game.world.canWalkSegment(zombie, goal, zombieBodyRadius(zombie))) { pause(zombie, game); return; }
    state.revision = game.world.sightRevision;
  }
  zombie.target = goal;
  zombie.desiredFacingX = (goal.x - zombie.x) / d;
  zombie.desiredFacingY = (goal.y - zombie.y) / d;
  // Turn deliberately before shuffling off, instead of sliding backwards while
  // a newly selected destination swings the vision cone around.
  const alignment = (zombie.facingX ?? 0) * zombie.desiredFacingX + (zombie.facingY ?? 1) * zombie.desiredFacingY;
  if (state.phase === "turn" && alignment < Math.cos(.3)) { zombie.moving = false; return; }
  state.phase = "walk";
  const travel = Math.min(d, ZOMBIE_IDLE.speed * delta), previous = { x: zombie.x, y: zombie.y };
  zombie.moving = game.moveEntity(zombie, zombie.desiredFacingX * travel, zombie.desiredFacingY * travel, zombieBodyRadius(zombie));
  if (!zombie.moving || distance(previous, zombie) < travel * .5 || distance(zombie, goal) < .003) pause(zombie, game);
}
