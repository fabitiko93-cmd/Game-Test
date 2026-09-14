import { COLORS, VIEW } from "./config.js?v=9";
import { activeWeapon, itemDefinition } from "./inventory.js?v=9";
import { VISION, visionGeometry } from "./perception.js?v=9";
import { clamp, hash2, lerp } from "./util.js?v=9";

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false });
    this.width = 1;
    this.height = 1;
    this.scale = 1;
    this.camera = { x: 0, y: 0 };
    this.cameraTarget = { x: 0, y: 0 };
    this.cameraFollowing = true;
    this.cameraPanning = false;
    this.hotspots = [];
    this.particles = [];
    this.tracers = [];
    this.selectedId = null;
    this.destination = null;
    this.destinationRun = false;
    this.invalidDestination = null;
    this.contextId = null;
    this.frame = 0;
    this.visionCache = new Map();
    this.coverHintCache = { key: "", objects: [] };
    this.diagnostics = false;
    this.metrics = { fps: 0, frames: 0, time: 0, visibleTiles: 0, visibleObjects: 0 };
    this.backgroundGradient = null;
    this.vignetteGradient = null;
    this.streetlightGlow = this.createGlowSprite(70, "238,194,111", .22);
    this.playerGlow = this.createGlowSprite(130, "220,181,105", .1);
    this.resize();
    window.addEventListener("resize", () => this.resize());
    window.visualViewport?.addEventListener("resize", () => this.resize());
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.scale = Math.min(window.devicePixelRatio || 1, VIEW.pixelRatioMax);
    this.width = Math.max(1, rect.width);
    this.height = Math.max(1, rect.height);
    this.canvas.width = Math.floor(this.width * this.scale);
    this.canvas.height = Math.floor(this.height * this.scale);
    this.ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    this.ctx.imageSmoothingEnabled = false;
    this.backgroundGradient = this.ctx.createLinearGradient(0, 0, 0, this.height);
    this.backgroundGradient.addColorStop(0, "#17231d");
    this.backgroundGradient.addColorStop(1, "#0b100d");
    this.vignetteGradient = this.ctx.createRadialGradient(
      this.width / 2,
      this.height / 2,
      Math.min(this.width, this.height) * .25,
      this.width / 2,
      this.height / 2,
      Math.max(this.width, this.height) * .7,
    );
    this.vignetteGradient.addColorStop(0, "rgba(0,0,0,0)");
    this.vignetteGradient.addColorStop(1, "rgba(0,0,0,.46)");
    this.clampCamera();
  }

  createGlowSprite(radius, color, alpha) {
    const sprite = document.createElement("canvas");
    sprite.width = radius * 2;
    sprite.height = radius * 2;
    const context = sprite.getContext("2d");
    const gradient = context.createRadialGradient(radius, radius, 2, radius, radius, radius);
    gradient.addColorStop(0, `rgba(${color},${alpha})`);
    gradient.addColorStop(1, `rgba(${color},0)`);
    context.fillStyle = gradient;
    context.fillRect(0, 0, sprite.width, sprite.height);
    return sprite;
  }

  rawIso(x, y, z = 0) {
    return { x: (x - y) * VIEW.tileW * .5, y: (x + y) * VIEW.tileH * .5 - z };
  }

  iso(x, y, z = 0) {
    const p = this.rawIso(x, y, z);
    return { x: p.x - this.camera.x + this.width * .5, y: p.y - this.camera.y + this.height * .5 };
  }

  screenToWorld(x, y) {
    const rx = x - this.width * .5 + this.camera.x;
    const ry = y - this.height * .5 + this.camera.y;
    return { x: ry / VIEW.tileH + rx / VIEW.tileW, y: ry / VIEW.tileH - rx / VIEW.tileW };
  }

  follow(player, snap = false) {
    if (!this.cameraFollowing && !snap) return;
    if (snap) this.cameraFollowing = true;
    const p = this.rawIso(player.x, player.y, 0);
    this.cameraTarget.x = p.x;
    this.cameraTarget.y = p.y - 34;
    const amount = snap ? 1 : .105;
    this.camera.x = lerp(this.camera.x, this.cameraTarget.x, amount);
    this.camera.y = lerp(this.camera.y, this.cameraTarget.y, amount);
    this.clampCamera();
  }

  beginPan() {
    this.cameraFollowing = false;
    this.cameraPanning = true;
  }

  panBy(dx, dy) {
    if (!this.cameraPanning) return;
    this.camera.x -= dx;
    this.camera.y -= dy;
    this.clampCamera();
  }

  endPan() {
    this.cameraPanning = false;
  }

  recenter(player, snap = false) {
    this.cameraFollowing = true;
    this.cameraPanning = false;
    this.follow(player, snap);
  }

  clampCamera() {
    const corners = [
      this.rawIso(1, 1), this.rawIso(VIEW.worldW - 2, 1),
      this.rawIso(VIEW.worldW - 2, VIEW.worldH - 2), this.rawIso(1, VIEW.worldH - 2),
    ];
    const xs = corners.map(point => point.x);
    const ys = corners.map(point => point.y);
    const minX = Math.min(...xs) + this.width * .5 - VIEW.tileW;
    const maxX = Math.max(...xs) - this.width * .5 + VIEW.tileW;
    const minY = Math.min(...ys) + this.height * .5 - VIEW.tileH * 1.5;
    const maxY = Math.max(...ys) - this.height * .5 + VIEW.tileH * 1.5;
    this.camera.x = minX > maxX ? (minX + maxX) * .5 : clamp(this.camera.x, minX, maxX);
    this.camera.y = minY > maxY ? (minY + maxY) * .5 : clamp(this.camera.y, minY, maxY);
  }

  render(game, delta) {
    this.frame++;
    this.updateMetrics(delta);
    if (this.invalidDestination) {
      this.invalidDestination.life -= delta;
      if (this.invalidDestination.life <= 0) this.invalidDestination = null;
    }
    this.updateParticles(delta);
    this.updateTracers(delta);
    this.follow(game.player);
    const ctx = this.ctx;
    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    ctx.fillStyle = this.backgroundGradient || "#101a15";
    ctx.fillRect(0, 0, this.width, this.height);
    this.hotspots.length = 0;

    this.drawGround(game.world, game.minutes);
    this.drawBlood(game.world);
    this.drawPlayerNoise(game);
    this.drawCoverHints(game);
    this.drawVisionCones(game);
    this.drawDestination();
    this.contextId = game.contextObject()?.id || null;

    const drawables = [];
    const bounds = this.visibleWorldBounds(4);
    for (const object of game.world.objectsInBounds(bounds.minX, bounds.minY, bounds.maxX, bounds.maxY)) {
      const p = this.iso(object.x, object.y);
      if (p.x >= -130 && p.x <= this.width + 130 && p.y >= -160 && p.y <= this.height + 100) {
        drawables.push({ kind: "object", ref: object, depth: object.x + object.y });
      }
    }
    for (const zombie of game.zombies) {
      if (zombie.removed) continue;
      const p = this.iso(zombie.x, zombie.y);
      if (p.x >= -130 && p.x <= this.width + 130 && p.y >= -160 && p.y <= this.height + 100) {
        drawables.push({ kind: "zombie", ref: zombie, depth: zombie.x + zombie.y + .06 });
      }
    }
    drawables.push({ kind: "player", ref: game.player, depth: game.player.x + game.player.y + .08 });
    drawables.sort((a, b) => a.depth - b.depth);
    this.metrics.visibleObjects = drawables.length;

    for (const drawable of drawables) {
      if (drawable.kind === "object") this.drawObject(drawable.ref, game);
      else if (drawable.kind === "zombie") this.drawZombie(drawable.ref, game);
      else this.drawPlayer(drawable.ref, game);
    }

    this.drawRoofs(game);
    this.drawParticles();
    this.drawTracers();
    this.drawNoiseHints(game.world);
    this.drawLighting(game);
    this.drawVignette();
  }

  visibleWorldBounds(padding = 2) {
    const corners = [
      this.screenToWorld(-VIEW.tileW, -VIEW.tileH),
      this.screenToWorld(this.width + VIEW.tileW, -VIEW.tileH),
      this.screenToWorld(this.width + VIEW.tileW, this.height + VIEW.tileH),
      this.screenToWorld(-VIEW.tileW, this.height + VIEW.tileH),
    ];
    return {
      minX: clamp(Math.floor(Math.min(...corners.map(point => point.x))) - padding, 0, VIEW.worldW - 1),
      minY: clamp(Math.floor(Math.min(...corners.map(point => point.y))) - padding, 0, VIEW.worldH - 1),
      maxX: clamp(Math.ceil(Math.max(...corners.map(point => point.x))) + padding, 0, VIEW.worldW - 1),
      maxY: clamp(Math.ceil(Math.max(...corners.map(point => point.y))) + padding, 0, VIEW.worldH - 1),
    };
  }

  updateMetrics(delta) {
    this.metrics.frames += 1;
    this.metrics.time += delta;
    if (this.metrics.time >= .5) {
      this.metrics.fps = Math.round(this.metrics.frames / this.metrics.time);
      this.metrics.frames = 0;
      this.metrics.time = 0;
    }
  }

  toggleDiagnostics() {
    this.diagnostics = !this.diagnostics;
    return this.diagnostics;
  }

  diagnosticsText() {
    return `${this.metrics.fps || "–"} FPS · ${this.metrics.visibleTiles} TILES · ${this.metrics.visibleObjects} OBJEKTE · DPR ${this.scale.toFixed(1)}`;
  }

  drawGround(world, minutes) {
    const ctx = this.ctx;
    const bounds = this.visibleWorldBounds(1);
    let visibleTiles = 0;
    for (let y = bounds.minY; y <= bounds.maxY; y++) {
      for (let x = bounds.minX; x <= bounds.maxX; x++) {
        const p = this.iso(x, y);
        if (p.x < -VIEW.tileW || p.x > this.width + VIEW.tileW || p.y < -VIEW.tileH || p.y > this.height + VIEW.tileH) continue;
        visibleTiles += 1;
        const type = world.tiles[y][x];
        const palette = COLORS[type] || COLORS.grass;
        const variant = Math.floor(hash2(x, y, world.seed) * palette.length) % palette.length;
        let color = palette[variant];
        if (type === "water") {
          const wave = Math.sin((x + y) * .7 + this.frame * .025) * 7;
          color = this.shiftColor(color, wave);
        }
        this.diamond(p.x, p.y, VIEW.tileW + .8, VIEW.tileH + .8, color);
        if (type === "road") this.drawRoadMark(x, y);
        else if (type === "grass" && hash2(x * 9, y * 11, world.seed) > .74) this.drawGrass(p, hash2(x, y, 7));
        else if (["floor", "pharmacyFloor", "policeFloor", "clubFloor"].includes(type)) this.drawFloorSeam(p, x, y, type);
      }
    }
    this.metrics.visibleTiles = visibleTiles;
  }

  diamond(x, y, w, h, fill, stroke = null) {
    const ctx = this.ctx;
    ctx.beginPath(); ctx.moveTo(x, y - h / 2); ctx.lineTo(x + w / 2, y); ctx.lineTo(x, y + h / 2); ctx.lineTo(x - w / 2, y); ctx.closePath();
    ctx.fillStyle = fill; ctx.fill();
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
  }

  drawRoadMark(x, y) {
    const ctx = this.ctx;
    if (x === 31 && (y < 17 || y > 23) && y % 3 !== 0) {
      const a = this.iso(x + .33, y + .33), b = this.iso(x + .67, y + .67);
      ctx.strokeStyle = "rgba(211,201,155,.5)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke();
    }
    if (y === 20 && (x < 28 || x > 34) && x % 3 !== 0) {
      const a = this.iso(x + .33, y + .67), b = this.iso(x + .67, y + .33);
      ctx.strokeStyle = "rgba(211,201,155,.5)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke();
    }
  }

  drawGrass(p, variation) {
    const ctx = this.ctx;
    ctx.strokeStyle = variation > .5 ? "rgba(31,55,34,.5)" : "rgba(101,119,82,.35)";
    ctx.lineWidth = 1; ctx.beginPath();
    const ox = (variation - .5) * 34;
    ctx.moveTo(p.x + ox, p.y + 4); ctx.lineTo(p.x + ox - 2, p.y - 2);
    ctx.moveTo(p.x + ox, p.y + 4); ctx.lineTo(p.x + ox + 3, p.y - 1); ctx.stroke();
  }

  drawFloorSeam(p, x, y, type) {
    const ctx = this.ctx;
    ctx.strokeStyle = type === "pharmacyFloor" ? "rgba(36,50,42,.18)" : "rgba(42,36,27,.17)";
    ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(p.x, p.y - 16); ctx.lineTo(p.x + 32, p.y); ctx.lineTo(p.x, p.y + 16); ctx.stroke();
    if ((x + y) % 2 === 0) { ctx.fillStyle = "rgba(255,255,255,.025)"; ctx.fillRect(p.x - 1, p.y - 1, 2, 2); }
  }

  drawObject(o, game) {
    const selected = this.selectedId === o.id;
    if (selected) this.drawSelection(o.x, o.y, o.solid ? .58 : .42);
    switch (o.type) {
      case "wall": this.drawBlock(o.x, o.y, .96, .96, 42, o.color || "#70695c"); break;
      case "door": this.drawDoor(o); break;
      case "tree": this.drawTree(o); break;
      case "bush": this.drawBush(o); break;
      case "cabinet": this.drawFurniture(o, "#70553d", 19, .7, .48); break;
      case "fridge": this.drawFurniture(o, "#c0c1ad", 31, .58, .6); break;
      case "shelf": this.drawShelf(o); break;
      case "toolbox": this.drawFurniture(o, "#6f2d28", 11, .62, .46); break;
      case "desk": this.drawFurniture(o, "#51483b", 18, .86, .58); break;
      case "locker": this.drawFurniture(o, "#59625d", 34, .58, .48); break;
      case "gunlocker": this.drawFurniture(o, o.locked ? "#4c5550" : "#626d65", 37, .68, .48); break;
      case "counter": this.drawFurniture(o, "#544b3b", 19, .88, .5); break;
      case "bed": this.drawBed(o); break;
      case "radio": this.drawRadio(o); break;
      case "corpse": this.drawCorpse(o); break;
      case "groundloot": this.drawGroundLoot(o); break;
      case "car": this.drawCar(o); break;
      case "shed": this.drawShed(o); break;
      case "fence": this.drawFence(o); break;
      case "streetlamp": this.drawStreetlamp(o); break;
      case "busstop": this.drawBusStop(o); break;
      case "sign": this.drawSign(o); break;
      default: break;
    }
    if (o.interactable) {
      const hitZ = o.type === "corpse" || o.type === "groundloot" ? 7 : o.type === "radio" ? 12 : 19;
      const p = this.iso(o.x, o.y, hitZ);
      const radius = o.type === "door" ? 38 : o.type === "corpse" ? 36 : 34;
      this.hotspots.push({ id: o.id, kind: "object", ref: o, x: p.x, y: p.y, radius });
      if (this.contextId === o.id) this.drawContextMarker(p.x, p.y - 10);
    }
  }

  drawBlock(x, y, w, d, height, color) {
    const ctx = this.ctx;
    const a = this.iso(x - w/2, y - d/2), b = this.iso(x + w/2, y - d/2), c = this.iso(x + w/2, y + d/2), dP = this.iso(x - w/2, y + d/2);
    const at = this.iso(x - w/2, y - d/2, height), bt = this.iso(x + w/2, y - d/2, height), ct = this.iso(x + w/2, y + d/2, height), dt = this.iso(x - w/2, y + d/2, height);
    ctx.fillStyle = this.shiftColor(color, -20); ctx.beginPath(); ctx.moveTo(dP.x,dP.y); ctx.lineTo(c.x,c.y); ctx.lineTo(ct.x,ct.y); ctx.lineTo(dt.x,dt.y); ctx.closePath(); ctx.fill();
    ctx.fillStyle = this.shiftColor(color, -8); ctx.beginPath(); ctx.moveTo(b.x,b.y); ctx.lineTo(c.x,c.y); ctx.lineTo(ct.x,ct.y); ctx.lineTo(bt.x,bt.y); ctx.closePath(); ctx.fill();
    ctx.fillStyle = this.shiftColor(color, 12); ctx.beginPath(); ctx.moveTo(at.x,at.y); ctx.lineTo(bt.x,bt.y); ctx.lineTo(ct.x,ct.y); ctx.lineTo(dt.x,dt.y); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "rgba(14,17,14,.28)"; ctx.lineWidth = 1; ctx.stroke();
  }

  drawDoor(o) {
    if (!o.closed) {
      const p = this.iso(o.x, o.y);
      this.ctx.strokeStyle = "rgba(105,75,48,.9)"; this.ctx.lineWidth = 5;
      this.ctx.beginPath(); this.ctx.moveTo(p.x, p.y); this.ctx.lineTo(p.x + (o.orientation === "x" ? 21 : -21), p.y - 11); this.ctx.stroke();
      return;
    }
    this.drawBlock(o.x, o.y, o.orientation === "x" ? .78 : .14, o.orientation === "x" ? .14 : .78, 35, "#694b35");
    const p = this.iso(o.x, o.y, 20); this.ctx.fillStyle = o.locked ? "#b44a3d" : "#c3a55b"; this.ctx.fillRect(p.x + 4, p.y, 3, 3);
    if (o.locked) {
      this.ctx.fillStyle = "#271713";
      this.ctx.fillRect(p.x + 3, p.y - 1, 5, 5);
      this.ctx.fillStyle = "#c3a55b";
      this.ctx.fillRect(p.x + 5, p.y, 1, 3);
    }
  }

  shadow(p, rx, ry, alpha = .25) {
    const ctx = this.ctx; ctx.fillStyle = `rgba(0,0,0,${alpha})`; ctx.beginPath(); ctx.ellipse(p.x, p.y + 2, rx, ry, 0, 0, Math.PI*2); ctx.fill();
  }

  drawTree(o) {
    const ctx = this.ctx, p = this.iso(o.x, o.y);
    this.shadow(p, 25, 9, .31);
    ctx.fillStyle = "#4f3828"; ctx.fillRect(p.x - 4, p.y - 42, 8, 44);
    ctx.fillStyle = "#2a3d2d"; ctx.beginPath(); ctx.arc(p.x-10,p.y-51,17,0,Math.PI*2); ctx.arc(p.x+7,p.y-60,21,0,Math.PI*2); ctx.arc(p.x+15,p.y-42,18,0,Math.PI*2); ctx.fill();
    ctx.fillStyle = o.variant === 1 ? "#41543e" : "#354a36"; ctx.beginPath(); ctx.arc(p.x-3,p.y-61,17,0,Math.PI*2); ctx.arc(p.x+14,p.y-55,13,0,Math.PI*2); ctx.fill();
    ctx.fillStyle = "rgba(139,151,104,.24)"; ctx.fillRect(p.x-10,p.y-70,13,4);
  }

  drawBush(o) {
    const ctx = this.ctx, p = this.iso(o.x,o.y); this.shadow(p,17,6,.22);
    ctx.fillStyle = o.variant ? "#384a34" : "#42533c"; ctx.beginPath(); ctx.arc(p.x-8,p.y-11,10,0,Math.PI*2); ctx.arc(p.x+4,p.y-15,13,0,Math.PI*2); ctx.arc(p.x+12,p.y-8,9,0,Math.PI*2); ctx.fill();
  }

  drawFurniture(o, color, height, w, d) {
    const p = this.iso(o.x,o.y); this.shadow(p,17,6,.25); this.drawBlock(o.x,o.y,w,d,height,color);
    if (o.interactable) { const h = this.iso(o.x,o.y,height*.55); this.ctx.fillStyle="#b49a62"; this.ctx.fillRect(h.x+3,h.y,3,2); }
  }

  drawShelf(o) {
    this.drawBlock(o.x,o.y,.72,.38,27,"#76684d");
    const ctx=this.ctx,p=this.iso(o.x,o.y,17); ctx.strokeStyle="#302b24";ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(p.x-12,p.y+6);ctx.lineTo(p.x+12,p.y-6);ctx.stroke();
    ctx.fillStyle="#99443c";ctx.fillRect(p.x-6,p.y-2,4,5);ctx.fillStyle="#637f76";ctx.fillRect(p.x+2,p.y-5,4,5);
  }

  drawBed(o) {
    const p=this.iso(o.x,o.y);this.shadow(p,24,8,.24);this.drawBlock(o.x,o.y,.75,1.25,8,"#5f665d");
    const head=this.iso(o.x-.22,o.y-.34,10);this.ctx.fillStyle="#c4bfa6";this.ctx.beginPath();this.ctx.ellipse(head.x,head.y,11,5,-.45,0,Math.PI*2);this.ctx.fill();
  }

  drawRadio(o) {
    this.drawBlock(o.x,o.y,.45,.34,16,"#423e35");
    const p=this.iso(o.x,o.y,12),ctx=this.ctx;ctx.strokeStyle="#b9ae8b";ctx.beginPath();ctx.arc(p.x,p.y-9,10,Math.PI,Math.PI*2);ctx.stroke();ctx.fillStyle="#7f362f";ctx.fillRect(p.x+5,p.y-1,3,3);
  }

  drawCorpse(o) {
    const p=this.iso(o.x,o.y),ctx=this.ctx;this.shadow(p,20,7,.3);
    ctx.save();ctx.translate(p.x,p.y-3);ctx.rotate(-.43);ctx.fillStyle="#38473d";ctx.fillRect(-16,-5,25,10);ctx.fillStyle="#b18a6e";ctx.beginPath();ctx.arc(13,0,6,0,Math.PI*2);ctx.fill();ctx.strokeStyle="#262b27";ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(-9,2);ctx.lineTo(-18,10);ctx.moveTo(-7,-2);ctx.lineTo(-17,-10);ctx.stroke();ctx.restore();
  }

  drawGroundLoot(o) {
    const p=this.iso(o.x,o.y),ctx=this.ctx;this.shadow(p,12,4,.3);
    ctx.fillStyle="#706247";ctx.beginPath();ctx.moveTo(p.x-10,p.y);ctx.lineTo(p.x-7,p.y-13);ctx.lineTo(p.x+7,p.y-13);ctx.lineTo(p.x+11,p.y);ctx.closePath();ctx.fill();
    ctx.strokeStyle="#aa986d";ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(p.x-5,p.y-12);ctx.quadraticCurveTo(p.x,p.y-19,p.x+5,p.y-12);ctx.stroke();
  }

  drawCar(o) {
    const ctx=this.ctx,p=this.iso(o.x,o.y);this.shadow(p,36,12,.35);
    const w=o.orientation==="x"?1.55:.86,d=o.orientation==="x"?.86:1.55;
    this.drawBlock(o.x,o.y,w,d,18,o.color);
    this.drawBlock(o.x,o.y,w*.62,d*.62,30,this.shiftColor(o.color,10));
    const wind=this.iso(o.x,o.y,28);ctx.fillStyle="rgba(120,151,153,.65)";ctx.fillRect(wind.x-10,wind.y-3,20,5);
    ctx.fillStyle="#171a18";ctx.fillRect(p.x-25,p.y-1,10,4);ctx.fillRect(p.x+15,p.y-1,10,4);
  }

  drawShed(o) {
    const color = o.color || "#675742";
    this.drawBlock(o.x, o.y, 1.28, 0.96, 23, color);
    const p = this.iso(o.x, o.y, 24);
    this.ctx.fillStyle = "#3a3025";
    this.ctx.fillRect(p.x - 6, p.y - 9, 12, 8);
  }

  drawFence(o) {
    const width = o.orientation === "x" ? 1.38 : 0.16;
    const depth = o.orientation === "x" ? 0.16 : 1.38;
    this.drawBlock(o.x, o.y, width, depth, 10, o.color || "#5b5343");
  }

  drawStreetlamp(o) {
    const p=this.iso(o.x,o.y),ctx=this.ctx;this.shadow(p,8,3,.2);ctx.strokeStyle="#313631";ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(p.x,p.y-57);ctx.lineTo(p.x+8,p.y-57);ctx.stroke();ctx.fillStyle="#d8c278";ctx.fillRect(p.x+5,p.y-60,8,5);
  }

  drawBusStop(o) {
    const p=this.iso(o.x,o.y),ctx=this.ctx;ctx.strokeStyle="#8b938a";ctx.lineWidth=3;ctx.strokeRect(p.x-20,p.y-35,36,34);ctx.fillStyle="rgba(94,126,130,.24)";ctx.fillRect(p.x-18,p.y-33,32,30);ctx.fillStyle="#38765b";ctx.fillRect(p.x-10,p.y-29,17,13);
  }

  drawSign(o) {
    const p=this.iso(o.x,o.y),ctx=this.ctx;ctx.strokeStyle="#343b35";ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(p.x,p.y-28);ctx.stroke();ctx.fillStyle=o.name==="APOTHEKE"?"#d7ddd1":"#d3b65e";ctx.fillRect(p.x-22,p.y-38,44,13);ctx.fillStyle="#26352c";ctx.font="bold 6px monospace";ctx.textAlign="center";ctx.fillText(o.name,p.x,p.y-29);
  }

  drawSelection(x,y,r=.5) {
    const p=this.iso(x,y),ctx=this.ctx;ctx.strokeStyle="#d6bd72";ctx.lineWidth=2;ctx.globalAlpha=.72+.2*Math.sin(this.frame*.12);ctx.beginPath();ctx.ellipse(p.x,p.y,r*33,r*14,0,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=1;
  }

  drawContextMarker(x,y) {
    const ctx=this.ctx;ctx.fillStyle="#e9dfb9";ctx.globalAlpha=.75+.2*Math.sin(this.frame*.1);ctx.beginPath();ctx.moveTo(x,y-7);ctx.lineTo(x+5,y);ctx.lineTo(x,y+7);ctx.lineTo(x-5,y);ctx.closePath();ctx.fill();ctx.globalAlpha=1;
  }

  drawPlayer(player, game) {
    const ctx = this.ctx;
    const p = this.withImpact(this.iso(player.x, player.y), player, .11);
    const crouched = player.stance === "sneak";
    const weapon = activeWeapon(player);
    const weaponDefinition = itemDefinition(weapon);
    const bodyOffset = crouched ? 7 : 0;
    const bob = player.moving ? Math.sin(this.frame * (player.running ? .44 : .3)) * (crouched ? .7 : 1.4) : 0;
    this.shadow(p, crouched ? 15 : 13, crouched ? 6 : 5, .38);
    ctx.save();
    ctx.translate(Math.round(p.x), Math.round(p.y + bob + bodyOffset));
    if (player.hurtFlash > 0) {
      const hitPulse = clamp((player.hurtFlash || 0) / 0.24, 0, 1);
      ctx.globalAlpha = clamp(1 - hitPulse * 0.28 + Math.sin(this.frame * 0.9) * hitPulse * 0.08, 0.62, 1);
    }
    if (player.dead) ctx.globalAlpha = .42;
    const dirX = Math.sign(player.facingX);
    const dirY = Math.sign(player.facingY);
    const legTop = crouched ? -5 : -7;
    ctx.strokeStyle = "#292e2a";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(-4, legTop);
    ctx.lineTo(-7 + dirX * 2, crouched ? 0 : 1);
    ctx.moveTo(4, legTop);
    ctx.lineTo(7 + dirX * 2, crouched ? 0 : 1);
    ctx.stroke();
    ctx.fillStyle = "#46564a";
    ctx.fillRect(-9, crouched ? -23 : -27, 18, crouched ? 18 : 20);
    ctx.fillStyle = "#26302a";
    ctx.fillRect(-9 + dirX * 2, crouched ? -19 : -22, 5, crouched ? 12 : 15);
    ctx.fillStyle = "#b78e6e";
    ctx.fillRect(-5 + dirX * 2, crouched ? -31 : -36, 10, 10);
    ctx.fillStyle = "#45392e";
    ctx.fillRect(-6 + dirX * 2, crouched ? -33 : -38, 12, 5);
    ctx.fillStyle = "#677064";
    ctx.fillRect(-11, crouched ? -22 : -25, 4, 14);
    ctx.fillRect(7, crouched ? -22 : -25, 4, 14);
    if (game.stealth?.state(game).hidden) {
      ctx.strokeStyle = "rgba(154,174,117,.9)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 2]);
      ctx.beginPath();
      ctx.ellipse(0, crouched ? -15 : -18, 14, crouched ? 18 : 22, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (weapon) {
      if (weaponDefinition.weaponKind === "firearm") {
        ctx.strokeStyle = "#343a35";
        ctx.lineWidth = weaponDefinition.hands === 2 ? 5 : 4;
        ctx.beginPath();
        ctx.moveTo(5, crouched ? -17 : -21);
        ctx.lineTo(22 + dirX * 7, (crouched ? -22 : -27) + dirY * 3);
        ctx.stroke();
        ctx.strokeStyle = "#8f7a56";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(3, crouched ? -15 : -18);
        ctx.lineTo(10, crouched ? -18 : -22);
        ctx.stroke();
      } else {
        ctx.strokeStyle = "#c7c4b4";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(8, crouched ? -16 : -19);
        ctx.lineTo(17 + dirX * 4, (crouched ? -25 : -31) + dirY * 2);
        ctx.stroke();
        ctx.strokeStyle = "#76543a";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(7, crouched ? -14 : -17);
        ctx.lineTo(11, crouched ? -19 : -22);
        ctx.stroke();
      }
    }
    if (player.combat?.attackTimer > 0 && weaponDefinition?.weaponKind !== "firearm") {
      ctx.strokeStyle = "rgba(232,225,196,.8)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(dirX * 5, crouched ? -13 : -17, 25, -1.2, 1);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawZombie(zombie) {
    const ctx = this.ctx;
    const p = this.withImpact(this.iso(zombie.x, zombie.y), zombie, .11);
    const bob = zombie.moving ? Math.sin(this.frame * .22 + zombie.phase) * 1.2 : 0;
    if (this.selectedId === zombie.id) this.drawSelection(zombie.x, zombie.y, .5);
    this.shadow(p, 13, 5, .4);
    ctx.save();
    ctx.translate(Math.round(p.x), Math.round(p.y + bob));
    if (zombie.hurtFlash > 0) ctx.globalAlpha = .55;
    ctx.strokeStyle = "#2f302b";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(-4, -7);
    ctx.lineTo(-7, 1);
    ctx.moveTo(4, -7);
    ctx.lineTo(7, 1);
    ctx.stroke();
    ctx.fillStyle = zombie.variant % 2 ? "#535b4d" : "#55504b";
    ctx.fillRect(-9, -27, 18, 20);
    ctx.fillStyle = "#77806b";
    ctx.fillRect(-5, -36, 10, 10);
    ctx.fillStyle = "#382e2a";
    ctx.fillRect(-6, -28, 4, 12);
    ctx.strokeStyle = "#777968";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-7, -23);
    ctx.lineTo(-16, -14);
    ctx.moveTo(7, -23);
    ctx.lineTo(16, -18);
    ctx.stroke();
    if (zombie.state === "chase") {
      ctx.fillStyle = "#b54a3e";
      ctx.fillRect(-4, -33, 2, 2);
      ctx.fillRect(3, -33, 2, 2);
    }
    ctx.restore();
    if (zombie.hp < zombie.maxHp) {
      ctx.fillStyle = "#160b0a";
      ctx.fillRect(p.x - 13, p.y - 46, 26, 3);
      ctx.fillStyle = "#a63b32";
      ctx.fillRect(p.x - 13, p.y - 46, 26 * zombie.hp / zombie.maxHp, 3);
    }
    if (zombie.state !== "idle") {
      ctx.font = "bold 13px monospace";
      ctx.textAlign = "center";
      ctx.fillStyle = zombie.state === "chase" ? "#e55749" : "#d5ba68";
      ctx.fillText(zombie.state === "chase" ? "!" : "?", p.x, p.y - 51);
      if (zombie.state !== "chase" && zombie.stimulus) {
        ctx.font = "bold 7px monospace";
        ctx.fillStyle = zombie.stimulus === "sound" ? "#88adb3" : "#d8c577";
        ctx.fillText(zombie.stimulus === "sound" ? "OHR" : "AUGE", p.x, p.y - 61);
      }
    }
    this.hotspots.push({ id: zombie.id, kind: "zombie", ref: zombie, x: p.x, y: p.y - 20, radius: 25 });
  }

  drawCoverHints(game) {
    const player = game.player;
    const inSneak = player.stance === "sneak";
    const stealthState = game.stealth?.state(game) || {};
    const hidden = stealthState.hidden;
    if (!inSneak && !hidden) return;
    const ctx = this.ctx;
    const cacheKey = `${Math.round(player.x)},${Math.round(player.y)}:${inSneak ? 1 : 0}:${hidden ? 1 : 0}:${stealthState.coverId || ""}`;
    if (this.coverHintCache.key !== cacheKey) {
      this.coverHintCache = {
        key: cacheKey,
        objects: game.world.objectsNear(player.x, player.y, 5.2)
          .filter(object => !object.removed && (object.cover || 0) >= 0.42),
      };
    }
    for (const object of this.coverHintCache.objects) {
      if (object.removed || (object.cover || 0) < 0.42) continue;
      const point = this.iso(object.x, object.y, 2);
      const distanceFactor = clamp(1 - Math.hypot(object.x - player.x, object.y - player.y) / 5.2, 0.18, 1);
      ctx.save();
      ctx.globalAlpha = (hidden && object.id === stealthState.coverId ? 0.7 : 0.2) * distanceFactor;
      ctx.strokeStyle = hidden && object.id === stealthState.coverId ? "#a4bb83" : "#c4a75e";
      ctx.lineWidth = object.id === stealthState.coverId ? 2 : 1;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.ellipse(point.x, point.y, 22, 9, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  withImpact(point, entity, amount) {
    if (!(entity.hitKick > 0)) return point;
    const offset = this.rawIso((entity.impactX || 0) * amount, (entity.impactY || 0) * amount);
    return { x: point.x + offset.x * entity.hitKick, y: point.y + offset.y * entity.hitKick };
  }

  drawVisionCones(game) {
    const ctx = this.ctx;
    const tacticalVision = game.player.stance === "sneak" || (game.player.skills?.perception || 0) >= 25;
    for (const zombie of game.zombies) {
      const visibleByState = zombie.state === "chase" || (zombie.stimulus === "vision" && (zombie.awareness || 0) >= .12);
      if (zombie.removed || (!tacticalVision && !visibleByState)) continue;
      const center = this.iso(zombie.x, zombie.y);
      if (center.x < -250 || center.x > this.width + 250 || center.y < -180 || center.y > this.height + 180) continue;
      const angle = Math.atan2(zombie.facingY || 1, zombie.facingX || 0);
      const geometry = visionGeometry(zombie, game.player, game.world, game.minutes);
      const cacheKey = `${Math.round(zombie.x * 4)},${Math.round(zombie.y * 4)},${Math.round(angle * 20)},${Math.round(geometry.range * 4)},${game.world.sightRevision}`;
      let cached = this.visionCache.get(zombie.id);
      if (!cached || cached.key !== cacheKey || this.frame - cached.frame > 10) {
        const points = [];
        for (let sample = 0; sample <= VISION.renderSamples; sample++) {
          const rayAngle = angle - geometry.halfAngle + geometry.halfAngle * 2 * sample / VISION.renderSamples;
          const rayDistance = game.world.sightDistance(zombie, rayAngle, geometry.range);
          points.push({
            x: zombie.x + Math.cos(rayAngle) * rayDistance,
            y: zombie.y + Math.sin(rayAngle) * rayDistance,
          });
        }
        cached = { key: cacheKey, frame: this.frame, points };
        this.visionCache.set(zombie.id, cached);
      }
      ctx.save();
      ctx.globalAlpha = zombie.state === "chase" ? .11 : (tacticalVision ? .065 : .04) + (zombie.awareness || 0) * .075;
      ctx.fillStyle = zombie.state === "chase" ? "#bc493e" : "#c8ac61";
      ctx.beginPath();
      ctx.moveTo(center.x, center.y);
      for (const point of cached.points) {
        const projected = this.iso(point.x, point.y);
        ctx.lineTo(projected.x, projected.y);
      }
      ctx.closePath();
      ctx.fill();
      if (tacticalVision) {
        ctx.globalAlpha = .18;
        ctx.strokeStyle = "#cfbd77";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(center.x, center.y, geometry.nearRadius * 32, geometry.nearRadius * 15, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  drawPlayerNoise(game) {
    if (game.player.stance !== "sneak" || !(game.player.noiseRadius > .05)) return;
    const point = this.iso(game.player.x, game.player.y);
    const radius = game.player.noiseRadius;
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = .16 + Math.min(.14, (game.player.noisePulse || 0) * .14);
    ctx.strokeStyle = "#83a9ae";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.ellipse(point.x, point.y, radius * 32, radius * 15, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  drawDestination() {
    const ctx = this.ctx;
    if (this.destination) {
      const p = this.iso(this.destination.x, this.destination.y);
      const pulse = .55 + Math.sin(this.frame * .12) * .18;
      ctx.save();
      ctx.globalAlpha = pulse;
      ctx.strokeStyle = this.destinationRun ? "#d29b55" : "#d5c685";
      ctx.lineWidth = this.destinationRun ? 2.2 : 1.5;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, this.destinationRun ? 17 : 13, this.destinationRun ? 8 : 6, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    if (this.invalidDestination) {
      const p = this.iso(this.invalidDestination.x, this.invalidDestination.y);
      ctx.save();
      ctx.globalAlpha = clamp(this.invalidDestination.life / .75, 0, 1);
      ctx.strokeStyle = "#db574c";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(p.x - 8, p.y - 5); ctx.lineTo(p.x + 8, p.y + 5);
      ctx.moveTo(p.x + 8, p.y - 5); ctx.lineTo(p.x - 8, p.y + 5);
      ctx.stroke();
      ctx.restore();
    }
  }

  rejectDestination(point) {
    this.invalidDestination = { x: point.x, y: point.y, life: .75 };
  }

  trace(start, end, hit = false) {
    this.tracers.push({
      x1: start.x,
      y1: start.y,
      x2: end.x,
      y2: end.y,
      life: .12,
      maxLife: .12,
      color: hit ? "#f0d68b" : "#d7c990",
    });
  }

  updateTracers(delta) {
    for (const tracer of this.tracers) tracer.life -= delta;
    this.tracers = this.tracers.filter(tracer => tracer.life > 0);
  }

  drawTracers() {
    const ctx = this.ctx;
    for (const tracer of this.tracers) {
      const from = this.iso(tracer.x1, tracer.y1, 23);
      const to = this.iso(tracer.x2, tracer.y2, 20);
      ctx.save();
      ctx.globalAlpha = clamp(tracer.life / tracer.maxLife, 0, 1);
      ctx.strokeStyle = tracer.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
      ctx.restore();
    }
  }

  drawRoofs(game) {
    const ctx=this.ctx;
    for(const b of game.world.buildings){
      const inside=game.world.insideBuilding(game.player,b.id);
      const a=this.iso(b.x-.15,b.y-.15,48),c=this.iso(b.x+b.w-.85,b.y+b.h-.85,48),right=this.iso(b.x+b.w-.85,b.y-.15,48),left=this.iso(b.x-.15,b.y+b.h-.85,48);
      ctx.save();ctx.globalAlpha=inside?.id === b.id ? .07 : .94;
      ctx.fillStyle=b.roof;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(right.x,right.y);ctx.lineTo(c.x,c.y);ctx.lineTo(left.x,left.y);ctx.closePath();ctx.fill();
      ctx.strokeStyle="rgba(214,211,187,.22)";ctx.lineWidth=2;ctx.stroke();
      if(!inside){ctx.strokeStyle="rgba(0,0,0,.18)";ctx.lineWidth=1;for(let i=1;i<5;i++){const t=i/5;ctx.beginPath();ctx.moveTo(lerp(a.x,left.x,t),lerp(a.y,left.y,t));ctx.lineTo(lerp(right.x,c.x,t),lerp(right.y,c.y,t));ctx.stroke();}}
      ctx.restore();
    }
  }

  drawBlood(world){const ctx=this.ctx;for(const b of world.blood){const p=this.iso(b.x,b.y);ctx.globalAlpha=clamp(b.life,0,1)*.55;ctx.fillStyle="#5d1918";ctx.beginPath();ctx.ellipse(p.x,p.y,b.size*11,b.size*4,b.rotation,0,Math.PI*2);ctx.fill();}ctx.globalAlpha=1;}

  drawNoiseHints(world){const ctx=this.ctx;for(const n of world.noises){if(n.kind==="step")continue;const p=this.iso(n.x,n.y);const progress=1-n.life/n.maxLife;ctx.globalAlpha=(1-progress)*.18;ctx.strokeStyle="#e5dcc0";ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(p.x,p.y,n.radius*32*progress,n.radius*14*progress,0,0,Math.PI*2);ctx.stroke();}ctx.globalAlpha=1;}

  drawLighting(game){
    const ctx=this.ctx;const angle=(game.minutes/1440)*Math.PI*2-Math.PI/2;const sun=clamp((Math.sin(angle)+.25)/1.25,0,1);const dark=.5*(1-sun);
    if(dark>.02){ctx.fillStyle=`rgba(13,24,31,${dark})`;ctx.fillRect(0,0,this.width,this.height);}
    ctx.globalCompositeOperation="screen";
    const bounds=this.visibleWorldBounds(3);
    for(const o of game.world.objectsInBounds(bounds.minX,bounds.minY,bounds.maxX,bounds.maxY)){if(o.removed||!o.light)continue;const p=this.iso(o.x,o.y,42);ctx.drawImage(this.streetlightGlow,p.x-70,p.y-70);}
    ctx.globalCompositeOperation="source-over";
    if(sun<.35){const p=this.iso(game.player.x,game.player.y,12);ctx.globalCompositeOperation="screen";ctx.drawImage(this.playerGlow,p.x-130,p.y-130);ctx.globalCompositeOperation="source-over";}
  }

  drawVignette(){const ctx=this.ctx;ctx.fillStyle=this.vignetteGradient||"rgba(0,0,0,.2)";ctx.fillRect(0,0,this.width,this.height);}

  burst(x,y,color="#b94138",count=8){for(let i=0;i<count;i++)this.particles.push({x,y,z:18+Math.random()*8,vx:(Math.random()-.5)*1.5,vy:(Math.random()-.5)*1.5,vz:18+Math.random()*15,life:.45+Math.random()*.25,maxLife:.7,size:1+Math.random()*2,color});}
  updateParticles(delta){for(const p of this.particles){p.x+=p.vx*delta;p.y+=p.vy*delta;p.z+=p.vz*delta;p.vz-=65*delta;p.life-=delta;}this.particles=this.particles.filter(p=>p.life>0);}
  drawParticles(){const ctx=this.ctx;for(const part of this.particles){const p=this.iso(part.x,part.y,Math.max(0,part.z));ctx.globalAlpha=clamp(part.life/part.maxLife,0,1);ctx.fillStyle=part.color;ctx.fillRect(p.x,p.y,part.size,part.size);}ctx.globalAlpha=1;}

  pick(screenX,screenY){let best=null,bestDist=Infinity;for(const h of this.hotspots){const d=Math.hypot(screenX-h.x,screenY-h.y);if(d<h.radius&&d<bestDist){best=h;bestDist=d;}}return best;}

  shiftColor(hex,amount){
    const clean=hex.replace("#","");if(clean.length!==6)return hex;
    const num=parseInt(clean,16),r=clamp((num>>16)+amount,0,255),g=clamp(((num>>8)&255)+amount,0,255),b=clamp((num&255)+amount,0,255);
    return `rgb(${r},${g},${b})`;
  }
}
