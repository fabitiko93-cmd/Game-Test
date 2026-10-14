import { visionExposure } from "./perception.js";

// Direction is assessed per observer. The cover area is only an opportunity;
// walls/cars do not make a player standing on the observer's side invisible.
export function concealedAt(game, point, observer) {
  const cover = game.world.coverMap.at(point);
  if (!cover) return false;
  if (cover.kind === "concealment") return true;
  if (!observer) return false;
  const player = point === game.player ? game.player : { ...game.player, x: point.x, y: point.y };
  return visionExposure(observer, player, game.world, game.minutes, true) === 0;
}

export function hiddenFrom(game, observer, point = game.player) {
  const state = game.player.stealthState || {};
  if (game.player.stance !== "sneak" || game.player.running || state.attackLock > 0) return false;
  return state.openfieldRemaining > 0 || concealedAt(game, point, observer);
}

export function coverSegmentSafe(game, observer, start, end) {
  const count = Math.max(1, Math.ceil(Math.hypot(end.x - start.x, end.y - start.y) / .125));
  for (let i = 0; i <= count; i++) {
    const amount = i / count;
    if (!concealedAt(game, { x: start.x + (end.x - start.x) * amount,
      y: start.y + (end.y - start.y) * amount }, observer)) return false;
  }
  return true;
}
