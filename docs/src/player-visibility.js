import { VIEW } from "./config.js";

// Tactical awareness, not zombie perception: cover/stance never reduce this.
export const PLAYER_VIEW = Object.freeze({ radius: 16, exploreStep: .25 });

export class PlayerVisibility {
  constructor(width = VIEW.worldW, height = VIEW.worldH) {
    this.width = width;
    this.height = height;
    this.explored = new Uint8Array(width * height);
    this.lastExplore = null;
  }

  canSee(point, player) {
    return Boolean(point && player && !point.removed)
      && Math.hypot(point.x - player.x, point.y - player.y) <= PLAYER_VIEW.radius;
  }

  hasExplored(point) {
    const x = Math.round(point.x), y = Math.round(point.y);
    return x >= 0 && y >= 0 && x < this.width && y < this.height
      && Boolean(this.explored[y * this.width + x]);
  }

  update(player) {
    if (!player || (this.lastExplore && Math.hypot(player.x - this.lastExplore.x,
      player.y - this.lastExplore.y) < PLAYER_VIEW.exploreStep)) return;
    const radius = PLAYER_VIEW.radius;
    for (let y = Math.max(0, Math.floor(player.y - radius)); y <= Math.min(this.height - 1, Math.ceil(player.y + radius)); y++) {
      for (let x = Math.max(0, Math.floor(player.x - radius)); x <= Math.min(this.width - 1, Math.ceil(player.x + radius)); x++) {
        if (Math.hypot(x - player.x, y - player.y) <= radius) this.explored[y * this.width + x] = 1;
      }
    }
    this.lastExplore = { x: player.x, y: player.y };
  }

  serialize() {
    return { version: 1, width: this.width, height: this.height, explored: this.explored.join("") };
  }

  restore(saved) {
    this.explored.fill(0);
    this.lastExplore = null;
    if (saved?.version !== 1 || saved.width !== this.width || saved.height !== this.height
      || typeof saved.explored !== "string" || saved.explored.length !== this.explored.length
      || /[^01]/.test(saved.explored)) return;
    for (let i = 0; i < this.explored.length; i++) this.explored[i] = Number(saved.explored[i]);
  }
}

export function playerCanSee(game, point) {
  return !game.playerVisibility || game.playerVisibility.canSee(point, game.player);
}

export function rememberedScenery(object) {
  return object.type !== "groundloot" && object.type !== "corpse";
}
