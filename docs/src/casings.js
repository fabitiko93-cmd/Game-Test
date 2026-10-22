import {Quaternion,Vector3} from 'three';
import {cartridgeData} from './cartridge-models.js';
import {metersToTiles,heightPixels} from './world-scale.js';
import {casingImpactSound} from './game-audio.js';

export const CASING_LIMIT=96,CASING_LIFETIME=45;
const up=new Vector3(0,1,0),forward=new Vector3(0,0,1),point=new Vector3();
const noiseSample=(seed,i)=>(Math.sin(seed*19.732+i*78.233)*43758.5453)%1+.5;
const random=(seed,i)=>{const n=noiseSample(seed,i);return n-Math.floor(n);};
export function casingSurface(world,c){
  const tile=world.tileAt?.(c.x,c.y);
  if(world.insideBuilding?.(c)||['road','asphalt','pavement','concrete','floor'].includes(tile))return'hard';
  return tile==='gravel'?'gravel':'soft';
}
export function queueCasings(renderer,game,ammoType,socket,count=1,delay=.018){
  if(!socket)return;
  if(renderer.casingWorld!==game.world){renderer.casingWorld=game.world;renderer.casings=[];renderer.casingQueue=[];}
  renderer.casings||=[];renderer.casingQueue||=[];
  const queue=renderer.casingQueue;
  for(let i=0;i<count;i++){renderer.casingSerial=(renderer.casingSerial||0)+1;queue.push({socket:{...socket,rotation:[...(socket.rotation||[0,0,0,1])]},ammoType,delay:delay+i*.012,seed:renderer.casingSerial});}
  if(queue.length>CASING_LIMIT)queue.splice(0,queue.length-CASING_LIMIT);
}
function spawn(event){
  const {socket:s,seed,ammoType}=event,q=new Quaternion().fromArray(s.rotation),def=cartridgeData(ammoType),jitter=random(seed,0);
  const velocity=(s.unload?new Vector3((jitter-.5)*.3,.1,-.45-random(seed,1)*.3):new Vector3(1.2+jitter*.65,.45+random(seed,1)*.45,-.18+random(seed,2)*.3)).applyQuaternion(q);
  return{x:s.x,y:s.y,height:Math.max(def.radius,s.height),vx:velocity.x,vy:velocity.z,vz:velocity.y,
    rotation:q,angular:new Vector3(13+random(seed,3)*11,random(seed,4)*18-9,random(seed,5)*12),ammoType,seed,age:0,bounces:0,settled:false,footprint:{x:.02,y:.02},heightMeters:.03};
}
function impact(renderer,game,c,speed,surface){
  const softness=surface==='hard'?1:surface==='gravel'?.45:.07;
  const strength=Math.min(1,speed/4)*softness*(c.bounces===1?1:.30);
  if(strength<.025)return;
  const radius=(surface==='hard'?.55:surface==='gravel'?.28:.07)*Math.sqrt(strength);
  const noises=game.world.noises||[];
  const recent=noises.find(n=>n.kind==='casing'&&n.maxLife-n.life<.08&&Math.hypot(n.x-c.x,n.y-c.y)<.18);
  if(recent){recent.radius=Math.max(recent.radius,radius);recent.strength=Math.max(recent.strength,strength*.20);}
  else game.world.emitNoise(c.x,c.y,radius,'casing',.48,strength*.20);
  if(!renderer.lastCasingSound||game.elapsed-renderer.lastCasingSound>.025){casingImpactSound(game,c,strength,surface);renderer.lastCasingSound=game.elapsed;}
}
function advance(renderer,game,c,delta){
  c.age+=delta;if(c.settled)return;
  for(let left=delta;left>1e-8;){
    const dt=Math.min(1/120,left);left-=dt;
    c.x+=metersToTiles(c.vx*dt);c.y+=metersToTiles(c.vy*dt);c.height+=c.vz*dt-4.905*dt*dt;c.vz-=9.81*dt;
    const spin=c.angular.length();if(spin)c.rotation.premultiply(new Quaternion().setFromAxisAngle(c.angular.clone().normalize(),spin*dt));
    const data=cartridgeData(c.ammoType),axis=forward.clone().applyQuaternion(c.rotation),bottom=data.radius+data.length/2*Math.abs(axis.y);
    if(c.height>bottom)continue;
    const surface=casingSurface(game.world,c),speed=Math.abs(c.vz);c.height=bottom;
    if(c.vz>=0)continue;
    c.bounces++;impact(renderer,game,c,speed,surface);
    c.vz=speed*(surface==='hard'?.30:.10);c.vx*=surface==='hard'?.62:.35;c.vy*=surface==='hard'?.62:.35;c.angular.multiplyScalar(.46);
    if(c.bounces>=3||c.vz<.22){
      c.settled=true;c.vx=c.vy=c.vz=0;c.rotation.setFromAxisAngle(up,Math.atan2(axis.x,axis.z)).multiply(new Quaternion().setFromAxisAngle(new Vector3(1,0,0),Math.PI/2));c.height=data.radius;break;
    }
  }
}
export function updateCasings(renderer,game,delta){
  if(renderer.casingWorld&&renderer.casingWorld!==game.world){renderer.casings=[];renderer.casingQueue=[];renderer.casingWorld=game.world;}
  const dt=Math.max(0,delta);renderer.casings||=[];renderer.casingQueue||=[];
  for(const c of renderer.casings){advance(renderer,game,c,dt);c.elevationMeters=c.height;}
  for(const e of renderer.casingQueue){e.delay-=dt;if(e.delay<=0){const c=spawn(e);advance(renderer,game,c,Math.min(dt,-e.delay));c.elevationMeters=c.height;renderer.casings.push(c);}}
  renderer.casingQueue=renderer.casingQueue.filter(e=>e.delay>0);
  renderer.casings=renderer.casings.filter(c=>c.age<CASING_LIFETIME);
  while(renderer.casings.length>CASING_LIMIT){const i=renderer.casings.findIndex(c=>c.settled);renderer.casings.splice(i<0?0:i,1);}
}
const displayColors=new Map();
function drawCasingGeometry(renderer,c,ctx){
  const data=cartridgeData(c.ammoType),triangles=[];
  let colors=displayColors.get(c.ammoType);
  if(!colors){colors=[];for(let i=0;i<data.colors.length;i+=9){const rgb=data.colors.slice(i,i+3).map(v=>Math.round(255*(v<=.0031308?v*12.92:1.055*v**(1/2.4)-.055)));colors.push(`rgb(${rgb.join(',')})`);}displayColors.set(c.ammoType,colors);}
  for(let i=0;i<data.positions.length;i+=9){const projected=[];let depth=0;
    for(let j=0;j<9;j+=3){point.fromArray(data.positions,i+j).applyQuaternion(c.rotation);const p=renderer.iso(c.x+metersToTiles(point.x),c.y+metersToTiles(point.z),heightPixels(c.height+point.y));projected.push(p);depth+=point.x+point.z+point.y*.3;}
    triangles.push({projected,depth,color:colors[i/9]});
  }
  triangles.sort((a,b)=>a.depth-b.depth);ctx.save();
  for(const t of triangles){ctx.fillStyle=t.color;ctx.beginPath();ctx.moveTo(t.projected[0].x,t.projected[0].y);ctx.lineTo(t.projected[1].x,t.projected[1].y);ctx.lineTo(t.projected[2].x,t.projected[2].y);ctx.closePath();ctx.fill();}ctx.restore();
}

export function drawCasing(renderer,c){
  if(renderer.playerVisibility&&!renderer.playerVisibility.canSee(c,renderer.viewPlayer))return;
  const p=renderer.iso(c.x,c.y,heightPixels(c.height));if(p.x< -8||p.y< -8||p.x>renderer.width+8||p.y>renderer.height+8)return;
  const ctx=renderer.ctx;ctx.save();ctx.globalAlpha=Math.min(1,(CASING_LIFETIME-c.age)/2);
  if(c.settled&&typeof OffscreenCanvas!=='undefined'&&ctx.drawImage){
    if(!c.sprite){
      const canvas=new OffscreenCanvas(32,32),surface=canvas.getContext('2d'),density=6;
      drawCasingGeometry({iso:(x,y,z)=>{const p=renderer.rawIso(x-c.x,y-c.y,z-heightPixels(c.height));return{x:16+p.x*density,y:16+p.y*density};}},c,surface);
      c.sprite=canvas;
    }
    ctx.drawImage(c.sprite,p.x-16/6,p.y-16/6,32/6,32/6);
  }else drawCasingGeometry(renderer,c,ctx);
  ctx.restore();
}
