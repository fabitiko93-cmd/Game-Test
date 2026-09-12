(()=>{'use strict';
const canvas=document.getElementById('renderCanvas');
const $=id=>document.getElementById(id);
const ui={hp:$('hp'),hpBar:$('hpBar'),ammo:$('ammo'),reserve:$('reserve'),objective:$('objective'),status:$('status'),fps:$('fps'),hit:$('hitmarker'),damage:$('damageVignette'),start:$('startOverlay'),end:$('endOverlay'),endTitle:$('endTitle'),endText:$('endText'),startBtn:$('startBtn'),restartBtn:$('restartBtn'),fire:$('fireBtn'),ads:$('adsBtn'),reload:$('reloadBtn'),use:$('interactBtn'),leftZone:$('leftZone'),leftKnob:$('leftKnob'),rightZone:$('rightZone')};

let engine,scene,camera,weaponRoot,muzzleLight,muzzleMesh,extractPad,extractLight;
let running=false,hp=100,ammo=30,reserve=120,cores=0,kills=0,alertCount=0;
let moveX=0,moveY=0,lookDX=0,lookDY=0,firing=false,ads=false,reloading=false,fireCd=0,recoil=0,shake=0,last=0;
let enemies=[],coreObjects=[],solidMeshes=[],effects=[];
const cfg={speed:5.4,sprint:7.0,look:.0028,fireRate:.092,damage:34,enemyDamage:9,mag:30,reload:1.25};

function mat(name,color,emissive=null){const m=new BABYLON.StandardMaterial(name,scene);m.diffuseColor=BABYLON.Color3.FromHexString(color);m.specularColor=new BABYLON.Color3(.12,.14,.16);if(emissive)m.emissiveColor=BABYLON.Color3.FromHexString(emissive);return m}
function addBox(name,pos,scale,material,solid=true){const b=BABYLON.MeshBuilder.CreateBox(name,{width:scale.x,height:scale.y,depth:scale.z},scene);b.position.copyFrom(pos);b.material=material;b.checkCollisions=solid;b.isPickable=true;b.metadata={solid};if(solid)solidMeshes.push(b);return b}
function addStrip(pos,scale,color){const m=mat('strip','#111820',color);const b=addBox('lightStrip',pos,scale,m,false);b.isPickable=false;return b}

function buildWorld(){
 scene=new BABYLON.Scene(engine);scene.clearColor=new BABYLON.Color4(.015,.02,.027,1);scene.fogMode=BABYLON.Scene.FOGMODE_EXP2;scene.fogDensity=.017;scene.fogColor=new BABYLON.Color3(.025,.035,.045);scene.collisionsEnabled=true;
 const hemi=new BABYLON.HemisphericLight('ambient',new BABYLON.Vector3(0,1,0),scene);hemi.intensity=.42;hemi.diffuse=new BABYLON.Color3(.42,.55,.64);hemi.groundColor=new BABYLON.Color3(.06,.07,.08);
 const moon=new BABYLON.DirectionalLight('moon',new BABYLON.Vector3(-.35,-1,.28),scene);moon.position=new BABYLON.Vector3(0,30,-10);moon.intensity=.28;moon.diffuse=new BABYLON.Color3(.45,.68,.9);
 camera=new BABYLON.UniversalCamera('cam',new BABYLON.Vector3(0,1.72,-31),scene);camera.minZ=.05;camera.fov=1.05;camera.inertia=0;camera.angularSensibility=999999;camera.ellipsoid=new BABYLON.Vector3(.38,.85,.38);camera.checkCollisions=true;camera.rotation.y=0;
 scene.activeCamera=camera;
 const floorMat=mat('floor','#151c22'),wallMat=mat('wall','#232c34'),darkMat=mat('dark','#10161b'),metalMat=mat('metal','#313b43'),redMat=mat('red','#301417','#6a111a');
 const ground=BABYLON.MeshBuilder.CreateGround('ground',{width:78,height:78},scene);ground.material=floorMat;ground.checkCollisions=true;ground.isPickable=true;ground.metadata={solid:true};solidMeshes.push(ground);
 // perimeter
 addBox('north',new BABYLON.Vector3(0,2.5,38),new BABYLON.Vector3(78,5,1),wallMat);
 addBox('south',new BABYLON.Vector3(0,2.5,-38),new BABYLON.Vector3(78,5,1),wallMat);
 addBox('west',new BABYLON.Vector3(-38,2.5,0),new BABYLON.Vector3(1,5,78),wallMat);
 addBox('east',new BABYLON.Vector3(38,2.5,0),new BABYLON.Vector3(1,5,78),wallMat);
 // central compound layout, leaving deliberate corridors
 const walls=[
  [-18,2.1,-22,18,4.2,1],[-4,2.1,-16,1,4.2,13],[12,2.1,-24,1,4.2,15],[24,2.1,-18,18,4.2,1],
  [-24,2.1,-4,18,4.2,1],[-15,2.1,4,1,4.2,16],[0,2.1,-2,1,4.2,19],[15,2.1,4,1,4.2,16],[26,2.1,0,16,4.2,1],
  [-27,2.1,15,14,4.2,1],[-20,2.1,25,1,4.2,20],[-4,2.1,18,1,4.2,15],[7,2.1,25,22,4.2,1],[19,2.1,16,1,4.2,18],[29,2.1,23,16,4.2,1]
 ];
 walls.forEach((w,i)=>addBox('wall'+i,new BABYLON.Vector3(w[0],w[1],w[2]),new BABYLON.Vector3(w[3],w[4],w[5]),i%3===0?metalMat:wallMat));
 // cover / crates
 [[-27,-18],[20,-28],[8,-11],[-8,8],[25,10],[-29,29],[7,31],[31,-7]].forEach((p,i)=>{const h=i%3===0?2.4:1.5;addBox('crate'+i,new BABYLON.Vector3(p[0],h/2,p[1]),new BABYLON.Vector3(2.4,h,2.4),darkMat)});
 // architectural light strips
 for(let z=-32;z<=32;z+=8){addStrip(new BABYLON.Vector3(-37.35,2.6,z),new BABYLON.Vector3(.08,.12,2.4),'#4bbdf4');addStrip(new BABYLON.Vector3(37.35,2.6,z),new BABYLON.Vector3(.08,.12,2.4),'#4bbdf4')}
 [[-10,-30,'#56d4ff'],[9,-18,'#ff384f'],[-29,-2,'#56d4ff'],[7,4,'#ff384f'],[-11,21,'#56d4ff'],[27,30,'#56d4ff']].forEach((l,i)=>{const light=new BABYLON.PointLight('lamp'+i,new BABYLON.Vector3(l[0],3.3,l[1]),scene);light.diffuse=BABYLON.Color3.FromHexString(l[2]);light.intensity=i%2?1.3:1.0;light.range=12;addStrip(new BABYLON.Vector3(l[0],3.65,l[1]),new BABYLON.Vector3(2,.08,.12),l[2])});
 // entry gate atmosphere
 for(let i=0;i<5;i++){const p=new BABYLON.PointLight('entry'+i,new BABYLON.Vector3(-8+i*4,3.5,-34),scene);p.diffuse=new BABYLON.Color3(.2,.65,1);p.intensity=.5;p.range=8}
 buildWeapon();buildCores();buildExtraction();spawnEnemies();
 return scene;
}

function buildWeapon(){
 weaponRoot=new BABYLON.TransformNode('weaponRoot',scene);weaponRoot.parent=camera;weaponRoot.position=new BABYLON.Vector3(.42,-.34,1.05);weaponRoot.rotation=new BABYLON.Vector3(.02,0,0);
 const gunMat=mat('gun','#171d22'),edgeMat=mat('edge','#303b43'),screenMat=mat('screen','#102831','#56d9ff');
 const body=BABYLON.MeshBuilder.CreateBox('gunBody',{width:.22,height:.18,depth:.78},scene);body.parent=weaponRoot;body.position.z=.1;body.material=gunMat;body.isPickable=false;
 const top=BABYLON.MeshBuilder.CreateBox('gunTop',{width:.13,height:.08,depth:.44},scene);top.parent=weaponRoot;top.position=new BABYLON.Vector3(0,.13,.05);top.material=edgeMat;top.isPickable=false;
 const sight=BABYLON.MeshBuilder.CreateBox('optic',{width:.13,height:.11,depth:.14},scene);sight.parent=weaponRoot;sight.position=new BABYLON.Vector3(0,.22,.04);sight.material=screenMat;sight.isPickable=false;
 const barrel=BABYLON.MeshBuilder.CreateCylinder('barrel',{height:.28,diameter:.07},scene);barrel.parent=weaponRoot;barrel.rotation.x=Math.PI/2;barrel.position=new BABYLON.Vector3(0,.01,.55);barrel.material=edgeMat;barrel.isPickable=false;
 muzzleMesh=BABYLON.MeshBuilder.CreateSphere('muzzle',{diameter:.11,segments:6},scene);muzzleMesh.parent=weaponRoot;muzzleMesh.position=new BABYLON.Vector3(0,.01,.72);muzzleMesh.material=mat('flash','#ffcc55','#ff851c');muzzleMesh.visibility=0;muzzleMesh.isPickable=false;
 muzzleLight=new BABYLON.PointLight('muzzleLight',BABYLON.Vector3.Zero(),scene);muzzleLight.parent=muzzleMesh;muzzleLight.diffuse=new BABYLON.Color3(1,.45,.12);muzzleLight.intensity=0;muzzleLight.range=5;
}

function buildCores(){
 const coreMat=mat('core','#14313c','#23c9ff'),baseMat=mat('coreBase','#222d34');
 [[-29,-12],[8,12],[30,30]].forEach((p,i)=>{
   const root=new BABYLON.TransformNode('coreRoot'+i,scene);root.position=new BABYLON.Vector3(p[0],0,p[1]);
   const base=BABYLON.MeshBuilder.CreateCylinder('pedestal',{height:.8,diameter:1.1,tessellation:8},scene);base.parent=root;base.position.y=.4;base.material=baseMat;base.isPickable=false;
   const orb=BABYLON.MeshBuilder.CreatePolyhedron('core',{type:2,size:.5},scene);orb.parent=root;orb.position.y=1.25;orb.material=coreMat;orb.metadata={core:i};orb.isPickable=true;
   const l=new BABYLON.PointLight('coreLight',new BABYLON.Vector3(p[0],1.4,p[1]),scene);l.diffuse=new BABYLON.Color3(.1,.75,1);l.intensity=.9;l.range=7;
   coreObjects.push({root,orb,light:l,taken:false,baseY:1.25});
 });
}
function buildExtraction(){
 extractPad=BABYLON.MeshBuilder.CreateCylinder('extract',{height:.08,diameter:6,tessellation:32},scene);extractPad.position=new BABYLON.Vector3(30,.05,-31);const m=mat('extractMat','#11251b','#28c969');m.alpha=.55;extractPad.material=m;extractPad.isPickable=false;
 extractLight=new BABYLON.PointLight('extractLight',new BABYLON.Vector3(30,2,-31),scene);extractLight.diffuse=new BABYLON.Color3(.1,1,.45);extractLight.intensity=.05;extractLight.range=10;
}

function spawnEnemies(){
 const positions=[[-11,-27],[18,-27],[-30,-6],[-8,-6],[8,-5],[28,6],[-26,19],[-9,28],[12,30],[30,18],[20,12]];
 positions.forEach((p,i)=>createEnemy(i,p[0],p[1]));
}
function createEnemy(id,x,z){
 const root=new BABYLON.TransformNode('enemy'+id,scene);root.position=new BABYLON.Vector3(x,0,z);
 const armor=mat('armor'+id,iColor(id),'#000000'),skin=mat('skin'+id,'#6b5b50'),eye=mat('eye'+id,'#28090c','#ff1f35');
 const torso=BABYLON.MeshBuilder.CreateCapsule('torso'+id,{height:1.25,radius:.32},scene);torso.parent=root;torso.position.y=1.05;torso.material=armor;torso.metadata={enemy:id};
 const head=BABYLON.MeshBuilder.CreateSphere('head'+id,{diameter:.44,segments:8},scene);head.parent=root;head.position.y=1.86;head.material=skin;head.metadata={enemy:id,head:true};
 const visor=BABYLON.MeshBuilder.CreateBox('visor'+id,{width:.38,height:.09,depth:.06},scene);visor.parent=root;visor.position=new BABYLON.Vector3(0,1.9,-.2);visor.material=eye;visor.metadata={enemy:id,head:true};
 const gun=BABYLON.MeshBuilder.CreateBox('egun'+id,{width:.1,height:.1,depth:.55},scene);gun.parent=root;gun.position=new BABYLON.Vector3(.24,1.18,-.25);gun.rotation.x=-.12;gun.material=armor;gun.isPickable=false;
 [torso,head,visor].forEach(m=>{m.isPickable=true});
 enemies.push({id,root,torso,head,visor,hp:i%5===0?125:75,dead:false,alert:0,shot:Math.random(),home:new BABYLON.Vector3(x,0,z),phase:Math.random()*6.28,speed:i%5===0?1.15:1.55});
}
function iColor(i){return i%5===0?'#3f2026':'#252f37'}

function resetGame(){
 hp=100;ammo=30;reserve=120;cores=0;kills=0;alertCount=0;reloading=false;firing=false;ads=false;fireCd=0;recoil=0;camera.position.copyFromFloats(0,1.72,-31);camera.rotation.copyFromFloats(0,0,0);camera.fov=1.05;
 enemies.forEach(e=>{if(e.root)e.root.dispose()});enemies=[];spawnEnemies();
 coreObjects.forEach(c=>{c.taken=false;c.root.setEnabled(true);c.light.intensity=.9});
 extractLight.intensity=.05;ui.end.classList.remove('show');updateHUD();
}

function startGame(){resetGame();ui.start.classList.remove('show');ui.end.classList.remove('show');running=true;last=performance.now();if(document.documentElement.requestFullscreen){document.documentElement.requestFullscreen().catch(()=>{})}if(screen.orientation&&screen.orientation.lock){screen.orientation.lock('landscape').catch(()=>{})}}
function finish(win){running=false;firing=false;ui.endTitle.textContent=win?'EXTRACTION COMPLETE':'AGENT DOWN';ui.endText.textContent=win?`3 Datenkerne gesichert · ${kills} Gegner neutralisiert.`:`Mission fehlgeschlagen · ${kills} Gegner neutralisiert.`;ui.end.classList.add('show')}

function updateHUD(){ui.hp.textContent=Math.max(0,Math.ceil(hp));ui.hpBar.style.width=Math.max(0,hp)+'%';ui.ammo.textContent=String(ammo).padStart(2,'0');ui.reserve.textContent='/ '+reserve;ui.objective.textContent=cores<3?`SECURE DATA CORES // ${cores} / 3`:'EXTRACT // SOUTH-EAST PAD';ui.status.textContent=alertCount?'CONTACT':'STEALTH';ui.status.className='status '+(alertCount?'alert':'stealth')}
function flashHit(){ui.hit.classList.add('on');setTimeout(()=>ui.hit.classList.remove('on'),70)}
function flashDamage(){ui.damage.classList.add('on');setTimeout(()=>ui.damage.classList.remove('on'),110)}

function shoot(){
 if(!running||reloading||fireCd>0||ammo<=0){if(ammo<=0)reload();return}ammo--;fireCd=cfg.fireRate;recoil=Math.min(1,recoil+.48);shake=.08;muzzleMesh.visibility=1;muzzleLight.intensity=3.4;setTimeout(()=>{if(muzzleMesh){muzzleMesh.visibility=0;muzzleLight.intensity=0}},38);
 const origin=camera.globalPosition.clone();const dir=camera.getForwardRay().direction;const ray=new BABYLON.Ray(origin,dir,70);const hit=scene.pickWithRay(ray,m=>m.isPickable&&m!==extractPad);
 if(hit&&hit.hit&&hit.pickedMesh){const md=hit.pickedMesh.metadata||{};if(md.enemy!==undefined){const e=enemies.find(v=>v.id===md.enemy);if(e&&!e.dead){e.alert=8;const dmg=md.head?70:cfg.damage;e.hp-=dmg;flashHit();impact(hit.pickedPoint,true);if(e.hp<=0)killEnemy(e)}}else impact(hit.pickedPoint,false)}
 updateHUD();
}
function impact(pos,blood){if(!pos)return;const s=BABYLON.MeshBuilder.CreateSphere('impact',{diameter:blood?.11:.06,segments:5},scene);s.position.copyFrom(pos);s.material=mat('imp'+performance.now(),blood?'#c81826':'#d6e9f2',blood?'#6c0710':'#3b687d');s.isPickable=false;effects.push({mesh:s,t:.22})}
function killEnemy(e){e.dead=true;kills++;e.torso.material=mat('dead'+e.id,'#17191b');e.head.material=e.torso.material;setTimeout(()=>{if(e.root&&!e.root.isDisposed())e.root.setEnabled(false)},650)}
function reload(){if(reloading||ammo>=cfg.mag||reserve<=0)return;reloading=true;ui.reload.textContent='…';setTimeout(()=>{if(!reloading)return;const n=Math.min(cfg.mag-ammo,reserve);ammo+=n;reserve-=n;reloading=false;ui.reload.textContent='R';updateHUD()},cfg.reload*1000)}
function interact(){if(!running)return;let nearest=null,dist=999;coreObjects.forEach(c=>{if(c.taken)return;const d=BABYLON.Vector3.Distance(camera.position,c.root.position);if(d<dist){nearest=c;dist=d}});if(nearest&&dist<3.1){nearest.taken=true;nearest.light.intensity=0;nearest.root.setEnabled(false);cores++;if(cores===3)extractLight.intensity=1.6;updateHUD()}}
function toggleADS(){ads=!ads;ui.ads.textContent=ads?'ADS✓':'ADS'}

function hasLOS(e){const from=e.root.position.add(new BABYLON.Vector3(0,1.5,0)),to=camera.position.add(new BABYLON.Vector3(0,-.1,0)),v=to.subtract(from),d=v.length();const ray=new BABYLON.Ray(from,v.normalize(),d);const hit=scene.pickWithRay(ray,m=>m.metadata&&m.metadata.solid);return !hit||!hit.hit}
function enemyShot(e,d){if(Math.random()<Math.max(.38,.86-d/35)){hp-=cfg.enemyDamage+(e.hp>100?3:0);flashDamage();shake=.14;if(hp<=0){hp=0;updateHUD();finish(false);return}}updateHUD()}

function update(dt,t){
 fireCd=Math.max(0,fireCd-dt);if(firing)shoot();
 const yaw=camera.rotation.y,forward=new BABYLON.Vector3(Math.sin(yaw),0,Math.cos(yaw)),right=new BABYLON.Vector3(Math.cos(yaw),0,-Math.sin(yaw));let v=forward.scale(moveY).add(right.scale(moveX));if(v.lengthSquared()>1)v.normalize();if(v.lengthSquared()>.01)camera.moveWithCollisions(v.scale(cfg.speed*dt));
 camera.rotation.y+=lookDX;camera.rotation.x=Math.max(-1.1,Math.min(1.1,camera.rotation.x+lookDY));lookDX=lookDY=0;
 camera.fov+=( (ads?.72:1.05)-camera.fov)*Math.min(1,dt*12);
 recoil=Math.max(0,recoil-dt*4.4);weaponRoot.position.x+=( (ads?0:.42)-weaponRoot.position.x)*Math.min(1,dt*12);weaponRoot.position.y+=( (ads?-.22:-.34)-weaponRoot.position.y)*Math.min(1,dt*12);weaponRoot.position.z+=( (ads?.72:1.05)-weaponRoot.position.z)*Math.min(1,dt*12);weaponRoot.rotation.x=-recoil*.16+Math.sin(t*.007)*.006;
 if(shake>0){camera.rotation.y+=(Math.random()-.5)*shake*.03;camera.rotation.x+=(Math.random()-.5)*shake*.02;shake=Math.max(0,shake-dt*.8)}
 alertCount=0;
 enemies.forEach(e=>{if(e.dead)return;const to=camera.position.subtract(e.root.position),d=to.length();const sees=d<24&&hasLOS(e);if(sees)e.alert=6;else e.alert=Math.max(0,e.alert-dt);if(e.alert>0){alertCount++;const dir=to.clone();dir.y=0;if(dir.lengthSquared()>.01)dir.normalize();if(d>6.5){const old=e.root.position.clone();e.root.position.addInPlace(dir.scale(e.speed*dt));if(collidesEnemy(e.root.position)){e.root.position.copyFrom(old)}}e.root.rotation.y=Math.atan2(dir.x,dir.z);e.shot-=dt;if(d<27&&sees&&e.shot<=0){enemyShot(e,d);e.shot=.72+Math.random()*.55}}else{e.phase+=dt*.45;const dest=e.home.add(new BABYLON.Vector3(Math.sin(e.phase)*2.4,0,Math.cos(e.phase*.8)*2.4));const dir=dest.subtract(e.root.position);dir.y=0;if(dir.length()>.25){dir.normalize();const old=e.root.position.clone();e.root.position.addInPlace(dir.scale(e.speed*.35*dt));if(collidesEnemy(e.root.position))e.root.position.copyFrom(old);e.root.rotation.y=Math.atan2(dir.x,dir.z)}}});
 coreObjects.forEach((c,i)=>{if(!c.taken){c.orb.rotation.y+=dt*1.6;c.orb.rotation.x+=dt*.7;c.orb.position.y=c.baseY+Math.sin(t*.002+i)*.12}});
 effects.forEach(e=>e.t-=dt);for(let i=effects.length-1;i>=0;i--)if(effects[i].t<=0){effects[i].mesh.dispose();effects.splice(i,1)}
 if(cores===3&&BABYLON.Vector3.Distance(camera.position,extractPad.position)<3.2)finish(true);
 ui.fps.textContent=Math.round(engine.getFps())+' FPS';updateHUD();
}
function collidesEnemy(pos){for(const m of solidMeshes){if(m===scene.getMeshByName('ground'))continue;const bb=m.getBoundingInfo().boundingBox;const min=bb.minimumWorld,max=bb.maximumWorld;if(pos.x>min.x-.4&&pos.x<max.x+.4&&pos.z>min.z-.4&&pos.z<max.z+.4)return true}return false}

function bindControls(){
 let lid=null,startX=0,startY=0;
 ui.leftZone.addEventListener('pointerdown',e=>{e.preventDefault();lid=e.pointerId;ui.leftZone.setPointerCapture(lid);const r=ui.leftZone.getBoundingClientRect();startX=r.left+r.width/2;startY=r.top+r.height/2;moveStick(e)});
 function moveStick(e){if(e.pointerId!==lid)return;let dx=e.clientX-startX,dy=e.clientY-startY,max=42,d=Math.hypot(dx,dy)||1,s=Math.min(1,d/max),nx=dx/d*s,ny=dy/d*s;moveX=nx;moveY=-ny;ui.leftKnob.style.transform=`translate(${nx*max}px,${ny*max}px)`}
 ui.leftZone.addEventListener('pointermove',moveStick);const endLeft=e=>{if(e.pointerId!==lid)return;lid=null;moveX=moveY=0;ui.leftKnob.style.transform='translate(0,0)'};ui.leftZone.addEventListener('pointerup',endLeft);ui.leftZone.addEventListener('pointercancel',endLeft);
 let rid=null,lx=0,ly=0;
 ui.rightZone.addEventListener('pointerdown',e=>{if(e.target!==ui.rightZone)return;e.preventDefault();rid=e.pointerId;lx=e.clientX;ly=e.clientY;ui.rightZone.setPointerCapture(rid)});
 ui.rightZone.addEventListener('pointermove',e=>{if(e.pointerId!==rid)return;e.preventDefault();lookDX+=(e.clientX-lx)*cfg.look;lookDY+=(e.clientY-ly)*cfg.look;lx=e.clientX;ly=e.clientY});
 const endRight=e=>{if(e.pointerId===rid)rid=null};ui.rightZone.addEventListener('pointerup',endRight);ui.rightZone.addEventListener('pointercancel',endRight);
 ui.fire.addEventListener('pointerdown',e=>{e.preventDefault();firing=true;shoot();ui.fire.setPointerCapture(e.pointerId)});['pointerup','pointercancel','pointerleave'].forEach(ev=>ui.fire.addEventListener(ev,()=>firing=false));
 ui.ads.addEventListener('click',toggleADS);ui.reload.addEventListener('click',reload);ui.use.addEventListener('click',interact);ui.startBtn.addEventListener('click',startGame);ui.restartBtn.addEventListener('click',startGame);
 document.addEventListener('contextmenu',e=>e.preventDefault());document.addEventListener('gesturestart',e=>e.preventDefault());
 // optional desktop controls for testing
 const keys={};addEventListener('keydown',e=>{keys[e.code]=true;if(e.code==='KeyR')reload();if(e.code==='KeyE')interact();if(e.code==='ShiftLeft')toggleADS()});addEventListener('keyup',e=>keys[e.code]=false);scene.onBeforeRenderObservable.add(()=>{if(keys.KeyW)moveY=1;else if(keys.KeyS)moveY=-1;else if(!lid)moveY=0;if(keys.KeyD)moveX=1;else if(keys.KeyA)moveX=-1;else if(!lid)moveX=0;if(keys.Space){firing=true}else if(!keys.Space&&!ui.fire.matches(':active'))firing=false});
}

function boot(){
 engine=new BABYLON.Engine(canvas,true,{preserveDrawingBuffer:false,stencil:true,adaptToDeviceRatio:true},true);engine.setHardwareScalingLevel(Math.max(1,Math.min(1.7,(window.devicePixelRatio||1)*.85)));buildWorld();bindControls();updateHUD();engine.runRenderLoop(()=>{const now=performance.now(),dt=Math.min(.033,(now-last)/1000||0);last=now;if(running)update(dt,now);scene.render()});addEventListener('resize',()=>engine.resize());
}
if(window.BABYLON)boot();else{ui.startBtn.textContent='3D ENGINE FEHLER';ui.startBtn.disabled=true}
})();