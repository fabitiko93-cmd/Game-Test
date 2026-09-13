import { ITEMS } from "./config.js";
import { clamp, distance, formatClock, uid, vibrate } from "./util.js";

const SAVE_KEY = "sperrkreis98-save-v1";

export class Game {
  constructor(world, renderer, input, ui) {
    this.world = world;
    this.renderer = renderer;
    this.input = input;
    this.ui = ui;
    this.player = this.createPlayer();
    this.zombies = this.createZombies();
    this.minutes = 6 * 60 + 42;
    this.mission = 0;
    this.running = false;
    this.paused = false;
    this.dead = false;
    this.started = false;
    this.lastFrame = performance.now();
    this.uiTick = 0;
    this.autosaveTick = 0;
    this.stepTimer = 0;
    this.audio = null;
    this.bind();
    this.ui.setHasSave(this.hasSave());
  }

  createPlayer() {
    return {
      x: 8.1, y: 27.2, facingX: 0, facingY: -1,
      hp: 100, stamina: 100, hunger: 82, thirst: 78,
      moving: false, running: false, hurtFlash: 0, attackTimer: 0,
      attackCooldown: 0, pendingAttack: 0, selectedZombieId: null,
      inventory: [], equipped: null, capacity: 12,
    };
  }

  createZombies() {
    const positions = [
      [17.2, 8.4], [18.4, 25.2], [25.3, 17.3], [9.4, 17.9],
      [29.2, 27.4], [8.2, 8.2], [27.8, 8.7], [31.5, 18.1], [13.0, 29.0]
    ];
    return positions.map(([x,y], index) => ({
      id: `zombie-${index}`, x, y, spawnX:x, spawnY:y,
      hp: 52 + (index % 3) * 7, maxHp: 52 + (index % 3) * 7,
      state: "idle", stateTime: Math.random()*2, alertTime: 0,
      facingX: 0, facingY: 1, moving: false, attackCooldown: 0,
      hurtFlash: 0, phase: Math.random()*6, variant: index % 4,
      target: null, wanderTarget: null, removed: false,
    }));
  }

  bind() {
    this.input.callbacks = {
      attack: () => this.attack(), action: () => this.interact(),
      inventory: () => this.toggleInventory(), pause: () => this.togglePause(),
      tap: (x,y) => this.tapWorld(x,y),
    };
    this.ui.callbacks = {
      start: () => this.start(this.hasSave()),
      fresh: () => this.freshStart(),
      continue: () => this.setPaused(false),
      save: () => { this.save(); this.ui.showToast("SPIELSTAND GESICHERT"); },
      reset: () => this.reset(),
      useItem: id => this.useItem(id), dropItem: id => this.dropItem(id),
      unequip: () => this.unequip(),
      takeItem: (container,id) => this.takeItem(container,id),
      takeAll: container => this.takeAll(container),
      panelClosed: () => {},
    };
    window.addEventListener("visibilitychange", () => {
      if (document.hidden && this.started && !this.dead) { this.save(); this.setPaused(true); }
    });
    window.addEventListener("pagehide", () => { if (this.started && !this.dead) this.save(); });
  }

  hasSave() {
    try { return Boolean(localStorage.getItem(SAVE_KEY)); } catch (_) { return false; }
  }

  start(load = false) {
    if (this.started) return;
    this.started = true;
    if (load) this.load();
    this.initAudio();
    this.renderer.follow(this.player, true);
    this.ui.enterGame();
    this.input.enabled = true;
    this.running = true;
    this.lastFrame = performance.now();
    this.ui.renderInventory(this.player);
    this.ui.update(this.player, this);
    this.ui.showMessage(load ? "Du erinnerst dich, wo du warst." : "Etwas schlägt draußen gegen Metall.", 3.2);
    requestAnimationFrame(time => this.loop(time));
  }

  freshStart() {
    try { localStorage.removeItem(SAVE_KEY); } catch (_) {}
    this.start(false);
  }

