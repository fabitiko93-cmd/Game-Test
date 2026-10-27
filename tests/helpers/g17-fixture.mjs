import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {QuaterniusAssets} from '../../docs/src/quaternius-assets.js';
import {PlayerModels} from '../../docs/src/player-models.js';
import {AnimationReplay} from '../../docs/src/animation-replay.js';

const cache=new Map();
async function load(url){
  const name=new URL(url).pathname.split('/').at(-1),folder=/^g17-/.test(name)?'weapons':'quaternius';
  if(!cache.has(name))cache.set(name,(async()=>{
    const bytes=gunzipSync(await readFile(new URL('../../docs/assets/'+folder+'/'+name,import.meta.url)));
    return new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  })());
  return cache.get(name);
}
const assets=new QuaterniusAssets({loadAsset:load});
export async function g17Fixture(options={}){
  const models=new PlayerModels({},assets);models.weapons.loadAsset=load;
  const replay=new AnimationReplay(models);await replay.configure({sex:'male',type:'pistol_9mm',track:'aim',movement:'idle',...options});
  return{models,replay,get entity(){return replay.entity;},get player(){return replay.player;}};
}
