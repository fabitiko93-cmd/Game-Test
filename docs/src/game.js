import { ZombieSystem, createInitialZombies } from "./ai.js?v=11";
import {
  backgroundName,
  createPlayer,
  gainSkill,
  inflictZombieAttack,
  skillValue,
  treatWound as treatWoundWithItem,
  treatWithItem,
  updateCharacter,
} from "./character.js?v=11";
import { CombatSystem } from "./combat.js?v=11";
import { GAME, STANCES } from "./config.js?v=11";
import { ITEMS } from "./data.js?v=11";
import {
  activeWeapon,
  addItem,
  ammoLabel,
  carryCapacity,
  compatibleMods,
  createItem,
  equipItem,
  findItem,
  installMod,
  inventoryWeight,
  itemDefinition,
  removeItem,
  removeMod,
  roundsInWeapon,
  unequipSlot,
} from "./inventory.js?v=11";
import { Navigator } from "./navigation.js?v=11";
import { missionAt, missionSteps } from "./missions.js?v=11";
import { awarenessForPlayer } from "./perception.js?v=11";
import { SaveStore } from "./save.js?v=11";
import { StealthSystem, ensureStealthState } from "./stealth.js?v=11";
import { clamp, distance, formatClock, vibrate } from "./util.js?v=11";

const deepCopy = value => JSON.parse(JSON.stringify(value));

export class Game {
  constructor(world, renderer, input, ui) {
    this.world = world;
    this.renderer = renderer;
    this.input = input;
    this.ui = ui;
    this.navigator = new Navigator();
    this.zombieSystem = new ZombieSystem(this.navigator);
    this.combat = new CombatSystem();
    this.stealth = new StealthSystem();
    this.saveStore = new SaveStore();
    this.player = createPlayer({ name: "Alex", background: "citizen" });
    ensureStealthState(this.player);
    this.zombies = createInitialZombies();
    this.minutes = GAME.startMinutes;
    this.mission = 0;
    this.survivorCount = 0;
    this.migrationTimer = GAME.migrationSeconds;
    this.started = false;
    this.running = false;
    this.paused = false;
    this.dead = false;
    this.lastFrame = performance.now();
    this.elapsed = 0;
    this.uiTick = 0;
    this.autosaveTick = 0;
    this.aiAccumulator = 0;
    this.lastAiResult = { nearbyUndetected: false };
    this.stepTimer = 0;
    this.holdBlocked = false;
    this.combatPathTick = 0;
    this.audio = null;
    this.random = () => this.world.random();
    this.bind();
    this.ui.setHasSave(this.saveStore.has());
  }

  bind() {
    this.input.callbacks = {
      combat: () => this.combat.toggle(this),
      action: () => this.primaryAction(),
      execute: () => this.executeAction(),
      stance: () => this.toggleStance(),
      reload: () => this.reload(),
      inventory: () => this.toggleInventory(),
      mission: () => this.toggleMission(),
      status: () => this.toggleStatus(),
      character: () => this.toggleCharacter(),
      recenter: () => this.recenterCamera(),
      pause: () => this.togglePause(),
      tap: (x, y) => this.tapWorld(x, y),
      doubleTap: (x, y) => this.doubleTapWorld(x, y),
      holdStart: (x, y, options) => this.startGuidedMovement(x, y, options),
      holdMove: (x, y, options) => this.updateGuidedMovement(x, y, options),
      holdEnd: () => this.endGuidedMovement(),
      panStart: () => this.startCameraPan(),
      panMove: (dx, dy) => this.panCamera(dx, dy),
      panEnd: () => this.endCameraPan(),
    };
    this.ui.callbacks = {
      start: () => this.requestStart(),
      fresh: () => this.requestFreshWorld(),
      createCharacter: profile => this.acceptCharacter(profile),
      continue: () => this.setPaused(false),
      reset: () => this.requestFreshWorld(),
      useItem: id => this.useItem(id),
      treatWound: (woundId, itemType) => this.treatWound(woundId, itemType),
      dropItem: id => this.dropItem(id),
      unequip: slot => this.unequip(slot),
      takeItem: (container, id) => this.takeItem(container, id),
      takeAll: container => this.takeAll(container),
      customize: id => this.openWeaponPanel(id),
      installMod: (weaponId, modId) => this.mountMod(weaponId, modId),
      removeMod: (weaponId, slot) => this.unmountMod(weaponId, slot),
      reloadWeapon: () => this.reload(),
      newSurvivor: () => this.requestSuccessor(),
      diagnostics: () => this.toggleDiagnostics(),
      panelClosed: () => {},
    };
    window.addEventListener("visibilitychange", () => {
      if (document.hidden && this.started) {
        this.save();
        if (!this.dead) this.setPaused(true);
      }
    });
    window.addEventListener("pagehide", () => {
      if (this.started) this.save();
    });
  }

  requestStart() {
    if (this.saveStore.has()) {
      this.start(true);
      return;
    }
    this.ui.showCharacterCreator({ survivorNumber: 1, continuing: false });
  }

  requestFreshWorld() {
    if (this.started && !window.confirm("DIE GESAMTE WELT UND ALLE ÜBERLEBENDEN LÖSCHEN?")) return;
    this.saveStore.clear();
    this.world.reset(GAME.seed);
    this.zombies = createInitialZombies();
    this.minutes = GAME.startMinutes;
    this.mission = 0;
    this.survivorCount = 0;
    this.migrationTimer = GAME.migrationSeconds;
    this.dead = false;
    this.paused = this.started;
    this.input.enabled = false;
    this.ui.hidePause();
    this.ui.hideDeath();
    this.ui.showCharacterCreator({ survivorNumber: 1, continuing: false });
  }

