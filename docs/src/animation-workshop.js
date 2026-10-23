import {Vector3} from 'three';
import {PlayerModels} from './player-models.js';
import {AnimationReplay,MOVEMENTS,SCENARIOS} from './animation-replay.js';
import {AnimationProject,CHANNELS,TRACKS,WEAPON_TYPES,emptyAnimation,emptyValues,parseAnimation,profileKey,putFrame,sampleTrack} from './animation-document.js';
import {applyAnimation} from './animation-library.js';
import {weaponModelDefinition} from './weapon-catalog.js';
import {ITEMS} from './data.js';
import {bindModelOrbit} from './equipment-views.js';

const template=`
  <header class="aw-header"><div><small>SPERRKREIS 98</small><h2>ANIMATIONSWERKSTATT</h2></div><button data-aw="close" aria-label="Animationswerkstatt schließen">SCHLIESSEN ×</button></header>
  <div class="aw-layout">
    <section class="aw-view">
      <div class="aw-bar"><label><input type="checkbox" data-aw="original"> Original vergleichen</label><label><input type="checkbox" data-aw="skeleton" checked> Skelett / Ziele</label><button data-aw="camera">KAMERA ZURÜCK</button><button data-aw="retry" hidden>MODELLE ERNEUT LADEN</button></div>
      <div class="aw-stage"><canvas data-aw="canvas" tabindex="0" aria-label="Animierte Figur. Zum Umsehen ziehen."></canvas><canvas data-aw="overlay" aria-hidden="true"></canvas><span class="aw-loading" data-aw="loading">Modelle werden geladen …</span></div>
      <div class="aw-zoom"><label>Fokus<select data-aw="focus"><option value="body">Ganze Figur</option><option value="chest">Oberkörper</option><option value="head">Kopf</option><option value="hands">Hände</option></select></label><label>Zoom <input data-aw="zoom" type="range" min="0.7" max="2.8" step="0.05" value="1" aria-label="Ansicht vergrößern"></label></div>
      <p class="aw-hint">Ansicht drehen: mit einem Finger ziehen. Die Kamerabewegung ändert die Pose nicht.</p>
      <div class="aw-playback"><button data-aw="start" aria-label="Anfang">|◀</button><button data-aw="back" aria-label="Ein Bild zurück">−1 BILD</button><button data-aw="play">ABSPIELEN</button><button data-aw="next" aria-label="Ein Bild weiter">+1 BILD</button><button data-aw="end" aria-label="Ende">▶|</button></div>
      <label class="aw-timeline">Zeit <output data-aw="time">0,00 s</output><input data-aw="timeline" type="range" min="0" max="1" step="0.0001" value="0" aria-label="Animationszeit"></label>
      <div class="aw-bar"><label>Tempo <select data-aw="speed"><option value="0.25">¼×</option><option value="0.5">½×</option><option value="1" selected>1×</option><option value="2">2×</option></select></label><label><input data-aw="loop" type="checkbox"> Wiederholen</label><label>Prüftakt <select data-aw="fps"><option value="60">60 Bilder/s</option><option value="30">30 Bilder/s</option></select></label></div>
      <div data-aw="frames" class="aw-frames" aria-label="Gespeicherte Schlüsselstellungen"></div>
      <div data-aw="markers" class="aw-frames" aria-label="Aktionsereignisse"></div>
      <div data-aw="status" class="aw-status" role="status" aria-live="polite"></div>
      <details class="aw-diagnostics"><summary>Gelenke und Handkontakt prüfen</summary><div data-aw="diagnostics"></div></details>
    </section>
    <section class="aw-edit">
      <div class="aw-config"><label>Körpermodell<select data-aw="sex"><option value="male">Männlich · 1,80 m</option><option value="female">Weiblich · 1,68 m</option></select></label><label>Waffe<select data-aw="weapon"></select></label><label>Haltung / Aktion<select data-aw="track"></select></label><label>Bewegung<select data-aw="movement"></select></label><label>Prüfablauf<select data-aw="scenario"></select></label></div>
      <details><summary>Waffenaufsätze</summary><div data-aw="mods" class="aw-config"></div></details>
      <div class="aw-section-title"><h3>POSE BEARBEITEN</h3><span data-aw="frameLabel"></span></div>
      <label>Bereich<select data-aw="channel"></select></label>
      <p class="aw-hint">Verschiebung in cm, Drehung in Grad. Die Regler ändern die Spielhaltung am gewählten Zeitpunkt. Ellenbogenwerte steuern die Beugerichtung.</p>
      <div data-aw="values" class="aw-values"></div>
      <div class="aw-bar"><button data-aw="key">SCHLÜSSELSTELLUNG SETZEN</button><button data-aw="delete">STELLUNG LÖSCHEN</button></div>
      <div class="aw-bar"><button data-aw="undo">RÜCKGÄNGIG</button><button data-aw="redo">WIEDERHOLEN</button><button data-aw="zero">POSE ZURÜCKSETZEN</button></div>
      <p class="aw-hint" data-aw="trackHint"></p>
      <div class="aw-section-title"><h3>SPEICHERN &amp; VERWENDEN</h3><span data-aw="saved"></span></div>
      <div class="aw-bar"><button data-aw="save">ENTWURF SPEICHERN</button><button class="primary" data-aw="apply">IM SPIEL VERWENDEN</button></div>
      <p class="aw-hint">„Im Spiel verwenden“ aktiviert die Einstellungen auf diesem Gerät. Exportierte Dateien können dauerhaft ins Projekt übernommen werden.</p>
      <div class="aw-bar"><button data-aw="export">POSEN EXPORTIEREN</button><button data-aw="import">DATEI IMPORTIEREN</button><button data-aw="replay">PRÜFABLAUF EXPORTIEREN</button><button data-aw="originalGame">SPIEL AUF ORIGINAL SETZEN</button></div>
      <input data-aw="file" class="hidden" type="file" accept="application/json,.json">
    </section>
  </div>`;