  loop(now) {
    if (!this.running) return;
    const delta = Math.min(.05, Math.max(0, (now - this.lastFrame) / 1000));
    this.lastFrame = now;
    if (!this.paused && !this.dead) this.update(delta);
    this.renderer.render(this, delta);
    this.uiTick -= delta;
    if (this.uiTick <= 0) { this.ui.update(this.player, this); this.uiTick = .1; }
    requestAnimationFrame(time => this.loop(time));
  }

  update(delta) {
    this.minutes += delta * 2.15;
    this.world.update(delta);
    this.updatePlayer(delta);
    this.updateZombies(delta);
    this.updateMission();
    this.autosaveTick += delta;
    if (this.autosaveTick >= 12) { this.save(); this.autosaveTick = 0; }
  }

  updatePlayer(delta) {
    const p = this.player;
    p.hurtFlash = Math.max(0, p.hurtFlash - delta);
    p.attackTimer = Math.max(0, p.attackTimer - delta);
    p.attackCooldown = Math.max(0, p.attackCooldown - delta);
    if (p.pendingAttack > 0) {
      p.pendingAttack -= delta;
      if (p.pendingAttack <= 0) this.resolveAttack();
    }

    const input = this.input.movement();
    const wx = input.y + input.x;
    const wy = input.y - input.x;
    const length = Math.hypot(wx, wy);
    let dx = length ? wx / length : 0;
    let dy = length ? wy / length : 0;
    const canRun = p.stamina > 4 && input.run && input.magnitude > .25;
    const speed = canRun ? 3.45 : 1.95;
    p.moving = input.magnitude > .08;
    p.running = p.moving && canRun;
    if (p.moving) {
      p.facingX = dx; p.facingY = dy;
      const multiplier = input.magnitude < .32 ? .68 : 1;
      this.moveEntity(p, dx * speed * multiplier * delta, dy * speed * multiplier * delta, .27);
      if (p.running) p.stamina = Math.max(0, p.stamina - 17 * delta);
      else p.stamina = Math.min(100, p.stamina + 7.5 * delta * (p.hunger < 20 ? .45 : 1));
      this.stepTimer -= delta;
      if (this.stepTimer <= 0) {
        this.world.emitNoise(p.x,p.y,p.running?4.8:1.45,"step");
        this.stepTimer = p.running ? .28 : .48;
      }
    } else {
      p.stamina = Math.min(100, p.stamina + 12 * delta * (p.hunger < 20 ? .45 : 1));
      this.stepTimer = 0;
    }

    p.hunger = Math.max(0, p.hunger - delta * .033);
    p.thirst = Math.max(0, p.thirst - delta * .052);
    if (p.hunger <= 0 || p.thirst <= 0) this.damagePlayer(delta * 1.6, false);
  }

  moveEntity(entity, dx, dy, radius) {
    const nx = entity.x + dx;
    const ny = entity.y + dy;
    let moved = false;
    if (this.world.isWalkable(nx, entity.y, radius, entity.id)) { entity.x = nx; moved = true; }
    if (this.world.isWalkable(entity.x, ny, radius, entity.id)) { entity.y = ny; moved = true; }
    return moved;
  }

