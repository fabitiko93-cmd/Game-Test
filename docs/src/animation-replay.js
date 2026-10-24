import {Quaternion,Vector3} from 'three';
import {createPlayer} from './character.js';
import {activeWeapon,createItem,addItem,equipItem,consumeShot} from './inventory.js';
import {ITEMS} from './data.js';
import {playerModelAppearance,defaultStyle} from './quaternius-catalog.js';
import {beginReload,cancelReload,updateReload} from './weapon-reload.js';
import {kickWeapon} from './weapon-recoil.js';
import {axialAngle} from './weapon-ik.js';
import {transitionDuration} from './animation-targets.js';

export const SCENARIOS={single:'Einzelne Haltung / Aktion',transitions:'Anlegen → Schleichen → Sprint',interrupt:'Nachladen → Abbruch → Anlegen',turn:'Anlegen mit Richtungswechsel'};
export const MOVEMENTS={idle:'Stillstand',walk:'Gehen',crouch:'Schleichstillstand',crouchWalk:'Schleichen',sprint:'Sprinten'};
const vec=()=>new Vector3(),clone=x=>JSON.parse(JSON.stringify(x));

export class AnimationReplay{
  constructor(models){this.models=models;this.options={sex:'male',type:'pistol_9mm',track:'aim',movement:'idle',scenario:'single',fps:60,mods:{}};this.time=0;this.events=[];this.version=0;}
  async configure(options={}){
    this.options={...this.options,...options};
    const ticket=++this.version;
    const [,weaponAsset]=await Promise.all([this.models.ready,this.models.weapons.request(this.options.type,{retry:true})]);
    if(ticket!==this.version)return false;
    if(!weaponAsset)throw Error('Waffenmodell konnte nicht geladen werden. Bitte Modelle erneut laden.');
    const player=createPlayer({appearance:{sex:this.options.sex}});player.inventory=[];player.baseCapacity=100;player.equipment.mainHand=null;player.equipment.back=null;player.facingY=1;player.x=0;player.y=0;
    const weapon=createItem(this.options.type);weapon.id='workshop-weapon';
    for(const [slot,type]of Object.entries(this.options.mods)){
      if(type)weapon.mods[slot]=createItem(type);else delete weapon.mods[slot];
    }
    const definition=ITEMS[weapon.type],magazine=definition.magazineTypes?.[0];
    if(magazine){weapon.magazine=createItem(magazine,1,{rounds:3});weapon.magazine.id='workshop-current-mag';addItem(player,createItem(magazine,1,{rounds:7}));}
    else{weapon.rounds=3;addItem(player,createItem(definition.ammoType,12));}
    if(!addItem(player,weapon)||!equipItem(player,weapon.id).ok)throw Error('Testwaffe konnte nicht ausgerüstet werden.');
    this.base=clone(player);
    const appearance=playerModelAppearance(player);
    const needed=[...new Set([`${appearance.sex}-${defaultStyle(appearance.sex)}`,'player-motion','male-Beach',...['head','torso','legs','feet'].map(s=>appearance[s]),appearance.headwear].filter(Boolean))];
    const loaded=await Promise.all(needed.map(key=>this.models.library.request(key,{retry:true})));
    if(ticket!==this.version)return false;
    const missing=needed.filter((_,i)=>!loaded[i]);
    if(missing.length)throw Error('Figurenmodell konnte nicht geladen werden: '+missing.join(', ')+'. Bitte Modelle erneut laden.');
    this.reset();return true;
  }
  reset(){
    for(const entity of this.models.entities.values())this.models.release(entity);
    this.models.entities.clear();this.models.prepared.clear();this.models.used.clear();
    this.player=clone(this.base);this.time=0;this.steps=0;this.events=[];this.markers=[];this.previousJoints=null;
    this.game={player:this.player,world:{emitNoise(){}},sound(){},save(){},ui:{showToast(){},refreshAll(){}}};
    this.duration=this.options.scenario==='single'?(this.options.track==='shot'?.5:2):4;
    this.setMovement(this.options.movement);
    this.starting=true;this.evaluate(1);this.starting=false;
    if(this.options.track==='reload'&&this.options.scenario==='single'){
      const started=beginReload(this.game);if(!started.ok)throw Error(started.message);this.duration=this.player.combat.reload.duration;
      const state=this.player.combat.reload;
      if(state.kind==='cylinder')for(let i=0;i<state.planned;i++)this.markers.push({time:state.start+state.loop*(i+.7),label:`Patrone ${i+1}`});
      else this.markers.push({time:state.commitTime,label:'Munition übernommen'});
    }
    if(this.options.track==='shot'&&this.options.scenario==='single'&&!this.fire())throw Error('Schuss nicht möglich. Munition, Laufmodul und Bewegung prüfen.');
    if(this.options.scenario==='single'&&this.options.track.startsWith('to'))this.duration=transitionDuration(this.entity,this.options.track.slice(2).toLowerCase(),this.entity.weapon?.userData.pistol?.72:.42);
    else if(this.options.scenario==='single'&&!['reload','shot'].includes(this.options.track)){
      const action=this.entity.actions.get(this.clip);this.duration=action?.getClip().duration||2;
    }
    this.evaluate(0);return this.entity;
  }
  setDocument(document,revision){this.document=document;this.revision=revision;}
  previewEdits(document,revision){
    this.setDocument(document,revision);
    for(const entity of this.models.entities.values())entity.animationDirectEdit=true;
    try{return this.evaluate(0);}finally{for(const entity of this.models.entities.values())entity.animationDirectEdit=false;}
  }
  setMovement(name){
    this.movement=name;this.player.moving=['walk','crouchWalk','sprint'].includes(name);this.player.running=name==='sprint';this.player.stance=name.startsWith('crouch')?'sneak':'walk';
  }
  fire(){
    const weapon=activeWeapon(this.player);
    if(this.player.running||this.player.combat.reload||!consumeShot(weapon))return false;
    this.player.shots++;
    kickWeapon(this.player,weapon);this.player.combat.shotImpulse.fresh=false;
    this.events.push({time:this.time,label:'Schuss'});
    return true;
  }
  eventAt(at,previous,label,fn){if(previous<at&&this.time>=at){fn();this.events.push({time:at,label});}}
  step(delta){
    const previous=this.time;this.time+=delta;
    if(this.player.moving){const speed=this.player.running?2:this.player.stance==='sneak'?.45:.9;this.player.x+=this.player.facingX*delta*speed;this.player.y+=this.player.facingY*delta*speed;}
    const impulse=this.player.combat.shotImpulse;if(impulse)impulse.age+=delta;
    if(this.player.combat.reload)updateReload(this.game,delta);
    if(this.options.scenario==='transitions'){
      this.eventAt(.6,previous,'Schleichen',()=>this.setMovement('crouchWalk'));
      this.eventAt(1.2,previous,'Sprint',()=>this.setMovement('sprint'));
      this.eventAt(1.55,previous,'Anlegen',()=>this.setMovement('idle'));
      this.eventAt(2,previous,'Schleichstillstand',()=>this.setMovement('crouch'));
      this.eventAt(2.4,previous,'Gehen',()=>this.setMovement('walk'));
      this.eventAt(2.8,previous,'Stillstand',()=>this.setMovement('idle'));
    }else if(this.options.scenario==='interrupt'){
      this.eventAt(.4,previous,'Nachladen',()=>beginReload(this.game));
      this.eventAt(1.1,previous,'Abbruch / Sprint',()=>{cancelReload(this.game);this.setMovement('sprint');});
      this.eventAt(1.4,previous,'Erneut anlegen',()=>this.setMovement('idle'));
      this.eventAt(2,previous,'Schuss',()=>this.fire());
    }else if(this.options.scenario==='turn'){
      this.player.facingX=Math.sin(this.time>1?2.9:-2.9);this.player.facingY=Math.cos(this.time>1?2.9:-2.9);
    }
    this.steps++;return this.evaluate(delta);
  }
  evaluate(delta){
    const player=this.player,track=this.options.track,scenario=this.options.scenario;
    let posture=track==='carry'||track==='crouchCarry'?'carry':track==='hip'?'hip':'aim';
    if(track.startsWith('to')){const destination=track.slice(2).toLowerCase();posture=this.starting?(destination==='carry'?'aim':'carry'):destination;}
    if(scenario!=='single')posture=player.running||this.movement==='crouch'?'carry':'aim';
    if(scenario==='single'&&track.startsWith('crouch'))this.setMovement(this.options.movement==='crouchWalk'?'crouchWalk':'crouch');
    Object.assign(player.combat,{enabled:posture==='aim',targetId:posture==='aim'?'workshop-target':null,aim:posture==='aim'?1:0});
    this.clip=player.moving?(player.running?'Run':player.stance==='sneak'?'Crouch_Walk':'Walk'):(player.stance==='sneak'?'Crouch_Idle':posture==='carry'?'Idle_Neutral':'Idle_Gun_Pointing');
    const progress=this.duration>0?Math.min(.999999,this.time/this.duration):0;
    const pose=scenario==='single'?{appearance:playerModelAppearance(player),clip:this.clip,progress,delta,yaw:Math.atan2(player.facingX,player.facingY)}:this.models.motion.sample(player,this.time);
    this.entity=this.models.prepare(player,this.time,{pose,posture,document:this.document,revision:this.revision||0});
    this.diagnostics=measureAnimation(this.entity,player,this.previousJoints,delta);
    this.previousJoints=this.diagnostics.joints;
    return this.entity;
  }
  // Imported clip lengths are float32. Treat an almost-integral frame count as
  // integral, so its last evaluation has a real frame interval, not nanoseconds.
  get frameCount(){return Math.max(1,Math.ceil(this.duration*this.options.fps-1e-5));}
  frameTime(index){return index>=this.frameCount?this.duration:Math.max(0,index)/this.options.fps;}
  adjacentTime(direction){return this.frameTime(Math.min(this.frameCount,this.steps+Math.sign(direction)));}
  seek(time,{reset=false}={}){
    time=Math.max(0,Math.min(this.duration,time));
    const target=time>=this.duration-1e-8?this.frameCount:Math.min(this.frameCount-1,Math.floor(time*this.options.fps+1e-7));
    if(reset||target<this.steps)this.reset();
    while(this.steps<target)this.step(this.frameTime(this.steps+1)-this.time);
    return this.entity;
  }
  dispose(){for(const e of this.models.entities.values())this.models.release(e);this.models.entities.clear();}
}

