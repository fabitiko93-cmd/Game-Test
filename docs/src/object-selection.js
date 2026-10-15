import { interactionFootprint, interactionDistance } from "./interaction.js";
import { heightPixels, tilesToMeters } from "./world-scale.js";
import { playerCanSee } from "./player-visibility.js";

const cross = (a,b,c) => (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
function hull(points) {
  points.sort((a,b)=>a.x-b.x||a.y-b.y);
  const side = entries => { const result=[]; for(const p of entries){while(result.length>1&&cross(result.at(-2),result.at(-1),p)<=0)result.pop();result.push(p);}return result.slice(0,-1); };
  return [...side(points),...side([...points].reverse())];
}

// Match the projected, elevated body rather than a large circle at a fixed height.
export function objectPickPolygon(renderer,object) {
  const looseShapes={corpse:{x:.16,y:.45},groundloot:{x:.16,y:.12},radio:{x:.18,y:.1}};
  const heights={door:1.985,corpse:.2,groundloot:.25,radio:.4,toolbox:.45,car:1.45,shed:2.4};
  const footprint=object.footprint||looseShapes[object.type]||interactionFootprint(object),x=Math.max(.05,footprint.x),y=Math.max(.05,footprint.y);
  const base=heightPixels(object.elevationMeters||0);
  const top=base+heightPixels(object.heightMeters||heights[object.type]||.5);
  return hull([base,top].flatMap(z=>[-x,x].flatMap(dx=>[-y,y].map(dy=>renderer.iso(object.x+dx,object.y+dy,z)))));
}

export function polygonDistance(point,polygon) {
  let inside=true,nearest=Infinity;
  for(let i=0;i<polygon.length;i++){
    const a=polygon[i],b=polygon[(i+1)%polygon.length];
    if(cross(a,b,point)<-1e-8)inside=false;
    const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((point.x-a.x)*dx+(point.y-a.y)*dy)/(dx*dx+dy*dy||1)));
    nearest=Math.min(nearest,Math.hypot(point.x-a.x-dx*t,point.y-a.y-dy*t));
  }
  return inside?0:nearest;
}

export function pickHotspots(hotspots,x,y,visible=()=>true) {
  const candidates=[];
  for(let i=0;i<hotspots.length;i++){
    const hit=hotspots[i];if(hit.ref.removed||!visible(hit.ref))continue;
    const centerDistance=Math.hypot(x-hit.x,y-hit.y);
    const distance=hit.polygon?polygonDistance({x,y},hit.polygon):Math.max(0,centerDistance-hit.radius);
    if(hit.polygon?distance<=10:centerDistance<hit.radius)candidates.push({hit,distance,centerDistance,order:i});
  }
  candidates.sort((a,b)=>a.distance-b.distance||(a.hit.polygon&&b.hit.polygon?b.order-a.order:a.centerDistance-b.centerDistance));
  // An exact body tap takes precedence over the neighbouring touch allowance.
  const exact=candidates.some(candidate=>candidate.distance===0);
  return candidates.filter(candidate=>!exact||candidate.distance===0).map(candidate=>candidate.hit);
}

export class ObjectChoices {
  constructor(panel) {
    this.panel=panel;this.list=panel.querySelector('[data-object-choices]');this.game=null;
    panel.querySelector('button').addEventListener('click',()=>this.hide());
    panel.addEventListener('pointerdown',event=>{event.stopPropagation();this.game?.input.cancelPointer();if(this.game)this.game.input.lastTap.time=0;});
  }
  show(hits,game) {
    this.hide();this.game=game;game.clearNavigation();
    game.renderer.choiceIds=hits.map(hit=>hit.id);this.list.replaceChildren();
    hits.forEach((hit,index)=>{
      const button=document.createElement('button'),number=document.createElement('b'),label=document.createElement('span'),distance=document.createElement('small');
      number.textContent=String(index+1);label.textContent=hit.ref.name||'BEHÄLTER';
      distance.textContent=`${tilesToMeters(interactionDistance(game.player,hit.ref)).toFixed(1).replace('.',',')} m${hit.ref.elevationMeters?' · WANDMONTAGE':''}`;
      button.append(number,label,distance);button.dataset.objectId=hit.id;
      button.addEventListener('click',()=>{
        this.hide();if(!game.canAct()||hit.ref.removed||!playerCanSee(game,hit.ref))return;
        game.renderer.selectedId=hit.id;game.player.combat.targetId=null;
        game.ui.showMessage(`${hit.ref.name} · AKTION ZUM BENUTZEN`,1.8);
      });
      this.list.append(button);
    });
    this.panel.classList.remove('hidden');
  }
  hide() {this.panel.classList.add('hidden');if(this.game)this.game.renderer.choiceIds=[];this.game=null;}
}
