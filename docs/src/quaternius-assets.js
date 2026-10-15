import { QUATERNIUS_MODELS, PLAYER_ANIMATIONS } from "./quaternius-catalog.js";
import { loadModelAsset } from "./model-pass.js";

const ASSETS = new URL("../assets/quaternius/", import.meta.url);

export class QuaterniusAssets {
  constructor({ loadAsset = loadModelAsset } = {}) { this.loadAsset = loadAsset; this.assets = new Map(); this.pending = new Map(); }
  request(key) {
    if (this.pending.has(key)) return this.pending.get(key);
    const definition = QUATERNIUS_MODELS.characters[key] || QUATERNIUS_MODELS.interiors[key] || (key==='player-motion'?PLAYER_ANIMATIONS:null);
    if (!definition) return Promise.resolve(null);
    const promise = this.loadAsset(new URL(definition.file, ASSETS).href).then(asset => {
      asset.scene.traverse(o=>{if(o.isMesh)o.frustumCulled=false;});
      this.assets.set(key, asset); return asset;
    }).catch(error=>{console.warn(`Modell ${key} konnte nicht geladen werden.`,error);return null;});
    this.pending.set(key,promise); return promise;
  }
  get(key) { if (!this.pending.has(key)) this.request(key); return this.assets.get(key); }
}
