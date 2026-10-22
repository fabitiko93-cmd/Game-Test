import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import CATALOG from '../docs/assets/clothing/icons.json' with {type:'json'};
import {ITEMS} from '../docs/src/data.js';
import {createPlayer} from '../docs/src/character.js';
import {createItem,equipItem} from '../docs/src/inventory.js';
import {clothingIconKey,createItemIcon} from '../docs/src/item-icons.js';
import {playerModelAppearance} from '../docs/src/quaternius-catalog.js';
import {GameUI} from '../docs/src/ui.js';
import {buildClothingIcons} from '../scripts/prepare-clothing-icons.mjs';

const garmentTypes=Object.keys(ITEMS).filter(type=>['clothing','bag'].includes(ITEMS[type].type));
const root=new URL('../docs/assets/clothing/',import.meta.url);

test('every clothing and backpack item has the icon of its actual worn part on either body',()=>{
  for(const sex of ['male','female'])for(const type of garmentTypes){
    const item=createItem(type),key=clothingIconKey(item,sex);assert.ok(key,`${sex} ${type}`);
    const entry=CATALOG.icons[key],player=createPlayer({appearance:{sex}});player.inventory=[item];equipItem(player,item.id);
    const appearance=playerModelAppearance(player),slot=ITEMS[type].equipSlot;
    if(slot!=='back')assert.equal(entry.model,slot==='head'?appearance.headwear:appearance[slot],`${type}: image matches equipped mesh`);
    assert.equal(entry.slot,slot);assert.ok(entry.triangles>0);assert.ok(!entry.materials.includes('Skin'),'no floating body parts');
  }
  assert.equal(ITEMS.work_jacket.name,'Warnweste');assert.equal(ITEMS.work_jacket.short,'Warnweste');
});

test('the shipped transparent SVG icons reproduce original model geometry and contain the referenced symbols',async()=>{
  const rebuilt=await buildClothingIcons(),svg=await readFile(new URL(CATALOG.file,root),'utf8');
  assert.equal(svg,rebuilt.svg);assert.equal(await readFile(new URL('icons.json',root),'utf8'),rebuilt.metadata);
  assert.ok(CATALOG.file.includes(createHash('sha256').update(svg).digest('hex').slice(0,12)));
  assert.ok(!/NaN|Infinity|<image|<script|<rect/.test(svg),'geometry only, transparent background');
  for(const [key,entry] of Object.entries(CATALOG.icons)){
    assert.ok(svg.includes(`<symbol id="${key}"`),key);
    const source=await readFile(new URL('../docs/assets/quaternius/'+entry.source,import.meta.url));
    assert.equal(createHash('sha256').update(source).digest('hex'),entry.sourceSha256);
  }
});

class Element {
  constructor(tag){this.tag=tag;this.children=[];this.attributes={};this.dataset={};this.classList={add(){},toggle(){}};}
  setAttribute(key,value){this.attributes[key]=value;}
  append(...children){this.children.push(...children);}
  replaceChildren(...children){this.children=children;}
  addEventListener(){}
}
const dom={createElement:tag=>new Element(tag),createElementNS:(_,tag)=>new Element(tag)};

test('the actual inventory, equipment and loot menus use per-item model icons and the corrected name',()=>{
  const previous=globalThis.document;globalThis.document=dom;
  try{
    const player=createPlayer({appearance:{sex:'female'}});player.inventory=garmentTypes.map(type=>createItem(type));
    const ui={el:Object.fromEntries(['inventory_grid','equipment_grid','carry_weight','container_items'].map(id=>[id,new Element('div')])),callbacks:{},
      itemIcon:GameUI.prototype.itemIcon,itemAmount:GameUI.prototype.itemAmount,renderEquipment:GameUI.prototype.renderEquipment,decimal:String,updateItemDetail(){},renderQuickbar(){}};
    const vest=player.inventory.find(item=>item.type==='work_jacket');equipItem(player,vest.id);
    GameUI.prototype.renderInventory.call(ui,player,{});GameUI.prototype.renderContainer.call(ui,{items:player.inventory},player);
    for(const field of ['inventory_grid','container_items']){
      const buttons=ui.el[field].children;assert.equal(buttons.length,garmentTypes.length);
      for(const button of buttons){
        const icon=button.children[0];assert.equal(icon.className,'item-icon model-item-icon');
        const svg=icon.children[0],use=svg.children[0];assert.equal(svg.attributes.viewBox,'0 0 96 96');
        assert.ok(use.attributes.href.includes(`/assets/clothing/${CATALOG.file}#`));
        assert.ok(CATALOG.icons[use.attributes.href.split('#')[1]]);
      }
      assert.ok(buttons.some(button=>button.children[1].textContent==='Warnweste'));
    }
    assert.ok(ui.el.equipment_grid.children.some(button=>button.children[0]?.className==='item-icon model-item-icon'));
    assert.equal(createItemIcon(createItem('ak_762'),'male',dom).className,'item-icon ak','weapon icons stay available');
    assert.equal(clothingIconKey(createItem('water')),null);
  }finally{globalThis.document=previous;}
});
