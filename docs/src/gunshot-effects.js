import {heightPixels,metersToTiles} from './world-scale.js';

const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n));
export function shotEnd(world,start,end){
  if(!world?.hasLineOfSight||world.hasLineOfSight(start,end))return {...end,height:end.height??1.05};
  let low=0,high=1;
  for(let i=0;i<12;i++){
    const t=(low+high)/2,p={x:start.x+(end.x-start.x)*t,y:start.y+(end.y-start.y)*t};
    if(world.hasLineOfSight(start,p))low=t;else high=t;
  }
  return {x:start.x+(end.x-start.x)*low,y:start.y+(end.y-start.y)*low,height:(start.height??1.25)+((end.height??1.05)-(start.height??1.25))*low};
}
export function createTracer(start,end){
  const distance=Math.hypot(end.x-start.x,end.y-start.y),flight=Math.max(.012,distance/180);
  return {start:{...start,height:start.height??1.25},end:{...end,height:end.height??1.05},age:0,fresh:true,flight,distance,life:flight+.025};
}
export function tracerSegment(tracer){
  const head=clamp((tracer.age*180+.24)/Math.max(.001,tracer.distance)),tail=Math.max(0,head-.48/Math.max(.001,tracer.distance));
  const at=t=>({x:tracer.start.x+(tracer.end.x-tracer.start.x)*t,y:tracer.start.y+(tracer.end.y-tracer.start.y)*t,
    height:tracer.start.height+(tracer.end.height-tracer.start.height)*t});
  return {from:at(tail),to:at(head),alpha:.32*Math.exp(-tracer.age*24)};
}
export function updateShotEffects(renderer,delta){
  for(const event of [...renderer.tracers,...renderer.gunshots]){
    if(event.fresh){event.fresh=false;continue;}
    event.age+=Math.max(0,delta);
  }
  renderer.tracers=renderer.tracers.filter(t=>t.age<t.life);
  renderer.gunshots=renderer.gunshots.filter(s=>s.age<.085);
}
export function drawShotTrails(renderer){
  const ctx=renderer.ctx;
  for(const tracer of renderer.tracers){
    if(renderer.playerVisibility&&(!renderer.playerVisibility.canSee(tracer.start,renderer.viewPlayer)||!renderer.playerVisibility.canSee(tracer.end,renderer.viewPlayer)))continue;
    const segment=tracerSegment(tracer),a=renderer.iso(segment.from.x,segment.from.y,heightPixels(segment.from.height)),b=renderer.iso(segment.to.x,segment.to.y,heightPixels(segment.to.height));
    if(Math.hypot(b.x-a.x,b.y-a.y)<.1)continue;
    ctx.save();ctx.lineCap='round';
    const gradient=ctx.createLinearGradient(a.x,a.y,b.x,b.y);gradient.addColorStop(0,'rgba(206,201,174,0)');gradient.addColorStop(1,`rgba(225,219,190,${segment.alpha})`);
    ctx.strokeStyle=gradient;ctx.lineWidth=.7;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();ctx.restore();
  }
}
export function drawMuzzleFlashes(renderer){
  const ctx=renderer.ctx;
  for(const shot of renderer.gunshots||[]){
    if(shot.age>.052)continue;
    const p=shot.start,from=renderer.iso(p.x,p.y,heightPixels(p.height)),d=p.direction||shot.direction;
    const length=shot.size*(1-shot.age/.065),to=renderer.iso(p.x+metersToTiles(d.x*length),p.y+metersToTiles(d.y*length),heightPixels(p.height+(d.height||0)*length));
    const dx=to.x-from.x,dy=to.y-from.y,len=Math.max(.8,Math.hypot(dx,dy)),nx=-dy/len,ny=dx/len,width=Math.max(.7,len*.23);
    const alpha=(1-shot.age/.055)*shot.strength;
    ctx.save();ctx.globalCompositeOperation='screen';ctx.globalAlpha=alpha;
    const glow=ctx.createRadialGradient(from.x,from.y,0,from.x,from.y,len*1.8);
    glow.addColorStop(0,'rgba(255,184,76,.45)');glow.addColorStop(1,'rgba(255,143,48,0)');
    ctx.fillStyle=glow;ctx.beginPath();ctx.arc(from.x,from.y,len*1.8,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#f8b35f';ctx.beginPath();ctx.moveTo(from.x,from.y);
    for(const [t,w] of [[.22,-.7],[.42,-shot.flare],[.69,-.3],[1,0],[.60,.45],[.32,shot.flare]])ctx.lineTo(from.x+dx*t+nx*width*w,from.y+dy*t+ny*width*w);
    ctx.closePath();ctx.fill();ctx.fillStyle='#fff1c4';ctx.beginPath();ctx.ellipse(from.x+dx*.15,from.y+dy*.15,Math.max(.5,len*.24),Math.max(.5,width*.4),Math.atan2(dy,dx),0,Math.PI*2);ctx.fill();ctx.restore();
  }
}
