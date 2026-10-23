// Share concurrent requests; retry temporary failures with a bounded budget.
// A deliberate user retry opens a fresh budget after an earlier failure.
export class ModelAssetCache{
  constructor({loadAsset,now=Date.now,retryDelay=1500,maxAttempts=3}={}){
    this.loadAsset=loadAsset;this.now=now;this.retryDelay=retryDelay;this.maxAttempts=maxAttempts;
    this.entries=new Map();this.revision=0;
  }
  entry(key){
    if(!this.entries.has(key))this.entries.set(key,{asset:null,pending:null,failed:false,error:null,attempts:0,retryAt:0});
    return this.entries.get(key);
  }
  isFailed(key){return this.entry(key).failed;}
  requestAsset(key,url,{retry=false}={}){
    const entry=this.entry(key);
    if(entry.asset)return Promise.resolve(entry.asset);
    if(entry.pending)return entry.pending;
    if(retry&&entry.failed)entry.attempts=0;
    else if(entry.failed&&(this.now()<entry.retryAt||entry.attempts>=this.maxAttempts))return Promise.resolve(null);
    entry.failed=false;entry.attempts++;
    entry.pending=Promise.resolve().then(()=>this.loadAsset(url)).then(asset=>{
      if(!asset)throw Error('Leere Modellantwort');
      this.prepareAsset?.(key,asset);entry.asset=asset;entry.error=null;this.revision++;return asset;
    }).catch(error=>{
      entry.failed=true;entry.error=error;entry.retryAt=this.now()+this.retryDelay;
      console.warn(`Modell ${key} konnte nicht geladen werden.`,error);return null;
    }).finally(()=>{entry.pending=null;});
    return entry.pending;
  }
}
