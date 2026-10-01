import { gainSkill, treatWound as treatWoundWithItem, treatWithItem } from "./character.js";
import { ITEMS } from "./data.js";
import { activeWeapon, addItem, compatibleMods, equipItem, findItem, installMod, itemDefinition, removeItem, removeMod, unequipSlot } from "./inventory.js";
import { clamp } from "./util.js";

export function takeItem(game, container, itemId) {
  const item = container.items?.find(entry => entry.id === itemId);
  if (!item) return;
  if (!addItem(game.player, item)) {
    game.ui.showToast("ZU SCHWER · RUCKSACK PRÜFEN");
    return;
  }
  container.items = container.items.filter(entry => entry.id !== itemId);
  if (item.type === "sealed_antibiotics" && game.mission < 2) {
    game.advanceMission(2, "Medikament gesichert. Zurück zum Unterschlupf.");
  }
  gainSkill(game.player, "search", 0.05);
  game.ui.renderContainer(container, game.player);
  game.ui.refreshAll(game.player, game);
  game.ui.showToast(`${ITEMS[item.type].name.toUpperCase()} EINGEPACKT`);
  game.sound("pickup");
  game.save();
}

export function takeAll(game, container) {
  for (const item of [...(container.items || [])]) game.takeItem(container, item.id);
}

export function treatWound(game, woundId, itemType) {
  if (!game.canAct(true)) return;
  const item = game.player.inventory.find(entry => entry.type === itemType && (entry.count || 1) > 0);
  if (!item) {
    game.ui.showToast("DAS BENÖTIGTE MEDIZINMATERIAL FEHLT");
    return;
  }
  const result = treatWoundWithItem(game.player, itemType, woundId);
  if (!result.used) {
    game.ui.showToast(result.message);
    return;
  }
  removeItem(game.player, item.id, 1);
  game.ui.showToast(result.message);
  game.ui.refreshAll(game.player, game);
  game.sound("consume");
  game.save();
}

export function useItem(game, id) {
  if (!game.canAct(true)) return;
  const item = findItem(game.player, id);
  const definition = itemDefinition(item);
  if (!item || !definition) return;
  let consume = false;
  let message = "";

  if (definition.type === "weapon" || definition.equipSlot) {
    const result = equipItem(game.player, id);
    message = result.message;
    if (result.ok) game.sound("equip");
  } else if (definition.effect) {
    if (definition.needs && !game.player.inventory.some(entry => entry.type === definition.needs)) {
      game.ui.showToast(`DU BRAUCHST: ${ITEMS[definition.needs].name.toUpperCase()}`);
      return;
    }
    for (const [stat, value] of Object.entries(definition.effect)) {
      game.player[stat] = clamp((game.player[stat] || 0) + value, 0, 100);
    }
    consume = true;
    message = `${definition.name.toUpperCase()} BENUTZT`;
    game.sound("consume");
  } else if (definition.type === "medical" || item.type === "cloth") {
    const result = treatWithItem(game.player, item.type);
    if (!result.used) {
      game.ui.showToast(result.message);
      return;
    }
    consume = true;
    message = result.message;
    game.sound("consume");
  } else if (definition.type === "ammo" || definition.type === "magazine") {
    const result = game.combat.reload(game);
    message = result.message;
    if (!result.ok) {
      game.ui.showToast(message);
      return;
    }
  } else if (definition.type === "mod") {
    const weapon = activeWeapon(game.player);
    if (!weapon || !compatibleMods(game.player, weapon).some(mod => mod.id === item.id)) {
      game.ui.showToast("KEINE PASSENDE WAFFE AUSGERÜSTET");
      return;
    }
    const result = installMod(game.player, weapon.id, item.id);
    message = result.message;
    if (!result.ok) {
      game.ui.showToast(message);
      return;
    }
    game.sound("equip");
  } else if (definition.quest) {
    game.ui.showToast("DIESE PACKUNG GEHÖRT ZUM FUNKSPRUCH");
    return;
  } else {
    game.ui.showToast("DAS KANNST DU JETZT NICHT BENUTZEN");
    return;
  }

  if (consume) removeItem(game.player, item.id, 1);
  game.ui.selectedItemId = null;
  game.ui.refreshAll(game.player, game);
  game.ui.showToast(message);
  game.save();
}

export function dropItem(game, id) {
  const item = findItem(game.player, id);
  if (!item) return;
  const dropped = removeItem(game.player, id);
  const bag = game.world.addObject("groundloot", game.player.x + 0.3, game.player.y + 0.18, {
    static: false,
    interactable: true,
    solid: false,
    name: "ABGELEGTE SACHEN",
    items: [dropped],
  });
  game.renderer.selectedId = bag.id;
  game.ui.selectedItemId = null;
  game.ui.refreshAll(game.player, game);
  game.ui.showToast("GEGENSTAND ABGELEGT");
  game.save();
}

export function unequip(game, slot) {
  const item = unequipSlot(game.player, slot);
  if (!item) return;
  game.ui.refreshAll(game.player, game);
  game.ui.showToast(`${itemDefinition(item).name.toUpperCase()} ABGELEGT`);
}

export function openWeaponPanel(game, id) {
  const weapon = findItem(game.player, id);
  if (itemDefinition(weapon)?.weaponKind !== "firearm") return;
  game.ui.openWeaponPanel(weapon, game.player);
}

export function mountMod(game, weaponId, modId) {
  const result = installMod(game.player, weaponId, modId);
  game.ui.showToast(result.message);
  if (result.ok) game.sound("equip");
  const weapon = findItem(game.player, weaponId);
  game.ui.openWeaponPanel(weapon, game.player);
  game.ui.refreshAll(game.player, game);
  game.save();
}

export function unmountMod(game, weaponId, slot) {
  const result = removeMod(game.player, weaponId, slot);
  game.ui.showToast(result.message);
  const weapon = findItem(game.player, weaponId);
  game.ui.openWeaponPanel(weapon, game.player);
  game.ui.refreshAll(game.player, game);
  game.save();
}

export function reload(game) {
  if (!game.canAct(true)) return;
  const result = game.combat.reload(game);
  game.ui.showToast(result.message);
  game.ui.refreshAll(game.player, game);
  game.save();
}
