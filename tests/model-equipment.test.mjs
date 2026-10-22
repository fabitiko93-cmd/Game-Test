import assert from 'node:assert/strict';
import test from 'node:test';
import {ITEMS,LOOT_TABLES} from '../docs/src/data.js';
import {hasWeaponModel,weaponModelDefinition} from '../docs/src/weapon-catalog.js';
import {clothingModelFor,CLOTHING_ITEMS} from '../docs/src/clothing-catalog.js';
import {QUATERNIUS_MODELS} from '../docs/src/quaternius-catalog.js';
import {World} from '../docs/src/world.js';
import {Renderer} from '../docs/src/render.js';

test('unmodelled weapons and borrowed equipment substitutes are removed with their orphaned ammunition and attachments',()=>{
  for(const type of ['hammer','baseball_bat','axe','crowbar','shotgun_12g','hunting_rifle',
    'shell_12g','ammo_rifle','hunting_scope','pistol_suppressor','shotgun_choke','recoil_pad',
    'short_stock','weapon_sling','shell_holder','outfit_top','outfit_trousers','leather_jacket',
    'jeans','motorcycle_helmet','canvas_bag'])assert.equal(ITEMS[type],undefined,type);
  for(const [type,definition] of Object.entries(ITEMS)){
    if(definition.type==='weapon')assert.ok(hasWeaponModel(type)||['kitchen_knife','pistol_9mm'].includes(type),type);
    if(definition.type==='mod')for(const compatible of definition.compatible){
      assert.ok(ITEMS[compatible]?.modSlots.includes(definition.modSlot),`${type}: ${compatible}`);
      assert.ok(weaponModelDefinition(compatible)?.mods[type],`${type}: original model part`);
    }
    if(definition.type==='clothing')for(const sex of ['male','female']){
      const key=clothingModelFor({type},definition,sex);assert.ok(QUATERNIUS_MODELS.characters[key],type);
    }
    if(definition.type==='magazine')for(const compatible of definition.compatible)assert.ok(ITEMS[compatible]?.magazineTypes.includes(type));
  }
  assert.equal(Object.keys(CLOTHING_ITEMS).length,48,'all actual starting garments remain');
  for(const type of ['water','bread','bandage','sealed_antibiotics','lockpick','can_opener','pharmacy_key','police_key'])assert.ok(ITEMS[type],type);
});

test('all generated loot, guaranteed world equipment and saved fresh worlds contain only current item definitions',()=>{
  for(const name of ['kitchen','fridge','tools','pharmacy','grocery','police','hunting','vehicle','clothing','corpse'])assert.ok(Array.isArray(LOOT_TABLES[name]),name);
  const check=item=>{assert.ok(ITEMS[item.type],item.type);if(item.magazine)check(item.magazine);for(const mod of Object.values(item.mods||{}))check(mod);};
  for(const seed of [17,420,981013]){
    const world=new World(seed);
    for(const object of world.objects)for(const item of object.items||[])check(item);
    for(const table of Object.keys(LOOT_TABLES))for(const item of world.rollLoot.call({random:()=>0},table))check(item);
    const restored=new World(seed);restored.restore(JSON.parse(JSON.stringify(world.serialize())));
    for(const object of restored.objects)for(const item of object.items||[])check(item);
    const police=restored.objects.find(o=>o.name==='POLIZIST');assert.ok(police.items.some(i=>i.type==='police_key'));
    assert.ok(restored.objects.some(o=>o.items?.some(i=>i.type==='pharmacy_key')));
    assert.ok(restored.objects.some(o=>o.items?.some(i=>i.type==='sealed_antibiotics')));
  }
});

test('the world corpse renderer exclusively uses the human model even while its asset is loading',()=>{
  const calls=[],renderer={ctx:{},iso:()=>({x:12,y:34}),playerModels:{drawCorpse(ctx,corpse,point){calls.push({corpse,point});return false;}}};
  for(const name of ['POLIZIST','APOTHEKERIN','REGLOSE PERSON']){
    const corpse={type:'corpse',name,x:1,y:1};Renderer.prototype.drawCorpse.call(renderer,corpse);
    assert.ok(corpse.playerAppearance);assert.equal(calls.at(-1).corpse,corpse);
  }
  assert.equal(calls.length,3);
});
