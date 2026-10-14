import { VISION, visionExposure } from "./perception.js";
import { distance } from "./util.js";
import { STEALTH_RULES } from "./stealth.js";

export const COVER_SEARCH = Object.freeze({ visualSeconds: 6.5, soundSeconds: 5.5, stalledSeconds: 6.5 });

export function ensureSightMemory(zombie) {
  zombie.sightMemory ||= { visible: false, recognition: 0, revealedCoverId: null, transition: false };
  return zombie.sightMemory;
}

export function beginCoverSearch(zombie, game, coverId, anchor, source = "vision") {
  if (!coverId || !anchor || !game.world.coverMap.area(coverId)) return;
  zombie.coverSearch = {
    coverId, anchor: { ...anchor }, phase: "anchor", entered: false,
    remaining: source === "sound" ? COVER_SEARCH.soundSeconds : COVER_SEARCH.visualSeconds,
    points: null, cursor: 0, stalled: 0, lastDistance: null, routeFailures: 0,
  };
  zombie.lastSeen = { ...anchor };
  zombie.target = { ...anchor };
  zombie.state = "search";
  zombie.stateTimer = 0;
  zombie.stateTime = 0;
  zombie.stimulus = source;
  zombie.path = [];
  zombie.repathTimer = 0;
}

export function coverAwareExposure(zombie, game, delta) {
  const player = game.player, state = player.stealthState || {};
  const memory = ensureSightMemory(zombie);
  const previouslyVisible = memory.visible;
  memory.visible = false;
  const raw = player.dead ? 0 : visionExposure(zombie, player, game.world, game.minutes, true);

  // The class perk is effective concealment, not a visibility multiplier.
  // A hit already in flight may still land; it does not cancel this source.
  if (state.source === "openfield") {
    memory.recognition = Math.max(0, memory.recognition - delta);
    memory.revealedCoverId = null;
    return 0;
  }

  const protection = state.source === "cover" ? game.world.coverMap.at(player, state.coverId, zombie) : null;
  if (protection) {
    if (previouslyVisible && zombie.lastSeen) {
      beginCoverSearch(zombie, game, protection.id, zombie.lastSeen);
    }
    const search = zombie.coverSearch;
    const targetedCloseSearch = search?.entered && search.coverId === protection.id
      && distance(zombie, player) <= VISION.nearRadius;
    const alreadyFound = memory.revealedCoverId === protection.id;
    if ((targetedCloseSearch || alreadyFound) && raw > 0 && game.world.hasLineOfSight(zombie, player)) {
      memory.visible = true;
      memory.revealedCoverId = protection.id;
      zombie.awareness = 1;
      zombie.coverSearch = null;
      return Math.max(1, raw);
    }
    memory.revealedCoverId = null;
    memory.transition = true;
    memory.occlusionGrace = protection.kind === "occlusion" ? 2 : 0;
    memory.recognition = Math.max(0, memory.recognition - delta);
    return 0;
  }

  const closeSearch = zombie.coverSearch;
  if (state.source === "cover" && closeSearch?.entered && closeSearch.coverId === state.coverId
    && distance(zombie, player) <= VISION.nearRadius && raw > 0) {
    memory.visible = true;
    memory.revealedCoverId = state.coverId;
    zombie.awareness = 1;
    zombie.coverSearch = null;
    return Math.max(1, raw);
  }

  memory.revealedCoverId = null;
  memory.occlusionGrace = Math.max(0, (memory.occlusionGrace || 0) - delta);
  const crossing = memory.transition && (state.departureTime > 0 || memory.occlusionGrace > 0) && player.stance === "sneak";
  if (crossing) {
    memory.recognition = raw > 0 ? Math.min(1, memory.recognition + delta / STEALTH_RULES.transitionRecognition)
      : Math.max(0, memory.recognition - delta);
    if (memory.recognition < 1) return 0;
    // Recognition of this crossing must not wait for a second awareness timer.
    if (raw > 0) zombie.awareness = 1;
  } else {
    memory.recognition = 0;
    if (raw > 0 && memory.transition && player.running) zombie.awareness = 1;
  }
  if (!state.departureTime && !state.coverId) memory.transition = false;
  memory.visible = raw > 0;
  if (raw > 0) zombie.coverSearch = null;
  return raw;
}

export function finishCoverSearch(zombie) {
  zombie.coverSearch = null;
  zombie.target = null;
  zombie.lastSeen = null;
  zombie.path = [];
  zombie.stimulus = null;
  zombie.awareness = Math.min(zombie.awareness, 0.08);
  zombie.state = "idle";
  zombie.stateTime = 0;
  zombie.stateTimer = 0;
}

export function updateCoverSearch(zombie, game, delta) {
  const search = zombie.coverSearch;
  if (!search) return false;
  if (!game.world.coverMap.area(search.coverId)) { finishCoverSearch(zombie); return true; }
  // Approach time is not investigation time. The silhouette is fixed, and
  // only this cover's perimeter supplies subsequent search destinations.
  if (!search.entered && game.world.coverMap.contains(search.coverId, zombie, 0.95)) search.entered = true;
  if (search.entered) {
    search.remaining = Math.max(0, search.remaining - delta);
    zombie.stateTimer = search.remaining;
    if (!search.remaining) { finishCoverSearch(zombie); return true; }
  }
  const d = zombie.target ? distance(zombie, zombie.target) : 0;
  if (search.lastDistance === null || d < search.lastDistance - 0.08) {
    search.lastDistance = d;
    search.stalled = 0;
  } else search.stalled += delta;
  if (search.stalled >= COVER_SEARCH.stalledSeconds || search.routeFailures >= 3) {
    finishCoverSearch(zombie);
    return true;
  }
  if (!zombie.target || d < 0.55) {
    search.phase = "area";
    search.points ||= game.world.coverMap.searchPoints(search.coverId)
      .sort((a, b) => distance(a, search.anchor) - distance(b, search.anchor));
    if (!search.points.length) { finishCoverSearch(zombie); return true; }
    const next = search.points[search.cursor++ % search.points.length];
    zombie.target = { ...next };
    zombie.path = [];
    zombie.repathTimer = 0;
    search.lastDistance = null;
    search.stalled = 0;
  }
  return true;
}
