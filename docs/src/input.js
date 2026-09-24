import { vibrate } from "./util.js?v=12";

export const TAP_GESTURE = Object.freeze({
  doubleMs: 460,
  doubleDistance: 48,
  tapTravel: 20,
  holdTravel: 24,
  holdDelay: 245,
});

export function matchingTap(previous, current, now = performance.now()) {
  return Boolean(previous?.time)
    && now - previous.time < TAP_GESTURE.doubleMs
    && Math.hypot(current.x - previous.x, current.y - previous.y) < TAP_GESTURE.doubleDistance;
}

export class InputController {
  constructor(canvas) {
    this.canvas = canvas;
    this.enabled = false;
    this.callbacks = {};
    this.keys = new Set();
    this.pointers = new Map();
    this.primaryId = null;
    this.pointer = { x: 0, y: 0 };
    this.travel = 0;
    this.holding = false;
    this.holdRun = false;
    this.holdTimer = null;
    this.lastTap = { time: 0, x: 0, y: 0 };
    this.panning = false;
    this.panCentroid = null;
    this.suppressUntilClear = false;
    this.bind();
  }

  bind() {
    window.addEventListener("keydown", event => {
      const key = event.key.toLowerCase();
      this.keys.add(key);
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(key)) event.preventDefault();
      if (key === " " && !event.repeat) this.callbacks.combat?.();
      if (key === "e" && !event.repeat) this.callbacks.action?.();
      if (key === "x" && !event.repeat) this.callbacks.execute?.();
      if (key === "c" && !event.repeat) this.callbacks.stance?.();
      if (key === "r" && !event.repeat) this.callbacks.reload?.();
      if (key === "i" && !event.repeat) this.callbacks.inventory?.();
      if (key === "m" && !event.repeat) this.callbacks.mission?.();
      if (key === "k" && !event.repeat) this.callbacks.character?.();
      if (key === "f" && !event.repeat) this.callbacks.recenter?.();
      if (key === "escape" && !event.repeat) this.callbacks.pause?.();
    });
    window.addEventListener("keyup", event => this.keys.delete(event.key.toLowerCase()));
    window.addEventListener("blur", () => this.cancelPointer());

    this.canvas.addEventListener("pointerdown", event => this.pointerDown(event));
    this.canvas.addEventListener("pointermove", event => this.pointerMove(event));
    this.canvas.addEventListener("pointerup", event => this.pointerUp(event));
    this.canvas.addEventListener("pointercancel", event => this.pointerCancel(event));
    this.canvas.addEventListener("contextmenu", event => event.preventDefault());

