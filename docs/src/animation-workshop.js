import {Quaternion,Vector3} from 'three';
import {PlayerModels} from './player-models.js';
import {AnimationReplay,MOVEMENTS,SCENARIOS} from './animation-replay.js';
import {AnimationProject,CHANNELS,TRACKS,WEAPON_TYPES,emptyAnimation,emptyValues,parseAnimation,profileKey,putFrame,sampleTrack} from './animation-document.js';
import {applyAnimation} from './animation-library.js';
import {weaponModelDefinition} from './weapon-catalog.js';
import {ITEMS} from './data.js';
import {template,selectOptions,display} from './workshop-ui.js';
import {bindWorkshopInteraction,HANDLE_CHANNELS,handlePoint,elbowHandle} from './workshop-interaction.js';
import {WorkshopCamera} from './workshop-camera.js';
import {WorkshopReference} from './workshop-reference.js';
import {POSES,poseValues,putPose,putDuration,positionChannel} from './animation-document.js';

export class AnimationWorkshop{
  constructor(game){
    this.game=game;this.isOpen=false;this.playing=false;this.playHead=0;this.yaw=.35;this.pitch=.08;this.zoom=1;this.channel='weapon';this.mode='pose';this.tool='move';this.axis=0;this.notice='';this.busy=true;this.modSelection={};
    let storage=null;try{storage=globalThis.localStorage;}catch(_){}
    this.project=new AnimationProject(storage);
    this.cameraControl=new WorkshopCamera();
    const renderer=game.renderer;
    this.models=new PlayerModels(renderer.zombieModels.pass,renderer.modelLibrary);this.models.weapons=renderer.playerModels.weapons;
    this.replay=new AnimationReplay(this.models);
    this.root=document.createElement('section');this.root.className='animation-workshop hidden';this.root.setAttribute('role','dialog');this.root.setAttribute('aria-modal','true');this.root.setAttribute('aria-label','Animationswerkstatt');this.root.innerHTML=template;
    document.body.append(this.root);this.el=Object.fromEntries([...this.root.querySelectorAll('[data-aw]')].map(node=>[node.dataset.aw,node]));
    selectOptions(this.el.weapon,WEAPON_TYPES.map(type=>[type,weaponModelDefinition(type).name]));
    selectOptions(this.el.track,Object.entries(TRACKS));this.el.track.value='aim';
    selectOptions(this.el.movement,Object.entries(MOVEMENTS));selectOptions(this.el.scenario,Object.entries(SCENARIOS));
    const channels=Object.entries(CHANNELS).filter(([id])=>!['contactL','freeHandL','pinR','pinL','elbowTurnR','elbowTurnL'].includes(id)).map(([id,c])=>[id,c.label]);selectOptions(this.el.channel,channels);selectOptions(this.el.quickChannel,channels);
    this.reference=new WorkshopReference(this.el.referenceImage,storage);
    this.cancelGesture=bindWorkshopInteraction(this.el.canvas,{
      read:()=>({camera:this.camera,tool:this.tool,axis:this.axis,channel:this.channel,editable:this.canEdit(),handles:this.handles||[],rootYaw:this.replay.entity?.root.getWorldQuaternion(new Quaternion()),yaw:this.yaw,pitch:this.pitch}),
      allow:()=>{if(this.lockedHand()){this.message('Diese Hand hält ihren Griffkontakt. Zum freien Verschieben „Hand frei positionieren“ wählen.');return false;}return !this.standOnly()||!this.replay.player?.moving;},block:text=>this.message(text),
      select:channel=>this.selectChannel(channel,{focus:false}),tap:()=>this.focusSelection(),values:()=>this.currentValues(),orbit:(yaw,pitch)=>{this.yaw=yaw;this.pitch=pitch;},
      begin:()=>{this.playing=false;this.refreshPlayback();this.project.begin();this.dragging=true;this.cameraControl.freeze();},
      change:values=>{const document=this.editedDocument(values);this.project.preview(document);this.replay.previewEdits(this.project.document,this.project.revision);this.viewKey=null;},
      end:(cancel,moved)=>{if(cancel)this.project.cancel();const changed=!cancel&&this.project.commit();this.dragging=false;this.cameraControl.release();if(changed||cancel&&moved)this.changed();else this.renderValues();}
    });
    this.bind();this.renderMods();this.refreshMode();this.renderValues();
  }
  bind(){
    const on=(name,fn)=>this.el[name].addEventListener('click',()=>{try{this.cancelGesture?.();fn();}catch(error){this.message(error.message,true);}});
    on('panel',()=>this.setPanel(!this.panelOpen));on('panelClose',()=>this.setPanel(false));
    on('fitSelection',()=>this.focusSelection());on('whole',()=>{this.el.focus.value='body';this.setZoom(1);this.cameraControl.request('body');this.viewKey=null;});
    on('undoQuick',()=>{if(this.project.undo())this.changed();});on('playQuick',()=>this.el.play.click());
    on('rotateCycle',()=>{if(this.tool==='rotate'&&!this.isElbow())this.axis=(this.axis+1)%3;this.setTool('rotate');});
    this.el.workMode.addEventListener('change',()=>this.setMode(this.el.workMode.value));
    this.el.quickChannel.addEventListener('change',()=>this.selectChannel(this.el.quickChannel.value,{closePanel:true}));
    this.el.focus.addEventListener('change',()=>{this.cameraControl.request(this.focusSubject());this.viewKey=null;});
    for(const button of this.root.querySelectorAll('[data-aw-mode]'))button.addEventListener('click',()=>this.setMode(button.dataset.awMode));
    for(const button of this.root.querySelectorAll('[data-aw-tool]'))button.addEventListener('click',()=>this.setTool(button.dataset.awTool));
    for(const button of this.root.querySelectorAll('[data-aw-axis]'))button.addEventListener('click',()=>{this.axis=Number(button.dataset.awAxis);this.renderSelection();});
    for(const button of this.root.querySelectorAll('[data-aw-view]'))button.addEventListener('click',()=>{this.yaw=({front:0,side:Math.PI/2,three:.65})[button.dataset.awView];this.pitch=0;});
    on('zoomOut',()=>this.setZoom(this.zoom-.15));on('zoomIn',()=>this.setZoom(this.zoom+.15));
    on('zeroChannel',()=>{const values=this.currentValues();values[this.channel]=emptyValues()[this.channel];if(this.isElbow())values['elbowTurn'+this.channel.at(-1)]=[0];this.writeFrame(values);});
    this.el.contact.addEventListener('change',()=>this.setContact(Number(this.el.contact.value)));
    for(const side of ['R','L'])this.el['pin'+side].addEventListener('change',()=>{const values=this.currentValues();values['pin'+side][0]=Number(this.el['pin'+side].checked);this.writeFrame(values);});
    this.el.duration.addEventListener('change',()=>{if(this.canEdit())this.change(putDuration(this.project.document,this.key(),this.el.track.value.slice(2).toLowerCase(),Number(this.el.duration.value)));});
    on('reference',()=>{this.el.imageFile.value='';this.el.imageFile.click();});
    on('clearReference',()=>this.reference.clear());
    this.el.imageFile.addEventListener('change',()=>{try{this.reference.load(this.el.imageFile.files[0]);}catch(error){this.message(error.message,true);}});
    this.el.opacity.addEventListener('input',()=>{this.el.referenceImage.style.opacity=this.el.opacity.value;});this.el.referenceImage.style.opacity=this.el.opacity.value;
    this.el.referenceImage.addEventListener('error',()=>{this.reference.clear();this.message('Dieses Bildformat konnte nicht geöffnet werden.',true);});
    on('close',()=>this.close());on('camera',()=>{this.yaw=.35;this.pitch=.08;this.zoom=1;this.el.zoom.value='1';});
    on('play',()=>{const playing=!this.playing;if(playing&&this.playHead>=this.replay.duration)this.seek(0);this.playing=this.mode!=='pose'&&playing;this.refreshPlayback();if(!playing){this.renderValues();this.renderFrames();}});
    on('retry',()=>this.configure());
    on('start',()=>this.seek(0));on('end',()=>this.seek(this.replay.duration));on('back',()=>this.seek(this.replay.adjacentTime(-1)));on('next',()=>this.seek(this.replay.adjacentTime(1)));
    this.el.timeline.addEventListener('input',()=>this.seek(Number(this.el.timeline.value)*this.replay.duration));
    this.el.zoom.addEventListener('input',()=>{this.zoom=Number(this.el.zoom.value);});
    this.el.original.addEventListener('change',()=>{this.invalidate();this.renderValues();});
    for(const name of ['sex','track','movement','scenario','fps'])this.el[name].addEventListener('change',()=>this.configure());
    this.el.weapon.addEventListener('change',()=>{this.modSelection={};this.renderMods();this.configure();});
    this.el.channel.addEventListener('change',()=>this.selectChannel(this.el.channel.value));
    on('key',()=>this.writeFrame(this.currentValues()));
    on('zero',()=>{if(!this.canEdit())return;const doc=JSON.parse(this.project.serialize()),profile=doc.profiles[this.key()];if(profile){delete (this.mode==='pose'?profile.poses:profile.tracks)[this.el.track.value];this.change(doc);}});
    on('delete',()=>{
      const doc=JSON.parse(this.project.serialize()),frames=doc.profiles[this.key()]?.tracks[this.el.track.value];
      if(!this.canEdit()||this.mode==='pose'||!frames)return;const t=this.phase();doc.profiles[this.key()].tracks[this.el.track.value]=frames.filter(f=>Math.abs(f.time-t)>.0002);this.change(doc);
    });
    on('undo',()=>{if(this.project.undo())this.changed();});on('redo',()=>{if(this.project.redo())this.changed();});
    on('save',()=>{this.frame(0);this.project.save();if(this.mode==='pose'){this.reference.capture(this.key()+':'+this.el.track.value,this.el.canvas);this.renderPoseCards();}this.message('Entwurf auf diesem Gerät gespeichert.');this.renderFrames();});
    on('apply',()=>{applyAnimation(this.project.document,this.project.storage);this.message('Posen sind im Spiel auf diesem Gerät aktiv.');});
    on('originalGame',()=>{applyAnimation(emptyAnimation(),this.project.storage);this.message('Das Spiel verwendet wieder die Originalposen. Der Entwurf bleibt erhalten.');});
    on('export',()=>this.download('sperrkreis-animationen.json',this.project.serialize()));
    on('replay',()=>this.download('sperrkreis-pruefablauf.json',JSON.stringify({format:'sperrkreis-animation-replay',version:1,options:this.replay.options,mode:this.mode,time:this.replay.time,animation:this.project.document},null,2)+'\n'));
    on('import',()=>{this.el.file.value='';this.el.file.click();});
    this.el.file.addEventListener('change',async()=>{
      try{
        const file=this.el.file.files[0];if(!file)return;if(file.size>1500000)throw Error('Datei ist zu groß.');const text=await file.text();let input=JSON.parse(text);
        if(input.format==='sperrkreis-animation-replay'){
          const o=input.options;
          if(input.version!==1||!o||!WEAPON_TYPES.includes(o.type)||!['male','female'].includes(o.sex)||!Object.hasOwn(TRACKS,o.track)||!Object.hasOwn(MOVEMENTS,o.movement)||!Object.hasOwn(SCENARIOS,o.scenario)||![30,60].includes(o.fps)||!Number.isFinite(input.time))throw Error('Ungültiger Prüfablauf.');
          const definition=weaponModelDefinition(o.type);
          const slots=new Set(Object.keys(definition.mods).map(type=>ITEMS[type]?.modSlot));
          if(!o.mods||typeof o.mods!=='object'||Array.isArray(o.mods))throw Error('Ungültige Waffenaufsätze.');
          for(const [slot,type]of Object.entries(o.mods))if(!slots.has(slot)||typeof type!=='string'||(type&&(!Object.hasOwn(definition.mods,type)||ITEMS[type]?.modSlot!==slot)))throw Error('Unpassender Waffenaufsatz.');
          const animation=parseAnimation(JSON.stringify(input.animation));this.project.replace(animation);
          this.mode=['pose','animation','test'].includes(input.mode)?input.mode:'animation';if(this.mode==='pose'&&!Object.hasOwn(POSES,o.track))this.mode='animation';this.refreshMode();this.el.sex.value=o.sex;this.el.weapon.value=o.type;this.el.track.value=o.track;this.el.movement.value=o.movement;this.el.scenario.value=o.scenario;this.el.fps.value=String(o.fps);this.modSelection=o.mods||{};this.renderMods();await this.configure();this.seek(input.time);
        }else this.change(parseAnimation(text));
        this.message('Datei als Entwurf importiert.');
      }catch(error){this.message(error.message,true);}
    });
    this.root.addEventListener('keydown',event=>{
      if(event.key==='Escape'){event.preventDefault();this.close();}
      if(event.key==='Tab'){
        const nodes=[...this.root.querySelectorAll('button,input,select,summary,canvas[tabindex]')].filter(n=>!n.disabled&&n.getClientRects().length),i=nodes.indexOf(document.activeElement);
        if((event.shiftKey&&i<=0)||(!event.shiftKey&&i===nodes.length-1)){event.preventDefault();(event.shiftKey?nodes.at(-1):nodes[0])?.focus();}
      }
    });
  }
  async open(){
    this.game.setPaused(true);this.game.ui.hidePause();this.opener=document.activeElement;this.root.classList.remove('hidden');this.isOpen=true;
    this.setPanel(false);
    this.el.close.focus();await this.configure();if(this.project.error)this.message('Gespeicherter Entwurf konnte nicht geladen werden: '+this.project.error,true);
  }
  close(){this.playing=false;this.isOpen=false;this.root.classList.add('hidden');this.game.setPaused(true);this.cancelGesture?.();this.opener?.focus();}
  async configure(){
    this.cancelGesture?.();
    this.camera=null;this.handles=[];this.viewKey=null;
    this.refocusAfterSeek=false;
    this.cameraControl.request(this.focusSubject());
    this.playing=false;this.pendingTime=undefined;this.pendingReset=false;this.notice='';this.noticeError=false;this.busy=true;this.el.retry.hidden=true;this.el.loading.hidden=false;this.el.loading.textContent='Modelle werden geladen …';this.refreshPlayback();this.renderValues();
    const options={sex:this.el.sex.value,type:this.el.weapon.value,track:this.el.track.value,movement:this.el.movement.value,scenario:this.mode==='test'?this.el.scenario.value:'single',fps:Number(this.el.fps.value),mods:{...this.modSelection}};
    this.replay.setDocument(this.el.original.checked?null:this.project.document,this.project.revision);
    try{if(!await this.replay.configure(options))return;this.playHead=0;this.busy=false;this.el.loading.hidden=true;this.renderValues();this.renderFrames();this.renderPoseCards();}
    catch(error){this.busy=true;this.el.retry.hidden=false;this.el.loading.textContent=error.message;this.message(error.message,true);}
  }
  renderMods(){
    const definition=weaponModelDefinition(this.el.weapon.value),groups=new Map();this.el.mods.replaceChildren();
    for(const type of Object.keys(definition.mods)){const slot=ITEMS[type]?.modSlot;if(!slot)continue;if(!groups.has(slot))groups.set(slot,[]);groups.get(slot).push([type,ITEMS[type].name]);}
    if(!groups.size){this.el.mods.textContent='Für diese Waffe sind keine Aufsätze vorgesehen.';return;}
    const base=createDefaultMods(this.el.weapon.value);
    for(const [slot,entries]of groups){
      const label=document.createElement('label');label.textContent=({mount:'Montage',optic:'Visier',utility:'Lampe',muzzle:'Mündung',stock:'Schaft',barrel:'Lauf',grip:'Griff',foregrip:'Vordergriff'})[slot]||slot;
      const select=document.createElement('select');selectOptions(select,[['','Ohne'],...entries]);select.value=Object.hasOwn(this.modSelection,slot)?this.modSelection[slot]:base[slot]||'';
      select.addEventListener('change',()=>{this.modSelection[slot]=select.value;this.configure();});label.append(select);this.el.mods.append(label);
    }
  }
  canEdit(){return !this.busy&&!this.el.original.checked&&this.mode!=='test';}
  standOnly(){return ['pelvis','footR','footL','kneeR','kneeL'].includes(this.channel);}
  lockedHand(){return this.channel==='support'&&this.tool!=='rotate'&&this.currentValues().contactL[0]>=0&&!this.replay.player?.combat?.reload;}
  setZoom(value){this.zoom=Math.max(.7,Math.min(2.8,value));this.el.zoom.value=String(this.zoom);}
  setTool(tool){this.cancelGesture?.();this.tool=tool;this.renderSelection();}
  isElbow(){return this.channel==='elbowR'||this.channel==='elbowL';}
  focusSubject(){return this.el.focus.value==='selection'?this.channel:this.el.focus.value;}
  focusSelection(){this.el.focus.value='selection';this.setZoom(1);this.cameraControl.request(this.channel);this.viewKey=null;}
  setPanel(open){this.panelOpen=Boolean(open);this.root.dataset.panel=String(this.panelOpen);this.el.panelBody.hidden=!this.panelOpen;this.el.panel.setAttribute('aria-expanded',String(this.panelOpen));this.viewKey=null;}
  selectChannel(channel,{focus=true,closePanel=false}={}){if(focus)this.cancelGesture?.();this.channel=channel;this.el.channel.value=channel;this.el.quickChannel.value=channel;if(this.isElbow()&&this.tool==='depth')this.tool='move';if(focus)this.focusSelection();if(closePanel)this.setPanel(false);this.renderValues();}
  setMode(mode){if(this.mode===mode)return;this.cancelGesture?.();this.mode=mode;this.playing=false;this.setPanel(mode!=='pose');this.refreshMode();this.configure();}
  refreshMode(){
    const current=this.el.track.value;selectOptions(this.el.track,Object.entries(this.mode==='pose'?POSES:TRACKS));this.el.track.value=Object.hasOwn(this.mode==='pose'?POSES:TRACKS,current)?current:'aim';
    this.root.dataset.mode=this.mode;this.el.playarea.hidden=this.mode==='pose';this.el.scenarioLabel.hidden=this.mode!=='test';this.el.poseCards.hidden=this.mode!=='pose';
    this.el.workMode.value=this.mode;this.el.playQuick.hidden=this.mode==='pose';
    if(this.mode==='test'&&this.el.scenario.value==='single')this.el.scenario.value='transitions';
    this.el.modeHint.textContent=({pose:'Eine Grundhaltung bearbeiten. Änderungen gelten unabhängig vom Zeitpunkt. Die markierten Punkte können direkt angefasst werden.',animation:'Eine Haltung oder Aktion in der Zeit bearbeiten. Änderungen setzen ein Schlüsselbild an der ausgewählten Position.',test:'Gespeicherte Haltungen und Übergänge im gemeinsamen Spielcontroller prüfen. Zum Bearbeiten zu Haltung oder Animation wechseln.'})[this.mode];
    for(const button of this.root.querySelectorAll('[data-aw-mode]'))button.setAttribute('aria-pressed',String(button.dataset.awMode===this.mode));
    this.renderPoseCards();this.renderSelection();
  }
  renderSelection(){
    const rotational=!positionChannel(this.channel)&&CHANNELS[this.channel].size===3;
    this.el.rotation.hidden=this.isElbow()||this.tool==='view'||!(this.tool==='rotate'||rotational);
    for(const button of this.root.querySelectorAll('[data-aw-tool]')){button.setAttribute('aria-pressed',String(button.dataset.awTool===this.tool));if(button.dataset.awTool==='depth')button.disabled=this.isElbow();}
    for(const button of this.root.querySelectorAll('[data-aw-axis]'))button.setAttribute('aria-pressed',String(Number(button.dataset.awAxis)===this.axis));
    this.el.selection.textContent=CHANNELS[this.channel].label;
    this.el.gestureHint.textContent=this.tool==='view'?'Mit einem Finger die Ansicht drehen.':!this.canEdit()?'Ansicht und Vergleich; Bearbeitung gesperrt.':this.isElbow()?'Am Beugebogen ziehen. Die Hand behält ihren Griffkontakt.':this.standOnly()&&this.replay.player?.moving?'Zum Bearbeiten Stillstand wählen.':this.lockedHand()?'Handkontakt lösen oder die Waffe verschieben.':this.tool==='rotate'||rotational?'Am Punkt oder Ring ziehen. Drehachse darunter wählen.':this.tool==='depth'?'Am Punkt nach oben / unten ziehen: vor / zurück.':'Antippen zum Einzoomen, danach den Punkt ziehen.';
    this.el.rotateCycle.textContent=this.isElbow()?'BEUGEN':['NEIGEN','DREHEN','KIPPEN'][this.axis];
    const transition=this.mode==='animation'&&this.el.track.value.startsWith('to');this.el.durationLabel.hidden=!transition;
    if(transition){const posture=this.el.track.value.slice(2).toLowerCase();this.el.duration.value=String(this.project.document.profiles[this.key()]?.durations?.[posture]??(this.replay.entity?.weapon?.userData.pistol?.72:.42));}
    this.el.duration.disabled=!this.canEdit();this.el.key.textContent=this.mode==='pose'?'HALTUNG FESTHALTEN':'SCHLÜSSELSTELLUNG SETZEN';
  }
  setContact(value){
    if(!this.canEdit())return;const values=this.currentValues();
    if(value<0&&values.contactL[0]>=0){
      const entity=this.replay.entity,point=handlePoint(entity,'support').sub(entity.root.getWorldPosition(new Vector3())).applyQuaternion(entity.root.getWorldQuaternion(new Quaternion()).invert());
      values.freeHandL=point.toArray().map((v,i)=>v-values.support[i]);
    }
    values.contactL[0]=value;this.writeFrame(values);
  }
  renderPoseCards(){
    if(!this.reference)return;this.el.poseCards.replaceChildren();
    for(const [name,label]of Object.entries(POSES)){
      const button=document.createElement('button'),thumbnail=this.reference.thumbnails[this.key()+':'+name];button.setAttribute('aria-pressed',String(this.el.track.value===name));
      if(thumbnail){const image=document.createElement('img');image.src=thumbnail;image.alt='';button.append(image);}
      const text=document.createElement('span');text.textContent=label;button.append(text);button.addEventListener('click',()=>{this.el.track.value=name;this.configure();});this.el.poseCards.append(button);
    }
  }
  key(){return profileKey(this.el.sex.value,this.el.weapon.value);}
  phase(){return this.replay.duration?Math.min(1,this.replay.time/this.replay.duration):0;}
  currentValues(){return this.mode==='pose'?poseValues(this.project.document,this.key(),this.el.track.value):sampleTrack(this.project.document,this.key(),this.el.track.value,this.phase());}
  editedDocument(values){return this.mode==='pose'?putPose(this.project.document,this.key(),this.el.track.value,values):putFrame(this.project.document,this.key(),this.el.track.value,this.phase(),values);}
  writeFrame(values){if(!this.canEdit())return;this.playing=false;this.change(this.editedDocument(values));}
  change(document){this.project.replace(document);this.changed();}
  changed(){this.notice='';this.noticeError=false;this.invalidate();this.renderValues();this.renderFrames();this.renderPoseCards();this.refreshPlayback();}
  invalidate(){this.replay.setDocument(this.el.original.checked?null:this.project.document,this.project.revision);this.pendingReset=true;this.pendingTime=this.replay.time;}
  seek(time){if(this.mode==='pose')time=0;this.playing=false;this.playHead=Math.max(0,Math.min(this.replay.duration,time));this.pendingTime=this.playHead;this.refocusAfterSeek=true;this.viewKey=null;this.refreshPlayback();}
  refreshPlayback(){this.el.play.textContent=this.playing?'PAUSE':'ABSPIELEN';this.el.playQuick.textContent=this.playing?'Ⅱ':'▶';}
  renderValues(){
    const selectedField=this.isElbow()?'elbowTurn'+this.channel.at(-1):this.channel,all=this.currentValues(),c=CHANNELS[selectedField],values=all[selectedField],disabled=!this.canEdit()||this.standOnly()&&this.replay.player?.moving;this.el.values.replaceChildren();
    for(let i=0;i<c.size;i++){
      const translation=!this.isElbow()&&positionChannel(this.channel)&&i<3,scale=translation?100:1,step=this.isElbow()?1:translation?.1:c.size===1?.05:1;
      const label=document.createElement('label');label.className='aw-axis';const title=document.createElement('span');title.textContent=this.isElbow()?'Beugerichtung (°)':c.size===1?'Fingerbeugung (rad)':`${translation?['X · seitlich','Y · Höhe','Z · vor / zurück'][i]:['X · neigen','Y · drehen','Z · kippen'][i%3]} (${translation?'cm':'°'})`;
      const field=this.isElbow()?selectedField:this.channel==='support'&&all.contactL[0]<0&&i<3?'freeHandL':this.channel,limits=CHANNELS[field],value=all[field][i];
      const input=document.createElement('input');input.type='number';input.inputMode='decimal';input.step=String(step);input.min=String((limits.min?.[i]??-limits.limit[i])*scale);input.max=String(limits.limit[i]*scale);input.value=String(Math.round(value*scale*1000)/1000);input.disabled=disabled;
      const change=value=>{const number=Number(value);if(!Number.isFinite(number))return;const next=this.currentValues();next[field][i]=Math.max(limits.min?.[i]??-limits.limit[i],Math.min(limits.limit[i],number/scale));this.writeFrame(next);};
      input.addEventListener('change',()=>change(input.value));
      const minus=document.createElement('button'),plus=document.createElement('button');minus.textContent='−';plus.textContent='+';minus.disabled=plus.disabled=disabled;minus.setAttribute('aria-label',title.textContent+' verringern');plus.setAttribute('aria-label',title.textContent+' erhöhen');minus.addEventListener('click',()=>change(Number(input.value)-step));plus.addEventListener('click',()=>change(Number(input.value)+step));
      label.append(title,minus,input,plus);this.el.values.append(label);
    }
    for(const name of ['key','zero','delete','zeroChannel','contact','pinR','pinL'])this.el[name].disabled=disabled;this.el.delete.disabled=disabled||this.mode==='pose';this.el.contact.value=String(all.contactL[0]<-.5?-1:all.contactL[0]>.5?1:0);this.el.pinR.checked=all.pinR[0]>.5;this.el.pinL.checked=all.pinL[0]>.5;this.renderSelection();
    this.el.trackHint.textContent=this.mode==='pose'?'Diese Grundhaltung gilt über den gesamten Ablauf. Animationsspuren können zusätzliche Bewegungen ergänzen.':this.mode==='test'?'Zum Bearbeiten zu Haltung oder Animation wechseln.':this.el.track.value.startsWith('to')?'Diese Spur formt den Übergangsweg. An Anfang und Ende wird weich auf die Grundhaltungen übergeblendet.':'Schlüsselstellungen gelten für dieses Körpermodell und diese Waffe.';
  }
  renderFrames(){
    const frames=this.project.document.profiles[this.key()]?.tracks[this.el.track.value]||[];this.el.frames.replaceChildren();
    for(const frame of frames){const button=document.createElement('button');button.textContent=display(frame.time*this.replay.duration)+' s';button.classList.toggle('selected',Math.abs(frame.time-this.phase())<.0002);button.addEventListener('click',()=>this.seek(frame.time*this.replay.duration));this.el.frames.append(button);}
    this.el.frames.hidden=this.mode==='pose';this.el.markers.hidden=this.mode==='pose';
    this.el.frameLabel.textContent=this.mode==='pose'?'Zeitunabhängige Grundhaltung':frames.some(f=>Math.abs(f.time-this.phase())<.0002)?'Gespeicherte Schlüsselstellung':'Zwischenstellung';
    this.el.undo.disabled=this.el.undoQuick.disabled=!this.project.undoStack.length;this.el.redo.disabled=!this.project.redoStack.length;
    this.el.saved.textContent=JSON.stringify(this.project.saved)===JSON.stringify(this.project.document)?'Entwurf gespeichert':'Ungespeicherte Änderungen';
    this.el.markers.replaceChildren();for(const marker of this.replay.markers||[]){const button=document.createElement('button');button.textContent=marker.label+' · '+display(marker.time)+' s';button.addEventListener('click',()=>this.seek(marker.time));this.el.markers.append(button);}
  }
  message(text,error=false){this.notice=text;this.noticeError=error;this.el.status.textContent=text;this.el.status.classList.toggle('aw-error',error);}
  download(name,text){
    const url=URL.createObjectURL(new Blob([text],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  frame(delta){
    if(!this.isOpen||this.busy||!this.replay.entity)return;
    try{
      let refresh=false;
      if(this.pendingTime!==undefined){this.replay.seek(this.pendingTime,{reset:this.pendingReset});this.playHead=this.replay.time;this.pendingTime=undefined;this.pendingReset=false;if(this.refocusAfterSeek){this.cameraControl.request(this.focusSubject());this.refocusAfterSeek=false;}refresh=true;}
      if(this.playing){
        this.playHead+=delta*Number(this.el.speed.value);
        if(this.playHead>=this.replay.duration){if(this.el.loop.checked){this.playHead%=this.replay.duration;this.replay.seek(0,{reset:true});}else{this.playHead=this.replay.duration;this.playing=false;this.refreshPlayback();}}
        this.replay.seek(this.playHead);refresh=true;
      }
      this.draw();
      this.el.timeline.value=String(this.phase());this.el.time.textContent=`${display(this.replay.time)} / ${display(this.replay.duration)} s`;
      if(refresh&&!this.playing&&!this.el.values.contains(document.activeElement)){this.renderValues();this.renderFrames();}
    }catch(error){this.playing=false;this.message(error.message,true);}
  }
  draw(){
    const entity=this.replay.entity,rect=this.el.canvas.getBoundingClientRect();
    const viewKey=JSON.stringify([entity.root.uuid,this.replay.time,this.yaw,this.pitch,this.zoom,this.el.focus.value,this.channel,this.panelOpen,rect.width,rect.height,this.el.skeleton.checked,this.mode,this.tool,this.axis,this.project.revision,this.el.original.checked,this.el.diagnostics.parentElement.open,this.notice,this.noticeError,globalThis.innerWidth,globalThis.innerHeight,globalThis.devicePixelRatio,this.models.pass.status]);
    if(viewKey===this.viewKey)return;this.viewKey=viewKey;
    const framing=this.cameraControl.view(entity,{aspect:rect.width/Math.max(1,rect.height),yaw:this.yaw,pitch:this.pitch,zoom:this.zoom});
    const project=this.models.pass.drawInspection(this.el.canvas,entity.root,{...framing,azimuth:this.yaw,elevation:this.pitch});
    if(!project)return;
    this.projection=project;this.camera=this.models.pass.inspectionCamera.clone();this.drawOverlay(project);
    const d=this.replay.diagnostics;
    this.el.status.textContent=[this.notice,...d.warnings].filter(Boolean).join(' · ')||'Gelenke und Ziele innerhalb der geprüften Grenzen.';this.el.status.classList.toggle('aw-error',this.noticeError||d.warnings.length>0);
    this.el.quickStatus.textContent=this.notice||d.warnings[0]||this.el.gestureHint.textContent;this.el.quickStatus.classList.toggle('aw-error',this.noticeError||d.warnings.length>0);
    if(this.el.diagnostics.parentElement.open){
      this.el.diagnostics.replaceChildren();
      for(const side of ['R','L']){const s=d.sides[side],p=document.createElement('p');p.textContent=`${side==='R'?'Rechts':'Links'}: Handgelenk ${display(s.bend)}° · Unterarmdrehung ${display(s.foreTwist)}° · Handdrehung ${display(s.wristTwist)}° · Handtempo ${display(s.speed)} m/s`;this.el.diagnostics.append(p);}
      const p=document.createElement('p');p.textContent=`Steuerung: Beine ${d.owners.legs}, rechts ${d.owners.right}, links ${d.owners.left}.`;this.el.diagnostics.append(p);
      for(const [name,gap]of Object.entries(d.gaps)){const p=document.createElement('p');p.textContent=`${name==='weapon'?'Waffenziel':'Stützhandziel'}: ${display(gap*1000)} mm Abweichung`;this.el.diagnostics.append(p);}
    }
  }
  drawOverlay(project){
    const canvas=this.el.overlay,rect=this.el.canvas.getBoundingClientRect(),ratio=Math.min(2,globalThis.devicePixelRatio||1),entity=this.replay.entity;
    canvas.width=Math.round(rect.width*ratio);canvas.height=Math.round(rect.height*ratio);const ctx=canvas.getContext('2d');ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,rect.width,rect.height);
    const point=name=>project(entity.model.getObjectByName(name).getWorldPosition(new Vector3()));
    if(this.el.skeleton.checked){
      ctx.lineWidth=1.5;ctx.strokeStyle='#8ce1ba99';
      for(const chain of [['Head','Chest','Body'],['Chest','ShoulderR','UpperArmR','LowerArmR','WristR','Middle2R'],['Chest','ShoulderL','UpperArmL','LowerArmL','WristL','Middle2L'],['Body','UpperLegR','LowerLegR','FootR'],['Body','UpperLegL','LowerLegL','FootL']]){
        ctx.beginPath();chain.forEach((name,i)=>{const p=point(name);i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y);});ctx.stroke();
      }
    }
    this.handles=[];if(this.mode==='test'||this.el.original.checked||this.tool==='view')return;
    for(const channel of HANDLE_CHANNELS){
      const world=handlePoint(entity,channel);if(!world)continue;const p=project(world),selected=channel===this.channel;
      if(p.x<0||p.x>rect.width||p.y<0||p.y>rect.height)continue;
      const elbow=channel.startsWith('elbow')?elbowHandle(entity,channel.at(-1)):null;
      this.handles.push({channel,...p,point:world,elbow});
      if(selected&&elbow){ctx.beginPath();for(let i=0;i<=64;i++){const q=project(elbow.radial.clone().applyAxisAngle(elbow.axis,i*Math.PI/32).add(elbow.center));i?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y);}ctx.strokeStyle='#c9e5ba';ctx.lineWidth=2;ctx.setLineDash([4,3]);ctx.stroke();ctx.setLineDash([]);}
      ctx.beginPath();ctx.arc(p.x,p.y,selected?11:7,0,Math.PI*2);ctx.fillStyle=selected?'#ffe0a0':'#182b25d9';ctx.fill();ctx.strokeStyle=selected?'#fff3d9':'#9ee4c6';ctx.lineWidth=selected?3:2;ctx.stroke();
      if(selected){
        if(!elbow&&(this.tool==='rotate'||!positionChannel(channel))){ctx.beginPath();ctx.arc(p.x,p.y,43,0,Math.PI*2);ctx.setLineDash([5,4]);ctx.strokeStyle='#ffe0a0';ctx.stroke();ctx.setLineDash([]);}
        ctx.font='bold 11px sans-serif';ctx.textAlign='center';const label=CHANNELS[channel].label,tx=Math.max(75,Math.min(rect.width-75,p.x)),ty=Math.max(18,p.y-20);ctx.lineWidth=4;ctx.strokeStyle='#102018';ctx.strokeText(label,tx,ty);ctx.fillStyle='#fff1cf';ctx.fillText(label,tx,ty);
        const target=entity.animationTargets?.[channel];if(!elbow&&!channel.startsWith('knee')&&target&&target.distanceTo(world)>.015){const t=project(target);ctx.setLineDash([3,4]);ctx.strokeStyle='#e8b07e';ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(t.x,t.y);ctx.stroke();ctx.setLineDash([]);ctx.strokeRect(t.x-4,t.y-4,8,8);}
      }
    }
  }
}

function createDefaultMods(type){
  return{...ITEMS[type]?.defaultMods};
}
