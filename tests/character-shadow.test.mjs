import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {Vector3} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {ModelPass} from '../docs/src/model-pass.js';
import {PlayerModels} from '../docs/src/player-models.js';
import {QuaterniusAssets} from '../docs/src/quaternius-assets.js';
import {createPlayer} from '../docs/src/character.js';
import {playerModelAppearance} from '../docs/src/quaternius-catalog.js';
import {drawSoleShadows,projectGround,sampleSoleContacts} from '../docs/src/character-shadow.js';
import {heightPixels} from '../docs/src/world-scale.js';

const cache=new Map();
async function load(url){
  const name=new URL(url).pathname.split('/').at(-1);
  if(!cache.has(name))cache.set(name,(async()=>{
    const b=gunzipSync(await readFile(new URL('../docs/assets/quaternius/'+name,import.meta.url)));
    return new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');
  })());return cache.get(name);
}
const canvas=()=>({transforms:[],alphas:[],save(){},restore(){},fillRect(){},transform(...args){this.transforms.push(args);},createRadialGradient(){const alphas=this.alphas;return{addColorStop(stop,color){if(stop===0)alphas.push(Number(color.slice(color.lastIndexOf(',')+1,-1)));}};}});

test('ground contacts use the exact shared 3D camera projection without the old fixed screen offset',()=>{
  const pass=new ModelPass({createRenderer:()=>({domElement:{addEventListener(){}},setClearColor(){},setPixelRatio(){},setSize(){}})});
  pass.beginFrame(3.5);const origin={x:49,y:78};
  for(const point of [new Vector3(),new Vector3(.2,0,-.3),new Vector3(-.4,0,.7)]){
    const p=point.clone().project(pass.camera),ground=projectGround(point,origin);
    assert.ok(Math.abs(ground.x-(origin.x+p.x*pass.size/2))<1e-8);
    assert.ok(Math.abs(ground.y-(origin.y-p.y*pass.size/2-heightPixels(.95)))<1e-8);
  }
});

test('both real player rigs retain heel/toe probes across walking, crouching, directions and frame preparation',async()=>{
  const library=new QuaterniusAssets({loadAsset:load}),models=new PlayerModels({draw:()=>true},library);await models.ready;
  for(const sex of ['male','female']){
    const player=createPlayer({appearance:{sex}}),entity=models.entity(player,playerModelAppearance(player));
    assert.equal(entity.soles.length,2);assert.ok(entity.soles.every(foot=>foot.length>=3&&foot.length<=8));
    for(const clip of ['Idle_Neutral','Walk','Crouch_Idle','Crouch_Walk'])for(const yaw of [0,Math.PI/2,Math.PI])for(const progress of [0,.25,.5,.75]){
      models.pose(entity,{clip,progress,yaw,delta:1});entity.root.updateMatrixWorld(true);
      const contacts=sampleSoleContacts(entity.soles),all=entity.soles.flat().map(({mesh,index})=>mesh.getVertexPosition(index,new Vector3()).applyMatrix4(mesh.matrixWorld));
      assert.ok(contacts.every(c=>Number.isFinite(c.center.x+c.center.z+c.height)&&c.length>0&&c.length<.6),JSON.stringify({sex,clip,yaw,progress,contacts}));
      let minimum=Infinity;const meshes=new Set(entity.soles.flat().map(p=>p.mesh));
      for(const mesh of meshes)for(let i=0;i<mesh.geometry.attributes.position.count;i++)minimum=Math.min(minimum,mesh.getVertexPosition(i,new Vector3()).applyMatrix4(mesh.matrixWorld).y);
      assert.ok(Math.min(...all.map(p=>p.y))-minimum<.035,`${sex} ${clip} ${progress}: probes follow the lowest actual shoe`);
    }
    models.beginFrame();let calls=0;const original=models.motion.sample;models.motion.sample=function(...args){calls++;return original.apply(this,args);};
    models.drawShadow(canvas(),player,0,{x:0,y:0});models.draw({},player,0,{x:0,y:0});assert.equal(calls,1,'the floor shadow and body use one sampled animation pose');models.motion.sample=original;
  }
});

test('lifted feet have softer lighter contact shadows while grounded soles stay centered on the floor',()=>{
  const ctx=canvas(),origin={x:20,y:30},foot={center:new Vector3(.3,0,.1),direction:new Vector3(0,0,1),length:.26};
  drawSoleShadows(ctx,[{...foot,height:0},{...foot,height:.25}],origin);
  assert.equal(ctx.transforms.length,2);assert.ok(ctx.alphas[1]<ctx.alphas[0]/5,'lifted foot loses its dark contact patch');
  const p=projectGround(foot.center,origin);for(const transform of ctx.transforms)assert.deepEqual(transform.slice(4),[p.x,p.y]);
});
