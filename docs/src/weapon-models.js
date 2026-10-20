import { Box3, Group, Vector3 } from "three";
import { loadModelAsset } from "./model-pass.js";
import { weaponModelDefinition, hasWeaponModel } from './weapon-catalog.js';
export { AK_MODEL, VECTOR_MODEL, M4_MODEL } from './weapon-catalog.js';

export const WEAPON_ANCHORS=Object.freeze({stock:new Vector3(0,.04,-.18),optic:new Vector3(0,.15,.12),muzzle:new Vector3(0,.09,.54),magazine:new Vector3(0,-.08,.18)});

export function weaponModelSignature(weapon) {
  return `${weapon?.id}|${weapon?.type}|${weapon?.magazine?.type || ""}|${Object.values(weapon?.mods || {}).map(mod => mod.type).sort().join("|")}`;
}

export function configureWeaponModel(root, weapon) {
  const definition = weaponModelDefinition(weapon);
  const mods=Object.values(weapon.mods || {}),setups=mods.map(mod=>definition.setups?.[mod.type]).filter(Boolean);
  const parts=mod=>[definition.mods[mod?.type]].flat().filter(Boolean);
  const visible = new Set([...definition.baseParts, ...mods.flatMap(parts)]);
  if (definition.magazines[weapon.magazine?.type]) visible.add(definition.magazines[weapon.magazine.type]);
  for(const setup of setups)for(const name of setup.hideParts || [])visible.delete(name);
  for(const [slot,required] of Object.entries(definition.requires || {}))
    if(!weapon.mods?.[required])for(const name of parts(weapon.mods?.[slot]))visible.delete(name);
  const offsets=Object.assign({},...setups.map(setup=>setup.offsets));
  for (const name of Object.keys(definition.asset.parts)) {
    const part=root.getObjectByName(name);part.visible=visible.has(name);
    part.position.fromArray(offsets[name] || [0,0,0]);
  }
  const stock = root.getObjectByName(definition.mods[weapon.mods?.stock?.type]);
  if(stock?.visible){const bounds=weaponModelBounds(stock);root.userData.stockContact=bounds.getCenter(new Vector3()).setZ(bounds.min.z);}
  else root.userData.stockContact=null;
  root.userData.grips=definition.grips?Object.assign({verticalSupport:false,leftThumb:null,leftThumbPole:null},definition.grips,...setups.map(setup=>setup.grips)):null;
  root.userData.anchors=Object.assign({},definition.anchors,...setups.map(setup=>setup.anchors));
  return root;
}

export function weaponModelBounds(root) {
  root.updateMatrixWorld(true);
  const bounds = new Box3();
  root.traverseVisible(mesh => {
    if (!mesh.isMesh) return;
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    bounds.union(mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld));
  });
  return bounds;
}

export class WeaponModels {
  constructor({ loadAsset = loadModelAsset } = {}) { this.loadAsset = loadAsset; this.entries = new Map(); }
  entry(weapon='ak_762') {
    const type=typeof weapon==='string'?weapon:weapon.type;
    if(!this.entries.has(type))this.entries.set(type,{asset:null,pending:null,failed:false});
    return this.entries.get(type);
  }
  isFailed(weapon) { return this.entry(weapon).failed; }
  request(weapon='ak_762') {
    const definition=weaponModelDefinition(weapon);
    if(!definition)return Promise.resolve(null);
    const entry=this.entry(weapon);
    entry.pending ||= this.loadAsset(new URL(`../assets/weapons/${definition.asset.file}`, import.meta.url).href)
      .then(asset => { entry.asset = asset; return asset; })
      .catch(error => { entry.failed = true; console.warn(`${definition.name}-Modell konnte nicht geladen werden.`, error); return null; });
    return entry.pending;
  }
  create(weapon) {
    const definition=weaponModelDefinition(weapon);
    if (!definition) return null;
    const entry=this.entry(weapon);
    if (!entry.asset) { this.request(weapon); return null; }
    const root = entry.asset.scene.clone(true);
    root.name = definition.name;
    root.traverse(mesh => { if (mesh.isMesh) mesh.frustumCulled = false; });
    return configureWeaponModel(root, weapon);
  }
}

// Inspection and the held weapon use the same parts and the world's shared pass.
export class WeaponInspection {
  constructor(pass, library) { this.pass = pass; this.library = library; this.signature = null; this.root = null; }
  draw(canvas, weapon, yaw = Math.PI/2, pitch = 0) {
    if (!hasWeaponModel(weapon)) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    const drawKey = `${weaponModelSignature(weapon)}|${yaw}|${pitch}|${rect.width}|${rect.height}|${globalThis.devicePixelRatio}|${this.pass.status}`;
    if (this.lastDrawKey === drawKey) return this.anchors;
    const ctx = canvas.getContext("2d");
    const signature = weaponModelSignature(weapon);
    if (this.signature !== signature) {
      const model = this.library.create(weapon);
      if (!model) {
        ctx.clearRect(0,0,canvas.width,canvas.height);ctx.fillStyle = "#b6b8a3"; ctx.font = '12px sans-serif';
        ctx.fillText(this.library.isFailed(weapon) ? "MODELL NICHT GELADEN" : "MODELL WIRD GELADEN …", 15, 35);
        return;
      }
      model.updateMatrixWorld(true);
      const bounds=weaponModelBounds(model),center = bounds.getCenter(new Vector3());
      this.length=bounds.getSize(new Vector3()).length();
      model.position.sub(center);
      this.root = new Group(); this.root.add(model);this.model=model; this.signature = signature;
    }
    this.root.rotation.set(pitch,yaw,0,'YXZ');
    const height=Math.max(.5,this.length/(rect.width/rect.height*.64));
    const project=this.pass.drawInspection(canvas,this.root,{height,center:new Vector3(),elevation:.05});
    const anchors=this.model.userData.anchors;
    this.anchors=project?Object.fromEntries(Object.entries(anchors).map(([slot,p])=>[slot,project(this.model.localToWorld(new Vector3().fromArray(p)))])):null;
    this.lastDrawKey = drawKey;
    return this.anchors;
  }
}