  updateZombies(delta) {
    for (const z of this.zombies) {
      if (z.removed) continue;
      z.hurtFlash = Math.max(0,z.hurtFlash-delta);
      z.attackCooldown = Math.max(0,z.attackCooldown-delta);
      z.stateTime += delta;
      const d = distance(z,this.player);
      const sees = d < (this.player.running ? 9.5 : 7.2) && this.world.hasLineOfSight(z,this.player);
      let heard = null;
      for (let i=this.world.noises.length-1;i>=0;i--) {
        const n=this.world.noises[i];
        if (distance(z,n)<=n.radius) { heard=n; break; }
      }
      if (sees) {
        if (z.state !== "chase") this.sound("alert");
        z.state="chase"; z.alertTime=4.5; z.target={x:this.player.x,y:this.player.y};
      } else if (heard) {
        z.state="investigate"; z.alertTime=3; z.target={x:heard.x,y:heard.y};
      } else if (z.alertTime>0) {
        z.alertTime-=delta;
        if(z.state==="chase")z.target={x:this.player.x,y:this.player.y};
      } else if (z.state === "chase" || z.state === "investigate") {
        z.state="idle"; z.target=null; z.stateTime=0;
      }

      if (d < .82 && sees) {
        z.moving=false;
        if(z.attackCooldown<=0){z.attackCooldown=1.15;window.setTimeout(()=>{if(!z.removed&&!this.dead&&distance(z,this.player)<1.05)this.damagePlayer(7+Math.random()*6,true);},220);}
        continue;
      }

      let target=z.target;
      if(!target && z.stateTime>2.3+z.variant*.4){
        z.stateTime=0;
        z.wanderTarget={x:clamp(z.spawnX+(Math.random()-.5)*5,1,34),y:clamp(z.spawnY+(Math.random()-.5)*5,1,34)};
      }
      if(!target)target=z.wanderTarget;
      if(target){
        const tx=target.x-z.x,ty=target.y-z.y,len=Math.hypot(tx,ty);
        if(len<.22){z.wanderTarget=null;z.moving=false;continue;}
        const dx=tx/len,dy=ty/len;z.facingX=dx;z.facingY=dy;
        const speed=z.state==="chase"?1.28:z.state==="investigate"?.92:.38;
        let moved=this.moveEntity(z,dx*speed*delta,dy*speed*delta,.25);
        if(!moved){
          moved=this.moveEntity(z,-dy*speed*delta,dx*speed*delta,.25);
          if(!moved)this.moveEntity(z,dy*speed*delta,-dx*speed*delta,.25);
        }
        z.moving=moved;
      } else z.moving=false;
    }
  }

  attack() {
    if (!this.canAct() || this.player.attackCooldown > 0) return;
    const p=this.player,weapon=p.equipped?ITEMS[p.equipped.type]:null;
    const range=weapon?.range||.88;
    let target=this.zombies.find(z=>z.id===p.selectedZombieId&&!z.removed);
    if(!target||distance(p,target)>range+.55)target=this.nearestZombie(range+.42);
    if(target){const dx=target.x-p.x,dy=target.y-p.y,len=Math.hypot(dx,dy)||1;p.facingX=dx/len;p.facingY=dy/len;p.selectedZombieId=target.id;this.renderer.selectedId=target.id;}
    p.attackCooldown=weapon?.cooldown||.7;p.attackTimer=.28;p.pendingAttack=.12;
    this.world.emitNoise(p.x,p.y,weapon?.noise||2.8,"attack");
    this.sound("swing");vibrate(10);
  }

  resolveAttack() {
    const p=this.player,weapon=p.equipped?ITEMS[p.equipped.type]:null,range=weapon?.range||.88;
    let target=this.zombies.find(z=>z.id===p.selectedZombieId&&!z.removed);
    if(!target||distance(p,target)>range+.28)target=this.nearestZombie(range+.18,true);
    if(!target)return;
    const dx=target.x-p.x,dy=target.y-p.y,len=Math.hypot(dx,dy)||1;
    const facing=(dx/len)*p.facingX+(dy/len)*p.facingY;
    if(facing<-.15)return;
    const damage=(weapon?.damage||11)*(.87+Math.random()*.26);
    target.hp-=damage;target.hurtFlash=.15;target.state="chase";target.alertTime=6;
    target.x+=dx/len*.13;target.y+=dy/len*.13;
    this.renderer.burst(target.x,target.y,"#832d29",8);this.renderer.shake=4;
    this.world.blood.push({x:target.x+(Math.random()-.5)*.2,y:target.y+(Math.random()-.5)*.2,size:.4+Math.random()*.45,rotation:Math.random()*Math.PI,life:1});
    this.sound("hit");vibrate([12,18,12]);
    if(target.hp<=0)this.killZombie(target);
  }

