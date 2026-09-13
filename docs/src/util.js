export const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
export const lerp = (a, b, t) => a + (b - a) * t;
export const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export function mulberry32(seed) {
  return function random() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export function hash2(x, y, seed = 98) {
  let h = Math.imul(x + seed, 374761393) + Math.imul(y - seed, 668265263);
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

export function choose(random, values) {
  return values[Math.floor(random() * values.length)];
}

export function uid(prefix = "id") {
  uid.counter = (uid.counter || 0) + 1;
  return `${prefix}-${uid.counter}`;
}

export function formatClock(totalMinutes) {
  const dayMinutes = ((totalMinutes % 1440) + 1440) % 1440;
  const h = Math.floor(dayMinutes / 60);
  const m = Math.floor(dayMinutes % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function pointInRect(px, py, rect) {
  return px >= rect.x && py >= rect.y && px <= rect.x + rect.w && py <= rect.y + rect.h;
}

export function vibrate(pattern = 12) {
  try { navigator.vibrate?.(pattern); } catch (_) { /* iOS simply ignores this. */ }
}

export function lineCells(x0, y0, x1, y1) {
  const cells = [];
  let x = Math.floor(x0), y = Math.floor(y0);
  const tx = Math.floor(x1), ty = Math.floor(y1);
  const dx = Math.abs(tx - x), sx = x < tx ? 1 : -1;
  const dy = -Math.abs(ty - y), sy = y < ty ? 1 : -1;
  let error = dx + dy;
  while (true) {
    cells.push({ x, y });
    if (x === tx && y === ty) break;
    const e2 = 2 * error;
    if (e2 >= dy) { error += dy; x += sx; }
    if (e2 <= dx) { error += dx; y += sy; }
  }
  return cells;
}

