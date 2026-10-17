import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { AnimationClip, AnimationMixer, Bone, Box3, BufferGeometry, Float32BufferAttribute,
  Group, Matrix4, Object3D, QuaternionKeyframeTrack, Skeleton, SkinnedMesh,
  Uint16BufferAttribute, Vector3, VectorKeyframeTrack } from "three";
import { ZombieModels } from "../docs/src/zombie-models.js";
import { ZombieMotion, zombieModelYaw } from "../docs/src/zombie-motion.js";
import { createZombie, ZOMBIE_ATTACK } from "../docs/src/ai.js";
import { zombieBodyProfile, zombieCorpseAppearance } from "../docs/src/zombie-appearance.js";
import { WORLD_SCALE, pixelsPerMeter } from "../docs/src/world-scale.js";
import { createSoleProbes, sampleSoleContacts } from "../docs/src/character-shadow.js";
import { LOCOMOTION, speedInTiles } from "../docs/src/locomotion.js";
import { STANCES } from "../docs/src/config.js";

const metadata = JSON.parse(await readFile(new URL("../docs/assets/zombies3d/models.json", import.meta.url)));

// Non-rendering numeric asset inspection: the shipped bone hierarchy and
// original mesh/weights are evaluated with the actual Three.js animation mixer.
async function loadRig(index) {
  const compressed = await readFile(new URL(`../docs/assets/zombies3d/${metadata.variants[index].file}`, import.meta.url));
  const bytes = gunzipSync(compressed);
  assert.equal(bytes.readUInt32LE(0), 0x46546c67);
  assert.equal(bytes.readUInt32LE(8), bytes.length);
  assert.ok(metadata.variants[index].file.includes(createHash("sha256").update(compressed).digest("hex").slice(0,12)));
  const length = bytes.readUInt32LE(12), g = JSON.parse(bytes.subarray(20,20+length)), binary = bytes.subarray(28+length);
  const accessor = i => {
    const a = g.accessors[i], v = g.bufferViews[a.bufferView], sizes = {SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16};
    const data = binary.subarray((v.byteOffset||0)+(a.byteOffset||0));
    const n = a.count*sizes[a.type], out = [];
    for(let j=0;j<n;j++) out.push(a.componentType===5126?data.readFloatLE(j*4):data.readUInt16LE(j*2));
    return out;
  };
  const bones = new Set(g.skins.flatMap(s=>s.joints));
  const nodes = g.nodes.map((n,i) => {
    let o = bones.has(i) ? new Bone() : new Object3D();
    if(n.mesh !== undefined) {
      const attributes=g.meshes[n.mesh].primitives[0].attributes, geometry=new BufferGeometry();
      geometry.setAttribute('position',new Float32BufferAttribute(accessor(attributes.POSITION),3));
      geometry.setAttribute('skinIndex',new Uint16BufferAttribute(accessor(attributes.JOINTS_0),4));
      geometry.setAttribute('skinWeight',new Float32BufferAttribute(accessor(attributes.WEIGHTS_0),4));
      o=new SkinnedMesh(geometry);
    }
    o.name=n.name;
    if(n.matrix){o.matrix.fromArray(n.matrix);o.matrix.decompose(o.position,o.quaternion,o.scale);}
    if(n.translation)o.position.fromArray(n.translation);if(n.rotation)o.quaternion.fromArray(n.rotation);if(n.scale)o.scale.fromArray(n.scale);return o; });
  for(let i=0;i<nodes.length;i++)for(const child of g.nodes[i].children||[])nodes[i].add(nodes[child]);
  const scene = new Group(); for(const i of g.scenes[0].nodes)scene.add(nodes[i]);
  scene.updateMatrixWorld(true);
  g.nodes.forEach((n,i)=>{if(n.skin!==undefined){const skin=g.skins[n.skin],inverse=accessor(skin.inverseBindMatrices);
    nodes[i].bind(new Skeleton(skin.joints.map(j=>nodes[j]),skin.joints.map((_,k)=>new Matrix4().fromArray(inverse,k*16))),new Matrix4());}});
  const animations = g.animations.map(a => new AnimationClip(a.name,-1,a.channels.map(ch=>{
    const s=a.samplers[ch.sampler], prop=ch.target.path==='rotation'?'quaternion':'position';
    const Track=prop==='quaternion'?QuaternionKeyframeTrack:VectorKeyframeTrack;
    return new Track(`${g.nodes[ch.target.node].name}.${prop}`,accessor(s.input),accessor(s.output));
  })));
  return {scene,animations,g,nodes,accessor};
}

