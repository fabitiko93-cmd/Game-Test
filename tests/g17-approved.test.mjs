import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {Quaternion,Vector3} from 'three';
import {g17Fixture} from './helpers/g17-fixture.mjs';
import {G17_GRASP} from '../docs/src/g17-grasp.js';

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
    const point=mesh.getVertexPosition(Number(id),new Vector3()).applyMatrix4(mesh.matrixWorld).sub(head).divideScalar(e.root.scale.x);
    assert.ok(point.distanceTo(new Vector3(...expected))<2e-6,'approved shoulder volume vertex '+id);
  }
  const gun=e.weapon.getWorldQuaternion(new Quaternion()).normalize();
  assert.ok(gun.angleTo(new Quaternion().setFromAxisAngle(new Vector3(0,1,0),G17_GRASP.weaponYaw))<1e-6);
  f.replay.dispose();
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

test('G17 remains continuous at 15 Hz during interrupted reloads and repeated posture changes',async()=>{
  for(const sex of ['male','female'])for(const scenario of ['transitions','interrupt','turn']){
    const f=await g17Fixture({sex,scenario,fps:15}),names=['UpperArmR','LowerArmR','WristR','UpperArmL','LowerArmL','WristL'];
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
