// Screen-space interaction for the lazy workshop, independent of game input.
import {Plane,Quaternion,Raycaster,Vector2,Vector3} from 'three';
import {CHANNELS,positionChannel} from './animation-document.js';
import {armCircle} from './elbow-pose.js';
const joints={support:'Middle2L',elbowR:'LowerArmR',elbowL:'LowerArmL',chest:'Chest',head:'Head',shoulderR:'ShoulderR',shoulderL:'ShoulderL',pelvis:'Body',footR:'FootR',footL:'FootL',kneeR:'LowerLegR',kneeL:'LowerLegL',fingersR:'Middle2R',fingersL:'Middle2L'};
export const HANDLE_CHANNELS=['weapon',...Object.keys(joints).filter(n=>!n.startsWith('fingers'))];
export function handlePoint(entity,channel){const object=channel==='weapon'?entity.weapon:entity.model.getObjectByName(joints[channel]);return object?.getWorldPosition(new Vector3());}
export function elbowHandle(entity,side){const arm=['UpperArm','LowerArm','Wrist'].map(n=>entity.model.getObjectByName(n+side));return arm.every(Boolean)?armCircle(...arm):null;}
export function elbowDragAngle(circle,camera,rect,x,y,previous=0){
  let best={cost:Infinity,angle:previous};
  for(let angle=-160;angle<=160;angle++){
    const p=circle.radial.clone().applyAxisAngle(circle.axis,angle*Math.PI/180).add(circle.center).project(camera);
    const dx=(p.x+1)*rect.width/2-x,dy=(1-p.y)*rect.height/2-y,cost=dx*dx+dy*dy+(angle-previous)**2*.002;
    if(cost<best.cost)best={cost,angle};
  }
  return best.angle;
}
export function screenPointToWorld(clientX,clientY,rect,camera,plane){
  const ray=new Raycaster();ray.setFromCamera(new Vector2((clientX-rect.left)/rect.width*2-1,1-(clientY-rect.top)/rect.height*2),camera);
  return ray.ray.intersectPlane(plane,new Vector3());
}
export function dragValues(values,channel,tool,axis,worldDelta,rotationDegrees,yaw){
  const out=JSON.parse(JSON.stringify(values)),c=CHANNELS[channel];if(!c)return out;
  if(tool==='rotate'){
    const index=positionChannel(channel)?(c.size===6?3+axis:-1):c.size===3?axis:-1;
    if(index>=0)out[channel][index]+=rotationDegrees;
  }else if(positionChannel(channel)){
    const local=worldDelta.clone().applyQuaternion(yaw.clone().invert());
    const target=channel==='support'&&out.contactL[0]<0?'freeHandL':channel;
    if(tool==='depth')out[target][2]+=rotationDegrees;else for(let i=0;i<3;i++)out[target][i]+=local.getComponent(i);
    out[target]=out[target].map((value,i)=>Math.max(CHANNELS[target].min?.[i]??-CHANNELS[target].limit[i],Math.min(CHANNELS[target].limit[i],value)));
  }
  out[channel]=out[channel].map((value,i)=>Math.max(c.min?.[i]??-c.limit[i],Math.min(c.limit[i],value)));
  return out;
}

export function bindWorkshopInteraction(canvas,access){
  let gesture=null;
  const finish=(event,cancel=false)=>{
    if(!gesture||event&&event.pointerId!==gesture.id)return;
    const old=gesture;gesture=null;
    if(old.edit)access.end(cancel,old.moved);
    if(old.edit&&!cancel&&!old.moved)access.tap?.(old.channel);
    if(canvas.hasPointerCapture?.(old.id))canvas.releasePointerCapture(old.id);
  };
  const down=event=>{
    event.preventDefault();event.stopPropagation();if(gesture||event.button>0)return;
    const state=access.read();if(!state.camera)return;
    const rect=canvas.getBoundingClientRect(),camera=state.camera.clone(),x=event.clientX-rect.left,y=event.clientY-rect.top;
    if(state.tool==='view'){gesture={id:event.pointerId,view:true,x:event.clientX,y:event.clientY,yaw:state.yaw,pitch:state.pitch};}
    else{
      if(!state.editable)return;
      const hits=state.handles.map(h=>({...h,d:Math.hypot(x-h.x,y-h.y)})).filter(h=>h.d<=28).sort((a,b)=>a.d-b.d);
      let hit=hits[0];
      const selected=state.handles.find(h=>h.channel===state.channel);
      if(state.tool==='rotate'&&selected&&!selected.elbow&&Math.abs(Math.hypot(x-selected.x,y-selected.y)-43)<23)hit=selected;
      if(!hit)return;
      access.select(hit.channel);const canMove=access.allow?access.allow(hit.channel):true;
      const anchor=hit.point.clone(),normal=camera.getWorldDirection(new Vector3()),plane=new Plane().setFromNormalAndCoplanarPoint(normal,anchor);
      const start=screenPointToWorld(event.clientX,event.clientY,rect,camera,plane);if(!start)return;
      gesture={id:event.pointerId,channel:hit.channel,tool:positionChannel(hit.channel)?state.tool:'rotate',axis:state.axis,rect,camera,plane,start,x:event.clientX,y:event.clientY,anchor:hit,values:access.values(),yaw:state.rootYaw.clone(),edit:true,moved:false,elbow:hit.elbow,lastAngle:0,canMove};
      access.begin();
    }
    try{canvas.setPointerCapture(event.pointerId);}catch(_){}
  };
  const move=event=>{
    const g=gesture;if(!g||g.id!==event.pointerId)return;event.preventDefault();event.stopPropagation();
    const dx=event.clientX-g.x,dy=event.clientY-g.y;
    if(g.view){access.orbit(g.yaw+dx*.012,Math.max(-1.45,Math.min(1.45,g.pitch+dy*.009)));return;}
    if(!g.canMove)return;
    if(g.elbow&&g.elbow.radius<.006){access.block?.('Der Arm ist fast gestreckt. Für mehr Beugung die Hand oder Waffe etwas näher zum Körper führen.');return;}
    if(!g.moved&&Math.hypot(dx,dy)<3)return;g.moved=true;
    if(g.elbow){
      const angle=elbowDragAngle(g.elbow,g.camera,g.rect,g.anchor.x+dx,g.anchor.y+dy,g.lastAngle);g.lastAngle=angle;
      const values=JSON.parse(JSON.stringify(g.values)),field='elbowTurn'+g.channel.at(-1);values[field][0]=Math.max(-160,Math.min(160,values[field][0]+angle));access.change(values);return;
    }
    const point=screenPointToWorld(event.clientX,event.clientY,g.rect,g.camera,g.plane);if(!point)return;
    const amount=g.tool==='depth'?-dy*(g.camera.top-g.camera.bottom)/g.rect.height:dx*.5-dy*.15;
    access.change(dragValues(g.values,g.channel,g.tool,g.axis,point.sub(g.start),amount,g.yaw));
  };
  const up=e=>finish(e),cancel=e=>finish(e,true),blur=()=>finish(null,true);
  canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointermove',move);
  canvas.addEventListener('pointerup',up);canvas.addEventListener('pointercancel',cancel);canvas.addEventListener('lostpointercapture',cancel);
  globalThis.addEventListener?.('blur',blur);
  globalThis.addEventListener?.('resize',blur);
  return()=>{finish(null,true);};
}
