import { vibrate } from "./util.js?v=4";

export class InputController {
  constructor(canvas) {
    this.canvas = canvas;
    this.enabled = false;
    this.callbacks = {};
    this.keys = new Set();
    this.pointerId = null;
    this.pointer = { x: 0, y: 0 };
    this.pointerStart = { x: 0, y: 0 };
    this.travel = 0;
    this.holding = false;
    this.holdTimer = null;
    this.lastTap = { time: 0, x: 0, y: 0 };
    this.bind();
  }

  bind() {
    window.addEventListener("keydown", event => {
      const key = event.key.toLowerCase();
      this.keys.add(key);
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(key)) event.preventDefault();
      if (key === " " && !event.repeat) this.callbacks.combat?.();
      if (key === "e" && !event.repeat) this.callbacks.action?.();
      if (key === "c" && !event.repeat) this.callbacks.stance?.();
      if (key === "r" && !event.repeat) this.callbacks.reload?.();
      if (key === "i" && !event.repeat) this.callbacks.inventory?.();
      if (key === "k" && !event.repeat) this.callbacks.character?.();
      if (key === "escape" && !event.repeat) this.callbacks.pause?.();
    });
    window.addEventListener("keyup", event => this.keys.delete(event.key.toLowerCase()));
    window.addEventListener("blur", () => this.cancelPointer());

    this.canvas.addEventListener("pointerdown", event => this.pointerDown(event));
    this.canvas.addEventListener("pointermove", event => this.pointerMove(event));
    this.canvas.addEventListener("pointerup", event => this.pointerUp(event));
    this.canvas.addEventListener("pointercancel", event => this.pointerUp(event));
    this.canvas.addEventListener("contextmenu", event => event.preventDefault());

    this.button("attack-button", () => this.callbacks.combat?.());
    this.button("action-button", () => this.callbacks.action?.());
    this.button("stance-button", () => this.callbacks.stance?.());
    this.button("reload-button", () => this.callbacks.reload?.());
    this.button("inventory-button", () => this.callbacks.inventory?.());
    this.button("character-button", () => this.callbacks.character?.());
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

  pointerDown(event) {
    if (!this.enabled || this.pointerId !== null || event.button > 0) return;
    event.preventDefault();
    this.pointerId = event.pointerId;
    this.pointer = this.coordinates(event);
    this.pointerStart = { ...this.pointer };
    this.travel = 0;
    this.holding = false;
    this.canvas.setPointerCapture?.(event.pointerId);
    this.holdTimer = window.setTimeout(() => {
      if (this.pointerId !== event.pointerId || this.travel > 24) return;
      this.holding = true;
      this.callbacks.holdStart?.(this.pointer.x, this.pointer.y);
      vibrate(5);
    }, 245);
  }

  pointerMove(event) {
    if (!this.enabled || event.pointerId !== this.pointerId) return;
    event.preventDefault();
    const next = this.coordinates(event);
    this.travel += Math.hypot(next.x - this.pointer.x, next.y - this.pointer.y);
    this.pointer = next;
    if (!this.holding && this.travel > 22) {
      window.clearTimeout(this.holdTimer);
      this.holding = true;
      this.callbacks.holdStart?.(next.x, next.y);
    }
    if (this.holding) this.callbacks.holdMove?.(next.x, next.y);
  }

  pointerUp(event) {
    if (event.pointerId !== this.pointerId) return;
    event.preventDefault();
    window.clearTimeout(this.holdTimer);
    const point = this.coordinates(event);
    const wasHolding = this.holding;
    const moved = this.travel;
    this.pointerId = null;
    this.holding = false;
    this.holdTimer = null;
    if (wasHolding) {
      this.callbacks.holdEnd?.();
      return;
    }
    if (moved > 18) return;

    const now = performance.now();
    const isDouble = now - this.lastTap.time < 330
      && Math.hypot(point.x - this.lastTap.x, point.y - this.lastTap.y) < 32;
    this.callbacks.tap?.(point.x, point.y);
    if (isDouble) {
      this.callbacks.doubleTap?.(point.x, point.y);
      this.lastTap.time = 0;
    } else {
      this.lastTap = { time: now, x: point.x, y: point.y };
    }
  }

  cancelPointer() {
    window.clearTimeout(this.holdTimer);
    if (this.holding) this.callbacks.holdEnd?.();
    this.pointerId = null;
    this.holding = false;
    this.holdTimer = null;
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