export function measureAnimation(entity,player,previous=null,delta=0){
  if(!entity)return{warnings:['Modelle werden geladen.'],joints:{},sides:{}};
  const point=name=>entity.model.getObjectByName(name).getWorldPosition(vec()),joints={},warnings=[],sides={};
  if(!entity.weapon||entity.weapon.userData.weaponId!==activeWeapon(player)?.id)warnings.push('Waffenmodell nicht geladen.');
  for(const name of ['Chest','Head','ShoulderR','ShoulderL','UpperArmR','UpperArmL','LowerArmR','LowerArmL','WristR','WristL','Middle2R','Middle2L'])joints[name]=point(name).toArray();
  for(const side of ['R','L']){
    const upper=point('UpperArm'+side),lower=point('LowerArm'+side),wrist=point('Wrist'+side),middle=point('Middle2'+side),axis=wrist.clone().sub(lower).normalize();
    const bend=wrist.clone().sub(lower).angleTo(middle.sub(wrist))*180/Math.PI;
    const forearm=entity.model.getObjectByName('LowerArm'+side),hand=entity.model.getObjectByName('Wrist'+side),saved=forearm.quaternion.clone(),actual=forearm.getWorldQuaternion(new Quaternion()),handQ=hand.getWorldQuaternion(new Quaternion());
    forearm.quaternion.copy(entity.rifleHands.get('LowerArm'+side).rotation);entity.root.updateMatrixWorld(true);
    const from=hand.getWorldPosition(vec()).sub(lower).normalize(),neutral=new Quaternion().setFromUnitVectors(from,axis).multiply(forearm.getWorldQuaternion(new Quaternion()));
    forearm.quaternion.copy(saved);entity.root.updateMatrixWorld(true);
    const foreTwist=Math.abs(axialAngle(actual.clone().multiply(neutral.invert()),axis))*180/Math.PI;
    const wristTwist=Math.abs(axialAngle(handQ.multiply(actual.multiply(entity.rifleHands.get('Wrist'+side).rotation).invert()),axis))*180/Math.PI;
    const speed=previous&&delta>0?wrist.distanceTo(new Vector3(...previous['Wrist'+side]))/delta:0;
    const flex=lower.clone().sub(upper).angleTo(wrist.clone().sub(lower))*180/Math.PI;
    sides[side]={bend,foreTwist,wristTwist,speed,flex};
    if(![bend,foreTwist,wristTwist,speed,flex,...upper,...wrist].every(Number.isFinite))warnings.push(`${side}: ungültige Gelenkstellung`);
    if(bend>(entity.weapon?.userData.pistol?(player.combat?.reload?55:40):85))warnings.push(`${side}: Handgelenk stark gebeugt`);
    if(foreTwist>(entity.weapon?.userData.grips?.handgun?65:175))warnings.push(`${side}: Unterarm stark verdreht`);
    if(speed>4)warnings.push(`${side}: schneller Handsprung`);
  }
  const gaps={};
  for(const [side,gap]of Object.entries(entity.characterGaps||{}))if(gap>.025)warnings.push(`${side==='R'?'Rechter':'Linker'} Fuß: Ziel außerhalb der Reichweite`);
  for(const [channel,target]of Object.entries(entity.animationTargets||{})){
    if(channel==='weapon'||channel==='support'){
      const actual=channel==='weapon'?entity.weapon.getWorldPosition(vec()):point('Middle2L');gaps[channel]=actual.distanceTo(target);
      if(gaps[channel]>.08)warnings.push(channel==='weapon'?'Waffenziel noch nicht erreicht':'Stützhandziel noch nicht erreicht');
    }
  }
  return{joints,sides,warnings,gaps,owners:entity.animationOwners};
}
