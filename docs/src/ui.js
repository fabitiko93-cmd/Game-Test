import { BACKGROUNDS, EQUIPMENT_SLOTS, ITEMS, SKILLS } from "./data.js?v=3";
import {
  activeWeapon,
  ammoLabel,
  carryCapacity,
  compatibleMods,
  equipmentSummary,
  findItem,
  inventoryWeight,
  itemDefinition,
  roundsInWeapon,
  weaponCapacity,
} from "./inventory.js?v=3";
import { backgroundName, skillRank, visibleInfectionState, woundDisplay } from "./character.js?v=3";

const MOD_SLOT_LABELS = {
  optic: "VISIERUNG",
  muzzle: "MÜNDUNG",
  stock: "SCHAFT",
  utility: "ZUBEHÖR",
};

export class GameUI {
  constructor() {
    const ids = [
      "loading", "start-button", "hud", "character-creator", "creator-kicker", "creator-number",
      "character-name", "background-options", "background-description", "character-confirm",
      "hp-fill", "stamina-fill", "hunger-need", "thirst-need", "wound-need",
      "awareness-fill", "noise-fill", "location", "clock", "objective-text", "message", "target-label",
      "enemy-target", "enemy-state", "enemy-name", "enemy-hp-fill", "aim-meter", "aim-fill", "ammo-label",
      "action-button", "action-label", "attack-button", "stance-button", "stance-label", "reload-button",
      "inventory-button", "inventory-count", "character-button", "pause-button", "quickbar",
      "inventory-panel", "equipment-grid", "inventory-grid", "item-description", "carry-weight",
      "customize-button", "drop-button", "use-button",
      "container-panel", "container-kind", "container-name", "container-items", "take-all-button",
      "character-panel", "character-background", "character-title", "skill-list", "condition-summary", "wound-list",
      "weapon-panel", "weapon-title", "weapon-ammo", "weapon-condition", "mod-slots", "available-mods", "weapon-reload-button",
      "pause-panel", "continue-button", "reset-button", "death-panel", "survived-time", "death-cause",
      "new-survivor-button", "toast",
    ];
    this.el = Object.fromEntries(ids.map(id => [id.replaceAll("-", "_"), document.getElementById(id)]));
    this.callbacks = {};
    this.selectedBackground = "citizen";
    this.selectedItemId = null;
    this.openContainer = null;
    this.weaponId = null;
    this.messageTimer = 0;
    this.toastTimer = 0;
    this.bind();
    this.renderBackgroundOptions();
  }

  bind() {
    this.el.start_button.addEventListener("click", () => this.callbacks.start?.());
    this.el.character_confirm.addEventListener("click", () => this.callbacks.createCharacter?.({
      name: this.el.character_name.value,
      background: this.selectedBackground,
    }));
    document.querySelectorAll("[data-close]").forEach(button => {
      button.addEventListener("click", () => this.closePanel(button.dataset.close));
    });
    this.el.continue_button.addEventListener("click", () => this.callbacks.continue?.());
    this.el.reset_button.addEventListener("click", () => this.callbacks.reset?.());
    this.el.new_survivor_button.addEventListener("click", () => this.callbacks.newSurvivor?.());
    this.el.use_button.addEventListener("click", () => this.selectedItemId && this.callbacks.useItem?.(this.selectedItemId));
    this.el.drop_button.addEventListener("click", () => this.selectedItemId && this.callbacks.dropItem?.(this.selectedItemId));
    this.el.customize_button.addEventListener("click", () => this.selectedItemId && this.callbacks.customize?.(this.selectedItemId));
    this.el.take_all_button.addEventListener("click", () => this.openContainer && this.callbacks.takeAll?.(this.openContainer));
    this.el.weapon_reload_button.addEventListener("click", () => this.callbacks.reloadWeapon?.());
  }

