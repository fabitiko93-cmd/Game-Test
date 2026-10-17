import assert from 'node:assert/strict';
import test from 'node:test';
import {createPlayer} from '../docs/src/character.js';
import {PlayerMotion} from '../docs/src/player-motion.js';
import {updateMovement} from '../docs/src/movement.js';
import {STANCES} from '../docs/src/config.js';

const angle=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));

test('rapid path heading changes turn continuously without restarting the step, across the angle seam and at 30/60/120 Hz',()=>{
  for(const fps of [30,60,120]){
    const player=createPlayer(),motion=new PlayerMotion();Object.assign(player,{moving:true,facingX:0,facingY:1});motion.sample(player,0);
    let previous=motion.sample(player,.01),last=previous;
    for(let i=1;i<=fps;i++){
      const target=i<fps/2?Math.PI:-Math.PI+.15;
      player.facingX=Math.sin(target);player.facingY=Math.cos(target);player.x+=.5/fps;
      last=motion.sample(player,.01+i/fps);
      assert.equal(last.clip,'Walk');assert.ok(Math.abs(angle(last.yaw,previous.yaw))<=9/fps+1e-8);
      assert.notEqual(last.progress,previous.progress,'the existing step continues');previous=last;
    }
    assert.ok(Math.abs(angle(last.yaw,-Math.PI+.15))<.03);
    const repeated=motion.sample(player,1.01);assert.equal(repeated.yaw,last.yaw,'two render uses of a frame cannot turn twice');
  }
});

test('exhaustion produces uninterrupted walking rather than repeated Run/Walk toggling; a new sprint input can resume',()=>{
  for(const fps of [30,60,120]){
    const player=createPlayer();Object.assign(player,{x:0,y:0,stamina:4.05,inventory:[],equipment:{},stance:'walk'});
    const keyboard={magnitude:1,x:0,y:1,run:true};
    const game={player,elapsed:0,stepTimer:0,input:{keyboardMovement:()=>keyboard},world:{emitNoise(){}},
      stealth:{cancelExecution(){},hiddenNoiseMultiplier:()=>1,onMove(){}},combat:{target:()=>null},
      clearNavigation(){player.navigation.path=[];},moveEntity(entity,x,y){entity.x+=x;entity.y+=y;return true;}};
    let exhausted=false,walking=0;
    for(let frame=0;frame<fps*2;frame++){
      const x=player.x,y=player.y;game.elapsed+=1/fps;updateMovement(game,1/fps);
      if(exhausted){assert.equal(player.running,false);assert.ok(Math.hypot(player.x-x,player.y-y)<=STANCES.walk.speed*1.08/fps+1e-8);walking++;}
      if(player.navigation.sprintExhausted)exhausted=true;
    }
    assert.ok(walking>fps);assert.ok(player.stamina>10,'normal walking recovery is retained');
    keyboard.run=false;updateMovement(game,1/fps);keyboard.run=true;updateMovement(game,1/fps);assert.equal(player.running,true);
  }
});
