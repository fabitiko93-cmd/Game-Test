import { equipmentSummary, itemDefinition, itemWeight } from './inventory.js';
import { hasWeaponModel } from './weapon-catalog.js';

export const MOD_LABELS={optic:'VISIERUNG',muzzle:'MÜNDUNG',stock:'SCHAFT',foregrip:'VORDERGRIFF',utility:'ZUBEHÖR',magazine:'MAGAZIN'};
const weightLabel=item=>`${itemWeight(item).toLocaleString('de-DE',{minimumFractionDigits:2,maximumFractionDigits:2})} kg`;

// Both inspectors own a single pointer; a second touch cannot steal an orbit or
// reach the world underneath. Keyboard rotation uses the same angle state.
export function bindModelOrbit(canvas,read,write,{tilt=false}={}){
  let pointer=null,x=0,y=0;
  const stop=event=>{if(event&&event.pointerId!==pointer)return;const old=pointer;pointer=null;if(old!==null&&canvas.hasPointerCapture?.(old))canvas.releasePointerCapture(old);};
  canvas.addEventListener('pointerdown',event=>{
    event.preventDefault();event.stopPropagation();if(pointer!==null||event.button>0)return;
    pointer=event.pointerId;x=event.clientX;y=event.clientY;
    try{canvas.setPointerCapture(pointer);}catch(_){}
  });
  canvas.addEventListener('pointermove',event=>{
    if(event.pointerId!==pointer)return;event.preventDefault();event.stopPropagation();
    const state=read();write({yaw:state.yaw+(event.clientX-x)*.012,pitch:tilt?Math.max(-.75,Math.min(.75,(state.pitch||0)+(event.clientY-y)*.009)):0});
    x=event.clientX;y=event.clientY;
  });
  for(const name of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(name,stop);
  canvas.addEventListener('keydown',event=>{
    if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;
    event.preventDefault();event.stopPropagation();const state=read();
    write({yaw:state.yaw+(event.key==='ArrowLeft'?-.15:event.key==='ArrowRight'?.15:0),pitch:tilt?Math.max(-.75,Math.min(.75,(state.pitch||0)+(event.key==='ArrowUp'?-.1:event.key==='ArrowDown'?.1:0))):0});
  });
  return ()=>stop();
}

function element(tag,className,text){const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;}
function button(label,action,className='loadout-action'){const node=element('button',className,label);node.addEventListener('click',action);return node;}

export class EquipmentViews {
  constructor(ui){
    this.ui=ui;this.characterYaw=0;this.characterSlot='torso';this.characterTab='equipment';this.weaponSlot='stock';this.linkCache=new WeakMap();
    const ids=['character-preview','character-inspection','character-links','character-slots','character-equipment-detail','weapon-model-stage','weapon-links','weapon-slot-detail','weapon-parts-title','weapon-slot-picker','weapon-picker-title','weapon-picker-close','weapon-picker-backdrop'];
    this.el=Object.fromEntries(ids.map(id=>[id.replaceAll('-','_'),document.getElementById(id)]));
    this.cancelCharacter=bindModelOrbit(this.el.character_preview,()=>({yaw:this.characterYaw}),value=>{this.characterYaw=value.yaw;});
    this.cancelWeapon=bindModelOrbit(ui.el.weapon_preview,()=>({yaw:ui.weaponPreviewYaw,pitch:ui.weaponPreviewPitch}),value=>{ui.weaponPreviewYaw=value.yaw;ui.weaponPreviewPitch=value.pitch;},{tilt:true});
    document.getElementById('character-view-reset').addEventListener('click',()=>{this.characterYaw=0;});
    document.getElementById('weapon-view-reset').addEventListener('click',()=>{ui.weaponPreviewYaw=Math.PI/2;ui.weaponPreviewPitch=0;});
    this.el.weapon_picker_close.addEventListener('click',()=>this.closeWeaponPicker());
    this.el.weapon_picker_backdrop.addEventListener('click',()=>this.closeWeaponPicker());
    this.el.weapon_slot_picker.addEventListener('keydown',event=>{
      if(event.key==='Escape'){event.preventDefault();event.stopPropagation();this.closeWeaponPicker();}
      if(event.key==='Tab'){
        const focusable=[...this.el.weapon_slot_picker.querySelectorAll('button:not(:disabled)')].filter(node=>node.getClientRects().length);
        const index=focusable.indexOf(document.activeElement);
        if((event.shiftKey&&index<=0)||(!event.shiftKey&&index===focusable.length-1)){event.preventDefault();(event.shiftKey?focusable.at(-1):focusable[0])?.focus();}
      }
    });
    document.querySelectorAll('[data-character-tab]').forEach(node=>node.addEventListener('click',()=>this.showCharacterTab(node.dataset.characterTab)));
  }
  showCharacterTab(tab){
    this.characterTab=tab;
    document.querySelectorAll('[data-character-tab]').forEach(node=>{const active=node.dataset.characterTab===tab;node.classList.toggle('active',active);node.setAttribute('aria-pressed',String(active));});
    document.querySelectorAll('[data-character-page]').forEach(node=>node.classList.toggle('hidden',node.dataset.characterPage!==tab));
  }
  renderCharacter(player){
    this.player=player;const summaries=equipmentSummary(player),slots=this.el.character_slots;slots.replaceChildren();
    for(const summary of summaries){
      const node=button('',()=>{this.characterSlot=summary.slot;this.renderCharacter(this.player);},'model-slot character-slot');node.dataset.slot=summary.slot;
      node.classList.toggle('selected',summary.slot===this.characterSlot);node.setAttribute('aria-pressed',String(summary.slot===this.characterSlot));
      node.append(element('small','',summary.label),element('strong','',summary.reserved?'ZWEIHÄNDIG':summary.item?itemDefinition(summary.item).short:'LEER'));slots.append(node);
    }
    const selected=summaries.find(summary=>summary.slot===this.characterSlot),detail=this.el.character_equipment_detail;
    detail.replaceChildren(element('h3','',selected.label));
    if(selected.item){
      detail.append(element('strong','loadout-name',itemDefinition(selected.item).name),element('p','loadout-meta',weightLabel(selected.item)));
      const actions=element('div','loadout-actions');
      actions.append(button('ABLEGEN',()=>this.ui.callbacks.unequip?.(selected.reserved?'mainHand':selected.slot)));
      if(itemDefinition(selected.item).weaponKind==='firearm')actions.append(button('ANPASSEN',()=>this.ui.callbacks.customize?.(selected.item.id)));
      detail.append(actions);
    }else detail.append(element('p','loadout-meta','Dieser Platz ist frei.'));
    detail.append(element('h3','','PASSEND IM RUCKSACK'));
    const candidates=player.inventory.filter(item=>item.id!==selected.item?.id&&(itemDefinition(item).equipSlot===selected.slot||(selected.slot==='mainHand'&&itemDefinition(item).type==='weapon')));
    for(const item of candidates){
      const node=button('',()=>this.ui.callbacks.useItem?.(item.id),'loadout-choice');node.dataset.itemId=item.id;
      node.append(element('strong','',itemDefinition(item).short),element('small','',weightLabel(item)));detail.append(node);
    }
    if(!candidates.length)detail.append(element('p','loadout-meta','Keine passenden Gegenstände dabei.'));
  }
  prepareWeapon(weapon){
    const definition=itemDefinition(weapon),slots=[...(definition.feed==='magazine'?['magazine']:[]),...(definition.modSlots||[])];
    if(!slots.includes(this.weaponSlot))this.weaponSlot=slots[0]||null;
  }
  selectWeaponSlot(slot,weapon,player){this.weaponSlot=slot;this.ui.renderWeaponPanel(weapon,player);this.openWeaponPicker();}
  openWeaponPicker(){
    this.el.weapon_slot_picker.classList.remove('hidden');this.el.weapon_picker_backdrop.classList.remove('hidden');
    this.el.weapon_picker_close.focus({preventScroll:true});
  }
  closeWeaponPicker({returnFocus=true}={}){
    this.el.weapon_slot_picker.classList.add('hidden');this.el.weapon_picker_backdrop.classList.add('hidden');
    if(returnFocus)this.ui.el.mod_slots.querySelector(`[data-slot="${this.weaponSlot}"]`)?.focus({preventScroll:true});
  }
  renderWeapon(weapon){
    const slot=this.weaponSlot,installed=slot==='magazine'?weapon.magazine:weapon.mods?.[slot],detail=this.el.weapon_slot_detail;
    this.el.weapon_picker_title.textContent=`${MOD_LABELS[slot]||'TEILE'} AUSWÄHLEN`;
    this.el.weapon_model_stage.classList.toggle('no-model',!hasWeaponModel(weapon));
    for(const node of this.ui.el.mod_slots.children){node.classList.toggle('selected',node.dataset.slot===slot);node.setAttribute('aria-pressed',String(node.dataset.slot===slot));}
    detail.replaceChildren(element('strong','',`${MOD_LABELS[slot]||'ANBAUTEILE'} · ${installed?itemDefinition(installed).name:'LEER'}`));
    if(installed)detail.append(button('ENTFERNEN',()=>this.ui.callbacks.removeMod?.(weapon.id,slot)));
    this.ui.el.weapon_magazines.classList.toggle('hidden',slot!=='magazine');
    this.ui.el.available_mods.classList.toggle('hidden',slot==='magazine');
    this.el.weapon_parts_title.classList.toggle('hidden',slot==='magazine');
    this.el.weapon_parts_title.textContent=`${MOD_LABELS[slot]||'PASSENDE TEILE'} IM RUCKSACK`;
  }
  draw(game){
    if(!this.ui.el.character_panel.classList.contains('hidden')&&this.characterTab==='equipment'){
      const anchors=game.renderer.characterInspection.draw(this.el.character_preview,game.player,this.characterYaw);
      this.drawLinks(this.el.character_inspection,this.el.character_links,this.el.character_slots,anchors,this.el.character_preview);
    }
    if(!this.ui.el.weapon_panel.classList.contains('hidden')){
      const weapon=game.player.inventory.find(item=>item.id===this.ui.weaponId);
      if(hasWeaponModel(weapon)){
        const anchors=game.renderer.weaponInspection.draw(this.ui.el.weapon_preview,weapon,this.ui.weaponPreviewYaw,this.ui.weaponPreviewPitch);
        this.drawLinks(this.el.weapon_model_stage,this.el.weapon_links,this.ui.el.mod_slots,anchors,this.ui.el.weapon_preview);
      }else this.el.weapon_links.replaceChildren();
    }
  }
  drawLinks(stage,svg,slots,anchors,canvas){
    if(!anchors)return;
    const rect=stage.getBoundingClientRect(),selected=[...slots.children].find(node=>node.classList.contains('selected'))?.dataset.slot;
    const cached=this.linkCache.get(svg);
    if(cached?.anchors===anchors&&cached.width===rect.width&&cached.height===rect.height&&cached.selected===selected)return;
    this.linkCache.set(svg,{anchors,width:rect.width,height:rect.height,selected});
    const image=canvas.getBoundingClientRect();svg.setAttribute('viewBox',`0 0 ${rect.width} ${rect.height}`);svg.replaceChildren();
    for(const node of slots.children){
      const anchor=anchors[node.dataset.slot];if(!anchor)continue;
      const box=node.getBoundingClientRect(),left=box.left-rect.left+box.width/2<rect.width/2;
      const x=(left?box.right:box.left)-rect.left,y=box.top-rect.top+box.height/2,tx=anchor.x+image.left-rect.left,ty=anchor.y+image.top-rect.top;
      const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d',`M${x},${y} H${x+(left?12:-12)} L${tx},${ty}`);path.classList.toggle('selected',node.classList.contains('selected'));svg.append(path);
      const circle=document.createElementNS('http://www.w3.org/2000/svg','circle');circle.setAttribute('cx',tx);circle.setAttribute('cy',ty);circle.setAttribute('r','2');svg.append(circle);
    }
  }
}