  requestSuccessor() {
    this.ui.hideDeath();
    this.ui.showCharacterCreator({ survivorNumber: this.survivorCount + 1, continuing: true });
  }

  acceptCharacter(profile) {
    const nextNumber = this.survivorCount + 1;
    const player = createPlayer({ ...profile, survivorNumber: nextNumber });
    ensureStealthState(player);
    if (nextNumber > 1) {
      const spawns = [{ x: 2, y: 20 }, { x: 45, y: 21 }, { x: 30, y: 45 }, { x: 30, y: 2 }];
      const safest = spawns
        .map(point => ({ point, danger: this.zombies.reduce((sum, zombie) => sum + (!zombie.removed && distance(point, zombie) < 7 ? 1 : 0), 0) }))
        .sort((a, b) => a.danger - b.danger)[0].point;
      player.x = safest.x;
      player.y = safest.y;
    }
    this.player = player;
    this.survivorCount = nextNumber;
    this.dead = false;
    this.player.dead = false;
    this.ui.hideCharacterCreator();
    this.ui.hideDeath();

    if (!this.started) {
      this.started = true;
      this.beginLoop();
    } else {
      this.input.enabled = true;
      this.paused = false;
      this.renderer.follow(this.player, true);
      this.ui.closeAllPanels();
      this.ui.refreshAll(this.player, this);
      this.ui.showMessage(`${this.player.name.toUpperCase()} BETRITT DEN SPERRKREIS`, 3);
    }
    this.save();
  }

  start(load = false) {
    if (this.started) return;
    if (load && !this.load()) {
      this.ui.showCharacterCreator({ survivorNumber: 1, continuing: false });
      return;
    }
    this.started = true;
    this.dead = Boolean(this.player.dead);
    this.beginLoop();
    if (this.dead) {
      this.input.enabled = false;
      this.ui.showDeath(this.player, this.minutes);
    } else {
      this.ui.showMessage("Die Stadt ist still. Zu still.", 3);
    }
  }

  beginLoop() {
    this.initAudio();
    this.renderer.follow(this.player, true);
    this.ui.enterGame();
    this.input.enabled = !this.dead;
    this.running = true;
    this.lastFrame = performance.now();
    this.ui.refreshAll(this.player, this);
    requestAnimationFrame(time => this.loop(time));
  }

  loop(now) {
    if (!this.running) return;
    const frameMilliseconds = now - this.lastFrame;
    const minimumFrame = 1000 / GAME.maxRenderFps - 1;
    if (frameMilliseconds < minimumFrame) {
      requestAnimationFrame(time => this.loop(time));
      return;
    }
    const delta = Math.min(0.05, Math.max(0, frameMilliseconds / 1000));
    this.lastFrame = now;
    if (!this.paused && !this.dead) this.update(delta);
    this.renderer.render(this, delta);
    this.uiTick -= delta;
    if (this.uiTick <= 0) {
      this.ui.update(this.player, this);
      this.uiTick = 0.1;
    }
    requestAnimationFrame(time => this.loop(time));
  }

  update(delta) {
    const gameDeltaMinutes = delta * GAME.timeScale;
    this.elapsed += delta;
    this.minutes += gameDeltaMinutes;
    this.world.update(delta);
    this.player.noisePulse = Math.max(0, this.player.noisePulse - delta * 0.65);
    this.player.hurtFlash = Math.max(0, (this.player.hurtFlash || 0) - delta);
    this.player.hitKick = Math.max(0, (this.player.hitKick || 0) - delta * 8);
    this.updateMovement(delta);
    this.combat.update(this, delta);
    this.aiAccumulator += delta;
    if (this.aiAccumulator >= GAME.aiStep) {
      const aiDelta = Math.min(0.1, this.aiAccumulator);
      this.aiAccumulator = 0;
      this.lastAiResult = this.zombieSystem.update(this, aiDelta);
    }
    this.stealth.update(this, delta);
    if (this.player.stance === "sneak" && this.player.moving && this.lastAiResult.nearbyUndetected) {
      gainSkill(this.player, "stealth", delta * 0.075);
    }
    this.updateNeeds(delta);
    const health = updateCharacter(this.player, delta, gameDeltaMinutes, this.minutes);
    this.player.bleeding = health.bleeding;
    this.updateMission();
    this.updateMigration(delta);
    if (health.dead || this.player.hp <= 0) this.die(this.player.deathCause || "DU BIST DEINEN VERLETZUNGEN ERLEGEN");
    this.autosaveTick += delta;
    if (this.autosaveTick >= GAME.autosaveSeconds) {
      this.save();
      this.autosaveTick = 0;
    }
  }

