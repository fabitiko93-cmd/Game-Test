import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {Quaternion,Vector3} from 'three';
import {g17Fixture} from './helpers/g17-fixture.mjs';
import {G17_GRASP} from '../docs/src/g17-grasp.js';
import {emptyAnimation,emptyValues,putPose} from '../docs/src/animation-document.js';

test('runtime G17 reproduces the approved review-10 shoulder and both actual skinned hands',async()=>{
  const reference=JSON.parse(await readFile(new URL('./fixtures/g17-approved-review10.json',import.meta.url),'utf8'));
  const f=await g17Fixture(),e=f.entity;
  e.root.updateMatrixWorld(true);let mesh;e.root.traverseVisible(m=>{if(m.name===reference.mesh)mesh=m;});assert.ok(mesh);mesh.skeleton.update();
  const head=e.model.getObjectByName('Head').getWorldPosition(new Vector3());
  for(const [id,expected]of Object.entries(reference.handVertices)){
    const point=e.weapon.worldToLocal(mesh.getVertexPosition(Number(id),new Vector3()).applyMatrix4(mesh.matrixWorld)).multiply(e.weapon.getWorldScale(new Vector3()));
    assert.ok(point.distanceTo(new Vector3(...expected))<2e-6,'approved skinned hand vertex '+id);
  }
  for(const [id,expected]of Object.entries(reference.shoulderVertices)){
    // Compare shape in the authored review frame, independently of the
    // upper body's world heading used to point the barrel at the game target.
    const point=mesh.getVertexPosition(Number(id),new Vector3()).applyMatrix4(mesh.matrixWorld).sub(head).divideScalar(e.root.scale.x)
      .applyAxisAngle(new Vector3(0,1,0),G17_GRASP.weaponYaw);
    const target=new Vector3(...expected).add(new Vector3(...(reference.shoulderAimCorrections[id]||[0,0,0])));
    assert.ok(point.distanceTo(target)<2e-6,'approved shoulder volume vertex '+id);
  }
  const gun=e.weapon.getWorldQuaternion(new Quaternion()).normalize();
  assert.ok(gun.angleTo(new Quaternion())<1e-6,'approved pose is aligned with the actual target');
  f.replay.dispose();
});

test('G17 barrel and live shot socket follow the game target in every heading on both rigs',async()=>{
  for(const sex of ['male','female'])for(const mods of [{},{mount:'pistol_optic_mount',optic:'reflex_sight',utility:'pistol_flashlight',muzzle:'sidearm_suppressor'}])for(const movement of ['idle','walk','crouch','crouchWalk']){
    const f=await g17Fixture({sex,mods,movement}),p=f.player;
    let time=0;
    for(const yaw of [0,Math.PI/4,Math.PI/2,3.1,-3.1,-Math.PI/2,-Math.PI/4]){
      p.facingX=Math.sin(yaw);p.facingY=Math.cos(yaw);
      for(let i=0;i<80;i++){
        if(p.moving){p.x+=p.facingX/120;p.y+=p.facingY/120;}
        f.models.prepare(p,time+=1/60);
      }
      const forward=new Vector3(0,0,1).applyQuaternion(f.entity.weapon.getWorldQuaternion(new Quaternion()));
      const shot=f.models.shotMuzzle(p,time),target=new Vector3(p.facingX,0,p.facingY),tag=`${sex} ${movement} ${yaw}`;
      assert.ok(forward.clone().setY(0).normalize().distanceTo(target)<1e-4,tag+' visible barrel follows target');
      assert.ok(new Vector3(shot.direction.x,0,shot.direction.y).normalize().distanceTo(target)<1e-4,tag+' live muzzle follows target');
      assert.ok(Math.abs(forward.y)<.001,tag+' raised barrel stays level');
    }
    f.replay.dispose();
  }
});

