import { ITEMS } from "./data.js";
import { createItem } from "./inventory.js";

// Build each weapon's test kit from its real compatibility definitions. Shared
// attachments get one copy per weapon, so several weapons can be tested together.
export function weaponTestLoadout(catalog = ITEMS) {
  const loadout = [];
  for (const [type, weapon] of Object.entries(catalog)) {
    if (weapon.type !== "weapon") continue;
    loadout.push({ type, count: 1 });

    for (const [modType, mod] of Object.entries(catalog)) {
      if (mod.type === "mod" && mod.compatible?.includes(type) && weapon.modSlots?.includes(mod.modSlot)) {
        loadout.push({ type: modType, count: 1 });
      }
    }

    const ammoTypes = new Set(weapon.ammoType ? [weapon.ammoType] : []);
    for (const magazineType of weapon.magazineTypes || []) {
      const magazine = catalog[magazineType];
      if (magazine?.type !== "magazine") continue;
      loadout.push({ type: magazineType, count: 1, options: { rounds: magazine.capacity } });
      loadout.push({ type: magazineType, count: 1, options: { rounds: 0 } });
      ammoTypes.add(magazine.ammoType);
    }
    for (const ammoType of ammoTypes) {
      const ammo = catalog[ammoType];
      if (ammo?.type !== "ammo") continue;
      for (let stack = 0; stack < 3; stack++) loadout.push({ type: ammoType, count: ammo.stack || 1 });
    }
  }
  return loadout;
}

export function createWeaponTestItems() {
  return weaponTestLoadout().map(({ type, count, options }) => createItem(type, count, options));
}
