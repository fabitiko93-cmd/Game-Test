import * as Movement from "./movement.js";
import * as WorldInput from "./world-input.js";
import * as ItemActions from "./item-actions.js";
import * as GameState from "./game-state.js";
import * as GameAudio from "./game-audio.js";
import { ZombieSystem, createInitialZombies } from "./ai.js";
import { backgroundName, createPlayer, gainSkill, inflictZombieAttack, skillValue, updateCharacter } from "./character.js";
import { CombatSystem } from "./combat.js";
import { GAME } from "./config.js";

import { activeWeapon, ammoLabel, itemDefinition, removeItem, roundsInWeapon } from "./inventory.js";
import { Navigator } from "./navigation.js";
import { missionAt, missionSteps } from "./missions.js";
import { awarenessForPlayer } from "./perception.js";
import { SaveStore } from "./save.js";
import { StealthSystem, ensureStealthState } from "./stealth.js";
import { clamp, distance, formatClock, vibrate } from "./util.js";

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
      openfield: () => { if (this.canAct()) this.stealth.activateOpenfield(this); },
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
    this.stealth.update(this, delta);
    this.aiAccumulator += delta;
    if (this.aiAccumulator >= GAME.aiStep) {
      const aiDelta = Math.min(0.1, this.aiAccumulator);
      this.aiAccumulator = 0;
      this.lastAiResult = this.zombieSystem.update(this, aiDelta);
    }
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
    return Movement.updateMovement(this, delta);
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
    return Movement.moveEntity(this, entity, dx, dy, radius);
  }

  setDestination(requestedPoint, options = {}) {
    return Movement.setDestination(this, requestedPoint, options);
  }

  clearNavigation() {
    return Movement.clearNavigation(this);
  }

  arriveAtDestination() {
    return Movement.arriveAtDestination(this);
  }

  queueInteraction(object) {
    return Movement.queueInteraction(this, object);
  }

  approachCombatTarget(target, range) {
    return Movement.approachCombatTarget(this, target, range);
  }

  tapWorld(x, y) {
    return WorldInput.tapWorld(this, x, y);
  }

  doubleTapWorld(x, y) {
    return WorldInput.doubleTapWorld(this, x, y);
  }

  startGuidedMovement(x, y, options = {}) {
    return WorldInput.startGuidedMovement(this, x, y, options);
  }

  updateGuidedMovement(x, y, options = {}) {
    return WorldInput.updateGuidedMovement(this, x, y, options);
  }

  endGuidedMovement() {
    return WorldInput.endGuidedMovement(this);
  }

  startCameraPan() {
    return WorldInput.startCameraPan(this);
  }

  panCamera(dx, dy) {
    return WorldInput.panCamera(this, dx, dy);
  }

  endCameraPan() {
    return WorldInput.endCameraPan(this);
  }

  recenterCamera() {
    return WorldInput.recenterCamera(this);
  }

  toggleStance() {
    if (!this.canAct()) return;
    this.player.stance = this.player.stance === "sneak" ? "walk" : "sneak";
    this.player.running = false;
    this.player.navigation.runRequested = false;
    this.stealth.refresh(this);
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
    return ItemActions.takeItem(this, container, itemId);
  }

  takeAll(container) {
    return ItemActions.takeAll(this, container);
  }

  treatWound(woundId, itemType) {
    return ItemActions.treatWound(this, woundId, itemType);
  }

  useItem(id) {
    return ItemActions.useItem(this, id);
  }

  dropItem(id) {
    return ItemActions.dropItem(this, id);
  }

  unequip(slot) {
    return ItemActions.unequip(this, slot);
  }

  openWeaponPanel(id) {
    return ItemActions.openWeaponPanel(this, id);
  }

  mountMod(weaponId, modId) {
    return ItemActions.mountMod(this, weaponId, modId);
  }

  unmountMod(weaponId, slot) {
    return ItemActions.unmountMod(this, weaponId, slot);
  }

  reload() {
    return ItemActions.reload(this);
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
    return GameState.serialize(this);
  }

  save() {
    return GameState.save(this);
  }

  load() {
    return GameState.load(this);
  }

  initAudio() {
    return GameAudio.initAudio(this);
  }

  sound(kind) {
    return GameAudio.sound(this, kind);
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
