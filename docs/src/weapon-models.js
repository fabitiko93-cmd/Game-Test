import { Box3, Group, Vector3 } from "three";
import AK from "../assets/weapons/ak.json" with { type: "json" };
import { loadModelAsset } from "./model-pass.js";
import { pixelsPerMeter } from "./world-scale.js";

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
  draw(canvas, weapon, yaw = Math.PI * .75) {
    if (weapon?.type !== "ak_762") return;
    const rect = canvas.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    if (rect.width < 1 || rect.height < 1) return;
    if (canvas.width !== Math.round(rect.width * dpr) || canvas.height !== Math.round(rect.height * dpr)) {
      canvas.width = Math.round(rect.width * dpr); canvas.height = Math.round(rect.height * dpr);
    }
    const drawKey = `${weaponModelSignature(weapon)}|${yaw}|${canvas.width}|${canvas.height}|${this.pass.status}`;
    if (this.lastDrawKey === drawKey) return;
    const ctx = canvas.getContext("2d");
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height);
    const signature = weaponModelSignature(weapon);
    if (this.signature !== signature) {
      const model = this.library.create(weapon);
      if (!model) {
        ctx.fillStyle = "#b6b8a3"; ctx.font = `${12 * dpr}px sans-serif`;
        ctx.fillText(this.library.failed ? "MODELL NICHT GELADEN" : "MODELL WIRD GELADEN …", 15 * dpr, 35 * dpr);
        return;
      }
      model.updateMatrixWorld(true);
      const center = weaponModelBounds(model).getCenter(new Vector3());
      model.position.sub(center);
      this.root = new Group(); this.root.add(model); this.signature = signature;
    }
    this.root.rotation.y = yaw;
    const zoom = rect.width / (1.5 * pixelsPerMeter);
    ctx.setTransform(dpr * zoom, 0, 0, dpr * zoom, canvas.width / 2, canvas.height / 2);
    this.pass.beginFrame(dpr * zoom);
    this.pass.draw(ctx, this.root, { x: 0, y: 0 }, { software: true, viewMeters: 1.6, centerHeight: 0 });
    this.lastDrawKey = drawKey;
  }
}