  nearestZombie(range=Infinity, inFront=false) {
    let result=null,best=range;
    for(const z of this.zombies){
      if(z.removed)continue;const d=distance(this.player,z);if(d>=best)continue;
      if(inFront){const dx=(z.x-this.player.x)/d,dy=(z.y-this.player.y)/d;if(dx*this.player.facingX+dy*this.player.facingY<-.2)continue;}
      best=d;result=z;
    }
    return result;
  }

  killZombie(z) {
    z.removed=true;
    if(this.player.selectedZombieId===z.id){this.player.selectedZombieId=null;this.renderer.selectedId=null;}
    const corpse=this.world.addObject("corpse",z.x,z.y,{interactable:true,solid:false,container:"corpse",name:"INFIZIERTER"});
    corpse.items=this.world.rollLoot("corpse");
    if(Math.random()<.35)corpse.items.push({id:uid("item"),type:"cloth",count:1});
    this.world.emitNoise(z.x,z.y,2.2,"body");this.ui.showMessage("Der Infizierte bleibt liegen.");
  }

  damagePlayer(amount, feedback=true) {
    if(this.dead)return;
    this.player.hp=Math.max(0,this.player.hp-amount);this.player.hurtFlash=.24;
    if(feedback){this.renderer.shake=7;this.renderer.burst(this.player.x,this.player.y,"#8d302b",5);this.sound("hurt");vibrate([25,20,25]);}
    if(this.player.hp<=0)this.die();
  }

  contextObject() {
    let best=null,bestDistance=1.28;
    for(const o of this.world.objects){
      if(o.removed||!o.interactable)continue;const d=distance(this.player,o);
      if(d<bestDistance){best=o;bestDistance=d;}
    }
    if(!best)return null;
    if(best.type==="door")return{...best,actionLabel:best.closed?"ÖFFNEN":"SCHLIESSEN"};
    if(best.type==="radio")return{...best,actionLabel:"EINSCHALTEN"};
    return{...best,actionLabel:"DURCHSUCHEN"};
  }

  interact(object=null) {
    if(!this.canAct())return;
    const target=object||this.contextObject();
    if(!target){this.ui.showMessage("Hier ist nichts in Reichweite.",1.2);return;}
    if(distance(this.player,target)>1.4){this.renderer.selectedId=target.id;this.ui.showMessage("Zu weit entfernt.",1.2);return;}
    if(target.type==="door"){
      target.closed=!target.closed;target.solid=target.closed;
      this.world.emitNoise(target.x,target.y,target.closed?3.2:2.2,"door");
      this.sound("door");this.ui.showMessage(target.closed?"Tür geschlossen":"Tür geöffnet",1.2);
    }else if(target.items){
      this.ui.openContainerPanel(target);this.renderer.selectedId=target.id;
      if(target.tutorial&&this.mission===0){this.mission=1;this.ui.showMessage("Die Apotheke am südlichen Platz hat Medikamente.",3.4);this.sound("objective");}
    }else if(target.type==="radio"){
      target.used=true;this.world.emitNoise(target.x,target.y,7.5,"radio");
      this.ui.showMessage("…Sperrbezirk nicht verlassen… Kontakt vermeiden…",4.5);this.sound("radio");
    }
  }

  tapWorld(x,y) {
    if(!this.canAct())return;
    const hit=this.renderer.pick(x,y);
    if(!hit){this.renderer.selectedId=null;this.player.selectedZombieId=null;return;}
    this.renderer.selectedId=hit.id;
    if(hit.kind==="zombie"){
      this.player.selectedZombieId=hit.id;
      if(distance(this.player,hit.ref)<1.75)this.attack();
      else this.ui.showMessage("Infizierter",1);
    }else{
      this.player.selectedZombieId=null;
      if(distance(this.player,hit.ref)<1.4)this.interact(hit.ref);
      else this.ui.showMessage(hit.ref.name||"Nicht in Reichweite",1.2);
    }
  }