    this.button("attack-button", () => this.callbacks.combat?.());
    this.button("action-button", () => this.callbacks.action?.());
    this.button("execute-button", () => this.callbacks.execute?.());
    this.button("stance-button", () => this.callbacks.stance?.());
    this.button("openfield-button", () => this.callbacks.openfield?.());
    this.button("reload-button", () => this.callbacks.reload?.());
    this.button("mission-button", () => this.callbacks.mission?.());
    this.button("status-button", () => this.callbacks.status?.());
    this.button("inventory-button", () => this.callbacks.inventory?.());
    this.button("character-button", () => this.callbacks.character?.());
    this.button("recenter-button", () => this.callbacks.recenter?.());
    this.button("pause-button", () => this.callbacks.pause?.());
  }

  button(id, callback) {
    const element = document.getElementById(id);
    if (!element) return;
    element.addEventListener("pointerdown", event => {
      event.preventDefault();
      event.stopPropagation();
      if (!this.enabled) return;
      callback();
      vibrate(7);
    });
  }

  coordinates(event) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  centroid() {
    const points = [...this.pointers.values()];
    if (!points.length) return null;
    return {
      x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
      y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
    };
  }

  pointerDown(event) {
    if (!this.enabled || (event.pointerType !== "touch" && event.button > 0)) return;
    event.preventDefault();
    const point = this.coordinates(event);
    this.pointers.set(event.pointerId, point);
    try {
      this.canvas.setPointerCapture?.(event.pointerId);
    } catch (_) {
      // Some embedded iOS browsers reject capture while changing gesture state.
    }

    if (this.pointers.size >= 2) {
      window.clearTimeout(this.holdTimer);
      if (this.holding) this.callbacks.holdEnd?.();
      this.holding = false;
      this.holdTimer = null;
      this.primaryId = null;
      this.panning = true;
      this.suppressUntilClear = true;
      this.panCentroid = this.centroid();
      this.callbacks.panStart?.();
      return;
    }

    if (this.panning || this.suppressUntilClear) return;
    this.primaryId = event.pointerId;
    this.pointer = point;
    this.travel = 0;
    this.holding = false;
    // Halten lenkt immer im Gehtempo. Rennen bleibt eine bewusste Doppel-Tipp-Aktion.
    this.holdRun = false;
    this.holdTimer = window.setTimeout(() => this.beginHold(event.pointerId), TAP_GESTURE.holdDelay);
  }

  beginHold(pointerId) {
    if (this.primaryId !== pointerId || this.travel > TAP_GESTURE.holdTravel || this.panning) return;
    this.holding = true;
    this.callbacks.holdStart?.(this.pointer.x, this.pointer.y, { run: this.holdRun });
    vibrate(5);
  }

  pointerMove(event) {
    if (!this.enabled || !this.pointers.has(event.pointerId)) return;
    event.preventDefault();
    const next = this.coordinates(event);
    this.pointers.set(event.pointerId, next);

    if (this.panning) {
      const centroid = this.centroid();
      if (centroid && this.panCentroid) this.callbacks.panMove?.(centroid.x - this.panCentroid.x, centroid.y - this.panCentroid.y);
      this.panCentroid = centroid;
      return;
    }

    if (event.pointerId !== this.primaryId || this.suppressUntilClear) return;
    this.travel += Math.hypot(next.x - this.pointer.x, next.y - this.pointer.y);
    this.pointer = next;
    if (!this.holding && this.travel > TAP_GESTURE.holdTravel) {
      window.clearTimeout(this.holdTimer);
      this.holding = true;
      this.callbacks.holdStart?.(next.x, next.y, { run: this.holdRun });
    }
    if (this.holding) this.callbacks.holdMove?.(next.x, next.y, { run: this.holdRun });
  }

  pointerUp(event) {
    if (!this.pointers.has(event.pointerId) && event.pointerId !== this.primaryId) return;
    event.preventDefault();
    const point = this.coordinates(event);
    this.pointers.delete(event.pointerId);

    if (this.panning) {
      if (this.pointers.size < 2) {
        this.panning = false;
        this.panCentroid = null;
        this.callbacks.panEnd?.();
      }
      if (!this.pointers.size) this.resetPointerState();
      return;
    }

    if (event.pointerId !== this.primaryId || this.suppressUntilClear) {
      if (!this.pointers.size) this.resetPointerState();
      return;
    }

    window.clearTimeout(this.holdTimer);
    const wasHolding = this.holding;
    const moved = this.travel;
    this.primaryId = null;
    this.holding = false;
    this.holdTimer = null;
    if (wasHolding) {
      this.callbacks.holdEnd?.();
      this.lastTap.time = 0;
      return;
    }
    if (moved > TAP_GESTURE.tapTravel) return;

    const now = performance.now();
    if (matchingTap(this.lastTap, point, now)) {
      this.callbacks.doubleTap?.(point.x, point.y);
      this.lastTap.time = 0;
    } else {
      this.callbacks.tap?.(point.x, point.y);
      this.lastTap = { time: now, x: point.x, y: point.y };
    }
  }

  resetPointerState() {
    window.clearTimeout(this.holdTimer);
    this.primaryId = null;
    this.holding = false;
    this.holdRun = false;
    this.holdTimer = null;
    this.suppressUntilClear = false;
  }

  pointerCancel(event) {
    this.cancelPointer();
  }

  cancelPointer() {
    window.clearTimeout(this.holdTimer);
    if (this.holding) this.callbacks.holdEnd?.();
    if (this.panning) this.callbacks.panEnd?.();
    this.pointers.clear();
    this.panning = false;
    this.panCentroid = null;
    this.resetPointerState();
  }

  keyboardMovement() {
    let x = 0;
    let y = 0;
    if (this.keys.has("a") || this.keys.has("arrowleft")) x -= 1;
    if (this.keys.has("d") || this.keys.has("arrowright")) x += 1;
    if (this.keys.has("w") || this.keys.has("arrowup")) y -= 1;
    if (this.keys.has("s") || this.keys.has("arrowdown")) y += 1;
    const magnitude = Math.hypot(x, y);
    if (magnitude) {
      x /= magnitude;
      y /= magnitude;
    }
    return { x, y, magnitude: Math.min(1, magnitude), run: this.keys.has("shift") };
  }
}
