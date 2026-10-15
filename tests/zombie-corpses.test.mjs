import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { Game } from "../docs/src/game.js";
import { World } from "../docs/src/world.js";
import { createPlayer } from "../docs/src/character.js";
import { createZombie } from "../docs/src/ai.js";
import { zombieBodyProfile } from "../docs/src/zombie-appearance.js";
import { ZombieSprites } from "../docs/src/zombie-sprites.js";
import { Renderer } from "../docs/src/render.js";

test("a real kill preserves original appearance, loot and selection through a normal world save",()=>{
  const world=new World(),game=Object.create(Game.prototype);
  Object.assign(game,{world,player:createPlayer(),renderer:{},ui:{showMessage(){}}});
  const zombie=createZombie(12,24,9,'zombie-3');Object.assign(zombie,{facingX:.6,facingY:-.8});
  const profile=zombieBodyProfile(zombie),corpsesBefore=world.objects.filter(o=>o.type==='corpse').length;
  game.killZombie(zombie);game.killZombie(zombie);
  assert.equal(zombie.removed,true);assert.equal(game.player.kills,1);
  const corpse=world.objects.find(o=>o.id===game.renderer.selectedId);
  assert.equal(world.objects.filter(o=>o.type==='corpse').length,corpsesBefore+1);
  assert.deepEqual(zombieBodyProfile(corpse.zombieAppearance),profile);
  assert.deepEqual([corpse.zombieAppearance.facingX,corpse.zombieAppearance.facingY],[.6,-.8]);
  assert.equal(corpse.interactable,true);assert.equal(corpse.solid,false);
  const saved=JSON.parse(JSON.stringify(world.serialize())),restored=new World();restored.restore(saved);
  const result=restored.objects.find(o=>o.id===corpse.id);
  assert.deepEqual(result.zombieAppearance,corpse.zombieAppearance);
  assert.deepEqual(result.items,corpse.items);
  assert.deepEqual(zombieBodyProfile(result.zombieAppearance),profile);
});

test("no-WebGL corpses use the ten hashed prone original model sprites and never the generic placeholder",async()=>{
  const metadata=JSON.parse(await readFile(new URL('../docs/assets/zombies/corpses.json',import.meta.url)));
  const images=[],sprites=new ZombieSprites({createImage:()=>{const image={};images.push(image);return image;}});
  for(let variant=0;variant<10;variant++) {
    const clip=metadata.variants[variant],data=await readFile(new URL(`../docs/assets/zombies/${clip.file}`,import.meta.url));
    assert.equal(data.readUInt32BE(16),metadata.width);assert.equal(data.readUInt32BE(20),metadata.height*8);
    assert.ok(clip.file.includes(createHash('sha256').update(data).digest('hex').slice(0,10)));
    const corpse={x:1,y:1,zombieAppearance:{id:`body-${variant}`,variant,facingX:0,facingY:1}},draws=[];
    const ctx={save(){},restore(){},drawImage(...args){draws.push(args);}};
    assert.equal(sprites.drawCorpse(ctx,corpse,{x:50,y:50}),false);images.at(-1).onload();
    assert.equal(sprites.drawCorpse(ctx,corpse,{x:50,y:50}),true);assert.equal(draws.length,1);
    const renderer=Object.create(Renderer.prototype);
    Object.assign(renderer,{ctx,iso:()=>({x:50,y:50}),shadow(){},zombieModels:{drawCorpse:()=>false},zombieSprites:sprites});
    renderer.drawCorpse(corpse);assert.equal(draws.length,2,'the actual world renderer calls the original corpse sprite');
  }
});