  takeItem(container,itemId) {
    const item=container.items.find(i=>i.id===itemId);if(!item)return;
    if(!this.addInventory(item.type,item.count)){this.ui.showToast("RUCKSACK IST VOLL");return;}
    container.items=container.items.filter(i=>i.id!==itemId);
    if(item.type==="antibiotics"&&this.mission<2){this.mission=2;this.ui.showMessage("Medikament gefunden. Zurück zum Unterschlupf.",3.5);this.sound("objective");}
    this.ui.renderContainer(container);this.ui.renderInventory(this.player);this.ui.showToast(`${ITEMS[item.type].name.toUpperCase()} EINGEPACKT`);this.sound("pickup");
  }

  takeAll(container) {
    for(const item of [...container.items])this.takeItem(container,item.id);
  }

  addInventory(type,count=1) {
    const def=ITEMS[type];
    const existingRoom=this.player.inventory.filter(item=>item.type===type).reduce((sum,item)=>sum+Math.max(0,def.stack-item.count),0);
    const emptyRoom=(this.player.capacity-this.player.inventory.length)*def.stack;
    if(existingRoom+emptyRoom<count)return false;
    let remaining=count;
    for(const item of this.player.inventory){if(item.type===type&&item.count<def.stack){const add=Math.min(remaining,def.stack-item.count);item.count+=add;remaining-=add;if(!remaining)return true;}}
    const needed=Math.ceil(remaining/def.stack);
    if(this.player.inventory.length+needed>this.player.capacity)return false;
    while(remaining>0){const add=Math.min(remaining,def.stack);this.player.inventory.push({id:uid("inv"),type,count:add});remaining-=add;}
    return true;
  }

  useItem(id) {
    if(!this.canAct(true))return;
    const item=this.player.inventory.find(i=>i.id===id);if(!item)return;
    const def=ITEMS[item.type];
    if(def.type==="weapon"){
      this.player.equipped=item;this.ui.showToast(`${def.name.toUpperCase()} AUSGERÜSTET`);this.sound("equip");
    }else if(def.quest){this.ui.showToast("DAS MUSS ZURÜCK ZUM UNTERSCHLUPF");return;
    }else if(def.needsOpener&&!this.player.inventory.some(i=>i.type==="can_opener")){this.ui.showToast("DU BRAUCHST EINEN DOSENÖFFNER");return;
    }else if(def.effect){
      for(const [stat,value] of Object.entries(def.effect))this.player[stat]=clamp(this.player[stat]+value,0,100);
      item.count--;if(item.count<=0){this.player.inventory=this.player.inventory.filter(i=>i.id!==id);if(this.player.equipped?.id===id)this.player.equipped=null;}
      this.ui.showToast(`${def.name.toUpperCase()} BENUTZT`);this.sound("consume");
    }else{this.ui.showToast("DAS KANNST DU JETZT NICHT BENUTZEN");return;}
    this.ui.selectedItemId=null;this.ui.renderInventory(this.player);
  }

  dropItem(id) {
    const item=this.player.inventory.find(i=>i.id===id);if(!item)return;
    const bag=this.world.addObject("groundloot",this.player.x+.28,this.player.y+.2,{interactable:true,solid:false,name:"ABGELEGTE SACHEN"});
    bag.items=[{...item,id:uid("item")}];
    this.player.inventory=this.player.inventory.filter(i=>i.id!==id);if(this.player.equipped?.id===id)this.player.equipped=null;
    this.ui.selectedItemId=null;this.ui.renderInventory(this.player);this.ui.showToast("GEGENSTAND ABGELEGT");
  }

  unequip() {this.player.equipped=null;this.ui.renderInventory(this.player);this.ui.showToast("HÄNDE FREI");}

  updateMission() {
    if(this.mission===2&&this.world.insideBuilding(this.player,"safehouse")){
      this.mission=3;this.ui.showMessage("MEDIKAMENT GESICHERT · DU HAST ES ZURÜCKGESCHAFFT",5);this.sound("success");vibrate([30,50,30]);this.save();
    }
  }

