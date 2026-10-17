import assert from 'node:assert/strict';
import test from 'node:test';
import {Group,Vector3} from 'three';
import {ModelPass} from '../docs/src/model-pass.js';
import {bindModelOrbit} from '../docs/src/equipment-views.js';

test('menu views use an independent eye-level camera and restore the shared renderer size for the next world pass',()=>{
  const sizes=[],views=[];
  const pass=new ModelPass({createRenderer:()=>({domElement:{addEventListener(){}},setClearColor(){},setPixelRatio(){},setSize:(w,h)=>sizes.push([w,h]),clear(){},render:(_scene,camera)=>views.push(camera)})});
  pass.beginFrame(2);const initial=pass.camera.position.clone(),size=pass.size;
  const canvas={width:0,height:0,getBoundingClientRect:()=>({width:640,height:240}),getContext:()=>({setTransform(){},clearRect(){},drawImage(){}})};
  const project=pass.drawInspection(canvas,new Group(),{height:2.1,center:new Vector3(0,.9,0)});
  assert.notEqual(views[0],pass.camera);assert.equal(pass.inspectionCamera.position.y,.9);
  assert.ok(pass.camera.position.equals(initial));assert.deepEqual(project(new Vector3(0,.9,0)),{x:320,y:120});
  pass.beginFrame(2);assert.deepEqual(sizes.at(-1),[size,size]);
});

test('one-finger model rotation survives cancellation, ignores a second touch and clamps tilt without sending input to the world',()=>{
  const handlers=new Map(),canvas={addEventListener:(name,fn)=>handlers.set(name,fn),setPointerCapture(){},hasPointerCapture:()=>false};
  let state={yaw:0,pitch:0},stopped=0;
  const cancel=bindModelOrbit(canvas,()=>state,next=>{state=next;},{tilt:true});
  const event=(pointerId,x,y)=>({pointerId,clientX:x,clientY:y,button:0,preventDefault(){},stopPropagation(){stopped++;}});
  handlers.get('pointerdown')(event(1,10,10));handlers.get('pointerdown')(event(2,20,20));handlers.get('pointermove')(event(2,90,90));assert.deepEqual(state,{yaw:0,pitch:0});
  handlers.get('pointermove')(event(1,50,200));assert.equal(state.yaw,.48);assert.equal(state.pitch,.75);
  handlers.get('pointerup')(event(2,0,0));handlers.get('pointermove')(event(1,60,200));assert.equal(state.yaw,.6);
  cancel();handlers.get('pointermove')(event(1,80,200));assert.equal(state.yaw,.6);
  handlers.get('pointerdown')(event(3,0,0));handlers.get('pointermove')(event(3,-10,-200));assert.equal(state.yaw,.48);assert.equal(state.pitch,-.75);assert.ok(stopped>4);
});
