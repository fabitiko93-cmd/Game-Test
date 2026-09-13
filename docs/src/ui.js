import { ITEMS } from "./config.js";

export class GameUI {
  constructor() {
    this.el = Object.fromEntries([
      "loading","start-button","hud","hp-fill","stamina-fill","hunger-need","thirst-need",
      "location","clock","objective-text","message","target-label","inventory-panel","inventory-grid",
      "inventory-count","carry-weight","weapon-slot","use-button","drop-button","container-panel",
      "container-kind","container-name","container-items","take-all-button","pause-panel","continue-button",
      "save-button","reset-button","death-panel","death-restart-button","survived-time","toast","quickbar",
      "action-button","action-label"
    ].map(id => [id.replaceAll("-", "_"), document.getElementById(id)]));
    this.callbacks = {};
    this.selectedItemId = null;
    this.openContainer = null;
    this.messageTimer = 0;
    this.toastTimer = 0;
    this.bind();
  }

  bind() {
    this.el.start_button.addEventListener("click", () => this.callbacks.start?.());
    document.querySelectorAll("[data-close]").forEach(button => button.addEventListener("click", () => this.closePanel(button.dataset.close)));
    this.el.continue_button.addEventListener("click", () => this.callbacks.continue?.());
    this.el.save_button.addEventListener("click", () => this.callbacks.save?.());
    this.el.reset_button.addEventListener("click", () => this.callbacks.reset?.());
    this.el.death_restart_button.addEventListener("click", () => this.callbacks.reset?.());
    this.el.use_button.addEventListener("click", () => this.selectedItemId && this.callbacks.useItem?.(this.selectedItemId));
    this.el.drop_button.addEventListener("click", () => this.selectedItemId && this.callbacks.dropItem?.(this.selectedItemId));
    this.el.take_all_button.addEventListener("click", () => this.openContainer && this.callbacks.takeAll?.(this.openContainer));
    this.el.weapon_slot.addEventListener("click", () => this.callbacks.unequip?.());
  }

  setHasSave(hasSave) {
    if (hasSave) {
      this.el.start_button.textContent = "FORTSETZEN";
      const secondary = document.createElement("button");
      secondary.id = "fresh-button";
      secondary.textContent = "NEUES SPIEL";
      secondary.addEventListener("click", () => this.callbacks.fresh?.());
      this.el.start_button.insertAdjacentElement("afterend", secondary);
    }
  }

  enterGame() {
    this.el.loading.classList.remove("visible");
    this.el.hud.classList.remove("hidden");
  }

  update(player, game) {
    this.el.hp_fill.style.width = `${player.hp}%`;
    this.el.stamina_fill.style.width = `${player.stamina}%`;
    this.el.hunger_need.querySelector("i").style.height = `${100 - player.hunger}%`;
    this.el.thirst_need.querySelector("i").style.height = `${100 - player.thirst}%`;
    this.el.hunger_need.style.opacity = player.hunger < 70 ? "1" : ".55";
    this.el.thirst_need.style.opacity = player.thirst < 70 ? "1" : ".55";
    this.el.location.textContent = game.locationName();
    this.el.clock.textContent = game.clockText();
    this.el.objective_text.textContent = game.objectiveText();
    this.el.inventory_count.textContent = `${player.inventory.length}/${player.capacity}`;
    const context = game.contextObject();
    if (context) {
      this.el.action_button.classList.add("ready");
      this.el.action_label.textContent = context.actionLabel || "AKTION";
      this.el.target_label.textContent = context.label || context.name || "INTERAGIEREN";
      this.el.target_label.classList.add("show");
    } else {
      this.el.action_button.classList.remove("ready");
      this.el.action_label.textContent = "AKTION";
      this.el.target_label.classList.remove("show");
    }
  }

  showMessage(text, duration = 2.3) {
    this.el.message.textContent = text;
    this.el.message.classList.add("show");
    window.clearTimeout(this.messageTimer);
    this.messageTimer = window.setTimeout(() => this.el.message.classList.remove("show"), duration * 1000);
  }