test("all ten real skinned models retain metric height, ground contact and authored clip keys", async()=>{
  for(let variant=0;variant<10;variant++){
    const rig=await loadRig(variant), {g,nodes,accessor}=rig;
    assert.equal(g.skins.length,1);assert.ok(g.skins[0].joints.length>=40);
    assert.deepEqual(rig.animations.map(a=>a.name).sort(),['alert','attack_left','attack_right','rest','shuffle','walk']);
    const mixer=new AnimationMixer(rig.scene);mixer.clipAction(rig.animations.find(a=>a.name==='rest')).play();mixer.update(0);
    rig.scene.updateMatrixWorld(true);
    const inverse=accessor(g.skins[0].inverseBindMatrices), palette=g.skins[0].joints.map((j,i)=>
      new Matrix4().multiplyMatrices(nodes[j].matrixWorld,new Matrix4().fromArray(inverse,i*16)));
    let min=Infinity,max=-Infinity;
    for(const mesh of g.meshes)for(const prim of mesh.primitives){
      const p=accessor(prim.attributes.POSITION), weights=accessor(prim.attributes.WEIGHTS_0), joints=accessor(prim.attributes.JOINTS_0);
      for(let i=0;i<p.length/3;i++){
        const value=new Vector3();for(let k=0;k<4;k++)value.addScaledVector(new Vector3().fromArray(p,i*3).applyMatrix4(palette[joints[i*4+k]]),weights[i*4+k]);
        min=Math.min(min,value.y);max=Math.max(max,value.y);
      }
    }
    // rest for odd variants uses idle3, so use canonical idle reference only for
    // even variants; fixed referenceHeight always remains source idle rig 2.
    if(variant%2===0){assert.ok(Math.abs(min)<2e-5,`${variant}: sole ${min}`);assert.ok(Math.abs(max-min-metadata.variants[variant].referenceHeight)<2e-5);}
    assert.ok(min>-.12&&max<2.2,`${variant}: skeleton must not explode or float`);
    assert.ok(Math.abs(metadata.variants[variant].referenceHeight-WORLD_SCALE.zombies.sourceReferenceHeights[variant])<1e-6);
    for(const clip of rig.animations){
      const spec=metadata.variants[variant].clips[clip.name];assert.ok(Math.abs(clip.duration-spec.duration)<1e-6);
      assert.ok(clip.tracks.some(t=>t.times.length>30),'real skeletal keys, not a small pose atlas');
      if(spec.distance)assert.ok(spec.distance>.5&&spec.distance<3.5);
      if(clip.name.startsWith('attack'))assert.ok(clip.tracks.some(t=>[...t.times].some(t=>Math.abs(t-ZOMBIE_ATTACK.windup)<1e-6)));
    }
  }
});

test('all ten source rigs retain separate animated foot contacts, including a raised source foot',async()=>{
  for(let variant=0;variant<10;variant++) {
    const rig=await loadRig(variant),root=new Group();root.add(rig.scene);
    root.scale.setScalar(zombieBodyProfile({id:`sole-${variant}`,variant}).scale);
    const probes=createSoleProbes(root);assert.equal(probes.length,2,`variant ${variant}: two feet`);
    const mixer=new AnimationMixer(rig.scene);
    for(const clip of ['rest','walk']) {
      mixer.stopAllAction();const action=mixer.clipAction(rig.animations.find(a=>a.name===clip));action.play();
      for(const phase of [0,.25,.5,.75]) {
        action.time=phase*action.getClip().duration;mixer.update(0);root.updateMatrixWorld(true);
        const contacts=sampleSoleContacts(probes);
        assert.ok(contacts.every(c=>c.length>0&&c.length<.6),`${variant} ${clip} ${phase}: no shadow spanning both feet`);
        let min=Infinity;root.traverseVisible(mesh=>{if(!mesh.isSkinnedMesh)return;for(let i=0;i<mesh.geometry.attributes.position.count;i++)min=Math.min(min,mesh.getVertexPosition(i,new Vector3()).applyMatrix4(mesh.matrixWorld).y);});
        assert.ok(Math.min(...contacts.map(c=>c.height))-min<.035,`${variant} ${clip} ${phase}: contact follows the lowest sole`);
      }
    }
  }
});

