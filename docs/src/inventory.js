import { EQUIPMENT_SLOTS, ITEMS } from "./data.js";
import { clamp, uid } from "./util.js";

const deepCopy = value => JSON.parse(JSON.stringify(value));

export function createItem(type, count = 1, options = {}) {
  const definition = ITEMS[type];
  if (!definition) throw new Error(`Unknown item type: ${type}`);
  const item = { id: options.id || uid("item"), type, count };

  if (definition.condition) item.condition = options.condition ?? definition.condition;
  if (definition.type === "weapon") {
    item.mods = options.mods ? deepCopy(options.mods) : Object.fromEntries(
      Object.entries(definition.defaultMods || {}).map(([slot, type]) => [slot, createItem(type)]),
    );
    if (definition.fireModes) item.fireMode = definition.fireModes.includes(options.fireMode) ? options.fireMode : definition.fireModes[0];
    if (definition.feed === "internal") item.rounds = clamp(options.rounds ?? 0, 0, definition.capacity);
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
  if (definition.roundWeight) weight = Math.ceil((definition.roundWeight * Math.max(1, item.count || 1) - 1e-9) / definition.weightStep) * definition.weightStep;
  if (item.magazine) weight += itemWeight(item.magazine);
  if (definition.feed === "internal" && item.rounds) {
    const ammo=ITEMS[definition.ammoType];
    weight += ammo?.roundWeight ? Math.ceil((ammo.roundWeight*item.rounds-1e-9)/ammo.weightStep)*ammo.weightStep : (ammo?.weight || 0)*item.rounds;
  }
  if (definition.type === "magazine" && (item.rounds || 0) >= Math.ceil(definition.capacity / 2)) weight += .05;
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
  let additional = itemWeight(item);
  if (itemDefinition(item)?.roundWeight) {
    let remaining = item.count || 1;
    additional = 0;
    for (const existing of player.inventory.filter(entry => entry.type === item.type && isStackable(entry))) {
      const moved = Math.min(remaining, itemDefinition(item).stack - existing.count);
      additional += itemWeight({...existing, count: existing.count + moved}) - itemWeight(existing);
      remaining -= moved;
      if (!remaining) break;
    }
    while (remaining > 0) {
      const moved = Math.min(remaining, itemDefinition(item).stack);
      additional += itemWeight({...item, count: moved}); remaining -= moved;
    }
  }
  return inventoryWeight(player) + additional <= carryCapacity(player) + 0.001;
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

export function weaponFireMode(weapon) {
  const modes = itemDefinition(weapon)?.fireModes || ["semi"];
  return modes.includes(weapon?.fireMode) ? weapon.fireMode : modes[0];
}

export function cycleFireMode(weapon) {
  const modes = itemDefinition(weapon)?.fireModes;
  if (!modes?.length) return { ok: false, message: "KEIN UMSCHALTBARER FEUERMODUS" };
  weapon.fireMode = modes[(modes.indexOf(weaponFireMode(weapon)) + 1) % modes.length];
  return { ok: true, message: weapon.fireMode === "auto" ? "FULLAUTO · SCHUSS HALTEN" : "SEMI · EIN SCHUSS PRO TIPP" };
}

export function compatibleMods(player, weapon) {
  const definition = itemDefinition(weapon);
  if (!definition?.modSlots) return [];
  return player.inventory.filter(item => {
    const mod = itemDefinition(item);
    return mod?.type === "mod" && mod.compatible?.includes(weapon.type) && weaponModSlots(weapon).includes(mod.modSlot);
  });
}

export function weaponModSlots(weapon) {
  const definition=itemDefinition(weapon);
  return (definition?.modSlots || []).filter(slot=>Object.entries(definition.modRequirements?.[slot] || {})
    .every(([required,types])=>types.includes(weapon.mods?.[required]?.type)));
}

function returnUnsupportedMods(player,weapon) {
  const slots=weaponModSlots(weapon),returned=[];
  for(const [slot,mod] of Object.entries(weapon.mods || {}))if(!slots.includes(slot)) {
    delete weapon.mods[slot];player.inventory.push(mod);returned.push(mod);
  }
  if(weapon.lightOn&&!Object.values(weapon.mods || {}).some(mod=>itemDefinition(mod)?.light))weapon.lightOn=false;
  return returned;
}

export function weaponLight(weapon) {
  if(!weapon?.lightOn)return null;
  return Object.entries(weapon.mods || {}).filter(([slot])=>weaponModSlots(weapon).includes(slot))
    .map(([,mod])=>itemDefinition(mod)?.light).find(Boolean) || null;
}

export function toggleWeaponLight(weapon) {
  if(!Object.entries(weapon?.mods || {}).some(([slot,mod])=>weaponModSlots(weapon).includes(slot)&&itemDefinition(mod)?.light))
    return {ok:false,message:'KEINE WAFFENLAMPE MONTIERT'};
  weapon.lightOn=!weapon.lightOn;
  return {ok:true,message:weapon.lightOn?'WAFFENLAMPE AN':'WAFFENLAMPE AUS'};
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
  if(!weaponModSlots(weapon).includes(modDefinition.modSlot))return {ok:false,message:'R4-SCHIENENLAUF ERFORDERLICH'};
  const removed = removeItem(player, mod.id);
  const previous = weapon.mods?.[modDefinition.modSlot] || null;
  weapon.mods ||= {};
  weapon.mods[modDefinition.modSlot] = removed;
  if (previous) player.inventory.push(previous);
  if(modDefinition.light)weapon.lightOn=true;
  const returned=returnUnsupportedMods(player,weapon);
  return { ok: true, message: `${modDefinition.name.toUpperCase()} MONTIERT${returned.length?' · AUFSÄTZE IM RUCKSACK':''}` };
}

export function removeMod(player, weaponId, slot) {
  const weapon = findItem(player, weaponId);
  const mod = weapon?.mods?.[slot];
  if (!weapon || !mod) return { ok: false, message: "Dieser Platz ist leer." };
  if (itemDefinition(mod)?.permanent) return { ok: false, message: "Dieser Umbau ist dauerhaft." };
  delete weapon.mods[slot];
  player.inventory.push(mod);
  returnUnsupportedMods(player,weapon);
  return { ok: true, message: `${itemDefinition(mod).name.toUpperCase()} ENTFERNT` };
}

export function fillMagazine(player, magazineId) {
  const magazine = findItem(player, magazineId);
  const definition = itemDefinition(magazine);
  if (definition?.type !== "magazine") return { ok: false, message: "SEPARATES MAGAZIN AUSWÄHLEN" };
  const missing = definition.capacity - (magazine.rounds || 0);
  if (missing <= 0) return { ok: false, message: "MAGAZIN IST VOLL" };
  const original = player.inventory.map(item => ({item, count: item.count})), previousRounds = magazine.rounds || 0, previousWeight = inventoryWeight(player);
  const moved = consumeType(player, definition.ammoType, missing);
  if (!moved) return { ok: false, message: "KEINE PASSENDE MUNITION" };
  magazine.rounds = (magazine.rounds || 0) + moved;
  if (inventoryWeight(player) > Math.max(carryCapacity(player), previousWeight) + .001) {
    magazine.rounds = previousRounds;
    player.inventory = original.map(({item, count}) => {item.count = count; return item;});
    return { ok: false, message: "ZU SCHWER FÜR DIE NÄCHSTE MAGAZIN-GEWICHTSSTUFE" };
  }
  return { ok: true, message: `MAGAZIN BEFÜLLT · ${magazine.rounds}/${definition.capacity}` };
}

export function emptyMagazine(player, magazineId) {
  const magazine = findItem(player, magazineId), definition = itemDefinition(magazine);
  if (definition?.type !== "magazine" || !magazine.rounds) return { ok: false, message: "MAGAZIN IST LEER" };
  const rounds = magazine.rounds;
  magazine.rounds = 0;
  if (!addItem(player, createItem(definition.ammoType, rounds))) {
    magazine.rounds = rounds;
    return { ok: false, message: "ZU SCHWER FÜR LOSE MUNITION" };
  }
  return { ok: true, message: `${rounds} PATRONEN AUS DEM MAGAZIN ENTNOMMEN` };
}

export function insertMagazine(player, weaponId, magazineId) {
  const weapon = findItem(player, weaponId), definition = itemDefinition(weapon), magazine = findItem(player, magazineId);
  if (definition?.feed !== "magazine" || !definition.magazineTypes.includes(magazine?.type)) {
    return { ok: false, message: "MAGAZIN PASST NICHT AN DIESE WAFFE" };
  }
  const previous = weapon.magazine;
  weapon.magazine = removeItem(player, magazine.id);
  // Both magazines were already carried. Moving them between inventory and slot
  // conserves mass and must never discard the outgoing magazine at full capacity.
  if (previous) player.inventory.push(previous);
  return { ok: true, message: `MAGAZIN EINGESETZT · ${ammoLabel(weapon)}` };
}

export function ejectMagazine(player, weaponId) {
  const weapon = findItem(player, weaponId);
  if (!weapon?.magazine) return { ok: false, message: "KEIN MAGAZIN EINGESETZT" };
  player.inventory.push(weapon.magazine);
  weapon.magazine = null;
  return { ok: true, message: "MAGAZIN HERAUSGENOMMEN" };
}

export function reloadWeapon(player, weapon = activeWeapon(player)) {
  const definition = itemDefinition(weapon);
  if (!weapon || definition?.weaponKind !== "firearm") return { ok: false, message: "Keine Schusswaffe ausgerüstet." };

  if (definition.feed === "magazine") {
    const candidates = player.inventory.filter(item => definition.magazineTypes.includes(item.type));
    candidates.sort((a, b) => (b.rounds || 0) - (a.rounds || 0));
    const currentRounds = weapon.magazine?.rounds || 0;
    const best = candidates[0];

    if (best && (!weapon.magazine || (best.rounds || 0) > currentRounds)) return insertMagazine(player, weapon.id, best.id);
    return { ok: false, message: weapon.magazine ? "KEIN VOLLERES ERSATZMAGAZIN · MAGAZIN SEPARAT BEFÜLLEN" : "KEIN PASSENDES MAGAZIN" };
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
  if (!weapon || definition?.weaponKind !== "firearm" || missingWeaponPart(weapon)) return false;
  if (definition.feed === "magazine") {
    if (!weapon.magazine?.rounds) return false;
    weapon.magazine.rounds -= 1;
    weapon.slideLocked=weapon.magazine.rounds===0;
  } else {
    if (!weapon.rounds) return false;
    weapon.rounds -= 1;
    if(weapon.type==='revolver_44'){
      weapon.spentCases=Math.min(definition.capacity-weapon.rounds,(weapon.spentCases||0)+1);
      weapon.cylinderIndex=((weapon.cylinderIndex||0)+1)%definition.capacity;
    }
  }
  weapon.condition = Math.max(0, (weapon.condition ?? 100) - 0.035);
  return true;
}

export function missingWeaponPart(weapon) {
  return Object.entries(itemDefinition(weapon)?.requiredMods || {}).find(([slot]) => !weapon.mods?.[slot])?.[1] || null;
}

export function ammoLabel(weapon) {
  const definition = itemDefinition(weapon);
  if (definition?.weaponKind !== "firearm") return "";
  const missing = missingWeaponPart(weapon);
  if (missing) return `${missing} FEHLT`;
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