  objectiveText() {
    return ["Durchsuche den Küchenschrank","Finde das Antibiotikum in der Apotheke","Kehre mit dem Medikament zurück","Überlebe · der Sperrkreis bleibt offen"][this.mission]||"Überlebe";
  }

  locationName() {
    const building=this.world.insideBuilding(this.player);if(building)return building.name;
    const {x,y}=this.player;if(x>=14&&x<=20||y>=14&&y<=20)return "KREUZUNG · AM WALDRAND";
    if(x>20&&y>20)return "APOTHEKENPLATZ";if(x>20&&y<15)return "NAHKAUF-PARKPLATZ";if(x<14&&y<15)return "ALTE REIHENHÄUSER";return "WALDRAND-SIEDLUNG";
  }

  clockText(){return formatClock(this.minutes);}

  toggleInventory() {
    if(!this.started||this.dead)return;
    this.ui.toggleInventory(this.player);
  }

  togglePause(){if(!this.started||this.dead)return;this.setPaused(!this.paused);}
  setPaused(value){this.paused=value;this.input.enabled=!value;this.ui.setPaused(value);if(!value)this.lastFrame=performance.now();}
  canAct(allowMenu=false){return this.started&&!this.paused&&!this.dead&&(allowMenu||this.ui.el.inventory_panel.classList.contains("hidden"))&&this.ui.el.container_panel.classList.contains("hidden");}

  die(){this.dead=true;this.input.enabled=false;try{localStorage.removeItem(SAVE_KEY);}catch(_){}this.ui.showDeath((this.minutes-(6*60+42))/60);this.sound("death");}

  save() {
    if(!this.started||this.dead)return;
    try{
      const payload={version:1,minutes:this.minutes,mission:this.mission,player:{...this.player,equipped:this.player.equipped?.id||null},zombies:this.zombies,world:this.world.serialize()};
      localStorage.setItem(SAVE_KEY,JSON.stringify(payload));
    }catch(_){this.ui.showToast("SPIELSTAND KONNTE NICHT GESICHERT WERDEN");}
  }

  load() {
    try{
      const saved=JSON.parse(localStorage.getItem(SAVE_KEY));if(!saved||saved.version!==1)return;
      this.minutes=saved.minutes??this.minutes;this.mission=saved.mission??0;
      const equippedId=saved.player?.equipped;Object.assign(this.player,saved.player||{});
      this.player.equipped=this.player.inventory.find(i=>i.id===equippedId)||null;
      if(Array.isArray(saved.zombies))this.zombies=saved.zombies;
      this.world.restore(saved.world);
    }catch(_){try{localStorage.removeItem(SAVE_KEY);}catch(__){}}
  }

  reset(){try{localStorage.removeItem(SAVE_KEY);}catch(_){}location.reload();}

  initAudio(){try{this.audio=new(window.AudioContext||window.webkitAudioContext)();this.audio.resume?.();}catch(_){}}
  sound(kind){
    if(!this.audio)return;const presets={pickup:[660,.06,"sine"],equip:[240,.05,"square"],consume:[420,.08,"sine"],door:[105,.12,"triangle"],swing:[180,.05,"sawtooth"],hit:[72,.1,"square"],hurt:[55,.16,"sawtooth"],alert:[145,.13,"triangle"],objective:[520,.16,"sine"],success:[720,.25,"sine"],radio:[90,.3,"sawtooth"],death:[46,.6,"sawtooth"]};
    const p=presets[kind];if(!p)return;try{const o=this.audio.createOscillator(),g=this.audio.createGain();o.type=p[2];o.frequency.setValueAtTime(p[0],this.audio.currentTime);o.frequency.exponentialRampToValueAtTime(Math.max(35,p[0]*.65),this.audio.currentTime+p[1]);g.gain.setValueAtTime(.035,this.audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,this.audio.currentTime+p[1]);o.connect(g).connect(this.audio.destination);o.start();o.stop(this.audio.currentTime+p[1]);}catch(_){}
  }
}
