import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {OrthographicCamera,Plane,Quaternion,Vector3} from 'three';
import {AnimationProject,emptyAnimation,emptyValues,parseAnimation,putPose,putFrame,putDuration,poseValues,WEAPON_TYPES} from '../docs/src/animation-document.js';
import {PlayerModels} from '../docs/src/player-models.js';
import {QuaterniusAssets} from '../docs/src/quaternius-assets.js';
import {AnimationReplay} from '../docs/src/animation-replay.js';
import {bindWorkshopInteraction,dragValues,screenPointToWorld} from '../docs/src/workshop-interaction.js';

const cache=new Map();
async function parse(url){if(!cache.has(url))cache.set(url,(async()=>{let b=await readFile(new URL(url));if(b[0]===31)b=gunzipSync(b);return new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');})());return cache.get(url);}
const library=new QuaterniusAssets({loadAsset:parse});
async function replay(options,document=null){const models=new PlayerModels({},library);models.weapons.loadAsset=parse;const r=new AnimationReplay(models);r.setDocument(document,1);await r.configure(options);return r;}
const point=(r,name)=>r.entity.model.getObjectByName(name).getWorldPosition(new Vector3());
function lengths(r){return ['R','L'].flatMap(s=>[['UpperLeg'+s,'LowerLeg'+s],['UpperArm'+s,'LowerArm'+s],['LowerArm'+s,'Wrist'+s]].map(([a,b])=>point(r,a).distanceTo(point(r,b))));}

test('static whole-body poses persist independently of the timeline on all eight weapons and both original rigs',async()=>{
  for(const sex of ['male','female'])for(const type of WEAPON_TYPES){
    const key=sex+':'+type,v=emptyValues();v.head[1]=5;v.weapon[0]=.01;v.pelvis[1]=-.06;v.footR[0]=-.02;
    const doc=putPose(emptyAnimation(),key,'aim',v),r=await replay({sex,type,track:'aim'},parseAnimation(JSON.stringify(doc))),base=await replay({sex,type,track:'aim'}),original=lengths(base);
    for(const t of [0,.5,1]){
      r.seek(r.duration*t);base.seek(base.duration*t);
      assert.equal(r.entity.animationEdits.head[1],5);assert.equal(r.entity.animationEdits.pelvis[1],-.06);
      assert.ok(r.entity.weapon);assert.ok(r.models.shotMuzzle(r.player,r.time));
      for(const [i,l]of lengths(r).entries())assert.ok(Math.abs(l-original[i])<1e-5,`${sex} ${type} limb ${i} retains its physical length`);
      assert.ok(point(r,'Body').y<point(base,'Body').y-.045);
      for(const side of ['R','L']){assert.ok(point(r,'Foot'+side).y>=point(base,'Foot'+side).y-.003);assert.ok(r.entity.characterGaps[side]<.012);}
      r.entity.root.traverse(o=>{if(o.isBone)assert.ok([...o.position,...o.quaternion].every(Number.isFinite));});
    }
    assert.deepEqual(doc.profiles[key].tracks,{},'a static pose creates no endpoint keyframes');r.dispose();base.dispose();
  }
});

test('stand-pose edits never freeze walking legs, and clearing a body pose restores the original evaluated skeleton',async()=>{
  const values=emptyValues();values.pelvis[1]=-.1;values.footL[2]=.1;values.kneeR[0]=.02;
  const doc=putPose(emptyAnimation(),'female:pistol_9mm','aim',values),edited=await replay({sex:'female',movement:'walk',track:'aim'},doc),original=await replay({sex:'female',movement:'walk',track:'aim'});
  for(const t of [.2,.4]){edited.seek(t);original.seek(t);for(const name of ['Body','UpperLegL','LowerLegR','FootR'])assert.ok(point(edited,name).distanceTo(point(original,name))<1e-8);}
  const standing=await replay({sex:'female',track:'aim'},doc),neutral=await replay({sex:'female',track:'aim'});
  standing.previewEdits(emptyAnimation(),2);
  for(const name of ['Body','UpperLegR','LowerLegL','FootL','FootR'])assert.ok(point(standing,name).distanceTo(point(neutral,name))<1e-7,name+' is restored');
  for(const r of [edited,original,standing,neutral])r.dispose();
});

test('free support-hand targets and explicit grip contacts share the real arm solver and preserve the weapon',async()=>{
  for(const type of ['pistol_9mm','revolver_44','m4_556']){
    const r=await replay({sex:'male',type,track:'aim'}),values=emptyValues(),origin=r.entity.root.getWorldPosition(new Vector3()),yaw=r.entity.root.getWorldQuaternion(new Quaternion());
    const target=point(r,'Middle2L').sub(origin).applyQuaternion(yaw.clone().invert());target.y-=.035;
    values.contactL[0]=-1;values.freeHandL=target.toArray();
    const doc=putPose(emptyAnimation(),'male:'+type,'aim',values);r.setDocument(doc,2);r.seek(0,{reset:true});
    assert.ok(r.entity.animationTargets.support.distanceTo(target.applyQuaternion(yaw).add(origin))<1e-7,type);
    assert.ok(r.entity.weapon&&r.models.shotMuzzle(r.player,r.time));
    const drag=dragValues(values,'support','move',0,new Vector3(.02,0,0),0,yaw);assert.equal(drag.freeHandL[0],values.freeHandL[0]+.02);assert.deepEqual(drag.support,values.support);
    r.dispose();
  }
});

test('transition duration edits affect the real transition clock without changing reload ammunition timing',async()=>{
  let doc=putDuration(emptyAnimation(),'male:pistol_9mm','aim',1.15);
  const r=await replay({sex:'male',type:'pistol_9mm',track:'toAim'},doc);assert.equal(r.duration,1.15);r.seek(.4);assert.equal(r.entity.rifleTransition.duration,1.15);r.dispose();
  const reload=await replay({sex:'male',type:'pistol_9mm',track:'reload'},doc),base=await replay({sex:'male',type:'pistol_9mm',track:'reload'});assert.equal(reload.duration,base.duration);assert.deepEqual(reload.markers,base.markers);reload.dispose();base.dispose();
});

test('gesture transactions coalesce previews, cancel cleanly, keep other profiles and accept previous exports',()=>{
  const p=new AnimationProject(),v=emptyValues();v.head[0]=3;p.replace(putPose(p.document,'female:m4_556','carry',v));const before=p.serialize();
  p.begin();for(const n of [1,2,3]){v.weapon[0]=n*.01;p.preview(putPose(p.document,'male:pistol_9mm','aim',v));}assert.equal(p.undoStack.length,1);p.commit();assert.equal(p.undoStack.length,2);p.undo();assert.equal(p.serialize(),before);p.redo();
  const last=p.serialize();p.begin();p.preview(emptyAnimation());p.cancel();assert.equal(p.serialize(),last);
  assert.equal(parseAnimation('{"format":"sperrkreis-animation","version":1,"profiles":{}}').version,2);
  assert.throws(()=>putDuration(emptyAnimation(),'male:pistol_9mm','aim',0));
  const invalid=emptyValues();invalid.pinL[0]=-1;assert.throws(()=>putPose(emptyAnimation(),'male:pistol_9mm','aim',invalid));
});

test('screen dragging stays in the captured camera plane and converts metres correctly in front and side views',()=>{
  const rect={left:10,top:20,width:400,height:400};
  for(const side of [false,true]){
    const camera=new OrthographicCamera(-1,1,1,-1,.1,30);camera.position.set(side?10:0,0,side?0:10);camera.lookAt(0,0,0);camera.updateProjectionMatrix();camera.updateMatrixWorld(true);
    const plane=new Plane().setFromNormalAndCoplanarPoint(camera.getWorldDirection(new Vector3()),new Vector3()),start=screenPointToWorld(210,220,rect,camera,plane),end=screenPointToWorld(230,200,rect,camera,plane);
    const delta=end.sub(start);assert.ok(Math.abs(delta.y-.1)<1e-8);assert.ok(Math.abs(delta.length()-Math.sqrt(.02))<1e-8);
    const values=dragValues(emptyValues(),'weapon','move',0,delta,0,new Quaternion());assert.ok(Math.abs(values.weapon[side?2:0])>.099);
  }
});

test('touch ownership, pointer cancellation and view gestures cannot corrupt a saved pose',()=>{
  class Canvas{handlers={};addEventListener(n,fn){this.handlers[n]=fn;}getBoundingClientRect(){return{left:0,top:0,width:400,height:400};}setPointerCapture(id){this.id=id;}hasPointerCapture(id){return this.id===id;}releasePointerCapture(){this.id=null;}fire(n,x,y,id=1){this.handlers[n]({pointerId:id,clientX:x,clientY:y,button:0,preventDefault(){},stopPropagation(){}});}}
  const canvas=new Canvas(),camera=new OrthographicCamera(-1,1,1,-1,.1,30);camera.position.z=10;camera.lookAt(0,0,0);camera.updateMatrixWorld(true);
  let tool='move',values=emptyValues(),begins=0,cancels=0,views=0,changes=0;
  const stop=bindWorkshopInteraction(canvas,{read:()=>({camera,tool,axis:0,editable:true,handles:[{channel:'weapon',x:200,y:200,point:new Vector3()}],rootYaw:new Quaternion(),yaw:0,pitch:0}),select(){},values:()=>values,begin(){begins++;},change(v){values=v;changes++;},end(cancel){if(cancel)cancels++;},orbit(){views++;}});
  canvas.fire('pointerdown',200,200);canvas.fire('pointermove',220,200,2);assert.equal(changes,0);canvas.fire('pointermove',220,200);assert.equal(changes,1);assert.ok(Math.abs(values.weapon[0]-.1)<1e-8);canvas.fire('pointercancel',220,200);assert.equal(cancels,1);
  tool='view';canvas.fire('pointerdown',200,200);canvas.fire('pointermove',220,200);canvas.fire('pointerup',220,200);assert.equal(begins,1);assert.equal(views,1);stop();
});

test('runtime model imports cannot pull editor UI, gestures or reference images into the model-loading path',async()=>{
  const seen=new Set();async function visit(name){if(seen.has(name))return;seen.add(name);const source=await readFile(new URL('../docs/src/'+name,import.meta.url),'utf8');for(const match of source.matchAll(/from\s*['"]\.\/([^'"]+)['"]/g))await visit(match[1]);}
  await visit('player-models.js');await visit('weapon-models.js');
  for(const file of seen)assert.ok(!file.startsWith('workshop-')&&file!=='animation-workshop.js',file+' must remain lazy editor-only code');
});
