import CATALOG from '../assets/clothing/icons.json' with {type:'json'};
import {ITEMS} from './data.js';
import {clothingModelFor} from './clothing-catalog.js';

const SVG='http://www.w3.org/2000/svg';
const atlas=new URL(`../assets/clothing/${CATALOG.file}`,import.meta.url).href;

export function clothingIconKey(item,sex='male') {
  const definition=ITEMS[typeof item==='string'?item:item?.type];
  if(!['clothing','bag'].includes(definition?.type))return null;
  const model=definition.type==='bag'?'male-Adventurer':clothingModelFor(typeof item==='string'?{type:item}:item,definition,sex);
  const key=`${model}-${definition.equipSlot}`;
  return CATALOG.icons[key]?key:null;
}

export function createItemIcon(item,sex='male',dom=globalThis.document) {
  const definition=ITEMS[typeof item==='string'?item:item?.type],key=clothingIconKey(item,sex),icon=dom.createElement('div');
  icon.className=`item-icon ${key?'model-item-icon':definition?.icon||definition?.type||item}`;
  icon.setAttribute('aria-hidden','true');
  if(key){
    const svg=dom.createElementNS(SVG,'svg'),use=dom.createElementNS(SVG,'use');
    svg.setAttribute('viewBox',CATALOG.viewBox);svg.setAttribute('focusable','false');
    use.setAttribute('href',`${atlas}#${key}`);svg.append(use);icon.append(svg);
  }
  return icon;
}
