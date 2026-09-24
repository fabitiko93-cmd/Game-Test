import { EQUIPMENT_SLOTS, ITEMS } from "./data.js?v=12";
import { clamp, uid } from "./util.js?v=12";

const deepCopy = value => JSON.parse(JSON.stringify(value));

export function createItem(type, count = 1, options = {}) {
  const definition = ITEMS[type];
  if (!definition) throw new Error(`Unknown item type: ${type}`);
  const item = { id: options.id || uid("item"), type, count };

  if (definition.condition) item.condition = options.condition ?? definition.condition;
  if (definition.type === "weapon") {
    item.mods = deepCopy(options.mods || {});
    if (definition.feed === "internal") item.rounds = options.rounds ?? 0;
    if (definition.feed === "magazine") {
      item.magazine = options.magazine ? deepCopy(options.magazine) : null;
      if (!item.magazine && Number.isFinite(options.loadedRounds)) {
        item.magazine = createItem(definition.magazineTypes[0], 1, { rounds: options.loadedRounds });
      }
    }
  }
  if (definition.type === "magazine") item.rounds = clamp(options.rounds ?? 0, 0, definition.capacity);
  if (definition.uses) item.uses = options.uses ?? definition.uses;
  return item;
}

export function cloneItem(item) {
  return deepCopy(item);
}

export function itemDefinition(itemOrType) {
  return ITEMS[typeof itemOrType === "string" ? itemOrType : itemOrType?.type];
}

export function isStackable(item) {
  const definition = itemDefinition(item);
  return Boolean(definition && definition.stack > 1 && !item.mods && !("rounds" in item));
}

export function itemWeight(item) {
  const definition = itemDefinition(item);
  if (!definition) return 0;
  let weight = definition.weight * Math.max(1, item.count || 1);
  if (item.magazine) weight += itemWeight(item.magazine);
  if (definition.feed === "internal" && item.rounds) {
    weight += (ITEMS[definition.ammoType]?.weight || 0) * item.rounds;
  }
  if (definition.type === "magazine" && item.rounds) {
    weight += (ITEMS[definition.ammoType]?.weight || 0) * item.rounds;
  }
  for (const mod of Object.values(item.mods || {})) weight += itemWeight(mod);
  const carriedMultiplier = Object.values(item.mods || {}).reduce(
    (value, mod) => value * (itemDefinition(mod)?.effects?.carriedWeightMul || 1),
    1,
  );
  return weight * carriedMultiplier;
}

export function inventoryWeight(player) {
  return player.inventory.reduce((sum, item) => sum + itemWeight(item), 0);
}

export function findItem(player, id) {
  return player.inventory.find(item => item.id === id) || null;
}

export function equippedItem(player, slot) {
  const id = player.equipment?.[slot];
  return id ? findItem(player, id) : null;
}

export function activeWeapon(player) {
  const item = equippedItem(player, "mainHand");
  return itemDefinition(item)?.type === "weapon" ? item : null;
}

export function carryCapacity(player) {
  const bag = equippedItem(player, "back");
  return (player.baseCapacity || 8) + (itemDefinition(bag)?.capacityBonus || 0);
}

export function canCarry(player, item) {
  return inventoryWeight(player) + itemWeight(item) <= carryCapacity(player) + 0.001;
}

function clearEquipmentReference(player, id) {
  for (const slot of Object.keys(player.equipment || {})) {
    if (player.equipment[slot] === id) player.equipment[slot] = null;
  }
}

export function addItem(player, incoming) {
  const item = cloneItem(incoming);
  if (!canCarry(player, item)) return false;
  const definition = itemDefinition(item);
  let remaining = item.count || 1;

  if (isStackable(item)) {
    for (const existing of player.inventory) {
      if (existing.type !== item.type || !isStackable(existing) || existing.count >= definition.stack) continue;
      const moved = Math.min(remaining, definition.stack - existing.count);
      existing.count += moved;
      remaining -= moved;
      if (remaining <= 0) return true;
    }
  }

  while (remaining > 0) {
    const moved = isStackable(item) ? Math.min(remaining, definition.stack) : 1;
    const next = cloneItem(item);
    next.id = remaining === (item.count || 1) ? item.id : uid("item");
    next.count = moved;
    player.inventory.push(next);
    remaining -= moved;
  }
  return true;
}