  updateMovement(delta) {
    const player = this.player;
    const keyboard = this.input.keyboardMovement();
    let dx = 0;
    let dy = 0;
    let moving = false;
    let requestedRun = false;

    if (keyboard.magnitude > 0) {
      player.navigation.path = [];
      player.navigation.destination = null;
      player.navigation.interactionId = null;
      player.navigation.manualUntil = this.elapsed + 0.9;
      dx = keyboard.y + keyboard.x;
      dy = keyboard.y - keyboard.x;
      const length = Math.hypot(dx, dy) || 1;
      dx /= length;
      dy /= length;
      moving = true;
      requestedRun = keyboard.run;
    } else {
      const target = this.combat.target(this);
      const weapon = activeWeapon(player);
      const stats = weapon ? itemDefinition(weapon) : null;
      if (target && stats?.weaponKind === "melee" && distance(player, target) <= (stats.range || 0.9) + 0.08
        && player.navigation.source === "combat") {
        this.clearNavigation();
      }

      const node = player.navigation.path?.[0];
      if (node) {
        const door = this.world.doorAtCell(node.x, node.y);
        if (door?.closed) {
          if (door.locked) {
            this.clearNavigation();
            this.renderer.selectedId = door.id;
            this.ui.showMessage("Die Tür ist verschlossen.", 1.4);
          } else if (distance(player, door) <= GAME.interactionRange + 0.2) {
            this.openDoor(door, true);
          }
        }
      }

      const next = player.navigation.path?.[0];
      if (next) {
        const tx = next.x - player.x;
        const ty = next.y - player.y;
        const length = Math.hypot(tx, ty);
        if (length < 0.13) {
          player.x = next.x;
          player.y = next.y;
          player.navigation.path.shift();
          if (!player.navigation.path.length) this.arriveAtDestination();
        } else {
          dx = tx / length;
          dy = ty / length;
          moving = true;
          requestedRun = player.navigation.runRequested;
        }
      }
    }

    const canRun = requestedRun && player.stance !== "sneak" && player.stamina > 4;
    const mode = player.stance === "sneak" ? "sneak" : canRun ? "run" : "walk";
    const stance = STANCES[mode];
    player.moving = moving;
    player.running = moving && mode === "run";
    if (moving) {
      player.facingX = dx;
      player.facingY = dy;
      const burden = inventoryWeight(player) / Math.max(1, carryCapacity(player));
      const burdenFactor = clamp(1.08 - burden * 0.16, 0.72, 1);
      const stealthFactor = 1 - skillValue(player, "stealth") * 0.003;
      const hiddenNoise = this.stealth.hiddenNoiseMultiplier(player);
      player.noiseRadius = stance.noise * stealthFactor * hiddenNoise;
      const previousX = player.x;
      const previousY = player.y;
      const moved = this.moveEntity(player, dx * stance.speed * burdenFactor * delta, dy * stance.speed * burdenFactor * delta, 0.27);
      this.stealth.onMove(this, Math.hypot(player.x - previousX, player.y - previousY), mode);
      if (!moved && player.navigation.path.length) {
        const interaction = this.world.objects.find(object => object.id === player.navigation.interactionId && !object.removed);
        if (interaction && distance(player, interaction) <= GAME.interactionRange + 0.2) this.arriveAtDestination();
        else this.clearNavigation();
      }
      player.stamina = clamp(player.stamina + stance.stamina * delta * (player.hunger < 20 ? 0.48 : 1), 0, 100);
      this.stepTimer -= delta;
      if (this.stepTimer <= 0) {
        const noise = stance.noise * stealthFactor * hiddenNoise;
        this.world.emitNoise(player.x, player.y, noise, "step", 1.1, 0.45);
        player.noisePulse = Math.max(player.noisePulse, clamp(noise / 7, 0, 1));
        this.stepTimer = mode === "run" ? 0.28 : mode === "sneak" ? 0.68 : 0.46;
      }
    } else {
      player.noiseRadius = Math.max(0, (player.noiseRadius || 0) - delta * 4.5);
      player.stamina = clamp(player.stamina + 10.5 * delta * (player.hunger < 20 ? 0.48 : 1), 0, 100);
      this.stepTimer = 0;
    }
  }

  updateNeeds(delta) {
    const infection = this.player.infectionStage || 0;
    this.player.hunger = Math.max(0, this.player.hunger - delta * (0.03 + (this.player.running ? 0.018 : 0)));
    this.player.thirst = Math.max(0, this.player.thirst - delta * (0.049 + (this.player.running ? 0.03 : 0) + infection * 0.05));
    if (this.player.hunger <= 0 || this.player.thirst <= 0) {
      this.player.hp = Math.max(0, this.player.hp - delta * 1.35);
      this.player.deathCause = this.player.thirst <= 0 ? "DU BIST VERDURSTET" : "DU BIST VERHUNGERT";
    }
  }

  updateMigration(delta) {
    this.migrationTimer -= delta;
    if (this.migrationTimer > 0) return;
    const active = this.zombies.filter(zombie => !zombie.removed).length;
    if (active < GAME.maxZombies) this.zombieSystem.spawnMigrant(this);
    this.migrationTimer = GAME.migrationSeconds * (0.82 + this.random() * 0.4);
  }

  attractMigration(amount = 8) {
    this.migrationTimer = Math.max(4, this.migrationTimer - amount);
  }

  moveEntity(entity, dx, dy, radius) {
    const nx = entity.x + dx;
    const ny = entity.y + dy;
    let moved = false;
    if (this.world.isWalkable(nx, entity.y, radius, entity.id)) {
      entity.x = nx;
      moved = true;
    }
    if (this.world.isWalkable(entity.x, ny, radius, entity.id)) {
      entity.y = ny;
      moved = true;
    }
    return moved;
  }

  setDestination(requestedPoint, options = {}) {
    if (!this.canAct()) return false;
    const point = this.world.clampPoint(requestedPoint);
    const navigation = this.player.navigation;
    const path = this.navigator.findPath(this.world, this.player, point, { allowDoors: true });
    const sameCell = Math.round(this.player.x) === Math.round(point.x) && Math.round(this.player.y) === Math.round(point.y);
    if (!path.length && !sameCell) {
      this.renderer.rejectDestination(point);
      this.ui.showMessage("Kein begehbarer Weg.", 1.1);
      return false;
    }
    navigation.path = path;
    navigation.destination = { x: Math.round(point.x), y: Math.round(point.y) };
    navigation.interactionId = options.interactionId || null;
    navigation.runRequested = Boolean(options.run);
    navigation.guided = Boolean(options.guided);
    navigation.source = options.source || "manual";
    if (navigation.source === "manual") navigation.manualUntil = this.elapsed + 1.25;
    this.renderer.destination = navigation.destination;
    this.renderer.destinationRun = navigation.runRequested;
    if (sameCell) this.arriveAtDestination();
    return true;
  }