test('both G17 rigs hold the calibrated finger pose with two reachable palm contacts',async()=>{
  for(const sex of ['male','female']){
    const f=await g17Fixture({sex}),e=f.entity;
    for(const [name,q]of Object.entries(G17_GRASP.rigs[sex].fingers))assert.ok(e.model.getObjectByName(name).quaternion.clone().normalize().angleTo(new Quaternion(...q).normalize())<1e-5,name);
    for(const side of ['R','L']){
      const actual=e.model.getObjectByName('Middle2'+side).getWorldPosition(new Vector3());
      const target=e.weapon.localToWorld(new Vector3(...G17_GRASP[side==='R'?'rightPalm':'leftPalm']));
      assert.ok(actual.distanceTo(target)<1e-6,sex+' '+side+' palm');
    }
    f.replay.dispose();
  }
});

test('G17 workshop target offsets retain the displayed facing axes after alignment',async()=>{
  for(const sex of ['male','female']){
    const f=await g17Fixture({sex}),values=emptyValues();values.weapon[0]=.01;values.support[2]=-.01;
    const document=putPose(emptyAnimation(),sex+':pistol_9mm','aim',values);
    for(const yaw of [0,Math.PI/2,3.1,-3.1]){
      f.player.facingX=Math.sin(yaw);f.player.facingY=Math.cos(yaw);
      f.replay.previewEdits(document,1);
      const e=f.entity,q=e.root.getWorldQuaternion(new Quaternion());
      for(const channel of ['weapon','support']){
        const actual=e.animationTargets[channel].clone().sub(e.animationTargetBases[channel]);
        const expected=new Vector3(...values[channel].slice(0,3)).applyQuaternion(q);
        assert.ok(actual.distanceTo(expected)<1e-7,`${sex} ${yaw} ${channel} displayed edit axes`);
      }
    }
    f.replay.dispose();
  }
});

test('G17 remains continuous at 15 Hz during interrupted reloads and repeated posture changes',async()=>{
  for(const sex of ['male','female'])for(const scenario of ['transitions','interrupt','turn']){
    const f=await g17Fixture({sex,scenario,fps:15}),names=['Hips','Torso','UpperArmR','LowerArmR','WristR','UpperArmL','LowerArmL','WristL'];
    let previous;
    for(let i=0;i<=f.replay.frameCount;i++){
      f.replay.seek(f.replay.frameTime(i));
      const qs=names.map(n=>f.entity.model.getObjectByName(n).quaternion.clone().normalize());
      for(let j=0;j<qs.length;j++){
        assert.ok(qs[j].toArray().every(Number.isFinite),`${sex} ${scenario} ${i} ${names[j]}`);
        if(previous)assert.ok(qs[j].angleTo(previous[j])<16/15+.01,`${sex} ${scenario} ${i} ${names[j]} must not flip`);
      }
      previous=qs;
    }
    f.replay.dispose();
  }
});

test('G17 spine alignment blends continuously at 30/60 Hz and preserves the original leg animation',async()=>{
  for(const sex of ['male','female'])for(const fps of [30,60])for(const scenario of ['transitions','interrupt','turn']){
    const f=await g17Fixture({sex,scenario,fps}),evaluate=f.models.controller.evaluate.bind(f.models.controller);
    const legs=['UpperLegR','LowerLegR','FootR','UpperLegL','LowerLegL','FootL'];
    f.models.controller.evaluate=(entity,...args)=>{
      const before=legs.map(n=>entity.model.getObjectByName(n).getWorldPosition(new Vector3()));
      evaluate(entity,...args);
      legs.forEach((name,i)=>assert.ok(entity.model.getObjectByName(name).getWorldPosition(new Vector3()).distanceTo(before[i])<1e-7,'original '+name));
    };
    let previous;
    for(let i=0;i<=f.replay.frameCount;i++){
      f.replay.seek(f.replay.frameTime(i));
      const qs=['Hips','Torso'].map(n=>f.entity.model.getObjectByName(n).quaternion.clone().normalize());
      if(previous)qs.forEach((q,j)=>assert.ok(q.angleTo(previous[j])<16/fps+.01,`${sex} ${fps} ${scenario} ${i}: spine turn jumped`));
      previous=qs;
    }
    f.replay.dispose();
  }
});
