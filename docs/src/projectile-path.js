
// Deterministic intersections with the actual fired ray. Bodies are visited in
// order, never selected independently behind the first hit. Walls still stop
// every calibre; material penetration is deliberately outside this patch.
export function projectilePath(game,end,stats){
  const start=game.player,dx=end.x-start.x,dy=end.y-start.y,len=Math.hypot(dx,dy);
  if(len<1e-6)return{hits:[],end:{...end}};
  const ux=dx/len,uy=dy/len,range=stats.range,bodyRadius=.15;
  const contacts=[];
  for(const zombie of game.zombies){
    if(zombie.removed)continue;
    const x=zombie.x-start.x,y=zombie.y-start.y,along=x*ux+y*uy,across=Math.abs(x*uy-y*ux);
    if(along<=0||along>range||across>bodyRadius)continue;
    const entry=Math.max(0,along-Math.sqrt(Math.max(0,bodyRadius**2-across**2)));
    contacts.push({zombie,along:entry});
  }
  contacts.sort((a,b)=>a.along-b.along||String(a.zombie.id).localeCompare(String(b.zombie.id)));
  const hits=[];let attenuation=1,stop=range;
  for(const contact of contacts){
    if(!game.world.hasLineOfSight(start,contact.zombie)){stop=Math.min(stop,contact.along);break;}
    hits.push({...contact,attenuation});stop=contact.along+.12;
    if(hits.length>=(stats.penetration||0)+1)break;
    attenuation*=stats.penetrationDamage??.4;
    if(attenuation<.1)break;
    stop=range;
  }
  let point={x:start.x+ux*stop,y:start.y+uy*stop};
  if(!game.world.hasLineOfSight(start,point)){
    let low=0,high=stop;for(let i=0;i<14;i++){const t=(low+high)/2;if(game.world.hasLineOfSight(start,{x:start.x+ux*t,y:start.y+uy*t}))low=t;else high=t;}
    stop=low;point={x:start.x+ux*stop,y:start.y+uy*stop};
  }
  return{hits:hits.filter(h=>h.along<=stop+.001),end:point};
}
