// Public assets belong to the game page, independently of which build chunk
// contains their loader. Source-only Node tooling uses the source asset tree.
const sourceAssets=new URL('../assets/',import.meta.url);
export function assetUrl(name){
  const page=globalThis.document?.baseURI;
  return new URL(name,page?new URL('./assets/',page):sourceAssets).href;
}
