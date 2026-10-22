import MODELS from "../assets/quaternius/models.json" with { type: "json" };
import ANIMATIONS from "../assets/quaternius/player-animations.json" with { type: "json" };
import { metersToTiles, WORLD_SCALE } from "./world-scale.js";
import { ITEMS } from './data.js';
import { BODY_SOURCES, HEADWEAR_MODELS } from './clothing-catalog.js';

export { MODELS as QUATERNIUS_MODELS };
export { ANIMATIONS as PLAYER_ANIMATIONS };
export const CHARACTER_STYLES = Object.freeze({
  male: { Casual_2: "Alltag", Casual_Hoodie: "Kapuzenjacke", Worker: "Arbeitskleidung", Farmer: "Landarbeit",
    Adventurer: "Outdoor", Suit: "Anzug", Punk: "Punk", Swat: "Einsatzkleidung" },
  female: { Casual: "Alltag", Worker: "Arbeitskleidung", Adventurer: "Outdoor", Formal: "Ausgehkleidung",
    Suit: "Anzug", Punk: "Punk", Soldier: "Militärkleidung" },
});
export const defaultStyle = sex => sex === "female" ? "Casual" : "Casual_2";

export function createPlayerAppearance(profile = {}) {
  const sex = profile.sex === "female" ? "female" : "male";
  const key = style => MODELS.characters[`${sex}-${style}`] ? `${sex}-${style}` : `${sex}-${defaultStyle(sex)}`;
  const base = key(profile.style);
  return { sex, head: profile.head ? key(profile.head.replace(`${sex}-`, "")) : base,
    torso: profile.torso ? key(profile.torso.replace(`${sex}-`, "")) : base,
    legs: profile.legs ? key(profile.legs.replace(`${sex}-`, "")) : base,
    feet: profile.feet ? key(profile.feet.replace(`${sex}-`, "")) : base };
}

export function playerModelAppearance(player) {
  const appearance = createPlayerAppearance(player.appearance);
  const equippedItem = slot => player.inventory?.find(item=>item.id===player.equipment?.[slot]);
  // Appearance chooses the person. Only equipped inventory items dress them.
  if(HEADWEAR_MODELS.has(appearance.head))appearance.head=`${appearance.sex}-${defaultStyle(appearance.sex)}`;
  appearance.bare=[];
  for(const slot of ['torso','legs','feet']) {
    const item=equippedItem(slot),definition=ITEMS[item?.type];
    let model=definition?.clothingModel;
    const legacy={work_jacket:'Worker',leather_jacket:'Punk',jeans:defaultStyle(appearance.sex)};
    if(legacy[item?.type])model=`${appearance.sex}-${legacy[item.type]}`;
    if(['outfit_top','outfit_trousers'].includes(item?.type))model=`${appearance.sex}-${item.modelStyle||defaultStyle(appearance.sex)}`;
    if(MODELS.characters[model])appearance[slot]=model;
    else {appearance[slot]=BODY_SOURCES[appearance.sex][slot];appearance.bare.push(slot);}
  }
  appearance.headwear=ITEMS[equippedItem('head')?.type]?.clothingModel||null;
  return appearance;
}

export const playerHeight = appearance => appearance?.sex === "female" ? WORLD_SCALE.player.futureFemaleHeight : WORLD_SCALE.player.height;
export const playerModelScale = appearance => playerHeight(appearance)/MODELS.playerReference[appearance?.sex === "female" ? "female" : "male"];

export const FURNITURE_MODELS = Object.freeze({
  cabinet: { asset: "Kitchen_Cabinet1" }, fridge: { asset: "Kitchen_Fridge" }, shelf: { asset: "Bookshelf" },
  bed: { asset: "Bed_Single" }, desk: { asset: "Table_RoundLarge",height:.74 },
  locker: { asset: "Shelf_2", front: true }, gunlocker: { asset: "Shelf_2", front: true },
  counter: { asset: "Kitchen_3Drawers", count: 3 },
});

export function furnishingDefinition(object) {
  if(typeof object==="string")return FURNITURE_MODELS[object];
  return MODELS.interiors[object.modelAsset]?{asset:object.modelAsset}:FURNITURE_MODELS[object.type];
}

export const furnishingYaw=object=>object.yaw??(object.orientation==="y"?-Math.PI/2:0);

export function furnishingDimensions(object) {
  const definition = furnishingDefinition(object); if (!definition) return null;
  const size = MODELS.interiors[definition.asset].dimensions;
  return { ...size,height:(typeof object==='object'?object.modelHeight:null)||definition.height||size.height,
    width: size.width*(definition.count || 1), depth: size.depth+(definition.front ? .07 : 0) };
}

export function furnishingFootprint(object) {
  const size = furnishingDimensions(object); if (!size) return null;
  const yaw=furnishingYaw(object),c=Math.abs(Math.cos(yaw)),s=Math.abs(Math.sin(yaw));
  return {x:metersToTiles((size.width*c+size.depth*s)/2),y:metersToTiles((size.width*s+size.depth*c)/2)};
}