  clearNavigation() {
    const navigation = this.player.navigation;
    navigation.path = [];
    navigation.destination = null;
    navigation.interactionId = null;
    navigation.runRequested = false;
    navigation.guided = false;
    navigation.source = null;
    this.renderer.destination = null;
    this.renderer.destinationRun = false;
  }

  arriveAtDestination() {
    const interactionId = this.player.navigation.interactionId;
    const wasGuided = this.player.navigation.guided;
    this.player.navigation.path = [];
    this.player.navigation.destination = null;
    this.player.navigation.interactionId = null;
    this.player.navigation.runRequested = false;
    this.renderer.destination = null;
    this.renderer.destinationRun = false;
    if (interactionId) {
      const object = this.world.objects.find(entry => entry.id === interactionId && !entry.removed);
      if (object) this.interact(object);
    } else if (!wasGuided) {
      this.player.navigation.source = null;
    }
  }

  queueInteraction(object) {
    if (!object?.interactable) return;
    this.renderer.selectedId = object.id;
    if (distance(this.player, object) <= GAME.interactionRange) {
      this.interact(object);
      return;
    }
    const path = this.navigator.pathToInteraction(this.world, this.player, object, {
      allowDoors: true,
      interactionRange: GAME.interactionRange,
    });
    if (!path.length) {
      this.renderer.rejectDestination(this.world.clampPoint(object));
      this.ui.showMessage("Kein Weg in Reichweite.", 1.2);
      return;
    }
    const destination = path[path.length - 1];
    this.player.navigation.path = path;
    this.player.navigation.destination = { ...destination };
    this.player.navigation.interactionId = object.id;
    this.player.navigation.runRequested = false;
    this.player.navigation.guided = false;
    this.player.navigation.source = "manual";
    this.player.navigation.manualUntil = this.elapsed + 1.25;
    this.renderer.destination = { ...destination };
    this.renderer.destinationRun = false;
    this.ui.showMessage(`GEHE ZU: ${object.name || "OBJEKT"}`, 1.1);
  }

  approachCombatTarget(target, range) {
    if (this.player.navigation.manualUntil > this.elapsed || this.player.navigation.guided) return;
    if (this.player.navigation.source === "combat" && this.player.navigation.path.length && this.elapsed < this.combatPathTick) return;
    if (distance(this.player, target) <= range + 0.04) return;
    const path = this.navigator.findPath(this.world, this.player, target, { allowDoors: true, maxNodes: 1800 });
    if (!path.length) return;
    this.player.navigation.path = path;
    this.player.navigation.destination = path[path.length - 1];
    this.player.navigation.interactionId = null;
    this.player.navigation.runRequested = false;
    this.player.navigation.guided = false;
    this.player.navigation.source = "combat";
    this.renderer.destination = null;
    this.combatPathTick = this.elapsed + 0.35;
  }

  tapWorld(x, y) {
    if (!this.canAct()) return;
    const hit = this.renderer.pick(x, y);
    if (hit?.kind === "zombie") {
      this.combat.selectTarget(this, hit.ref);
      this.ui.showMessage(this.player.combat.enabled ? "Ziel erfasst" : "Ziel gewählt · Kampfmodus aktivieren", 1.4);
      return;
    }
    if (hit?.kind === "object") {
      if (this.renderer.selectedId === hit.id) {
        this.queueInteraction(hit.ref);
        return;
      }
      this.renderer.selectedId = hit.id;
      this.player.combat.targetId = null;
      this.ui.showMessage(hit.ref.name || "Objekt gewählt", 1.1);
      return;
    }
    this.renderer.selectedId = null;
    if (!this.player.combat.enabled) this.player.combat.targetId = null;
    this.setDestination(this.renderer.screenToWorld(x, y), { source: "manual" });
  }

  doubleTapWorld(x, y) {
    if (!this.canAct()) return;
    const hit = this.renderer.pick(x, y);
    if (hit?.kind === "object") {
      this.queueInteraction(hit.ref);
      return;
    }
    if (hit?.kind === "zombie") {
      this.combat.selectTarget(this, hit.ref);
      if (!this.player.combat.enabled) this.combat.toggle(this);
      return;
    }
    this.renderer.selectedId = null;
    this.setDestination(this.renderer.screenToWorld(x, y), { source: "manual", run: true });
  }

  startGuidedMovement(x, y, options = {}) {
    if (!this.canAct()) return;
    const hit = this.renderer.pick(x, y);
    this.holdBlocked = Boolean(hit);
    if (hit) {
      if (hit.kind === "zombie") this.combat.selectTarget(this, hit.ref);
      else this.renderer.selectedId = hit.id;
      return;
    }
    this.updateGuidedMovement(x, y, options);
  }

  updateGuidedMovement(x, y, options = {}) {
    if (this.holdBlocked || !this.canAct()) return;
    this.setDestination(this.renderer.screenToWorld(x, y), {
      source: "manual",
      guided: true,
      run: Boolean(options.run) && this.player.stance !== "sneak",
    });
  }

  endGuidedMovement() {
    if (!this.holdBlocked && this.player.navigation.guided) this.clearNavigation();
    this.holdBlocked = false;
  }

  startCameraPan() {
    if (!this.canAct()) return;
    if (this.player.navigation.guided) this.clearNavigation();
    this.renderer.beginPan();
  }

  panCamera(dx, dy) {
    if (!this.canAct()) return;
    this.renderer.panBy(dx, dy);
  }

  endCameraPan() {
    this.renderer.endPan();
  }

  recenterCamera() {
    if (!this.started) return;
    this.renderer.recenter(this.player);
    this.ui.showToast("KAMERA ZENTRIERT", 1.1);
  }

