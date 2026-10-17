import { Box3, Group, Vector3 } from "three";
import AK from "../assets/weapons/ak.json" with { type: "json" };
import { loadModelAsset } from "./model-pass.js";

export const WEAPON_ANCHORS=Object.freeze({stock:new Vector3(0,.04,-.18),optic:new Vector3(0,.15,.12),muzzle:new Vector3(0,.09,.54),magazine:new Vector3(0,-.08,.18)});

export const AK_MODEL = AK;
const BASE_PARTS = ["Receiver", "Handguard", "Barrel"];
const MOD_PARTS = { ak_fixed_stock: "FixedStock", ak_frame_stock: "SkeletonStock", ak_acog_3x: "Optic3x", ak_suppressor: "Suppressor" };

export function weaponModelSignature(weapon) {
  return `${weapon?.id}|${weapon?.type}|${weapon?.magazine?.type || ""}|${Object.values(weapon?.mods || {}).map(mod => mod.type).sort().join("|")}`;
}

export function configureWeaponModel(root, weapon) {
  const visible = new Set([...BASE_PARTS, ...Object.values(weapon.mods || {}).map(mod => MOD_PARTS[mod.type])]);
  if (weapon.magazine?.type === "mag_ak_30") visible.add("Magazine");
  for (const name of Object.keys(AK.parts)) root.getObjectByName(name).visible = visible.has(name);
  const stock=root.getObjectByName(visible.has('FixedStock')?'FixedStock':'SkeletonStock');
  if(stock.visible){const bounds=weaponModelBounds(stock);root.userData.stockContact=bounds.getCenter(new Vector3()).setZ(bounds.min.z);}
  else root.userData.stockContact=null;
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
  constructor({ loadAsset = loadModelAsset } = {}) { this.loadAsset = loadAsset; this.asset = null; this.pending = null; this.failed = false; }
  request() {
    this.pending ||= this.loadAsset(new URL(`../assets/weapons/${AK.file}`, import.meta.url).href)
      .then(asset => { this.asset = asset; return asset; })
      .catch(error => { this.failed = true; console.warn("AK-Modell konnte nicht geladen werden.", error); return null; });
    return this.pending;
  }
  create(weapon) {
    if (weapon?.type !== "ak_762") return null;
    if (!this.asset) { this.request(); return null; }
    const root = this.asset.scene.clone(true);
    root.name = "AK";
    root.traverse(mesh => { if (mesh.isMesh) mesh.frustumCulled = false; });
    return configureWeaponModel(root, weapon);
  }
}

// Inspection and the held weapon use the same parts and the world's shared pass.
export class WeaponInspection {
  constructor(pass, library) { this.pass = pass; this.library = library; this.signature = null; this.root = null; }
  draw(canvas, weapon, yaw = Math.PI/2, pitch = 0) {
    if (weapon?.type !== "ak_762") return;
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
        ctx.fillText(this.library.failed ? "MODELL NICHT GELADEN" : "MODELL WIRD GELADEN …", 15, 35);
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
    this.anchors=project?Object.fromEntries(Object.entries(WEAPON_ANCHORS).map(([slot,p])=>[slot,project(this.model.localToWorld(p.clone()))])):null;
    this.lastDrawKey = drawKey;
    return this.anchors;
  }
}
