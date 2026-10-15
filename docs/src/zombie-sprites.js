import { ZombieAnimator } from "./zombie-animation.js";
import ATLAS from "../assets/zombies/atlas.json" with { type: "json" };

// This relative path works both in docs/src and in the bundled docs/build entry.
const ASSETS = new URL("../assets/zombies/", import.meta.url);
const MAX_SHEETS = 14; // About 40–60 MB decoded; active sheets are never evicted.

export class ZombieSprites {
  constructor({ metadata = ATLAS, createImage = () => new Image() } = {}) {
    this.animator = new ZombieAnimator(metadata);
    this.createImage = createImage;
    this.cache = new Map();
    this.previous = new WeakMap();
    this.needed = new Set();
    this.tick = 0;
    // Bundle metadata with this release. An older active service worker must
    // never supply a stale heading/timing map to newly loaded game code.
    this.metadata = metadata;
  }

  beginFrame() { this.tick++; this.needed.clear(); }

  sheet(key, clip) {
    this.needed.add(key);
    let entry = this.cache.get(key);
    if (!entry) {
      entry = { image: this.createImage(), loaded: false, used: this.tick };
      this.cache.set(key, entry);
      entry.image.onload = () => { entry.loaded = true; this.trim(); };
      entry.image.onerror = () => { entry.failed = true; };
      entry.image.src = new URL(clip.file, ASSETS).href;
    }
    entry.used = this.tick;
    return entry.loaded ? entry.image : null;
  }

  trim() {
    if (this.cache.size <= MAX_SHEETS) return;
    const candidates = [...this.cache].filter(([key]) => !this.needed.has(key))
      .sort(([, a], [, b]) => a.used-b.used);
    for (const [key, entry] of candidates) {
      if (this.cache.size <= MAX_SHEETS) break;
      entry.image.onload = entry.image.onerror = null;
      entry.image.src = "";
      this.cache.delete(key);
    }
  }

  draw(ctx, zombie, time, p) {
    const pose = this.animator.sample(zombie, time);
    const clip = this.metadata.variants[pose.variant][pose.clip];
    const key = `${pose.variant}-${pose.clip}`;
    const image = this.sheet(key, clip);
    const frame = Math.min(clip.frames-1, Math.floor(pose.progress*clip.frames));
    const sprite = image ? { key, frame } : this.previous.get(zombie);
    if (!sprite || !this.cache.get(sprite.key)?.loaded) return false;
    // Keep the last real pose during a new sheet's decode instead of flashing
    // back to the old procedural character at every AI-state transition.
    this.needed.add(sprite.key);
    this.cache.get(sprite.key).used = this.tick;
    this.previous.set(zombie, sprite);
    const { width, height, anchor, scale } = this.metadata;
    ctx.save();
    if (zombie.hurtFlash > 0) ctx.globalAlpha *= .55;
    ctx.imageSmoothingEnabled = true;
    // A loading state change may reuse the old frame, but never its old facing.
    const row = this.metadata.directionRows[pose.direction];
    ctx.drawImage(this.cache.get(sprite.key).image, sprite.frame*width, row*height, width, height,
      p.x-anchor[0]/scale, p.y-anchor[1]/scale, width/scale, height/scale);
    ctx.restore();
    return true;
  }

  endFrame() { this.trim(); }
}