  toggleStance() {
    if (!this.canAct()) return;
    if (this.stealth.state(this).hidden) this.stealth.breakHidden(this, "DECKUNG VERLASSEN", true);
    this.player.stance = this.player.stance === "sneak" ? "walk" : "sneak";
    this.player.navigation.runRequested = false;
    this.ui.showToast(this.player.stance === "sneak" ? "SCHLEICHMODUS" : "NORMALES GEHEN");
  }

  selectedObject() {
    return this.world.objects.find(object => object.id === this.renderer.selectedId && object.interactable && !object.removed) || null;
  }

  contextObject() {
    const selected = this.selectedObject();
    if (selected && distance(this.player, selected) <= GAME.interactionRange) return this.decorateAction(selected);
    let best = null;
    let bestDistance = GAME.interactionRange;
    for (const object of this.world.objectsNear(this.player.x, this.player.y, GAME.interactionRange)) {
      if (object.removed || !object.interactable) continue;
      const d = distance(this.player, object);
      if (d < bestDistance) {
        best = object;
        bestDistance = d;
      }
    }
    return best ? this.decorateAction(best) : null;
  }

  decorateAction(object) {
    if (object.locked) object.actionLabel = this.hasKeyFor(object) ? "AUFSCHLIESSEN" : "ÖFFNEN";
    else if (object.type === "door") object.actionLabel = object.closed ? "ÖFFNEN" : "SCHLIESSEN";
    else if (object.type === "radio") object.actionLabel = "EINSCHALTEN";
    else object.actionLabel = "DURCHSUCHEN";
    return object;
  }

  primaryAction() {
    if (!this.canAct()) return;
    const weapon = activeWeapon(this.player);
    if (itemDefinition(weapon)?.weaponKind === "firearm" && this.player.combat.enabled && this.combat.target(this)) {
      const result = this.combat.fire(this);
      if (!result.ok) this.ui.showToast(result.message);
      this.ui.refreshAll(this.player, this);
      return;
    }
    if (this.stealth.action(this)) {
      this.ui.refreshAll(this.player, this);
      return;
    }
    const object = this.selectedObject() || this.contextObject();
    if (object) this.queueInteraction(object);
    else this.ui.showMessage("Hier ist nichts ausgewählt.", 1.1);
  }

  executeAction() {
    if (!this.canAct()) return;
    const context = this.stealth.executionContext(this);
    if (context?.actionable) {
      this.stealth.executionAction(this);
      this.ui.refreshAll(this.player, this);
      return;
    }
    this.ui.showToast(context?.hint || "SCHLEICHEN · MESSER AUSWÄHLEN · ZIEL ANTIPPEN");
  }

  interact(object) {
    if (!this.canAct() || !object || object.removed) return;
    if (distance(this.player, object) > GAME.interactionRange + 0.08) {
      this.queueInteraction(object);
      return;
    }
    this.clearNavigation();
    if (object.locked && !this.unlock(object)) return;

    if (object.type === "door") {
      object.closed = !object.closed;
      object.solid = object.closed;
      object.blocksSight = object.closed;
      this.world.touchSight();
      this.world.emitNoise(object.x, object.y, object.closed ? 2.6 : 1.8, "door", 2.2);
      this.sound("door");
      this.ui.showMessage(object.closed ? "Tür geschlossen" : "Tür geöffnet", 1.1);
      this.save();
      return;
    }
    if (object.items) {
      const search = skillValue(this.player, "search");
      const noise = 1.6 * (1 - search * 0.004);
      this.world.emitNoise(object.x, object.y, noise, "search", 2.4, 0.6);
      if (!object.searched) {
        object.searched = true;
        gainSkill(this.player, "search", 0.38);
      }
      this.ui.openContainerPanel(object, this.player);
      this.renderer.selectedId = object.id;
      if (object.tutorial && this.mission === 0) {
        this.advanceMission(1, "Das Radio erwähnt Medikamente in der Apotheke.");
      }
      return;
    }
    if (object.type === "radio") {
      object.used = true;
      this.world.emitNoise(object.x, object.y, 7.5, "radio", 5, 1);
      this.ui.showMessage("…Sperrbezirk nicht verlassen… Apotheke am Ostplatz…", 4.4);
      this.sound("radio");
    }
  }

  openDoor(door, automatic = false) {
    if (!door || door.type !== "door" || !door.closed || door.locked) return false;
    door.closed = false;
    door.solid = false;
    door.blocksSight = false;
    this.world.touchSight();
    this.world.emitNoise(door.x, door.y, automatic ? 1.65 : 2.1, "door", 2.2);
    this.sound("door");
    return true;
  }

  hasKeyFor(object) {
    return Boolean(object.keyId && this.player.inventory.some(item => itemDefinition(item)?.keyId === object.keyId));
  }

