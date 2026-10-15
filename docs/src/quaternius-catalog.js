import MODELS from "../assets/quaternius/models.json" with { type: "json" };
import { metersToTiles, WORLD_SCALE } from "./world-scale.js";

export { MODELS as QUATERNIUS_MODELS };
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
  const equipped = slot => player.inventory?.find(item=>item.id===player.equipment?.[slot])?.type;
  const torso = equipped("torso"), legs = equipped("legs");
  if (torso === "work_jacket") appearance.torso = `${appearance.sex}-Worker`;
  if (torso === "leather_jacket") appearance.torso = `${appearance.sex}-Punk`;
  if (legs === "jeans") appearance.legs = `${appearance.sex}-${defaultStyle(appearance.sex)}`;
  return appearance;
}

export const playerHeight = appearance => appearance?.sex === "female" ? WORLD_SCALE.player.futureFemaleHeight : WORLD_SCALE.player.height;
export const playerModelScale = appearance => playerHeight(appearance)/MODELS.playerReference[appearance?.sex === "female" ? "female" : "male"];

export const FURNITURE_MODELS = Object.freeze({
  cabinet: { asset: "Kitchen_Cabinet1" }, fridge: { asset: "Kitchen_Fridge" }, shelf: { asset: "Bookshelf" },
  bed: { asset: "Bed_Single" }, desk: { asset: "Table_RoundSmall" },
  locker: { asset: "Shelf_2", front: true }, gunlocker: { asset: "Shelf_2", front: true },
  counter: { asset: "Kitchen_3Drawers", count: 3 },
});

export function furnishingDimensions(type) {
  const definition = FURNITURE_MODELS[type]; if (!definition) return null;
  const size = MODELS.interiors[definition.asset].dimensions;
  return { ...size, width: size.width*(definition.count || 1), depth: size.depth+(definition.front ? .07 : 0) };
}

export function furnishingFootprint(object) {
  const size = furnishingDimensions(object.type); if (!size) return null;
  return object.orientation === "y" ? { x: metersToTiles(size.depth/2), y: metersToTiles(size.width/2) }
    : { x: metersToTiles(size.width/2), y: metersToTiles(size.depth/2) };
}
