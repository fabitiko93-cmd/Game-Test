import AK from '../assets/weapons/ak.json' with { type: 'json' };
import VECTOR from '../assets/weapons/vector.json' with { type: 'json' };
import M4 from '../assets/weapons/m4.json' with { type: 'json' };
import REVOLVER from '../assets/weapons/revolver.json' with { type: 'json' };

// One catalogue drives the held model, weapon bench, UI and upper-body motion.
// Item compatibility and game values remain in data.js.
const MODELS = {
  ak_762: {
    name: 'AK', asset: AK, baseParts: ['Receiver', 'Handguard', 'Barrel'], muzzleParts:['Barrel'],
    magazines: {mag_ak_30: 'Magazine'},
    mods: {ak_fixed_stock: 'FixedStock', ak_frame_stock: 'SkeletonStock', ak_acog_3x: 'Optic3x', ak_suppressor: 'Suppressor'},
    anchors: {stock: [0,.04,-.18], optic: [0,.15,.12], muzzle: [0,.09,.54], magazine: [0,-.08,.18]},
  },
  vector_9mm: {
    name: 'Vector', asset: VECTOR, baseParts: ['Receiver', 'Barrel'], muzzleParts:['Barrel'],
    magazines: {mag_vector_33: 'Magazine'},
    mods: {vector_stock: 'FoldingStock', vector_foregrip: 'Foregrip', reflex_sight: 'Optic', vector_suppressor: 'Suppressor'},
    anchors: VECTOR.anchors, grips: VECTOR.grips,
    setups: {vector_foregrip: {grips: {left: [.16,-.005,.273], verticalSupport: true,
      leftThumb: VECTOR.grips.foregripThumb, leftThumbPole: VECTOR.grips.foregripThumbPole}}},
  },
  m4_556: {
    name: 'M4', asset: M4, baseParts: ['Receiver'], muzzleParts:['StandardUpper','RailUpper'],
    magazines: {mag_m4_30: 'Magazine'},
    mods: {m4_standard_barrel: ['StandardUpper', 'RearSight'], m4_rail_barrel: ['RailUpper', 'RearSight'],
      m4_stock: 'Stock', ak_frame_stock: 'FrameStock', ak_acog_3x: 'Optic3x', m4_suppressor: 'Suppressor'},
    anchors: M4.anchors, grips: M4.grips,
    setups: {...M4.setups, ak_acog_3x: {hideParts: ['RearSight']}},
    requires: {optic: 'barrel', muzzle: 'barrel'},
  },
  revolver_44: {
    name:'Revolver',asset:REVOLVER,baseParts:['Receiver','Cylinder','Hammer'],magazines:{},
    muzzleParts:['ShortBarrel','LongBarrel','RailBarrel'],
    mods:{revolver_short_barrel:'ShortBarrel',revolver_long_barrel:'LongBarrel',revolver_rail_barrel:'RailBarrel',
      revolver_wood_grip:'WoodGrip',revolver_comfort_grip:'ComfortGrip',reflex_sight:'Reflex',revolver_flashlight:'Flashlight'},
    anchors:REVOLVER.anchors,grips:{...REVOLVER.grips,left:[.16,-.015,.025],leftThumb:[.025,.035,-.045],leftThumbPole:[.10,.09,-.025]},
    setups:{revolver_comfort_grip:{grips:{left:[.165,-.020,.025]}}},
  },
};

export function weaponModelDefinition(weapon) { return MODELS[typeof weapon === 'string' ? weapon : weapon?.type]; }
export function hasWeaponModel(weapon) { return Boolean(weaponModelDefinition(weapon)); }
export { AK as AK_MODEL, VECTOR as VECTOR_MODEL, M4 as M4_MODEL, REVOLVER as REVOLVER_MODEL };
