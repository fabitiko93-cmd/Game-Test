import AK from '../assets/weapons/ak.json' with { type: 'json' };
import VECTOR from '../assets/weapons/vector.json' with { type: 'json' };

// One catalogue drives the held model, weapon bench, UI and upper-body motion.
// Item compatibility and game values remain in data.js.
const MODELS = {
  ak_762: {
    name: 'AK', asset: AK, baseParts: ['Receiver', 'Handguard', 'Barrel'],
    magazines: {mag_ak_30: 'Magazine'},
    mods: {ak_fixed_stock: 'FixedStock', ak_frame_stock: 'SkeletonStock', ak_acog_3x: 'Optic3x', ak_suppressor: 'Suppressor'},
    anchors: {stock: [0,.04,-.18], optic: [0,.15,.12], muzzle: [0,.09,.54], magazine: [0,-.08,.18]},
  },
  vector_9mm: {
    name: 'Vector', asset: VECTOR, baseParts: ['Receiver', 'Barrel'],
    magazines: {mag_vector_33: 'Magazine'},
    mods: {vector_stock: 'FoldingStock', vector_foregrip: 'Foregrip', reflex_sight: 'Optic', vector_suppressor: 'Suppressor'},
    anchors: VECTOR.anchors, grips: VECTOR.grips,
  },
};

export function weaponModelDefinition(weapon) { return MODELS[typeof weapon === 'string' ? weapon : weapon?.type]; }
export function hasWeaponModel(weapon) { return Boolean(weaponModelDefinition(weapon)); }
export { AK as AK_MODEL, VECTOR as VECTOR_MODEL };