  unlock(object) {
    if (this.hasKeyFor(object)) {
      object.locked = false;
      this.ui.showMessage("Aufgeschlossen", 1.2);
      this.sound("unlock");
      gainSkill(this.player, "burglary", 0.08);
      return true;
    }

    const lockpick = this.player.inventory.find(item => item.type === "lockpick");
    if (lockpick) {
      const skill = skillValue(this.player, "burglary");
      const chance = clamp(0.45 + skill * 0.008 - (object.lockDifficulty || 18) * 0.012, 0.12, 0.94);
      lockpick.uses = Math.max(0, (lockpick.uses ?? 1) - 1);
      if (lockpick.uses <= 0) removeItem(this.player, lockpick.id);
      if (this.random() <= chance) {
        object.locked = false;
        gainSkill(this.player, "burglary", 0.9);
        this.ui.showMessage("Schloss leise geöffnet", 1.4);
        this.sound("unlock");
        return true;
      }
      gainSkill(this.player, "burglary", 0.28);
      this.world.emitNoise(object.x, object.y, 2.4, "lock", 2.4);
      this.ui.showMessage("Dietrich abgerutscht", 1.3);
      this.sound("lock");
      return false;
    }

    const crowbar = this.player.inventory.find(item => item.type === "crowbar");
    if (crowbar) {
      object.locked = false;
      this.world.emitNoise(object.x, object.y, 10.5, "breach", 4.2, 1.15);
      this.player.noisePulse = 1;
      crowbar.condition = Math.max(0, (crowbar.condition ?? 100) - 2);
      gainSkill(this.player, "burglary", 0.45);
      this.ui.showMessage("Mit Gewalt aufgebrochen", 1.5);
      this.sound("breach");
      return true;
    }
    this.ui.showMessage("Verschlossen · Schlüssel, Dietrich oder Brecheisen nötig", 2.2);
    return false;
  }

  takeItem(container, itemId) {
    const item = container.items?.find(entry => entry.id === itemId);
    if (!item) return;
    if (!addItem(this.player, item)) {
      this.ui.showToast("ZU SCHWER · RUCKSACK PRÜFEN");
      return;
    }
    container.items = container.items.filter(entry => entry.id !== itemId);
    if (item.type === "sealed_antibiotics" && this.mission < 2) {
      this.advanceMission(2, "Medikament gesichert. Zurück zum Unterschlupf.");
    }
    gainSkill(this.player, "search", 0.05);
    this.ui.renderContainer(container, this.player);
    this.ui.refreshAll(this.player, this);
    this.ui.showToast(`${ITEMS[item.type].name.toUpperCase()} EINGEPACKT`);
    this.sound("pickup");
    this.save();
  }

  takeAll(container) {
    for (const item of [...(container.items || [])]) this.takeItem(container, item.id);
  }

  treatWound(woundId, itemType) {
    if (!this.canAct(true)) return;
    const item = this.player.inventory.find(entry => entry.type === itemType && (entry.count || 1) > 0);
    if (!item) {
      this.ui.showToast("DAS BENÖTIGTE MEDIZINMATERIAL FEHLT");
      return;
    }
    const result = treatWoundWithItem(this.player, itemType, woundId);
    if (!result.used) {
      this.ui.showToast(result.message);
      return;
    }
    removeItem(this.player, item.id, 1);
    this.ui.showToast(result.message);
    this.ui.refreshAll(this.player, this);
    this.sound("consume");
    this.save();
  }

  useItem(id) {
    if (!this.canAct(true)) return;
    const item = findItem(this.player, id);
    const definition = itemDefinition(item);
    if (!item || !definition) return;
    let consume = false;
    let message = "";

    if (definition.type === "weapon" || definition.equipSlot) {
      const result = equipItem(this.player, id);
      message = result.message;
      if (result.ok) this.sound("equip");
    } else if (definition.effect) {
      if (definition.needs && !this.player.inventory.some(entry => entry.type === definition.needs)) {
        this.ui.showToast(`DU BRAUCHST: ${ITEMS[definition.needs].name.toUpperCase()}`);
        return;
      }
      for (const [stat, value] of Object.entries(definition.effect)) {
        this.player[stat] = clamp((this.player[stat] || 0) + value, 0, 100);
      }
      consume = true;
      message = `${definition.name.toUpperCase()} BENUTZT`;
      this.sound("consume");
    } else if (definition.type === "medical" || item.type === "cloth") {
      const result = treatWithItem(this.player, item.type);
      if (!result.used) {
        this.ui.showToast(result.message);
        return;
      }
      consume = true;
      message = result.message;
      this.sound("consume");
    } else if (definition.type === "ammo" || definition.type === "magazine") {
      const result = this.combat.reload(this);
      message = result.message;
      if (!result.ok) {
        this.ui.showToast(message);
        return;
      }
    } else if (definition.type === "mod") {
      const weapon = activeWeapon(this.player);
      if (!weapon || !compatibleMods(this.player, weapon).some(mod => mod.id === item.id)) {
        this.ui.showToast("KEINE PASSENDE WAFFE AUSGERÜSTET");
        return;
      }
      const result = installMod(this.player, weapon.id, item.id);
      message = result.message;
      if (!result.ok) {
        this.ui.showToast(message);
        return;
      }
      this.sound("equip");
    } else if (definition.quest) {
      this.ui.showToast("DIESE PACKUNG GEHÖRT ZUM FUNKSPRUCH");
      return;
    } else {
      this.ui.showToast("DAS KANNST DU JETZT NICHT BENUTZEN");
      return;
    }

    if (consume) removeItem(this.player, item.id, 1);
    this.ui.selectedItemId = null;
    this.ui.refreshAll(this.player, this);
    this.ui.showToast(message);
    this.save();
  }

  dropItem(id) {
    const item = findItem(this.player, id);
    if (!item) return;
    const dropped = removeItem(this.player, id);
    const bag = this.world.addObject("groundloot", this.player.x + 0.3, this.player.y + 0.18, {
      static: false,
      interactable: true,
      solid: false,
      name: "ABGELEGTE SACHEN",
      items: [dropped],
    });
    this.renderer.selectedId = bag.id;
    this.ui.selectedItemId = null;
    this.ui.refreshAll(this.player, this);
    this.ui.showToast("GEGENSTAND ABGELEGT");
    this.save();
  }

  unequip(slot) {
    const item = unequipSlot(this.player, slot);
    if (!item) return;
    this.ui.refreshAll(this.player, this);
    this.ui.showToast(`${itemDefinition(item).name.toUpperCase()} ABGELEGT`);
  }