test("continuous gait follows actual travel, physical height, pause and frame rate",()=>{
  const walk=(fps,meters,variant=0)=>{
    const z=createZombie(0,0,variant,'stride-test'),clock=new ZombieMotion(metadata);Object.assign(z,{state:'chase',moving:true,phase:0});
    clock.sample(z,0);let pose;
    for(let i=1;i<=fps;i++){z.x=meters/2*i/fps;pose=clock.sample(z,i/fps);}
    assert.deepEqual(clock.sample(z,1),{...pose,delta:0});
    const before=pose.progress;z.moving=true;assert.equal(clock.sample(z,1.1).progress,before,'blocked feet remain still');
    return {pose,z};
  };
  const a=walk(30,1.44),b=walk(60,1.44),c=walk(120,1.44),slow=walk(60,.72);
  assert.ok(Math.abs(a.pose.progress-b.pose.progress)<1e-12&&Math.abs(b.pose.progress-c.pose.progress)<1e-12);
  assert.ok(Math.abs(b.pose.progress-2*slow.pose.progress)<1e-12);
  const stride=metadata.variants[0].clips.walk.distance*zombieBodyProfile(b.z).scale;
  assert.ok(Math.abs(b.pose.progress*stride-1.44)<1e-12);
  assert.equal(b.pose.clip,'walk');assert.equal(walk(60,0).pose.progress,0);
});

test("metric speeds preserve stealth/walk/chase/sprint hierarchy and noise/stamina contracts",()=>{
  assert.deepEqual([STANCES.sneak.speed,STANCES.walk.speed,STANCES.run.speed],[.39,.675,1.6]);
  assert.ok(LOCOMOTION.player.sneak<LOCOMOTION.player.walk&&LOCOMOTION.player.walk<=LOCOMOTION.zombie.chase&&LOCOMOTION.zombie.chase<LOCOMOTION.player.run);
  assert.equal(speedInTiles(LOCOMOTION.zombie.chase),.72);
  assert.deepEqual(Object.values(STANCES).map(s=>[s.noise,s.stamina]),[[.52,8.5],[1.45,7],[5.4,-17]]);
});

test("real 3D camera and continuous model heading match the sight cone projection",async()=>{
  const fake={domElement:{addEventListener(){}},setClearColor(){},setPixelRatio(){},setSize(){},clear(){},render(){}};
  const models=new ZombieModels({createRenderer:()=>fake,loadAsset:async()=>({scene:new Group(),animations:[]})});await models.ready;models.beginFrame(3);
  models.camera.updateMatrixWorld(true);
  const project=p=>p.project(models.camera).multiplyScalar(models.size/2);
  const origin=project(new Vector3());
  for(let i=0;i<32;i++){
    const angle=i*Math.PI/16,z={facingX:Math.cos(angle),facingY:Math.sin(angle)},yaw=zombieModelYaw(z);
    const actual=project(new Vector3(Math.sin(yaw),0,Math.cos(yaw))).sub(origin);
    const expected=[(z.facingX-z.facingY)*pixelsPerMeter/Math.SQRT2,-(z.facingX+z.facingY)*pixelsPerMeter*.5/Math.SQRT2];
    assert.ok(Math.abs(actual.x-expected[0])<1e-10&&Math.abs(actual.y-expected[1])<1e-10);
  }
});