export function removeItem(player, id, count = Infinity) {
  const index = player.inventory.findIndex(item => item.id === id);
  if (index < 0) return null;
  const item = player.inventory[index];
  if (isStackable(item) && count < item.count) {
    item.count -= count;
    return { ...cloneItem(item), id: uid("item"), count };
  }
  clearEquipmentReference(player, id);
  return player.inventory.splice(index, 1)[0];
}

export function consumeType(player, type, count) {
  let remaining = count;
  for (const item of [...player.inventory]) {
    if (item.type !== type || remaining <= 0) continue;
    const used = Math.min(remaining, item.count || 1);
    removeItem(player, item.id, used);
    remaining -= used;
  }
  return count - remaining;
}

export function countType(player, type) {
  return player.inventory
    .filter(item => item.type === type)
    .reduce((sum, item) => sum + (item.count || 1), 0);
}

export function equipItem(player, id) {
  const item = findItem(player, id);
  const definition = itemDefinition(item);
  if (!item || !definition) return { ok: false, message: "Gegenstand nicht gefunden." };

  if (definition.type === "weapon") {
    player.equipment.mainHand = item.id;
    player.equipment.offHand = definition.hands === 2 ? item.id : null;
    return { ok: true, message: `${definition.name.toUpperCase()} AUSGERÜSTET` };
  }

  if (definition.equipSlot) {
    player.equipment[definition.equipSlot] = item.id;
    return { ok: true, message: `${definition.name.toUpperCase()} ANGELEGT` };
  }
  return { ok: false, message: "Dieser Gegenstand lässt sich nicht ausrüsten." };
}

export function unequipSlot(player, slot) {
  const id = player.equipment?.[slot];
  if (!id) return null;
  clearEquipmentReference(player, id);
  return findItem(player, id);
}

export function equipmentProtection(player, zone) {
  const slot = zone === "head" ? "head" : zone === "legs" ? "legs" : "torso";
  const item = equippedItem(player, slot);
  const definition = itemDefinition(item);
  if (!item || !definition) return 0;
  const conditionFactor = clamp((item.condition ?? 100) / 100, 0.15, 1);
  return (definition.protection || 0) * conditionFactor;
}

export function damageProtection(player, zone, amount = 4) {
  const slot = zone === "head" ? "head" : zone === "legs" ? "legs" : "torso";
  const item = equippedItem(player, slot);
  if (!item || !("condition" in item)) return;
  item.condition = Math.max(0, item.condition - amount);
}

export function weaponStats(weapon) {
  const definition = itemDefinition(weapon);
  if (!definition || definition.type !== "weapon") return null;
  const stats = { ...definition };
  for (const mod of Object.values(weapon.mods || {})) {
    const effects = itemDefinition(mod)?.effects || {};
    for (const [key, value] of Object.entries(effects)) {
      if (key.endsWith("Mul")) {
        const property = key.slice(0, -3);
        stats[property] = (stats[property] ?? 1) * value;
      } else if (key.endsWith("Add")) {
        const property = key.slice(0, -3);
        stats[property] = (stats[property] ?? 0) + value;
      } else {
        stats[key] = value;
      }
    }
  }
  return stats;
}

export function compatibleMods(player, weapon) {
  const definition = itemDefinition(weapon);
  if (!definition?.modSlots) return [];
  return player.inventory.filter(item => {
    const mod = itemDefinition(item);
    return mod?.type === "mod" && mod.compatible?.includes(weapon.type) && definition.modSlots.includes(mod.modSlot);
  });
}

export function installMod(player, weaponId, modId) {
  const weapon = findItem(player, weaponId);
  const mod = findItem(player, modId);
  const weaponDefinition = itemDefinition(weapon);
  const modDefinition = itemDefinition(mod);
  if (!weapon || weaponDefinition?.weaponKind !== "firearm" || modDefinition?.type !== "mod") {
    return { ok: false, message: "Diese Kombination funktioniert nicht." };
  }
  if (!modDefinition.compatible?.includes(weapon.type) || !weaponDefinition.modSlots?.includes(modDefinition.modSlot)) {
    return { ok: false, message: "Der Umbau passt nicht an diese Waffe." };
  }
  const removed = removeItem(player, mod.id);
  const previous = weapon.mods?.[modDefinition.modSlot] || null;
  weapon.mods ||= {};
  weapon.mods[modDefinition.modSlot] = removed;
  if (previous) addItem(player, previous);
  return { ok: true, message: `${modDefinition.name.toUpperCase()} MONTIERT` };
}