function selectOptions(select,entries){select.replaceChildren();for(const [value,label]of entries){const option=document.createElement('option');option.value=value;option.textContent=label;select.append(option);}}
const display=n=>n.toLocaleString('de-DE',{minimumFractionDigits:2,maximumFractionDigits:2});

export class AnimationWorkshop{
  constructor(game){
    this.game=game;this.isOpen=false;this.playing=false;this.playHead=0;this.yaw=.35;this.pitch=.08;this.zoom=1;this.channel='weapon';this.notice='';this.busy=true;this.modSelection={};
    let storage=null;try{storage=globalThis.localStorage;}catch(_){}
    this.project=new AnimationProject(storage);
    const renderer=game.renderer;
    this.models=new PlayerModels(renderer.zombieModels.pass,renderer.modelLibrary);this.models.weapons=renderer.playerModels.weapons;
    this.replay=new AnimationReplay(this.models);
    this.root=document.createElement('section');this.root.className='animation-workshop hidden';this.root.setAttribute('role','dialog');this.root.setAttribute('aria-modal','true');this.root.setAttribute('aria-label','Animationswerkstatt');this.root.innerHTML=template;
    document.body.append(this.root);this.el=Object.fromEntries([...this.root.querySelectorAll('[data-aw]')].map(node=>[node.dataset.aw,node]));
    selectOptions(this.el.weapon,WEAPON_TYPES.map(type=>[type,weaponModelDefinition(type).name]));
    selectOptions(this.el.track,Object.entries(TRACKS));this.el.track.value='aim';
    selectOptions(this.el.movement,Object.entries(MOVEMENTS));selectOptions(this.el.scenario,Object.entries(SCENARIOS));selectOptions(this.el.channel,Object.entries(CHANNELS).map(([id,c])=>[id,c.label]));
    bindModelOrbit(this.el.canvas,()=>({yaw:this.yaw,pitch:this.pitch}),v=>{this.yaw=v.yaw;this.pitch=v.pitch;},{tilt:true,tiltLimit:1.45});
    this.bind();this.renderMods();this.renderValues();
  }
  bind(){
    const on=(name,fn)=>this.el[name].addEventListener('click',()=>{try{fn();}catch(error){this.message(error.message,true);}});
    on('close',()=>this.close());on('camera',()=>{this.yaw=.35;this.pitch=.08;this.zoom=1;this.el.zoom.value='1';});
    on('play',()=>{const playing=!this.playing;if(playing&&this.playHead>=this.replay.duration)this.seek(0);this.playing=playing;this.refreshPlayback();if(!playing){this.renderValues();this.renderFrames();}});
    on('retry',()=>this.configure());
    on('start',()=>this.seek(0));on('end',()=>this.seek(this.replay.duration));on('back',()=>this.seek(this.replay.adjacentTime(-1)));on('next',()=>this.seek(this.replay.adjacentTime(1)));
    this.el.timeline.addEventListener('input',()=>this.seek(Number(this.el.timeline.value)*this.replay.duration));
    this.el.zoom.addEventListener('input',()=>{this.zoom=Number(this.el.zoom.value);});
    this.el.original.addEventListener('change',()=>{this.invalidate();this.renderValues();});
    for(const name of ['sex','track','movement','scenario','fps'])this.el[name].addEventListener('change',()=>this.configure());
    this.el.weapon.addEventListener('change',()=>{this.modSelection={};this.renderMods();this.configure();});
    this.el.channel.addEventListener('change',()=>{this.channel=this.el.channel.value;this.renderValues();});
    on('key',()=>this.writeFrame(this.currentValues()));
    on('zero',()=>this.writeFrame(emptyValues()));
    on('delete',()=>{
      const doc=JSON.parse(this.project.serialize()),frames=doc.profiles[this.key()]?.tracks[this.el.track.value];
      if(!frames)return;const t=this.phase();doc.profiles[this.key()].tracks[this.el.track.value]=frames.filter(f=>Math.abs(f.time-t)>.0002);this.change(doc);
    });
    on('undo',()=>{if(this.project.undo())this.changed();});on('redo',()=>{if(this.project.redo())this.changed();});
    on('save',()=>{this.project.save();this.message('Entwurf auf diesem Gerät gespeichert.');this.renderFrames();});
    on('apply',()=>{applyAnimation(this.project.document,this.project.storage);this.message('Posen sind im Spiel auf diesem Gerät aktiv.');});
    on('originalGame',()=>{applyAnimation(emptyAnimation(),this.project.storage);this.message('Das Spiel verwendet wieder die Originalposen. Der Entwurf bleibt erhalten.');});
    on('export',()=>this.download('sperrkreis-animationen.json',this.project.serialize()));
    on('replay',()=>this.download('sperrkreis-pruefablauf.json',JSON.stringify({format:'sperrkreis-animation-replay',version:1,options:this.replay.options,time:this.replay.time,animation:this.project.document},null,2)+'\n'));
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
          this.el.sex.value=o.sex;this.el.weapon.value=o.type;this.el.track.value=o.track;this.el.movement.value=o.movement;this.el.scenario.value=o.scenario;this.el.fps.value=String(o.fps);this.modSelection=o.mods||{};this.renderMods();await this.configure();this.seek(input.time);
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
    this.el.close.focus();await this.configure();if(this.project.error)this.message('Gespeicherter Entwurf konnte nicht geladen werden: '+this.project.error,true);
  }
  close(){this.playing=false;this.isOpen=false;this.root.classList.add('hidden');this.game.setPaused(true);this.opener?.focus();}
  async configure(){
    this.playing=false;this.pendingTime=undefined;this.pendingReset=false;this.notice='';this.noticeError=false;this.busy=true;this.el.retry.hidden=true;this.el.loading.hidden=false;this.el.loading.textContent='Modelle werden geladen …';this.refreshPlayback();this.renderValues();
    const options={sex:this.el.sex.value,type:this.el.weapon.value,track:this.el.track.value,movement:this.el.movement.value,scenario:this.el.scenario.value,fps:Number(this.el.fps.value),mods:{...this.modSelection}};
    this.replay.setDocument(this.el.original.checked?null:this.project.document,this.project.revision);
    try{if(!await this.replay.configure(options))return;this.playHead=0;this.busy=false;this.el.loading.hidden=true;this.renderValues();this.renderFrames();}
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
  key(){return profileKey(this.el.sex.value,this.el.weapon.value);}
  phase(){return this.replay.duration?Math.min(1,this.replay.time/this.replay.duration):0;}
  currentValues(){return sampleTrack(this.project.document,this.key(),this.el.track.value,this.phase());}
  writeFrame(values){if(this.busy||this.el.original.checked||this.el.scenario.value!=='single')return;this.playing=false;this.change(putFrame(this.project.document,this.key(),this.el.track.value,this.phase(),values));}
  change(document){this.project.replace(document);this.changed();}
  changed(){this.notice='';this.noticeError=false;this.invalidate();this.renderValues();this.renderFrames();this.refreshPlayback();}
  invalidate(){this.replay.setDocument(this.el.original.checked?null:this.project.document,this.project.revision);this.pendingReset=true;this.pendingTime=this.replay.time;}
  seek(time){this.playing=false;this.playHead=Math.max(0,Math.min(this.replay.duration,time));this.pendingTime=this.playHead;this.refreshPlayback();}
  refreshPlayback(){this.el.play.textContent=this.playing?'PAUSE':'ABSPIELEN';}
  renderValues(){
    const c=CHANNELS[this.channel],values=this.currentValues()[this.channel],disabled=this.busy||this.el.original.checked||this.el.scenario.value!=='single';this.el.values.replaceChildren();
    for(let i=0;i<c.size;i++){
      const translation=['weapon','support','elbowR','elbowL'].includes(this.channel)&&i<3,scale=translation?100:1,step=translation?.1:c.size===1?.05:1;
      const label=document.createElement('label');label.className='aw-axis';const title=document.createElement('span');title.textContent=c.size===1?'Fingerbeugung (rad)':`${translation?['X · seitlich','Y · Höhe','Z · vor / zurück'][i]:['X · neigen','Y · drehen','Z · kippen'][i%3]} (${translation?'cm':'°'})`;
      const input=document.createElement('input');input.type='number';input.inputMode='decimal';input.step=String(step);input.min=String(-c.limit[i]*scale);input.max=String(c.limit[i]*scale);input.value=String(Math.round(values[i]*scale*1000)/1000);input.disabled=disabled;
      const change=value=>{const number=Number(value);if(!Number.isFinite(number))return;const next=this.currentValues();next[this.channel][i]=Math.max(-c.limit[i],Math.min(c.limit[i],number/scale));this.writeFrame(next);};
      input.addEventListener('change',()=>change(input.value));
      const minus=document.createElement('button'),plus=document.createElement('button');minus.textContent='−';plus.textContent='+';minus.disabled=plus.disabled=disabled;minus.setAttribute('aria-label',title.textContent+' verringern');plus.setAttribute('aria-label',title.textContent+' erhöhen');minus.addEventListener('click',()=>change(Number(input.value)-step));plus.addEventListener('click',()=>change(Number(input.value)+step));
      label.append(title,minus,input,plus);this.el.values.append(label);
    }
    for(const name of ['key','zero','delete'])this.el[name].disabled=disabled||this.busy;
    this.el.trackHint.textContent=this.el.scenario.value!=='single'?'Dieser Ablauf prüft mehrere Haltungen. Zum Bearbeiten die passende Haltung oder Übergangsspur unter „Haltung / Aktion“ und „Einzelne Haltung / Aktion“ wählen.':this.el.track.value.startsWith('to')?'Diese Spur formt den Übergangsweg. An Anfang und Ende wird weich auf die Grundhaltungen übergeblendet.':'Schlüsselstellungen gelten für dieses Körpermodell und diese Waffe. Alle übrigen Profile bleiben erhalten.';
  }
  renderFrames(){
    const frames=this.project.document.profiles[this.key()]?.tracks[this.el.track.value]||[];this.el.frames.replaceChildren();
    for(const frame of frames){const button=document.createElement('button');button.textContent=display(frame.time*this.replay.duration)+' s';button.classList.toggle('selected',Math.abs(frame.time-this.phase())<.0002);button.addEventListener('click',()=>this.seek(frame.time*this.replay.duration));this.el.frames.append(button);}
    this.el.frameLabel.textContent=frames.some(f=>Math.abs(f.time-this.phase())<.0002)?'Gespeicherte Schlüsselstellung':'Zwischenstellung';
    this.el.undo.disabled=!this.project.undoStack.length;this.el.redo.disabled=!this.project.redoStack.length;
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
      if(this.pendingTime!==undefined){this.replay.seek(this.pendingTime,{reset:this.pendingReset});this.playHead=this.replay.time;this.pendingTime=undefined;this.pendingReset=false;refresh=true;}
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
    const entity=this.replay.entity,height=this.el.sex.value==='female'?1.68:1.80;
    const viewKey=JSON.stringify([entity.root.uuid,this.replay.time,this.yaw,this.pitch,this.zoom,this.el.focus.value,this.channel,this.el.skeleton.checked,this.project.revision,this.el.original.checked,this.el.diagnostics.parentElement.open,this.notice,this.noticeError,globalThis.innerWidth,globalThis.innerHeight,globalThis.devicePixelRatio,this.models.pass.status]);
    if(viewKey===this.viewKey)return;this.viewKey=viewKey;
    const focus=this.el.focus.value,center=focus==='body'?new Vector3(0,height*.53,0):entity.model.getObjectByName(focus==='head'?'Head':focus==='hands'?'WristR':'Chest').getWorldPosition(new Vector3());
    const project=this.models.pass.drawInspection(this.el.canvas,entity.root,{height:height*1.22/this.zoom,center,azimuth:this.yaw,elevation:this.pitch});
    if(!project)return;
    this.drawOverlay(project);
    const d=this.replay.diagnostics;
    this.el.status.textContent=[this.notice,...d.warnings].filter(Boolean).join(' · ')||'Gelenke und Ziele innerhalb der geprüften Grenzen.';this.el.status.classList.toggle('aw-error',this.noticeError||d.warnings.length>0);
    if(this.el.diagnostics.parentElement.open){
      this.el.diagnostics.replaceChildren();
      for(const side of ['R','L']){const s=d.sides[side],p=document.createElement('p');p.textContent=`${side==='R'?'Rechts':'Links'}: Handgelenk ${display(s.bend)}° · Unterarmdrehung ${display(s.foreTwist)}° · Handdrehung ${display(s.wristTwist)}° · Handtempo ${display(s.speed)} m/s`;this.el.diagnostics.append(p);}
      const p=document.createElement('p');p.textContent=`Steuerung: Beine ${d.owners.legs}, rechts ${d.owners.right}, links ${d.owners.left}.`;this.el.diagnostics.append(p);
      for(const [name,gap]of Object.entries(d.gaps)){const p=document.createElement('p');p.textContent=`${name==='weapon'?'Waffenziel':'Stützhandziel'}: ${display(gap*1000)} mm Abweichung`;this.el.diagnostics.append(p);}
    }
  }
  drawOverlay(project){
    const canvas=this.el.overlay,rect=this.el.canvas.getBoundingClientRect(),ratio=Math.min(2,globalThis.devicePixelRatio||1);canvas.width=Math.round(rect.width*ratio);canvas.height=Math.round(rect.height*ratio);const ctx=canvas.getContext('2d');ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,rect.width,rect.height);if(!this.el.skeleton.checked)return;
    const point=name=>project(this.replay.entity.model.getObjectByName(name).getWorldPosition(new Vector3()));
    ctx.lineWidth=2;ctx.strokeStyle='#8ce1ba';
    for(const chain of [['Head','Chest'],['Chest','ShoulderR','UpperArmR','LowerArmR','WristR','Middle2R'],['Chest','ShoulderL','UpperArmL','LowerArmL','WristL','Middle2L']]){
      ctx.beginPath();chain.forEach((name,i)=>{const p=point(name);i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y);});ctx.stroke();
      for(const name of chain){const p=point(name);ctx.beginPath();ctx.arc(p.x,p.y,3,0,Math.PI*2);ctx.fillStyle='#aaf2d2';ctx.fill();}
    }
    for(const [name,target]of Object.entries(this.replay.entity.animationTargets||{})){
      const p=project(target);ctx.strokeStyle=name===this.channel?'#ffe29c':'#de9d6c';ctx.beginPath();ctx.moveTo(p.x-5,p.y);ctx.lineTo(p.x+5,p.y);ctx.moveTo(p.x,p.y-5);ctx.lineTo(p.x,p.y+5);ctx.stroke();
    }
  }
}

function createDefaultMods(type){
  return{...ITEMS[type]?.defaultMods};
}