test("subframe poses are genuinely evaluated and every render clears old color/depth",async()=>{
  const rig=await loadRig(0),clears=[],draws=[];
  const fake={domElement:{addEventListener(){}},setClearColor(){},setPixelRatio(){},setSize(){},
    clear(...args){clears.push(args);},render(scene){assert.equal(scene.children.filter(o=>o.type==='Group').length,1);}};
  const models=new ZombieModels({createRenderer:()=>fake,loadAsset:async()=>rig});await models.ready;
  const ctx={globalAlpha:1,save(){},restore(){},drawImage(...args){draws.push(args);}};
  const z=createZombie(0,0,0,'native-render-test');z.phase=0;
  models.beginFrame(3);assert.equal(models.draw(ctx,z,0,{x:100,y:100}),true);
  const entity=models.entities.get(z),signature=()=>{const values=[];entity.mixer.getRoot().traverse(o=>values.push(...o.quaternion.toArray(),...o.position.toArray()));return values;};
  const a=signature();models.draw(ctx,z,1/120,{x:100,y:100});const b=signature();
  assert.ok(a.some((v,i)=>Math.abs(v-b[i])>1e-8),'a half 60-Hz interval already produces a new interpolated skeletal pose');
  models.draw(ctx,z,1/120,{x:100,y:100});assert.deepEqual(signature(),b,'pause freezes the pose');
  assert.equal(draws.length,3);assert.deepEqual(clears,[[true,true,true],[true,true,true],[true,true,true]]);
  assert.equal(ctx.imageSmoothingEnabled,false);
  Object.assign(z,{state:'chase',moving:false,attackCooldown:ZOMBIE_ATTACK.cooldown,attackWindup:ZOMBIE_ATTACK.windup});
  models.draw(ctx,z,.02,{x:100,y:100});assert.match(entity.clip,/^attack_/);
  z.attackCooldown=ZOMBIE_ATTACK.cooldown-ZOMBIE_ATTACK.windup;z.attackWindup=0;
  models.draw(ctx,z,.30,{x:100,y:100});assert.ok(Math.abs(entity.current.time-ZOMBIE_ATTACK.windup)<1e-7);
  models.beginFrame(3);models.endFrame();assert.equal(models.entities.size,0,'departed entities release independent skeleton state');
});

test("all ten corpse variants keep their real skinned mesh, physical size, heading and frozen grounded pose",async()=>{
  const rigs=await Promise.all(metadata.variants.map((_,i)=>loadRig(i)));
  const fake={domElement:{addEventListener(){}},setClearColor(){},setPixelRatio(){},setSize(){},clear(){},render(){}};
  const models=new ZombieModels({createRenderer:()=>fake,loadAsset:async url=>rigs[metadata.variants.findIndex(m=>url.endsWith(m.file))]});
  await models.ready;models.beginFrame(2);
  const ctx={save(){},restore(){},drawImage(){}};
  for(let variant=0;variant<10;variant++) {
    const z=createZombie(10,20,variant,`zombie-${variant+1}`);
    Object.assign(z,{facingX:Math.sin(variant),facingY:Math.cos(variant)});
    const corpse={zombieAppearance:zombieCorpseAppearance(z)};
    assert.equal(models.drawCorpse(ctx,corpse,{x:100,y:100}),true);
    const entity=models.entities.get(corpse),bounds=new Box3().setFromObject(entity.root,true);
    const body=zombieBodyProfile(z),size=bounds.getSize(new Vector3());
    assert.equal(entity.root.scale.x,body.scale);
    assert.equal(entity.root.rotation.y,zombieModelYaw(z));
    assert.ok(Math.abs(bounds.min.y)<1e-6,`${variant}: corpse rests on the floor`);
    assert.ok(Math.abs(bounds.min.x+bounds.max.x)<1e-6&&Math.abs(bounds.min.z+bounds.max.z)<1e-6,'body stays centred on its selectable world point');
    assert.ok(size.y<.9&&Math.hypot(size.x,size.z)>body.height*.85,'a prone real body replaces the upright zombie');
    let original,actual;rigs[variant].scene.traverse(o=>{if(o.isSkinnedMesh)original=o;});entity.model.traverse(o=>{if(o.isSkinnedMesh)actual=o;});
    assert.equal(actual.geometry,original.geometry,'no replacement placeholder geometry');
    assert.notEqual(actual.skeleton,original.skeleton,'each body has its own frozen skeleton');
    const before=entity.root.toJSON();models.drawCorpse(ctx,corpse,{x:100,y:100});
    assert.deepEqual(entity.root.toJSON(),before,'repeated frames never breathe, walk or attack');
  }
  models.endFrame();assert.equal(models.entities.size,10);
  models.beginFrame(2);models.endFrame();assert.equal(models.entities.size,0);
});