export function removeMod(player, weaponId, slot) {
  const weapon = findItem(player, weaponId);
  const mod = weapon?.mods?.[slot];
  if (!weapon || !mod) return { ok: false, message: "Dieser Platz ist leer." };
  if (itemDefinition(mod)?.permanent) return { ok: false, message: "Dieser Umbau ist dauerhaft." };
  delete weapon.mods[slot];
  addItem(player, mod);
  return { ok: true, message: `${itemDefinition(mod).name.toUpperCase()} ENTFERNT` };
}

function fillMagazine(player, magazine) {
  const definition = itemDefinition(magazine);
  const missing = definition.capacity - (magazine.rounds || 0);
  if (missing <= 0) return 0;
  const moved = consumeType(player, definition.ammoType, missing);
  magazine.rounds = (magazine.rounds || 0) + moved;
  return moved;
}

export function reloadWeapon(player, weapon = activeWeapon(player)) {
  const definition = itemDefinition(weapon);
  if (!weapon || definition?.weaponKind !== "firearm") return { ok: false, message: "Keine Schusswaffe ausgerüstet." };

  if (definition.feed === "magazine") {
    const candidates = player.inventory.filter(item => definition.magazineTypes.includes(item.type));
    for (const magazine of candidates) fillMagazine(player, magazine);
    candidates.sort((a, b) => (b.rounds || 0) - (a.rounds || 0));
    const currentRounds = weapon.magazine?.rounds || 0;
    const best = candidates[0];

    if (best && (best.rounds || 0) > currentRounds) {
      const next = removeItem(player, best.id);
      if (weapon.magazine) addItem(player, weapon.magazine);
      weapon.magazine = next;
      return { ok: true, message: `MAGAZIN EINGESETZT · ${next.rounds}/${itemDefinition(next).capacity}` };
    }

    if (weapon.magazine) {
      const moved = fillMagazine(player, weapon.magazine);
      if (moved > 0) return { ok: true, message: `MAGAZIN GELADEN · ${weapon.magazine.rounds}/${itemDefinition(weapon.magazine).capacity}` };
    }
    return { ok: false, message: weapon.magazine ? "KEINE WEITERE 9-MM-MUNITION" : "KEIN PASSENDES MAGAZIN" };
  }

  const missing = definition.capacity - (weapon.rounds || 0);
  if (missing <= 0) return { ok: false, message: "WAFFE IST GELADEN" };
  const moved = consumeType(player, definition.ammoType, missing);
  if (!moved) return { ok: false, message: "KEINE PASSENDE MUNITION" };
  weapon.rounds = (weapon.rounds || 0) + moved;
  return { ok: true, message: `NACHGELADEN · ${weapon.rounds}/${definition.capacity}` };
}

export function roundsInWeapon(weapon) {
  const definition = itemDefinition(weapon);
  if (definition?.feed === "magazine") return weapon.magazine?.rounds || 0;
  return weapon?.rounds || 0;
}

export function weaponCapacity(weapon) {
  const definition = itemDefinition(weapon);
  if (definition?.feed === "magazine") return weapon.magazine ? itemDefinition(weapon.magazine)?.capacity || 0 : 0;
  return definition?.capacity || 0;
}

export function consumeShot(weapon) {
  const definition = itemDefinition(weapon);
  if (!weapon || definition?.weaponKind !== "firearm") return false;
  if (definition.feed === "magazine") {
    if (!weapon.magazine?.rounds) return false;
    weapon.magazine.rounds -= 1;
  } else {
    if (!weapon.rounds) return false;
    weapon.rounds -= 1;
  }
  weapon.condition = Math.max(0, (weapon.condition ?? 100) - 0.035);
  return true;
}

export function ammoLabel(weapon) {
  const definition = itemDefinition(weapon);
  if (definition?.weaponKind !== "firearm") return "";
  if (definition.feed === "magazine" && !weapon.magazine) return "KEIN MAGAZIN";
  return `${roundsInWeapon(weapon)}/${weaponCapacity(weapon)}`;
}

export function equipmentSummary(player) {
  return Object.entries(EQUIPMENT_SLOTS).map(([slot, label]) => ({
    slot,
    label,
    item: equippedItem(player, slot),
    reserved: slot === "offHand" && player.equipment.offHand && player.equipment.offHand === player.equipment.mainHand,
  }));
}