  openWeaponPanel(id) {
    const weapon = findItem(this.player, id);
    if (itemDefinition(weapon)?.weaponKind !== "firearm") return;
    this.ui.openWeaponPanel(weapon, this.player);
  }

  mountMod(weaponId, modId) {
    const result = installMod(this.player, weaponId, modId);
    this.ui.showToast(result.message);
    if (result.ok) this.sound("equip");
    const weapon = findItem(this.player, weaponId);
    this.ui.openWeaponPanel(weapon, this.player);
    this.ui.refreshAll(this.player, this);
    this.save();
  }

  unmountMod(weaponId, slot) {
    const result = removeMod(this.player, weaponId, slot);
    this.ui.showToast(result.message);
    const weapon = findItem(this.player, weaponId);
    this.ui.openWeaponPanel(weapon, this.player);
    this.ui.refreshAll(this.player, this);
    this.save();
  }

  reload() {
    if (!this.canAct(true)) return;
    const result = this.combat.reload(this);
    this.ui.showToast(result.message);
    this.ui.refreshAll(this.player, this);
    this.save();
  }

  onZombieAttack(zombie) {
    if (this.dead) return;
    const nearby = this.zombies.filter(entry => !entry.removed && distance(entry, this.player) < 1.45).length;
    const result = inflictZombieAttack(this.player, this.minutes, this.random, clamp((nearby - 1) * 0.12, 0, 0.35));
    const dx = this.player.x - zombie.x;
    const dy = this.player.y - zombie.y;
    const length = Math.hypot(dx, dy) || 1;
    this.player.impactX = dx / length;
    this.player.impactY = dy / length;
    this.player.hitKick = 1;
    this.renderer.burst(this.player.x, this.player.y, "#8d302b", 5);
    this.sound("hurt");
    vibrate([25, 20, 25]);
    this.ui.showMessage(result.label, 1.5);
    if (this.player.hp <= 0) this.die(this.player.deathCause || "DU WURDEST ZERRISSEN");
  }

  killZombie(zombie, options = {}) {
    zombie.removed = true;
    this.player.kills += 1;
    if (this.player.combat.targetId === zombie.id) {
      this.player.combat.targetId = null;
      this.player.combat.pendingTargetId = null;
      this.renderer.selectedId = null;
    }
    const corpse = this.world.addObject("corpse", zombie.x, zombie.y, {
      static: false,
      interactable: true,
      solid: false,
      container: "corpse",
      name: "INFIZIERTER",
      items: this.world.rollLoot("corpse"),
    });
    if (!options.silent) this.world.emitNoise(zombie.x, zombie.y, 2.1, "body", 2.2);
    this.renderer.selectedId = corpse.id;
    this.ui.showMessage("Der Infizierte bleibt liegen.", 1.2);
  }

  die(cause) {
    if (this.dead) return;
    this.dead = true;
    this.player.dead = true;
    this.player.deathCause = cause;
    this.clearNavigation();
    const belongings = deepCopy(this.player.inventory);
    this.world.addCorpse(this.player.x, this.player.y, `${this.player.name.toUpperCase()} · LEICHNAM`, belongings, {
      survivorId: this.player.id,
      deathCause: cause,
    });
    this.player.inventory = [];
    this.player.equipment = { mainHand: null, offHand: null, head: null, torso: null, legs: null, back: null };
    this.input.enabled = false;
    this.ui.closeAllPanels();
    this.ui.showDeath(this.player, this.minutes);
    this.sound("death");
    this.save();
  }

  nearestZombie(range = Infinity) {
    let result = null;
    let best = range;
    for (const zombie of this.zombies) {
      if (zombie.removed) continue;
      const d = distance(this.player, zombie);
      if (d < best) {
        best = d;
        result = zombie;
      }
    }
    return result;
  }

  updateMission() {
    if (this.mission === 2 && this.world.insideBuilding(this.player, "safehouse")) {
      this.advanceMission(3, "MEDIKAMENT GESICHERT · DER SPERRKREIS BLEIBT OFFEN", "success");
      vibrate([30, 50, 30]);
    }
  }

  advanceMission(index, message, sound = "objective") {
    if (index <= this.mission) return false;
    this.mission = index;
    if (message) this.ui.showMessage(message, index === 3 ? 5 : 3.4);
    this.ui.showToast("MISSION AKTUALISIERT", 2.1);
    this.sound(sound);
    this.ui.renderMission(this);
    this.save();
    return true;
  }

  objectiveText() {
    return missionAt(this.mission).objective;
  }

  missionDetails() {
    return { ...missionAt(this.mission), steps: missionSteps(this.mission) };
  }

  locationName() {
    const building = this.world.insideBuilding(this.player);
    if (building) return building.name;
    const { x, y } = this.player;
    if (x >= 28 && x <= 34) return "HAUPTSTRASSE";
    if (y >= 17 && y <= 23) return "OST-WEST-TRASSE";
    if (x > 34 && y > 23) return "APOTHEKENVIERTEL";
    if (x > 34) return "MARKTPLATZ";
    if (x < 14 && y > 23) return "WALDRAND";
    if (x < 14) return "REIHENHAUSSIEDLUNG";
    return "SPERRKREIS";
  }

  clockText() {
    return formatClock(this.minutes);
  }

  awareness() {
    return awarenessForPlayer(this.zombies);
  }

  activeWeapon() {
    return activeWeapon(this.player);
  }

  ammoText() {
    return ammoLabel(activeWeapon(this.player));
  }

  toggleInventory() {
    if (!this.canAct(true)) return;
    this.ui.toggleInventory(this.player, this);
  }

  toggleMission() {
    if (!this.canAct(true)) return;
    this.ui.toggleMission(this);
  }

