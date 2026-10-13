const gap = 8;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function overlapArea(a, b) {
  return Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x))
    * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
}

const padded = (rect, amount = gap) => ({ x: rect.x - amount, y: rect.y - amount,
  width: rect.width + amount * 2, height: rect.height + amount * 2 });

// Prefer stable edge positions. Only search the interior if every edge slot is
// occupied. Controls and world focus are supplied separately from DOM/rendering.
export function placeTargetPanel(bounds, size, controls, focus, previous = null) {
  const right = bounds.x + bounds.width - size.width, bottom = bounds.y + bounds.height - size.height;
  if (right < bounds.x || bottom < bounds.y) return null;
  const score = rect => controls.reduce((sum, obstacle) => sum + overlapArea(rect, obstacle) * 1000, 0)
    + focus.reduce((sum, obstacle) => sum + overlapArea(rect, obstacle), 0);
  const inside = rect => rect.x >= bounds.x && rect.y >= bounds.y && rect.x <= right && rect.y <= bottom;
  if (previous) {
    const rect = { ...previous, ...size };
    if (inside(rect) && score(rect) === 0) return { ...rect, clear: true };
  }
  const xs = new Set([bounds.x, right, (bounds.x + right) / 2]);
  const ys = new Set([bounds.y, bottom, (bounds.y + bottom) / 2]);
  for (const obstacle of [...controls, ...focus]) {
    xs.add(clamp(obstacle.x - size.width - gap, bounds.x, right));
    xs.add(clamp(obstacle.x + obstacle.width + gap, bounds.x, right));
    ys.add(clamp(obstacle.y - size.height - gap, bounds.y, bottom));
    ys.add(clamp(obstacle.y + obstacle.height + gap, bounds.y, bottom));
  }
  const candidates = [];
  for (const y of ys) for (const x of [bounds.x, right]) candidates.push({ x, y, ...size });
  for (const x of xs) for (const y of [bounds.y, bottom]) candidates.push({ x, y, ...size });
  const anchor = previous || { x: bounds.x, y: bounds.y };
  const closestClear = entries => entries.filter(rect => score(rect) === 0)
    .sort((a, b) => Math.hypot(a.x - anchor.x, a.y - anchor.y) - Math.hypot(b.x - anchor.x, b.y - anchor.y))[0];
  let clean = closestClear(candidates);
  if (!clean) {
    for (const x of xs) for (const y of ys) candidates.push({ x, y, ...size });
    clean = closestClear(candidates);
  }
  if (clean) return { ...clean, clear: true };
  // Tiny/crowded viewports may need compact text, but retain the action control.
  candidates.sort((a, b) => score(a) - score(b));
  return { ...candidates[0], clear: false };
}

export class TargetLayout {
  constructor(elements) {
    this.el = elements;
    this.controls = [elements.hud.querySelector(".top-left"), elements.hud.querySelector(".utility"),
      ...elements.hud.querySelectorAll(".actions button"), elements.quickbar,
      elements.hud.querySelector(".control-hint"), elements.message, elements.toast].filter(Boolean);
    this.geometry = null;
    this.sizes = new Map();
    this.previous = new Map();
  }

  measure(game) {
    const width = game.renderer.width, height = game.renderer.height;
    const signature = `${width}:${height}:${this.el.openfield_button.className}:${this.el.reload_button.className}`
      + `:${this.el.quickbar.childElementCount}:${this.el.inventory_count.textContent}`
      + `:${this.el.message.className}:${this.el.message.textContent}:${this.el.toast.className}:${this.el.toast.textContent}`;
    if (this.geometry?.signature === signature) return this.geometry;
    const style = getComputedStyle(this.el.hud), offset = this.el.hud.getBoundingClientRect();
    const left = parseFloat(style.paddingLeft) || 0, top = parseFloat(style.paddingTop) || 0;
    const bounds = { x: left, y: top, width: width - left - (parseFloat(style.paddingRight) || 0),
      height: height - top - (parseFloat(style.paddingBottom) || 0) };
    const controls = this.controls.filter(element => element.offsetWidth > 0 && element.offsetHeight > 0
      && (!element.matches(".message, .toast") || element.classList.contains("show"))).map(element => {
      const rect = element.getBoundingClientRect();
      return padded({ x: rect.left - offset.left, y: rect.top - offset.top, width: rect.width, height: rect.height }, 5);
    });
    this.sizes.clear();
    return this.geometry = { signature, bounds, controls };
  }

  size(element, key, compact = false) {
    element.classList.toggle("compact", compact);
    const id = `${key}:${compact}:${element.classList.contains("hidden")}`;
    if (!this.sizes.has(id)) this.sizes.set(id, { width: element.offsetWidth, height: element.offsetHeight });
    return this.sizes.get(id);
  }

  update(game, context) {
    if (this.el.hud.classList.contains("hidden") || !game.renderer.iso) return;
    const enemy = game.combat.target(game), label = this.el.target_label;
    if (!enemy && !label.classList.contains("show")) return;
    const { bounds, controls } = this.measure(game), focus = [], essential = [];
    const protect = (entity, important = false, object = false) => {
      if (!entity) return;
      const point = game.renderer.iso(entity.x, entity.y);
      const rect = padded({ x: point.x - (object ? 55 : 35), y: point.y - (object ? 70 : 80),
        width: object ? 110 : 105, height: object ? 95 : 100 }, 6);
      focus.push(rect); if (important) essential.push(rect);
    };
    protect(game.player, true); protect(enemy, true); protect(context, true, true);
    const p = game.renderer.iso(game.player.x, game.player.y);
    const icons = padded({ x: clamp(p.x + 20, 4, game.renderer.width - 63), y: Math.max(5, p.y - 43), width: 63, height: 63 }, 6);
    focus.push(icons); essential.push(icons);
    for (const zombie of game.zombies) if (!zombie.removed && zombie !== enemy
      && Math.hypot(zombie.x - game.player.x, zombie.y - game.player.y) < 8) protect(zombie);
    if (game.renderer.destination) protect(game.renderer.destination, true);
    const occupied = [...controls];
    const put = (element, rect) => {
      if (!rect) return;
      if (element.style.left !== `${rect.x}px`) element.style.left = `${rect.x}px`;
      if (element.style.top !== `${rect.y}px`) element.style.top = `${rect.y}px`;
      this.previous.set(element, rect); occupied.push(padded(rect, 5));
    };
    if (enemy) {
      const panel = this.el.enemy_target;
      if (this.el.execute_button.matches(":active") && this.previous.has(panel)) {
        // Keep both position and text density stable while a finger presses it.
        put(panel, this.previous.get(panel));
      } else {
        const key = `enemy:${this.el.execute_button.classList.contains("hidden")}:${this.el.aim_meter.classList.contains("hidden")}`;
        let rect = placeTargetPanel(bounds, this.size(panel, key), occupied, focus, this.previous.get(panel));
        if (!rect?.clear) {
          rect = placeTargetPanel(bounds, this.size(panel, key, true), occupied, focus, this.previous.get(panel));
          if (!rect?.clear) rect = placeTargetPanel(bounds, this.size(panel, key, true), occupied, essential, this.previous.get(panel));
        }
        put(panel, rect);
      }
    } else this.previous.delete(this.el.enemy_target);
    if (label.classList.contains("show")) {
      const rect = placeTargetPanel(bounds, this.size(label, `object:${label.textContent}`), occupied, focus, this.previous.get(label));
      label.classList.toggle("layout-hidden", !rect?.clear);
      if (rect?.clear) put(label, rect);
    } else this.previous.delete(label);
  }
}
