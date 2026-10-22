import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {Vector3} from 'three';
import {AnimationProject,ANIMATION_STORAGE,emptyAnimation,emptyValues,parseAnimation,profileKey,putFrame,sampleTrack,validateAnimation,WEAPON_TYPES,TRACKS} from '../docs/src/animation-document.js';
import {applyAnimation,appliedAnimation} from '../docs/src/animation-library.js';
import {AnimationReplay} from '../docs/src/animation-replay.js';
import {PlayerModels} from '../docs/src/player-models.js';
import {QuaterniusAssets} from '../docs/src/quaternius-assets.js';
import {weaponModelDefinition} from '../docs/src/weapon-catalog.js';
import {ITEMS} from '../docs/src/data.js';

const cache=new Map();
async function parse(url){
  if(!cache.has(url))cache.set(url,(async()=>{let b=await readFile(new URL(url));if(b[0]===31&&b[1]===139)b=gunzipSync(b);return new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');})());
  return cache.get(url);
}
const assets=new QuaterniusAssets({loadAsset:parse});
const storage=()=>{const values=new Map();return{getItem:key=>values.get(key),setItem:(key,v)=>values.set(key,v)};};
function models(){const m=new PlayerModels({},assets);m.weapons.loadAsset=parse;return m;}
async function replay(options,document=null){const r=new AnimationReplay(models());r.setDocument(document,1);await r.configure(options);return r;}
function snapshot(r){const pose={time:r.time,events:r.events,player:r.player};r.entity.root.traverse(o=>{if(o.isBone||o.parent?.name==='Weapon'||o.name==='Magazine')pose[o.name]=[...o.position,...o.quaternion];});return JSON.stringify(pose);}

test('portable profiles validate, interpolate, preserve both rigs, undo/redo and reload from storage',()=>{
  const s=storage(),p=new AnimationProject(s),v=emptyValues();v.weapon[0]=.08;
  p.replace(putFrame(p.document,profileKey('male','pistol_9mm'),'aim',.5,v));
  assert.ok(Math.abs(sampleTrack(p.document,'male:pistol_9mm','aim',.25).weapon[0]-.04)<1e-10);
  const female=emptyValues();female.support[1]=.02;p.replace(putFrame(p.document,'female:pistol_9mm','toAim',.5,female));
  assert.ok(p.document.profiles['male:pistol_9mm']);assert.ok(p.undo());assert.equal(p.document.profiles['female:pistol_9mm'],undefined);assert.ok(p.redo());
  p.save();assert.deepEqual(new AnimationProject(s).document,p.document);assert.deepEqual(parseAnimation(p.serialize()),p.document);
  assert.ok(s.getItem(ANIMATION_STORAGE));
  const invalid=emptyValues();invalid.weapon[0]=1;assert.throws(()=>putFrame(p.document,'male:pistol_9mm','aim',.5,invalid));
  assert.throws(()=>parseAnimation('{"format":"other","version":1,"profiles":{}}'));
  assert.throws(()=>validateAnimation({...emptyAnimation(),profiles:{'male:missing':{tracks:{}}}}));
  const bad=new AnimationProject({getItem(){throw Error('Storage blocked');}});assert.equal(bad.error,'Storage blocked');assert.throws(()=>bad.save());
});

test('saving a draft does not activate it; activation persists independently and advances the runtime revision',()=>{
  const s=storage(),p=new AnimationProject(s),before=appliedAnimation().revision,v=emptyValues();v.head[1]=3;
  p.replace(putFrame(p.document,'male:pistol_9mm','aim',.5,v));p.save();assert.equal(appliedAnimation().revision,before);
  applyAnimation(p.document,s);assert.deepEqual(appliedAnimation().document,p.document);assert.equal(appliedAnimation().revision,before+1);
  const active=appliedAnimation().document;assert.throws(()=>applyAnimation(emptyAnimation(),{setItem(){throw Error('Quota');}}));assert.deepEqual(appliedAnimation().document,active);
  applyAnimation(emptyAnimation(),s);
});

test('all eight weapon families and both original rigs evaluate in the shared controller at 30/60 Hz',async()=>{
  for(const sex of ['male','female'])for(const type of WEAPON_TYPES)for(const fps of [30,60]){
    const mods=fps===60?Object.fromEntries(Object.keys(weaponModelDefinition(type).mods).map(id=>[ITEMS[id].modSlot,id])):{};
    const r=await replay({sex,type,fps,track:'aim',movement:'crouchWalk',mods});
    r.seek(.25);assert.ok(r.entity.weapon,`${sex} ${type}`);assert.deepEqual(r.diagnostics.warnings.filter(w=>w.includes('ungültige')),[]);
    assert.equal(r.entity.animationOwners.right,'Waffenhaltung');assert.equal(r.models.controller.constructor.name,'AnimationController');
    for(const q of Object.values(r.diagnostics.joints))assert.ok(q.every(Number.isFinite));
    r.dispose();
  }
});

test('the live renderer reuses one evaluated pose, keeps offscreen state and picks up activated profiles',async()=>{
  const r=await replay({sex:'female',type:'pistol_9mm',track:'aim'}),m=r.models,p=r.player,s=storage();
  for(let i=0;i<30;i++)m.update(p,10+i/60);
  const time=10+29/60,e=m.entities.get(p),before=e.model.getObjectByName('Head').quaternion.clone(),clock=e.mixer.time;
  m.beginFrame();m.endFrame();assert.equal(m.entities.get(p),e,'updated offscreen character retains its controller history');
  const state=JSON.stringify(p);m.shotMuzzle(p,time);m.ejectionSocket(p,time);assert.equal(e.mixer.time,clock);assert.equal(JSON.stringify(p),state);
  const v=emptyValues();v.head[1]=5;let doc=putFrame(emptyAnimation(),'female:pistol_9mm','aim',0,v);doc=putFrame(doc,'female:pistol_9mm','aim',1,v);
  applyAnimation(doc,s);m.prepare(p,time);assert.ok(e.model.getObjectByName('Head').quaternion.angleTo(before)>.03,'the game uses the same saved pose data');
  const after=e.mixer.time;m.prepare(p,time);m.shotMuzzle(p,time);m.ejectionSocket(p,time);assert.equal(e.mixer.time,after);
  applyAnimation(emptyAnimation(),s);r.dispose();
});

test('backward seeking, repeated drawing inputs and interrupted reloads reproduce the complete animation state',async()=>{
  for(const sex of ['male','female'])for(const scenario of ['transitions','interrupt','turn']){
    const r=await replay({sex,type:'pistol_9mm',scenario});
    const base=JSON.stringify(r.base);r.seek(2.6);const first=snapshot(r);r.seek(3.5);r.seek(.3);r.seek(2.6);assert.equal(snapshot(r),first,`${sex} ${scenario} replay`);
    const entity=r.entity,key=entity.animationEvaluationKey,mixerTime=entity.mixer.time,pose=snapshot(r);
    r.models.shotMuzzle(r.player,r.time);r.models.ejectionSocket(r.player,r.time);
    assert.equal(entity.mixer.time,mixerTime,'socket queries do not advance animation');assert.equal(snapshot(r),pose,'socket queries preserve the evaluated pose');
    // Production calls use their own implicit pose context; subsequent queries
    // at that context must reuse the evaluation without ticking the mixer.
    const repeated=entity.mixer.time;r.models.shotMuzzle(r.player,r.time);r.models.ejectionSocket(r.player,r.time);assert.equal(entity.mixer.time,repeated);
    assert.equal(JSON.stringify(r.base),base,'preview does not mutate its initial state');
    r.seek(2.6,{reset:true});assert.equal(snapshot(r),first);r.dispose();
  }
});

test('saved target edits affect reached weapon/support/body poses and replay identically after export/import',async()=>{
  for(const sex of ['male','female']){
    const key=profileKey(sex,'pistol_9mm'),values=emptyValues();values.weapon[0]=-.025;values.support[1]=-.015;values.head[1]=4;
    const doc=putFrame(emptyAnimation(),key,'aim',.5,values),r=await replay({sex,type:'pistol_9mm',track:'aim'},doc);
    r.seek(r.duration*.5);const edited=snapshot(r),position=r.entity.weapon.getWorldPosition(new Vector3());
    const original=await replay({sex,type:'pistol_9mm',track:'aim'});original.seek(r.time);
    assert.ok(position.distanceTo(original.entity.weapon.getWorldPosition(new Vector3()))>.005,sex+' weapon edit is actually applied');
    const head=r.entity.model.getObjectByName('Head').quaternion;assert.ok(head.angleTo(original.entity.model.getObjectByName('Head').quaternion)>.03);
    r.setDocument(parseAnimation(JSON.stringify(doc)),2);r.seek(r.time,{reset:true});assert.equal(snapshot(r),edited);
    r.dispose();original.dispose();
  }
});

test('transition and reload editing use their real action clocks, with the ammunition event and magazine preserved',async()=>{
  for(const sex of ['male','female'])for(const type of ['pistol_9mm','revolver_44','m4_556'])for(const track of ['toAim','reload','shot']){
    const values=emptyValues();values.weapon[1]=.01;values.elbowL[0]=.015;
    const doc=putFrame(emptyAnimation(),profileKey(sex,type),track,.5,values),r=await replay({sex,type,track},doc);
    r.seek(r.duration*.5);assert.ok(r.entity.animationEdits.weapon[1]>.003,`${sex} ${type} ${track} data reaches the arm solver`);
    r.seek(r.duration);assert.ok(r.time>=r.duration-1e-8,'last frame reaches the real end');
    if(track==='reload'){assert.equal(r.player.combat.reload,undefined);assert.ok(r.player.inventory.find(w=>w.type===type).magazine?.rounds===7||type==='revolver_44');}
    r.dispose();
  }
});
