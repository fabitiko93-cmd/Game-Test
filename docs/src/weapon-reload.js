import {activeWeapon,consumeType,countType,findItem,insertMagazine,itemDefinition,weaponStats} from './inventory.js';
import MOTIONS from '../assets/quaternius/weapon-animations.json' with {type:'json'};

const modKey=weapon=>Object.values(weapon.mods||{}).map(m=>m.id).sort().join('|');
const seconds=(clip,rate)=>MOTIONS.clips[clip].duration/rate;

// A single clock drives the hands, moving gun parts, ammunition events and
// fire lock. Loose magazine filling remains a separate inventory operation.
export function beginReload(game,weapon=activeWeapon(game.player),magazineId=null){
  const player=game.player,combat=player.combat,definition=itemDefinition(weapon);
  if(combat.reload)return {ok:false,message:'WIRD BEREITS NACHGELADEN'};
  if(!weapon||definition?.weaponKind!=='firearm')return {ok:false,message:'KEINE SCHUSSWAFFE AUSGERÜSTET'};
  if(activeWeapon(player)?.id!==weapon.id)return {ok:false,message:'ZUM NACHLADEN IN DIE HAND NEHMEN'};
  if(player.running||player.dead)return {ok:false,message:'ZUM NACHLADEN SPRINT BEENDEN'};
  const state={weaponId:weapon.id,weaponType:weapon.type,modKey:modKey(weapon),elapsed:0,loaded:0,
    beforeMagazineId:weapon.magazine?.id||null,committed:false,spentCases:weapon.spentCases||0};
  const rate=(weaponStats(weapon).reloadSpeed||1)*.8;
  if(definition.feed==='magazine'){
    const candidates=player.inventory.filter(i=>definition.magazineTypes.includes(i.type)).sort((a,b)=>(b.rounds||0)-(a.rounds||0));
    const magazine=magazineId?candidates.find(i=>i.id===magazineId):candidates.find(i=>!weapon.magazine||(i.rounds||0)>(weapon.magazine.rounds||0));
    if(!magazine)return {ok:false,message:'KEIN PASSENDES ERSATZMAGAZIN · MAGAZINE SEPARAT BEFÜLLEN'};
    Object.assign(state,{kind:'magazine',magazineId:magazine.id,clip:definition.hands===1?'reload1H':'reload2H'});
    state.duration=seconds(state.clip,rate);state.commitTime=state.duration*.68;
  }else{
    const missing=definition.capacity-(weapon.rounds||0);
    if(missing<=0)return {ok:false,message:'WAFFE IST GELADEN'};
    const planned=Math.min(missing,countType(player,definition.ammoType));
    if(!planned)return {ok:false,message:'KEINE PASSENDE MUNITION'};
    if(weapon.type==='revolver_44'){
      Object.assign(state,{kind:'cylinder',planned,initialRounds:weapon.rounds||0,start:seconds('revolverStart',rate),loop:seconds('revolverLoad',rate),end:seconds('revolverEnd',rate)});
      state.duration=state.start+state.loop*planned+state.end;
    }else{
      Object.assign(state,{kind:'internal',planned,clip:'reload2H'});
      state.duration=seconds(state.clip,rate);state.commitTime=state.duration*.68;
    }
  }
  combat.reload=state;combat.aim=0;
  combat.attackCooldown=Math.max(combat.attackCooldown||0,state.duration);
  game.world.emitNoise(player.x,player.y,1.2,'reload',1.5,.45);game.sound('reload');
  return {ok:true,message:`NACHLADEN · ${state.duration.toFixed(1).replace('.',',')} S`};
}

export function cancelReload(game){
  if(!game.player.combat.reload)return false;
  delete game.player.combat.reload;
  game.player.combat.attackCooldown=Math.min(game.player.combat.attackCooldown||0,.12);
  game.player.combat.aim=0;return true;
}

export function reloadPhase(state){
  if(!state)return null;
  if(state.kind!=='cylinder')return {clip:state.clip,progress:Math.min(1,state.elapsed/state.duration)};
  if(state.elapsed<state.start)return {clip:'revolverStart',progress:state.elapsed/state.start};
  const time=state.elapsed-state.start;
  if(time<state.loop*state.planned)return {clip:'revolverLoad',progress:(time%state.loop)/state.loop,round:Math.floor(time/state.loop)};
  return {clip:'revolverEnd',progress:Math.min(1,(time-state.loop*state.planned)/state.end)};
}

export function updateReload(game,delta){
  const player=game.player,state=player.combat.reload;
  if(!state)return false;
  const weapon=activeWeapon(player);
  if(player.dead||player.running||weapon?.id!==state.weaponId||modKey(weapon)!==state.modKey){cancelReload(game);return false;}
  const definition=itemDefinition(weapon);
  if(state.kind==='magazine'&&!state.committed&&(weapon.magazine?.id||null)!==state.beforeMagazineId){cancelReload(game);return false;}
  state.elapsed=Math.min(state.duration,state.elapsed+Math.max(0,delta));
  let changed=false;
  if(state.kind==='cylinder'&&!state.ejected&&state.elapsed>=state.start*.56){
    state.ejected=true;
    if(state.spentCases>0)game.renderer?.ejectRevolverCases?.(game,state.spentCases);
    weapon.spentCases=0;changed=true;
  }

  if(state.kind==='cylinder'){
    while(state.loaded<state.planned&&state.elapsed>=state.start+state.loop*(state.loaded+.7)){
      const moved=consumeType(player,definition.ammoType,1);
      if(!moved){cancelReload(game);return false;}
      weapon.rounds=(weapon.rounds||0)+moved;state.loaded++;changed=true;game.sound('reload');
    }
  }else if(!state.committed&&state.elapsed>=state.commitTime){
    if(state.kind==='magazine'){
      if(!findItem(player,state.magazineId)||!insertMagazine(player,weapon.id,state.magazineId).ok){cancelReload(game);return false;}
    }else weapon.rounds=(weapon.rounds||0)+consumeType(player,definition.ammoType,state.planned);
    state.committed=true;changed=true;game.sound('reload');
  }
  if(state.elapsed>=state.duration){weapon.slideLocked=false;delete player.combat.reload;changed=true;game.ui?.showToast?.('NACHGELADEN');}
  if(changed){game.ui?.refreshAll?.(player,game);game.save?.();}
  return Boolean(player.combat.reload);
}
