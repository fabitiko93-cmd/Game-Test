import { clamp, vibrate } from "./util.js";

export class InputController {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pointerId = null;
    this.origin = { x: 0, y: 0 };
    this.current = { x: 0, y: 0 };
    this.vector = { x: 0, y: 0, magnitude: 0 };
    this.startedAt = 0;
    this.travel = 0;
    this.runHeld = false;
    this.enabled = false;
    this.callbacks = {};
    this.joystick = document.querySelector("#joystick");
    this.knob = document.querySelector("#joy-knob");
    this.defaultJoystickStyle = this.joystick.getAttribute("style") || "";
    this.bind();
  }

  bind() {
    window.addEventListener("keydown", event => {
      const key = event.key.toLowerCase();
      this.keys.add(key);
      if (["arrowup","arrowdown","arrowleft","arrowright"," "].includes(key)) event.preventDefault();
      if (key === " " && !event.repeat) this.callbacks.attack?.();
      if (key === "e" && !event.repeat) this.callbacks.action?.();
      if (key === "i" && !event.repeat) this.callbacks.inventory?.();
      if (key === "escape" && !event.repeat) this.callbacks.pause?.();
    });
    window.addEventListener("keyup", event => this.keys.delete(event.key.toLowerCase()));

    this.canvas.addEventListener("pointerdown", event => this.pointerDown(event));
    this.canvas.addEventListener("pointermove", event => this.pointerMove(event));
    this.canvas.addEventListener("pointerup", event => this.pointerUp(event));
    this.canvas.addEventListener("pointercancel", event => this.pointerUp(event));
    this.canvas.addEventListener("contextmenu", event => event.preventDefault());

    this.button("attack-button", () => this.callbacks.attack?.());
    this.button("action-button", () => this.callbacks.action?.());
    this.button("inventory-button", () => this.callbacks.inventory?.());
    this.button("pause-button", () => this.callbacks.pause?.());

    const run = document.querySelector("#run-button");
    const stopRun = event => { event?.preventDefault(); this.runHeld = false; run.classList.remove("ready"); };
    run.addEventListener("pointerdown", event => {
      event.preventDefault(); event.stopPropagation(); this.runHeld = true; run.classList.add("ready"); vibrate(8);
    });
    for (const type of ["pointerup", "pointercancel", "pointerleave"]) run.addEventListener(type, stopRun);
  }

  button(id, callback) {
    const element = document.getElementById(id);
    element.addEventListener("pointerdown", event => {
      event.preventDefault(); event.stopPropagation();
      if (!this.enabled) return;
      callback(); vibrate(7);
    });
  }

  pointerDown(event) {
    if (!this.enabled || this.pointerId !== null) return;
    const rect = this.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    if (x > rect.width * .66) {
      this.callbacks.tap?.(x, y);
      return;
    }
    event.preventDefault();
    this.pointerId = event.pointerId;
    this.origin = { x, y };
    this.current = { x, y };
    this.startedAt = performance.now();
    this.travel = 0;
    this.canvas.setPointerCapture?.(event.pointerId);
    this.placeJoystick(x, y);
    this.joystick.classList.add("active");
    this.updateVector();
  }

  pointerMove(event) {
    if (!this.enabled || event.pointerId !== this.pointerId) return;
    event.preventDefault();
    const rect = this.canvas.getBoundingClientRect();
    const next = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    this.travel += Math.hypot(next.x - this.current.x, next.y - this.current.y);
    this.current = next;
    this.updateVector();
  }

  pointerUp(event) {
    if (event.pointerId !== this.pointerId) return;
    event.preventDefault();
    const held = performance.now() - this.startedAt;
    const wasTap = held < 220 && this.travel < 12;
    const tapPoint = { ...this.current };
    this.pointerId = null;
    this.vector = { x: 0, y: 0, magnitude: 0 };
    this.joystick.classList.remove("active");
    this.knob.style.transform = "translate(0px, 0px)";
    this.restoreJoystick();
    if (wasTap) this.callbacks.tap?.(tapPoint.x, tapPoint.y);
  }

  placeJoystick(x, y) {
    const size = this.joystick.offsetWidth || 122;
    const maxX = window.innerWidth * .58 - size;
    const maxY = window.innerHeight - size - 8;
    this.joystick.style.left = `${clamp(x - size / 2, 8, Math.max(8, maxX))}px`;
    this.joystick.style.top = `${clamp(y - size / 2, 8, Math.max(8, maxY))}px`;
    this.joystick.style.bottom = "auto";
  }

  restoreJoystick() {
    window.setTimeout(() => {
      if (this.pointerId !== null) return;
      this.joystick.setAttribute("style", this.defaultJoystickStyle);
    }, 130);
  }

  updateVector() {
    const dx = this.current.x - this.origin.x;
    const dy = this.current.y - this.origin.y;
    const length = Math.hypot(dx, dy);
    const max = 47;
    const magnitude = clamp(length / max, 0, 1);
    const nx = length ? dx / length : 0;
    const ny = length ? dy / length : 0;
    this.vector = { x: nx * magnitude, y: ny * magnitude, magnitude };
    const visual = Math.min(length, max);
    this.knob.style.transform = `translate(${nx * visual}px, ${ny * visual}px)`;
  }

  movement() {
    let x = this.vector.x;
    let y = this.vector.y;
    if (this.keys.has("a") || this.keys.has("arrowleft")) x -= 1;
    if (this.keys.has("d") || this.keys.has("arrowright")) x += 1;
    if (this.keys.has("w") || this.keys.has("arrowup")) y -= 1;
    if (this.keys.has("s") || this.keys.has("arrowdown")) y += 1;
    const magnitude = Math.min(1, Math.hypot(x, y));
    if (magnitude > 0) { x /= Math.hypot(x, y); y /= Math.hypot(x, y); }
    return { x, y, magnitude: Math.max(magnitude, this.vector.magnitude), run: this.runHeld || this.keys.has("shift") || this.vector.magnitude > .78 };
  }
}

