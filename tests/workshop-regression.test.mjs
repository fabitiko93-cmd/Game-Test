import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {Vector3} from 'three';
import {PlayerModels} from '../docs/src/player-models.js';
import {QuaterniusAssets} from '../docs/src/quaternius-assets.js';
import {WeaponModels} from '../docs/src/weapon-models.js';
import {AnimationReplay,measureAnimation} from '../docs/src/animation-replay.js';
import {WEAPON_TYPES} from '../docs/src/animation-document.js';
import {weaponModelDefinition} from '../docs/src/weapon-catalog.js';
import {activeWeapon,createItem,addItem,equipItem} from '../docs/src/inventory.js';
import {createPlayer} from '../docs/src/character.js';
import {ITEMS} from '../docs/src/data.js';
import {loadModelAsset} from '../docs/src/model-pass.js';

const cache=new Map();
async function parse(url){
  if(!cache.has(url))cache.set(url,(async()=>{let bytes=await readFile(new URL(url));if(bytes[0]===31&&bytes[1]===139)bytes=gunzipSync(bytes);
    return new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');})());
  return cache.get(url);
}
const library=new QuaterniusAssets({loadAsset:parse});
function models(){const m=new PlayerModels({},library);m.weapons.loadAsset=parse;return m;}

test('all eight workshop weapons receive selected attachments and real loaded ammunition on both rigs',async()=>{
  for(const sex of ['male','female'])for(const type of WEAPON_TYPES){
    const mods=Object.fromEntries(Object.keys(weaponModelDefinition(type).mods).map(type=>[ITEMS[type].modSlot,type]));
    const r=new AnimationReplay(models());await r.configure({sex,type,mods});
    const w=activeWeapon(r.player);
    assert.equal(w.magazine?.rounds??w.rounds,3,`${sex} ${type} starts loaded`);
    for(const [slot,type]of Object.entries(mods))assert.equal(w.mods[slot]?.type,type,`${slot} selection reaches the inventory copy`);
    assert.equal(r.entity.weapon.userData.weaponId,w.id);
    if(w.magazine)assert.ok(r.entity.weapon.getObjectByName(r.entity.weapon.userData.magazinePart).visible);
    assert.ok(r.fire());assert.equal(w.magazine?.rounds??w.rounds,2);
    if(type==='revolver_44'){assert.equal(w.cylinderIndex,1);assert.equal(w.spentCases,1);}
    assert.ok(r.fire());assert.ok(r.fire());assert.equal(r.fire(),false,'an empty test weapon cannot simulate another shot');
    if(w.magazine)assert.equal(w.slideLocked,true);
    r.dispose();
  }
});

test('model loading deduplicates pending requests, bounds automatic retries and permits deliberate recovery',async t=>{
  t.mock.method(console,'warn',()=>{});
  let clock=0,calls=0,finish,success=false;
  const m=new WeaponModels({now:()=>clock,loadAsset:async()=>{calls++;await new Promise(resolve=>finish=resolve);if(!success)throw Error('temporary failure');return{scene:{}};}});
  for(let attempt=1;attempt<=3;attempt++){
    const request=m.request('pistol_9mm');assert.equal(m.request('pistol_9mm'),request);
    await Promise.resolve();finish();assert.equal(await request,null);assert.equal(calls,attempt);
    assert.equal(await m.request('pistol_9mm'),null,'retry delay prevents a frame-by-frame request storm');clock+=1500;
  }
  assert.equal(await m.request('pistol_9mm'),null);assert.equal(calls,3,'automatic budget is exhausted');
  success=true;const retry=m.request('pistol_9mm',{retry:true});await Promise.resolve();finish();
  const asset=await retry;assert.ok(asset);assert.equal(m.isFailed('pistol_9mm'),false);assert.equal(m.revision,1);
  assert.equal(await m.request('pistol_9mm'),asset);assert.equal(calls,4);
});

test('missing workshop assets report failure and a second configuration retries the failed asset',async t=>{
  t.mock.method(console,'warn',()=>{});
  const m=models(),r=new AnimationReplay(m);let working=false;
  m.weapons.loadAsset=url=>working?parse(url):Promise.reject(Error('HTTP 404'));
  await assert.rejects(r.configure({type:'pistol_9mm'}),/Waffenmodell/);
  working=true;await r.configure();assert.ok(r.entity.weapon);r.dispose();
  const e=models(),p=createPlayer();await e.ready;addItem(p,createItem('pistol_9mm'));equipItem(p,p.inventory.at(-1).id);
  e.weapons.loadAsset=async()=>{throw Error('offline');};
  const entity=e.prepare(p,0);assert.ok(measureAnimation(entity,p).warnings.includes('Waffenmodell nicht geladen.'));e.release(entity);
  working=false;
  const assets=new QuaterniusAssets({loadAsset:url=>!working&&url.includes('player-crouch')?Promise.reject(Error('offline body')):parse(url)});
  const b=new PlayerModels({},assets);b.weapons.loadAsset=parse;const bodyReplay=new AnimationReplay(b);
  await assert.rejects(bodyReplay.configure(),/Figurenmodell/);working=true;
  await bodyReplay.configure();assert.ok(bodyReplay.entity.weapon);bodyReplay.dispose();
});

test('a stalled model transfer aborts so the loader can recover instead of staying pending forever',async t=>{
  t.mock.method(globalThis,'fetch',(_url,{signal})=>new Promise((_resolve,reject)=>{
    signal.addEventListener('abort',()=>reject(signal.reason),{once:true});
  }));
  await assert.rejects(loadModelAsset('https://example.test/assets/stalled.glb.gz',{timeoutMs:5}),{name:'AbortError'});
});

test('late weapon loads invalidate the evaluated pose even when game time is paused',async()=>{
  const m=models();await m.ready;let finish;const gate=new Promise(resolve=>finish=resolve);
  m.weapons.loadAsset=async url=>{await gate;return parse(url);};
  const p=createPlayer();addItem(p,createItem('pistol_9mm'));equipItem(p,p.inventory.at(-1).id);
  assert.equal(m.prepare(p,10).weapon,null);
  finish();await m.weapons.request('pistol_9mm');
  assert.ok(m.shotMuzzle(p,10),'socket queries also see a newly loaded weapon before the next draw');
  const e=m.prepare(p,10);assert.ok(e.weapon,'the first paused frame after loading attaches the model');
  const clock=e.mixer.time;m.prepare(p,10);m.shotMuzzle(p,10);assert.equal(e.mixer.time,clock);m.release(e);
});

test('terminal frame navigation visits the preceding frame at 30/60 Hz and clip rounding cannot create nanosecond steps',async()=>{
  for(const fps of [30,60]){
    const r=new AnimationReplay(models());await r.configure({type:'pistol_9mm',track:'toAim',fps});r.seek(r.duration);
    const previous=Math.floor(r.duration*fps)/fps;r.seek(r.adjacentTime(-1));assert.equal(r.time,previous);
    r.seek(r.adjacentTime(1));assert.equal(r.time,r.duration);r.seek(0);assert.equal(r.time,0);r.dispose();
    const a=new AnimationReplay(models());await a.configure({type:'ak_762',track:'crouchCarry',fps});
    const intervals=[],evaluate=a.evaluate.bind(a);a.evaluate=delta=>{intervals.push(delta);return evaluate(delta);};
    a.seek(a.duration);assert.equal(a.time,a.duration);assert.ok(Math.min(...intervals)>.9/fps);
    assert.ok(a.diagnostics.sides.L.speed<4,'the terminal diagnostic uses a real observation interval');
    const previousJoints=structuredClone(a.diagnostics.joints);previousJoints.WristR[0]+=1;
    assert.ok(measureAnimation(a.entity,a.player,previousJoints,1/fps).warnings.includes('R: schneller Handsprung'),'real jumps remain visible');
    const point=a.entity.weapon.getWorldPosition(new Vector3());a.seek(a.duration,{reset:true});
    assert.ok(point.distanceTo(a.entity.weapon.getWorldPosition(new Vector3()))<1e-9);a.dispose();
  }
});
