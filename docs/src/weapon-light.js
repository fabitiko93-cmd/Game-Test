import {Quaternion,Vector3} from 'three';
import {activeWeapon,weaponLight} from './inventory.js';
import {heightPixels,metersToTiles,tilesToMeters} from './world-scale.js';

// Read the lens after the visible weapon has been posed. Its full orientation
// matters: a lowered revolver lights the floor in front of its barrel.
export function weaponLightSource(entity,player){
  const weapon=entity?.weapon,lens=weapon?.userData.lightOrigin,part=weapon?.getObjectByName('Flashlight');
  if(!lens||!part?.visible)return null;
  weapon.updateWorldMatrix(true,true);
  const point=weapon.localToWorld(lens.clone()),direction=new Vector3(0,0,1).applyQuaternion(part.getWorldQuaternion(new Quaternion()));
  return {x:player.x+metersToTiles(point.x),y:player.y+metersToTiles(point.z),height:Math.max(0,point.y),direction:{x:direction.x,y:direction.z,height:direction.y}};
}

// Trace a three-dimensional cone in metres, stopping at the ground or the same
// walls/doors used by sight. All endpoints retain their physical height.
export function weaponLightCone(world,source,light){
  const d=source.direction,axis=new Vector3(d.x,d.height,d.y).normalize();
  const right=new Vector3().crossVectors(axis,Math.abs(axis.y)>.95?new Vector3(1,0,0):new Vector3(0,1,0)).normalize();
  const up=new Vector3().crossVectors(right,axis).normalize(),points=[];
  const trace=direction=>{
    let distance=tilesToMeters(light.range);
    if(direction.y<-.00001)distance=Math.min(distance,source.height/-direction.y);
    const at=t=>({x:source.x+metersToTiles(direction.x*t),y:source.y+metersToTiles(direction.z*t),height:Math.max(0,source.height+direction.y*t)});
    if(!world.hasLineOfSight(source,at(distance))){
      let near=0,far=distance;
      for(let i=0;i<12;i++){const mid=(near+far)/2;if(world.hasLineOfSight(source,at(mid)))near=mid;else far=mid;}
      distance=near;
    }
    return at(distance);
  };
  for(let i=0;i<32;i++){
    const angle=i*Math.PI/16;
    points.push(trace(axis.clone().multiplyScalar(Math.cos(light.halfAngle)).addScaledVector(right,Math.sin(light.halfAngle)*Math.cos(angle)).addScaledVector(up,Math.sin(light.halfAngle)*Math.sin(angle))));
  }
  points.push(trace(axis));return points;
}

function hull(points){
  const sorted=points.slice().sort((a,b)=>a.x-b.x||a.y-b.y),cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x),half=list=>{
    const result=[];for(const p of list){while(result.length>1&&cross(result.at(-2),result.at(-1),p)<=0)result.pop();result.push(p);}result.pop();return result;
  };
  return [...half(sorted),...half(sorted.slice().reverse())];
}

export function drawWeaponLight(renderer,game,sun){
  const player=game.player,light=weaponLight(activeWeapon(player));if(!light||player.dead)return;
  const source=weaponLightSource(renderer.playerModels?.entities.get(player),player);if(!source)return;
  if(!game.world.hasLineOfSight(player,source))return;
  const key=[source.x,source.y,source.height,source.direction.x,source.direction.y,source.direction.height,light.range,light.halfAngle,game.world.seed,game.world.sightRevision].join('|');
  if(renderer.weaponLightCache?.key!==key)renderer.weaponLightCache={key,points:weaponLightCone(game.world,source,light)};
  const project=p=>renderer.iso(p.x,p.y,heightPixels(p.height));
  const origin=project(source),points=renderer.weaponLightCache.points.map(project),outline=hull([origin,...points]),ctx=renderer.ctx;
  const radius=Math.max(1,...points.map(p=>Math.hypot(p.x-origin.x,p.y-origin.y)));
  ctx.save();ctx.globalCompositeOperation='screen';
  const gradient=ctx.createRadialGradient(origin.x,origin.y,0,origin.x,origin.y,radius);
  gradient.addColorStop(0,`rgba(244,240,206,${.12+.10*(1-sun)})`);
  gradient.addColorStop(.7,`rgba(244,240,206,${.065+.06*(1-sun)})`);
  gradient.addColorStop(1,'rgba(244,240,206,0)');
  ctx.fillStyle=gradient;ctx.beginPath();
  outline.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.fill();ctx.restore();
}