  showToast(text, duration = 1.6) {
    this.el.toast.textContent = text;
    this.el.toast.classList.add("show");
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.el.toast.classList.remove("show"), duration * 1000);
  }

  toggleInventory(player) {
    const opening = this.el.inventory_panel.classList.contains("hidden");
    this.closePanel("container-panel");
    this.el.inventory_panel.classList.toggle("hidden", !opening);
    if (opening) this.renderInventory(player);
    return opening;
  }

  closePanel(id) {
    document.getElementById(id)?.classList.add("hidden");
    if (id === "container-panel") this.openContainer = null;
    this.callbacks.panelClosed?.();
  }

  closeAllPanels() {
    this.closePanel("inventory-panel");
    this.closePanel("container-panel");
  }

  renderInventory(player) {
    this.el.inventory_grid.replaceChildren();
    for (let i = 0; i < player.capacity; i++) {
      const item = player.inventory[i];
      const slot = document.createElement("button");
      slot.className = "inventory-slot";
      if (item) {
        const definition = ITEMS[item.type];
        slot.append(this.itemIcon(definition.type));
        const name = document.createElement("small"); name.textContent = definition.short; slot.append(name);
        if (item.count > 1) { const count = document.createElement("b"); count.textContent = item.count; slot.append(count); }
        if (item.id === this.selectedItemId) slot.classList.add("selected");
        slot.addEventListener("click", () => this.selectInventoryItem(item.id, player));
      } else slot.disabled = true;
      this.el.inventory_grid.append(slot);
    }
    const weapon = player.equipped ? ITEMS[player.equipped.type] : null;
    this.el.weapon_slot.querySelector("strong").textContent = weapon?.name || "Leere Hände";
    const weight = player.inventory.reduce((sum, item) => sum + ITEMS[item.type].weight * item.count, 0);
    this.el.carry_weight.textContent = `${weight.toFixed(1).replace(".", ",")} / 12 kg`;
    this.renderQuickbar(player);
  }

  selectInventoryItem(id, player) {
    this.selectedItemId = this.selectedItemId === id ? null : id;
    const item = player.inventory.find(entry => entry.id === this.selectedItemId);
    this.el.use_button.disabled = !item;
    this.el.drop_button.disabled = !item;
    if (item) {
      const def = ITEMS[item.type];
      this.el.use_button.textContent = def.type === "weapon" ? "AUSRÜSTEN" : "BENUTZEN";
      this.showToast(def.description, 2.4);
    }
    this.renderInventory(player);
  }

  openContainerPanel(object) {
    this.closePanel("inventory-panel");
    this.openContainer = object;
    this.el.container_panel.classList.remove("hidden");
    this.el.container_kind.textContent = object.type === "corpse" ? "PERSON" : "BEHÄLTER";
    this.el.container_name.textContent = object.name || "UNBEKANNT";
    this.renderContainer(object);
  }

  renderContainer(object) {
    this.el.container_items.replaceChildren();
    if (!object.items?.length) {
      const empty = document.createElement("div"); empty.className = "container-empty"; empty.textContent = "LEER";
      this.el.container_items.append(empty);
      return;
    }
    for (const item of object.items) {
      const def = ITEMS[item.type];
      const button = document.createElement("button"); button.className = "container-item";
      button.append(this.itemIcon(def.type));
      const name = document.createElement("small"); name.textContent = def.short; button.append(name);
      if (item.count > 1) { const count = document.createElement("b"); count.textContent = item.count; button.append(count); }
      button.addEventListener("click", () => this.callbacks.takeItem?.(object, item.id));
      this.el.container_items.append(button);
    }
  }

  itemIcon(type) {
    const icon = document.createElement("div");
    icon.className = `item-icon ${type}`;
    return icon;
  }

  renderQuickbar(player) {
    this.el.quickbar.replaceChildren();
    const items = player.inventory.filter(item => ["weapon", "medical", "food", "drink"].includes(ITEMS[item.type].type)).slice(0, 4);
    for (const item of items) {
      const def = ITEMS[item.type];
      const button = document.createElement("button");
      button.className = `quick-slot${player.equipped?.id === item.id ? " selected" : ""}`;
      button.append(this.itemIcon(def.type));
      if (item.count > 1) { const count = document.createElement("b"); count.textContent = item.count; button.append(count); }
      button.title = def.name;
      button.addEventListener("click", () => this.callbacks.useItem?.(item.id));
      this.el.quickbar.append(button);
    }
  }

  setPaused(paused) {
    this.el.pause_panel.classList.toggle("hidden", !paused);
  }

  showDeath(hours) {
    this.closeAllPanels();
    this.el.death_panel.classList.remove("hidden");
    this.el.survived_time.textContent = `DU HAST ${hours.toFixed(1).replace(".", ",")} STUNDEN ÜBERLEBT`;
  }
}

