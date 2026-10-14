import { VIEW } from "./config.js";
import { VISION, visionGeometry } from "./perception.js";
import { playerCanSee } from "./player-visibility.js";
import { beamOpacity, visionConeStyle, VISION_LAYER_ALPHA } from "./vision-cone.js";
import { VisionGeometry } from "./vision-geometry.js";

const TEXTURE_SIZE = 256;

export class VisionConeDisplay {
  constructor() {
    this.geometry = new VisionGeometry();
    this.cones = new Map();
    this.sprites = new Map();
    this.layer = null;
    this.mask = null;
  }

  sprite(color) {
    if (this.sprites.has(color)) {
      const sprite = this.sprites.get(color);
      this.sprites.delete(color); this.sprites.set(color, sprite);
      return sprite;
    }
    if (!this.mask) {
      this.mask = document.createElement("canvas");
      this.mask.width = this.mask.height = TEXTURE_SIZE;
      const ctx = this.mask.getContext("2d"), pixels = ctx.createImageData(TEXTURE_SIZE, TEXTURE_SIZE);
      for (let y = 0; y < TEXTURE_SIZE; y++) for (let x = 0; x < TEXTURE_SIZE; x++) {
        const u = (x + .5) / TEXTURE_SIZE * 2 - 1, v = (y + .5) / TEXTURE_SIZE * 2 - 1;
        const index = (y * TEXTURE_SIZE + x) * 4;
        pixels.data[index] = pixels.data[index + 1] = pixels.data[index + 2] = 255;
        pixels.data[index + 3] = Math.round(beamOpacity(Math.hypot(u, v), Math.atan2(v, u), VISION.halfAngle) * 255);
      }
      ctx.putImageData(pixels, 0, 0);
    }
    let sprite;
    if (this.sprites.size >= 16) {
      const oldest = this.sprites.keys().next().value;
      sprite = this.sprites.get(oldest); this.sprites.delete(oldest);
    } else {
      sprite = document.createElement("canvas");
      sprite.width = sprite.height = TEXTURE_SIZE;
    }
    const ctx = sprite.getContext("2d");
    ctx.clearRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
    ctx.drawImage(this.mask, 0, 0);
    ctx.globalCompositeOperation = "source-in";
    ctx.fillStyle = color; ctx.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
    ctx.globalCompositeOperation = "source-over";
    this.sprites.set(color, sprite);
    return sprite;
  }

  draw(renderer, game) {
    const tactical = game.player.stance === "sneak" || (game.player.skills?.perception || 0) >= 25;
    const visible = [];
    for (const zombie of game.zombies) {
      const selected = game.player.combat?.targetId === zombie.id;
      const style = visionConeStyle(zombie, tactical, selected);
      if (zombie.removed || !playerCanSee(game, zombie) || (!tactical && !style.visibleByState)) continue;
      const center = renderer.iso(zombie.x, zombie.y);
      const geometry = visionGeometry(zombie, game.player, game.world, game.minutes, true);
      const extentX = geometry.range * VIEW.tileW / Math.SQRT2;
      const extentY = geometry.range * VIEW.tileH / Math.SQRT2;
      if (center.x + extentX < 0 || center.x - extentX > renderer.width
        || center.y + extentY < 0 || center.y - extentY > renderer.height) continue;
      visible.push({ zombie, center, geometry, style });
    }
    const ids = new Set(visible.map(entry => entry.zombie.id));
    for (const id of this.cones.keys()) if (!ids.has(id)) this.cones.delete(id);
    if (!visible.length) return;
    this.layer ||= document.createElement("canvas");
    if (this.layer.width !== renderer.canvas.width || this.layer.height !== renderer.canvas.height) {
      this.layer.width = renderer.canvas.width; this.layer.height = renderer.canvas.height;
    }
    const ctx = this.layer.getContext("2d");
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.layer.width, this.layer.height);
    ctx.setTransform(renderer.scale, 0, 0, renderer.scale, 0, 0);
    ctx.imageSmoothingEnabled = true;
    this.geometry.prepare(game.world);
    // Draw danger last so a quiet beam cannot wash red back into yellow.
    visible.sort((a, b) => a.style.progress - b.style.progress || a.style.alpha - b.style.alpha);
    for (const { zombie, center, geometry, style } of visible) {
      const angle = Math.atan2(zombie.facingY ?? 1, zombie.facingX ?? 0);
      let cached = this.cones.get(zombie.id);
      if (!cached || cached.x !== zombie.x || cached.y !== zombie.y || cached.angle !== angle
        || cached.range !== geometry.range || cached.revision !== this.geometry.revision) {
        cached = { x: zombie.x, y: zombie.y, angle, range: geometry.range, revision: this.geometry.revision,
          points: this.geometry.polygon(game.world, zombie, angle, geometry.range, geometry.halfAngle) };
        this.cones.set(zombie.id, cached);
      }
      if (!cached.points.length) continue;
      ctx.save();
      ctx.beginPath(); ctx.moveTo(center.x, center.y);
      for (const point of cached.points) { const p = renderer.iso(point.x, point.y); ctx.lineTo(p.x, p.y); }
      ctx.closePath(); ctx.clip();
      const cosine = Math.cos(angle), sine = Math.sin(angle), range = geometry.range;
      ctx.transform((cosine - sine) * VIEW.tileW * .5 * range, (cosine + sine) * VIEW.tileH * .5 * range,
        (-sine - cosine) * VIEW.tileW * .5 * range, (cosine - sine) * VIEW.tileH * .5 * range, center.x, center.y);
      ctx.globalAlpha = style.alpha / VISION_LAYER_ALPHA;
      ctx.drawImage(this.sprite(style.color), -1, -1, 2, 2);
      ctx.restore();
    }
    renderer.ctx.save();
    renderer.ctx.globalAlpha = VISION_LAYER_ALPHA;
    renderer.ctx.drawImage(this.layer, 0, 0, renderer.width, renderer.height);
    renderer.ctx.restore();
  }
}
