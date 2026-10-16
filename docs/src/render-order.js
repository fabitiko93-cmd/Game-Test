import { VIEW } from "./config.js";
import { heightPixels } from "./world-scale.js";

export const isFloorObject = drawable => drawable.kind === "object"
  && (drawable.ref.placementRole === "rug" || drawable.ref.modelAsset?.startsWith("Carpet_"));

// Screen extents before camera translation/zoom. Tall wall panels can overlap a
// cabinet even when their centre sorts behind the cabinet's centre.
export function projectedBodyBounds(drawable) {
  const object=drawable.ref,shape=object.footprint||{x:.2,y:.2};
  const height=object.heightMeters||(drawable.kind==='object'?.5:1.8),elevation=object.elevationMeters||0;
  const x=(object.x-object.y)*VIEW.tileW/2,y=(object.x+object.y)*VIEW.tileH/2;
  const width=(shape.x+shape.y)*VIEW.tileW/2,depth=(shape.x+shape.y)*VIEW.tileH/2;
  return {left:x-width,right:x+width,top:y-depth-heightPixels(elevation+height),bottom:y+depth-heightPixels(elevation)};
}

const overlap=(a,b)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;

export function sortWorldDrawables(drawables,world) {
  drawables.sort((a,b)=>a.depth-b.depth);
  const floor=drawables.filter(isFloorObject),body=drawables.filter(drawable=>!isFloorObject(drawable));
  const nodes=body.map((drawable,index)=>({drawable,index,after:new Set(),waiting:0,bounds:projectedBodyBounds(drawable)}));
  const byId=new Map(nodes.map(node=>[node.drawable.ref.id,node]));
  const rooms=new Map();
  for(const node of nodes){
    const object=node.drawable.ref;
    const building=object.building||world.insideBuilding?.(object)?.id;
    if(!building)continue;
    if(!rooms.has(building))rooms.set(building,{walls:[],contents:[]});
    const room=rooms.get(building);
    if(node.drawable.kind==='object'&&['wall','door'].includes(object.type))room.walls.push(node);
    else room.contents.push(node);
  }
  const before=(a,b)=>{
    if(!a||!b||a===b||a.after.has(b))return;
    a.after.add(b);b.waiting++;
  };
  for(const room of rooms.values())for(const wall of room.walls)for(const content of room.contents){
    if(!overlap(wall.bounds,content.bounds))continue;
    if(['north','west'].includes(wall.drawable.ref.side))before(wall,content);
    else if(['south','east'].includes(wall.drawable.ref.side))before(content,wall);
  }
  for(const node of nodes)before(byId.get(node.drawable.ref.supportId),node);
  // Preserve the existing depth order wherever no real room overlap constrains it.
  const ready=nodes.filter(node=>!node.waiting),ordered=[];
  while(ready.length){
    const node=ready.shift();ordered.push(node.drawable);
    for(const next of node.after)if(--next.waiting===0){
      let i=0;while(i<ready.length&&ready[i].index<next.index)i++;
      ready.splice(i,0,next);
    }
  }
  // Malformed future support links must never make world objects disappear.
  if(ordered.length!==body.length){const included=new Set(ordered);ordered.push(...body.filter(drawable=>!included.has(drawable)));}
  drawables.splice(0,drawables.length,...floor,...ordered);
  return drawables;
}