  renderBackgroundOptions() {
    this.el.background_options.replaceChildren();
    for (const [id, background] of Object.entries(BACKGROUNDS)) {
      const button = document.createElement("button");
      button.className = `background-card${id === this.selectedBackground ? " selected" : ""}`;
      button.dataset.background = id;
      const name = document.createElement("strong");
      name.textContent = background.name;
      const skills = Object.entries(background.skills)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2)
        .map(([skill]) => SKILLS[skill].name)
        .join(" · ");
      const detail = document.createElement("small");
      detail.textContent = skills;
      button.append(name, detail);
      button.addEventListener("click", () => {
        this.selectedBackground = id;
        this.renderBackgroundOptions();
      });
      this.el.background_options.append(button);
    }
    const selected = BACKGROUNDS[this.selectedBackground];
    this.el.background_description.textContent = selected.short;
  }

  setHasSave(hasSave) {
    this.el.start_button.textContent = hasSave ? "FORTSETZEN" : "ÜBERLEBENDEN ERSTELLEN";
    document.getElementById("fresh-button")?.remove();
    if (!hasSave) return;
    const secondary = document.createElement("button");
    secondary.id = "fresh-button";
    secondary.textContent = "NEUE WELT";
    secondary.addEventListener("click", () => this.callbacks.fresh?.());
    this.el.start_button.insertAdjacentElement("afterend", secondary);
  }

  showCharacterCreator({ survivorNumber = 1, continuing = false } = {}) {
    this.closeAllPanels();
    this.selectedBackground = "citizen";
    this.renderBackgroundOptions();
    this.el.creator_kicker.textContent = continuing ? "DIE WELT HAT ÜBERDAUERT" : "ERSTER ÜBERLEBENDER";
    this.el.creator_number.textContent = String(survivorNumber).padStart(2, "0");
    this.el.character_name.value = survivorNumber === 1 ? "Alex" : `Alex ${survivorNumber}`;
    this.el.character_creator.classList.add("visible");
  }

  hideCharacterCreator() {
    this.el.character_creator.classList.remove("visible");
  }

  enterGame() {
    this.el.loading.classList.remove("visible");
    this.el.character_creator.classList.remove("visible");
    this.el.hud.classList.remove("hidden");
  }

  update(player, game) {
    this.el.hp_fill.style.width = `${Math.max(0, player.hp)}%`;
    this.el.stamina_fill.style.width = `${Math.max(0, player.stamina)}%`;
    this.el.hunger_need.querySelector("i").style.height = `${100 - player.hunger}%`;
    this.el.thirst_need.querySelector("i").style.height = `${100 - player.thirst}%`;
    const woundSeverity = Math.min(100, (player.wounds?.length || 0) * 24 + (player.bleeding || 0) * 350);
    this.el.wound_need.querySelector("i").style.height = `${woundSeverity}%`;
    this.el.hunger_need.style.opacity = player.hunger < 70 ? "1" : ".5";
    this.el.thirst_need.style.opacity = player.thirst < 70 ? "1" : ".5";
    this.el.wound_need.style.opacity = player.wounds?.length ? "1" : ".42";

    const awareness = game.awareness();
    this.el.awareness_fill.style.width = `${awareness.awareness * 100}%`;
    this.el.awareness_fill.style.background = awareness.pursuing ? "#c94a3f" : awareness.suspicious ? "#c5a052" : "#718672";
    this.el.noise_fill.style.width = `${(player.noisePulse || 0) * 100}%`;

    this.el.location.textContent = game.locationName();
    this.el.clock.textContent = game.clockText();
    this.el.objective_text.textContent = game.objectiveText();
    this.el.inventory_count.textContent = `${this.decimal(inventoryWeight(player))} KG`;
    this.updateAction(player, game);
    this.updateTarget(player, game);

    this.el.attack_button.classList.toggle("combat-active", player.combat.enabled);
    this.el.attack_button.querySelector("small").textContent = player.combat.enabled ? "KAMPF AN" : "KAMPF";
    this.el.stance_button.classList.toggle("active", player.stance === "sneak");
    this.el.stance_label.textContent = player.stance === "sneak" ? "SCHLEICHT" : "SCHLEICHEN";
    const weapon = activeWeapon(player);
    const firearm = itemDefinition(weapon)?.weaponKind === "firearm";
    this.el.reload_button.classList.toggle("hidden", !firearm);
  }

  updateAction(player, game) {
    const weapon = activeWeapon(player);
    const firearmTarget = itemDefinition(weapon)?.weaponKind === "firearm" && player.combat.enabled && game.combat.target(game);
    if (firearmTarget) {
      this.el.action_button.classList.add("fire-ready");
      this.el.action_button.classList.toggle("ready", player.combat.aim > 0.72);
      this.el.action_button.querySelector("span").textContent = "◎";
      this.el.action_label.textContent = "SCHUSS";
      this.el.target_label.classList.remove("show");
      return;
    }
    this.el.action_button.classList.remove("fire-ready");
    this.el.action_button.querySelector("span").textContent = "✦";
    const context = game.contextObject();
    const selected = game.selectedObject();
    this.el.action_button.classList.toggle("ready", Boolean(context || selected));
    this.el.action_label.textContent = context?.actionLabel || (selected ? "HINGEHEN" : "AKTION");
    if (context) {
      this.el.target_label.textContent = context.name || "INTERAGIEREN";
      this.el.target_label.classList.add("show");
    } else {
      this.el.target_label.classList.remove("show");
    }
  }

  updateTarget(player, game) {
    const enemy = game.combat.target(game);
    this.el.enemy_target.classList.toggle("hidden", !enemy);
    if (!enemy) return;
    const stateNames = {
      idle: "RUHIG",
      suspicious: "MISSTRAUISCH",
      investigate: "UNTERSUCHT",
      search: "SUCHT",
      chase: "VERFOLGT DICH",
    };
    this.el.enemy_state.textContent = stateNames[enemy.state] || "ZIEL";
    this.el.enemy_name.textContent = enemy.name || "INFIZIERTER";
    this.el.enemy_hp_fill.style.width = `${Math.max(0, enemy.hp / enemy.maxHp * 100)}%`;
    const weapon = activeWeapon(player);
    const firearm = itemDefinition(weapon)?.weaponKind === "firearm";
    this.el.ammo_label.textContent = firearm ? ammoLabel(weapon) : "";
    this.el.aim_meter.classList.toggle("hidden", !firearm);
    this.el.aim_fill.style.width = `${(player.combat.aim || 0) * 100}%`;
  }

  showMessage(text, duration = 2.3) {
    this.el.message.textContent = text;
    this.el.message.classList.add("show");
    window.clearTimeout(this.messageTimer);
    this.messageTimer = window.setTimeout(() => this.el.message.classList.remove("show"), duration * 1000);
  }

  showToast(text, duration = 1.7) {
    this.el.toast.textContent = text;
    this.el.toast.classList.add("show");
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.el.toast.classList.remove("show"), duration * 1000);
  }

  hasBlockingPanel() {
    return ["inventory-panel", "container-panel", "character-panel", "weapon-panel"]
      .some(id => !document.getElementById(id).classList.contains("hidden"));
  }

  closePanel(id) {
    document.getElementById(id)?.classList.add("hidden");
    if (id === "container-panel") this.openContainer = null;
    if (id === "weapon-panel") this.weaponId = null;
    this.callbacks.panelClosed?.();
  }

  closeAllPanels() {
    for (const id of ["inventory-panel", "container-panel", "character-panel", "weapon-panel"]) this.closePanel(id);
  }

  toggleInventory(player, game) {
    const opening = this.el.inventory_panel.classList.contains("hidden");
    this.closeAllPanels();
    this.el.inventory_panel.classList.toggle("hidden", !opening);
    if (opening) this.renderInventory(player, game);
    return opening;
  }

  renderInventory(player, game) {
    if (this.selectedItemId && !findItem(player, this.selectedItemId)) this.selectedItemId = null;
    this.renderEquipment(player);
    this.el.inventory_grid.replaceChildren();
    const items = [...player.inventory].sort((a, b) => {
      const equippedA = Object.values(player.equipment).includes(a.id) ? 0 : 1;
      const equippedB = Object.values(player.equipment).includes(b.id) ? 0 : 1;
      return equippedA - equippedB;
    });
    const cells = Math.max(10, items.length);
    for (let index = 0; index < cells; index++) {
      const item = items[index];
      const slot = document.createElement("button");
      slot.className = "inventory-slot";
      if (!item) {
        slot.disabled = true;
        this.el.inventory_grid.append(slot);
        continue;
      }
      const definition = itemDefinition(item);
      slot.append(this.itemIcon(definition.icon || definition.type));
      const name = document.createElement("small");
      name.textContent = definition.short;
      slot.append(name);
      const amount = this.itemAmount(item);
      if (amount) {
        const count = document.createElement("b");
        count.textContent = amount;
        slot.append(count);
      }
      if (item.id === this.selectedItemId) slot.classList.add("selected");
      slot.addEventListener("click", () => this.selectInventoryItem(item.id, player, game));
      this.el.inventory_grid.append(slot);
    }
    this.el.carry_weight.textContent = `${this.decimal(inventoryWeight(player))} / ${this.decimal(carryCapacity(player))} kg`;
    this.updateItemDetail(player);
    this.renderQuickbar(player);
  }

  renderEquipment(player) {
    this.el.equipment_grid.replaceChildren();
    for (const summary of equipmentSummary(player)) {
      const button = document.createElement("button");
      button.className = `equip-slot${summary.reserved ? " reserved" : ""}`;
      const label = document.createElement("small");
      label.textContent = summary.label;
      const value = document.createElement("strong");
      value.textContent = summary.reserved ? "ZWEIHÄNDIG" : summary.item ? itemDefinition(summary.item).short : "LEER";
      button.append(label, value);
      button.disabled = !summary.item || summary.reserved;
      button.addEventListener("click", () => this.callbacks.unequip?.(summary.slot));
      this.el.equipment_grid.append(button);
    }
  }

  selectInventoryItem(id, player, game) {
    if (this.selectedItemId === id) {
      this.callbacks.useItem?.(id);
      return;
    }
    this.selectedItemId = id;
    this.renderInventory(player, game);
  }

  updateItemDetail(player) {
    const item = findItem(player, this.selectedItemId);
    const definition = itemDefinition(item);
    this.el.use_button.disabled = !item;
    this.el.drop_button.disabled = !item;
    this.el.customize_button.disabled = definition?.weaponKind !== "firearm";
    if (!item) {
      this.el.item_description.textContent = "Gegenstand auswählen";
      this.el.use_button.textContent = "BENUTZEN";
      return;
    }
    let extra = "";
    if (definition.weaponKind === "firearm") extra = ` · MUNITION ${ammoLabel(item)} · ZUSTAND ${Math.round(item.condition || 0)} %`;
    else if (definition.type === "magazine") extra = ` · ${item.rounds || 0}/${definition.capacity}`;
    else if ("condition" in item) extra = ` · ZUSTAND ${Math.round(item.condition)} %`;
    this.el.item_description.textContent = `${definition.description}${extra}`;
    this.el.use_button.textContent = definition.type === "weapon" || definition.equipSlot ? "AUSRÜSTEN"
      : definition.type === "ammo" || definition.type === "magazine" ? "NACHLADEN"
        : definition.type === "mod" ? "MONTIEREN" : "BENUTZEN";
  }

  openContainerPanel(object, player) {
    this.closeAllPanels();
    this.openContainer = object;
    this.el.container_panel.classList.remove("hidden");
    this.el.container_kind.textContent = object.survivor ? "VERSTORBENER ÜBERLEBENDER" : object.type === "corpse" ? "PERSON" : "BEHÄLTER";
    this.el.container_name.textContent = object.name || "UNBEKANNT";
    this.renderContainer(object, player);
  }

  renderContainer(object, player) {
    this.el.container_items.replaceChildren();
    if (!object.items?.length) {
      const empty = document.createElement("div");
      empty.className = "container-empty";
      empty.textContent = "LEER";
      this.el.container_items.append(empty);
      return;
    }
    for (const item of object.items) {
      const definition = itemDefinition(item);
      if (!definition) continue;
      const button = document.createElement("button");
      button.className = "container-item";
      button.append(this.itemIcon(definition.icon || definition.type));
      const name = document.createElement("small");
      name.textContent = definition.short;
      button.append(name);
      const amount = this.itemAmount(item);
      if (amount) {
        const count = document.createElement("b");
        count.textContent = amount;
        button.append(count);
      }
      button.addEventListener("click", () => this.callbacks.takeItem?.(object, item.id));
      this.el.container_items.append(button);
    }
  }

  toggleCharacter(player) {
    const opening = this.el.character_panel.classList.contains("hidden");
    this.closeAllPanels();
    this.el.character_panel.classList.toggle("hidden", !opening);
    if (opening) this.renderCharacter(player);
  }

  renderCharacter(player) {
    this.el.character_title.textContent = player.name.toUpperCase();
    this.el.character_background.textContent = `${backgroundName(player).toUpperCase()} · ÜBERLEBENDER ${String(player.survivorNumber).padStart(2, "0")}`;
    this.el.skill_list.replaceChildren();
    for (const [id, definition] of Object.entries(SKILLS)) {
      const value = player.skills[id] || 0;
      const row = document.createElement("div");
      row.className = "skill-row";
      const label = document.createElement("small");
      const name = document.createElement("span");
      name.textContent = definition.name.toUpperCase();
      const rank = document.createElement("span");
      rank.textContent = skillRank(value);
      label.append(name, rank);
      const bar = document.createElement("div");
      bar.className = "skill-bar";
      const fill = document.createElement("i");
      fill.style.width = `${value}%`;
      bar.append(fill);
      row.append(label, bar);
      this.el.skill_list.append(row);
    }

    this.el.condition_summary.replaceChildren();
    const infection = visibleInfectionState(player);
    const chips = [
      ["GESUNDHEIT", `${Math.round(player.hp)} %`],
      ["BLUTUNG", player.bleeding > 0.01 ? "AKTIV" : "KEINE"],
      ["INFEKTION", infection || "KEINE ANZEICHEN"],
      ["ABSCHÜSSE", String(player.kills || 0)],
    ];
    for (const [labelText, valueText] of chips) {
      const chip = document.createElement("div");
      chip.className = "condition-chip";
      const label = document.createElement("small");
      label.textContent = labelText;
      const value = document.createElement("strong");
      value.textContent = valueText;
      chip.append(label, value);
      this.el.condition_summary.append(chip);
    }

    this.el.wound_list.replaceChildren();
    if (!player.wounds?.length) {
      const empty = document.createElement("div");
      empty.className = "wound-empty";
      empty.textContent = "KEINE DOKUMENTIERTEN VERLETZUNGEN";
      this.el.wound_list.append(empty);
    } else {
      for (const wound of player.wounds) {
        const entry = document.createElement("div");
        entry.className = "wound-entry";
        entry.textContent = woundDisplay(wound, player);
        this.el.wound_list.append(entry);
      }
    }
  }

  openWeaponPanel(weapon, player) {
    if (!weapon) return;
    this.closeAllPanels();
    this.weaponId = weapon.id;
    this.el.weapon_panel.classList.remove("hidden");
    this.renderWeaponPanel(weapon, player);
  }

  renderWeaponPanel(weapon, player) {
    const definition = itemDefinition(weapon);
    this.el.weapon_title.textContent = definition.name.toUpperCase();
    this.el.weapon_ammo.textContent = `MUNITION ${ammoLabel(weapon)}`;
    this.el.weapon_condition.textContent = `ZUSTAND ${Math.round(weapon.condition || 0)} %`;
    this.el.mod_slots.replaceChildren();
    for (const slot of definition.modSlots || []) {
      const installed = weapon.mods?.[slot];
      const button = document.createElement("button");
      button.className = "mod-slot";
      const label = document.createElement("small");
      label.textContent = MOD_SLOT_LABELS[slot] || slot.toUpperCase();
      const value = document.createElement("strong");
      value.textContent = installed ? itemDefinition(installed).short : "LEER";
      button.append(label, value);
      button.disabled = !installed;
      if (installed) {
        button.title = itemDefinition(installed).description;
        button.addEventListener("click", () => this.callbacks.removeMod?.(weapon.id, slot));
      }
      this.el.mod_slots.append(button);
    }

    this.el.available_mods.replaceChildren();
    const available = compatibleMods(player, weapon);
    if (!available.length) {
      const empty = document.createElement("div");
      empty.className = "available-empty";
      empty.textContent = "KEINE PASSENDEN TEILE IM RUCKSACK";
      this.el.available_mods.append(empty);
    } else {
      for (const mod of available) {
        const definitionMod = itemDefinition(mod);
        const button = document.createElement("button");
        button.className = "mod-item";
        button.append(this.itemIcon(definitionMod.icon || definitionMod.type));
        const name = document.createElement("small");
        name.textContent = definitionMod.short;
        button.append(name);
        button.addEventListener("click", () => this.callbacks.installMod?.(weapon.id, mod.id));
        this.el.available_mods.append(button);
      }
    }
  }

  renderQuickbar(player) {
    this.el.quickbar.replaceChildren();
    const weapon = activeWeapon(player);
    const candidates = [
      weapon,
      ...player.inventory.filter(item => ["medical", "food", "drink"].includes(itemDefinition(item)?.type)),
    ].filter(Boolean);
    const unique = [...new Map(candidates.map(item => [item.id, item])).values()].slice(0, 4);
    for (const item of unique) {
      const definition = itemDefinition(item);
      const button = document.createElement("button");
      button.className = `quick-slot${weapon?.id === item.id ? " selected" : ""}`;
      button.append(this.itemIcon(definition.icon || definition.type));
      const amount = this.itemAmount(item);
      if (amount) {
        const count = document.createElement("b");
        count.textContent = amount;
        button.append(count);
      }
      button.title = definition.name;
      button.addEventListener("click", () => this.callbacks.useItem?.(item.id));
      this.el.quickbar.append(button);
    }
  }

  itemAmount(item) {
    const definition = itemDefinition(item);
    if (definition?.type === "magazine") return `${item.rounds || 0}`;
    if (definition?.weaponKind === "firearm") return `${roundsInWeapon(item)}`;
    return item.count > 1 ? String(item.count) : "";
  }

  itemIcon(type) {
    const icon = document.createElement("div");
    icon.className = `item-icon ${type}`;
    return icon;
  }

  refreshAll(player, game) {
    this.update(player, game);
    this.renderQuickbar(player);
    if (!this.el.inventory_panel.classList.contains("hidden")) this.renderInventory(player, game);
    if (!this.el.character_panel.classList.contains("hidden")) this.renderCharacter(player);
    if (!this.el.weapon_panel.classList.contains("hidden")) {
      const weapon = findItem(player, this.weaponId);
      if (weapon) this.renderWeaponPanel(weapon, player);
      else this.closePanel("weapon-panel");
    }
    if (!this.el.container_panel.classList.contains("hidden") && this.openContainer) this.renderContainer(this.openContainer, player);
  }

  setPaused(paused) {
    this.el.pause_panel.classList.toggle("hidden", !paused);
  }

  hidePause() {
    this.el.pause_panel.classList.add("hidden");
  }

  showDeath(player) {
    this.closeAllPanels();
    this.el.death_panel.classList.remove("hidden");
    this.el.survived_time.textContent = `ÜBERLEBENDER ${String(player.survivorNumber).padStart(2, "0")} · ${player.kills || 0} INFIZIERTE`;
    this.el.death_cause.textContent = player.deathCause || "Der Sperrkreis bleibt zurück.";
  }

  hideDeath() {
    this.el.death_panel.classList.add("hidden");
  }

  decimal(value) {
    return Number(value || 0).toFixed(1).replace(".", ",");
  }
}