  toggleStatus() {
    if (!this.canAct(true)) return;
    this.ui.toggleStatus(this.player, this);
  }

  toggleCharacter() {
    if (!this.canAct(true)) return;
    this.ui.toggleCharacter(this.player, this);
  }

  toggleDiagnostics() {
    const enabled = this.renderer.toggleDiagnostics();
    this.ui.setDiagnostics(enabled, this.renderer.diagnosticsText());
  }

  togglePause() {
    if (!this.started || this.dead) return;
    this.setPaused(!this.paused);
  }

  setPaused(paused) {
    this.paused = paused;
    this.input.enabled = !paused && !this.dead;
    this.ui.setPaused(paused);
    if (!paused) this.lastFrame = performance.now();
    else this.save();
  }

  canAct(allowMenu = false) {
    return this.started && !this.paused && !this.dead && (allowMenu || !this.ui.hasBlockingPanel());
  }

  serialize() {
    const player = deepCopy(this.player);
    player.navigation = {
      path: [],
      destination: null,
      interactionId: null,
      runRequested: false,
      guided: false,
      manualUntil: 0,
      source: null,
    };
    const zombies = deepCopy(this.zombies).map(zombie => ({ ...zombie, path: [] }));
    return {
      seed: this.world.seed,
      minutes: this.minutes,
      mission: this.mission,
      survivorCount: this.survivorCount,
      migrationTimer: this.migrationTimer,
      player,
      zombies,
      world: this.world.serialize(),
    };
  }

  save() {
    if (!this.started) return false;
    const ok = this.saveStore.write(this.serialize());
    if (!ok) this.ui.showToast("AUTOSAVE FEHLGESCHLAGEN");
    return ok;
  }

  load() {
    const saved = this.saveStore.read();
    if (!saved?.player) return false;
    this.world.reset(saved.seed || GAME.seed);
    this.world.restore(saved.world || []);
    this.minutes = saved.minutes ?? GAME.startMinutes;
    this.mission = saved.mission ?? 0;
    this.survivorCount = saved.survivorCount ?? saved.player.survivorNumber ?? 1;
    this.migrationTimer = saved.migrationTimer ?? GAME.migrationSeconds;
    this.player = saved.player;
    ensureStealthState(this.player);
    this.player.stealthState.hidden = false;
    this.player.stealthState.execution = null;
    this.zombies = Array.isArray(saved.zombies) ? saved.zombies : createInitialZombies();
    for (const zombie of this.zombies) {
      zombie.desiredFacingX ??= zombie.facingX ?? 0;
      zombie.desiredFacingY ??= zombie.facingY ?? 1;
      zombie.stimulus ??= null;
      zombie.hitKick ??= 0;
    }
    this.player.navigation ||= { path: [], destination: null, interactionId: null, runRequested: false, guided: false, manualUntil: 0 };
    this.player.combat ||= { enabled: false, targetId: null, attackCooldown: 0, attackTimer: 0, pendingAttack: 0, pendingTargetId: null, aim: 0, recoil: 0 };
    this.player.equipment ||= { mainHand: null, offHand: null, head: null, torso: null, legs: null, back: null };
    this.player.noiseRadius ??= 0;
    this.player.hitKick ??= 0;
    this.renderer.destination = null;
    this.renderer.destinationRun = false;
    return true;
  }

  initAudio() {
    if (this.audio) return;
    try {
      this.audio = new AudioContext();
    } catch (_) {
      try {
        this.audio = new webkitAudioContext();
      } catch (_) {
        this.audio = null;
      }
    }
  }

  sound(kind) {
    if (!this.audio) return;
    const presets = {
      pickup: [660, 0.06, "sine"],
      equip: [240, 0.05, "square"],
      hide: [180, 0.08, "triangle"],
      consume: [420, 0.08, "sine"],
      door: [105, 0.12, "triangle"],
      unlock: [510, 0.05, "square"],
      lock: [180, 0.08, "square"],
      breach: [68, 0.2, "sawtooth"],
      swing: [180, 0.05, "sawtooth"],
      gunshot: [52, 0.2, "square"],
      reload: [320, 0.07, "square"],
      hit: [72, 0.1, "square"],
      execution: [110, 0.16, "triangle"],
      hurt: [55, 0.16, "sawtooth"],
      alert: [145, 0.13, "triangle"],
      objective: [520, 0.16, "sine"],
      success: [720, 0.25, "sine"],
      radio: [90, 0.3, "sawtooth"],
      death: [46, 0.6, "sawtooth"],
    };
    const preset = presets[kind];
    if (!preset) return;
    try {
      const oscillator = this.audio.createOscillator();
      const gain = this.audio.createGain();
      oscillator.type = preset[2];
      oscillator.frequency.setValueAtTime(preset[0], this.audio.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(30, preset[0] * 0.55), this.audio.currentTime + preset[1]);
      gain.gain.setValueAtTime(kind === "gunshot" ? 0.07 : 0.035, this.audio.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.audio.currentTime + preset[1]);
      oscillator.connect(gain).connect(this.audio.destination);
      oscillator.start();
      oscillator.stop(this.audio.currentTime + preset[1]);
    } catch (_) {
      // Audio is non-critical and can be disabled by iOS.
    }
  }

  debugSummary() {
    const weapon = activeWeapon(this.player);
    return {
      survivor: `${this.player.name} · ${backgroundName(this.player)}`,
      position: [this.player.x, this.player.y],
      stance: this.player.stance,
      hp: this.player.hp,
      wounds: this.player.wounds.length,
      weapon: weapon?.type || null,
      rounds: weapon ? roundsInWeapon(weapon) : 0,
      zombies: this.zombies.filter(zombie => !zombie.removed).length,
      saveVersion: 3,
    };
  }
}
