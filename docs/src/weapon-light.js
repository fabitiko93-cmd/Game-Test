import {activeWeapon,weaponLight} from './inventory.js';

// The same physical sight blockers used by combat stop the light. Binary search
// along each ray retains thin walls and doors without a second collision model.
export function weaponLightCone(world,player,light) {
  const angle=Math.atan2(player.facingY ?? 1,player.facingX ?? 0),points=[];
  for(let i=0;i<=24;i++) {
    const a=angle-light.halfAngle+2*light.halfAngle*i/24,dx=Math.cos(a),dy=Math.sin(a);
    const at=d=>({x:player.x+dx*d,y:player.y+dy*d});
    let distance=light.range;
    if(!world.hasLineOfSight(player,at(distance))) {
      let near=0,far=distance;
      for(let j=0;j<9;j++){const mid=(near+far)/2;if(world.hasLineOfSight(player,at(mid)))near=mid;else far=mid;}
      distance=near;
    }
    points.push(at(distance));
  }
  return points;
}

export function drawWeaponLight(renderer,game,sun) {
  const light=weaponLight(activeWeapon(game.player));if(!light||game.player.dead)return;
  const player=game.player,entity=renderer.playerModels?.entities.get(player),yaw=entity?.root.rotation.y;
  const facing={x:player.x,y:player.y,facingX:yaw===undefined?player.facingX:Math.sin(yaw),facingY:yaw===undefined?player.facingY:Math.cos(yaw)};
  const key=[facing.x,facing.y,facing.facingX,facing.facingY,light.range,light.halfAngle,game.world.seed,game.world.sightRevision].join('|');
  if(renderer.weaponLightCache?.key!==key)renderer.weaponLightCache={key,points:weaponLightCone(game.world,facing,light)};
  const points=renderer.weaponLightCache.points,ctx=renderer.ctx,origin=renderer.iso(player.x,player.y);
  const angle=Math.atan2(facing.facingY ?? 1,facing.facingX ?? 0);
  const end=renderer.iso(player.x+Math.cos(angle)*light.range,player.y+Math.sin(angle)*light.range),radius=Math.max(1,Math.hypot(end.x-origin.x,end.y-origin.y));
  ctx.save();ctx.globalCompositeOperation='screen';
  for(const inset of [0,3,7]) {
    const gradient=ctx.createRadialGradient(origin.x,origin.y,0,origin.x,origin.y,radius);
    gradient.addColorStop(0,`rgba(244,240,206,${(.08+.07*(1-sun))*(inset?1:.7)})`);
    gradient.addColorStop(1,'rgba(244,240,206,0)');
    ctx.fillStyle=gradient;ctx.beginPath();ctx.moveTo(origin.x,origin.y);
    for(const p of points.slice(inset,points.length-inset)){const q=renderer.iso(p.x,p.y);ctx.lineTo(q.x,q.y);}
    ctx.closePath();ctx.fill();
  }
  ctx.restore();
}
