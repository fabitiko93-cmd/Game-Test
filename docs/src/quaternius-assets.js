import { QUATERNIUS_MODELS, PLAYER_ANIMATIONS } from "./quaternius-catalog.js";
import { loadModelAsset } from "./model-pass.js";
import {assetUrl} from './asset-url.js';
import {ModelAssetCache} from './model-loading.js';

export class QuaterniusAssets extends ModelAssetCache {
  constructor(options={}) { super({loadAsset:loadModelAsset,...options});this.assets=new Map(); }
  prepareAsset(key,asset){
    asset.scene.traverse(o=>{if(o.isMesh)o.frustumCulled=false;});this.assets.set(key,asset);
  }
  request(key,options={}) {
    const definition = QUATERNIUS_MODELS.characters[key] || QUATERNIUS_MODELS.interiors[key] || (key==='player-motion'?PLAYER_ANIMATIONS:null);
    if (!definition) return Promise.resolve(null);
    return this.requestAsset(key,assetUrl(`quaternius/${definition.file}`),options);
  }
  get(key) { if (!this.assets.has(key)) this.request(key); return this.assets.get(key); }
}
