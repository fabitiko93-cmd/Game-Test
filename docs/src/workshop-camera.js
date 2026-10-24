// Editor-only camera framing. The gesture owns a frozen frame; choosing a
// body part or changing the viewport requests a new fit between gestures.
import {Box3,Vector3} from 'three';
const v=()=>new Vector3();
const arms=side=>['Shoulder'+side,'UpperArm'+side,'LowerArm'+side,'Wrist'+side,'Middle2'+side];
export function focusPoints(entity,subject){
  const point=name=>entity.model.getObjectByName(name)?.getWorldPosition(v()),points=[];
  let names;
  if(subject==='body')names=['FootR','FootL','Body','Chest','Head',...arms('R'),...arms('L')];
  else if(subject==='head')names=['Head','Neck','ShoulderL','ShoulderR'];
  else if(subject==='pelvis')names=['Body','Hips','UpperLegL','UpperLegR','LowerLegL','LowerLegR'];
  else if(/^(foot|knee)/.test(subject))names=['Body','UpperLeg'+subject.at(-1),'LowerLeg'+subject.at(-1),'Foot'+subject.at(-1)];
  else if(/^(elbow|shoulder)/.test(subject))names=arms(subject.at(-1));
  else if(['weapon','support','hands','fingersL','fingersR'].includes(subject))names=['LowerArmR','WristR','Middle2R','LowerArmL','WristL','Middle2L'];
  else names=['Body','Chest','Neck','Head','ShoulderR','ShoulderL'];
  for(const name of names){const p=point(name);if(p)points.push(p);}
  if(subject==='body'){const head=point('Head');if(head)points.push(head.add(new Vector3(0,.21,0)));for(const side of ['R','L']){const p=point('Foot'+side);if(p)points.push(p.add(new Vector3(0,-.06,0)));}}
  if(subject==='head'){const p=point('Head');if(p)points.push(p.add(new Vector3(0,.21,0)));}
  if(subject==='body'||subject==='weapon')entity.weapon?.traverseVisible(mesh=>{
    if(!mesh.isMesh||!mesh.geometry)return;mesh.geometry.computeBoundingBox();const box=mesh.geometry.boundingBox;
    for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z])points.push(new Vector3(x,y,z).applyMatrix4(mesh.matrixWorld));
  });
  return points;
}
export function fitCameraPoints(points,{aspect=1,yaw=0,pitch=0,zoom=1,minimum=.35}={}){
  const forward=new Vector3(Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch));
  const right=new Vector3(Math.cos(yaw),0,-Math.sin(yaw)),up=forward.clone().cross(right).normalize();
  const bounds=new Box3();for(const p of points)bounds.expandByPoint(new Vector3(p.dot(right),p.dot(up),p.dot(forward)));
  if(bounds.isEmpty())bounds.set(new Vector3(-.5,0,0),new Vector3(.5,1.8,0));
  const centerLocal=bounds.getCenter(v()),size=bounds.getSize(v());
  return{center:right.multiplyScalar(centerLocal.x).add(up.multiplyScalar(centerLocal.y)).add(forward.multiplyScalar(centerLocal.z)),height:Math.max(minimum,size.y,size.x/Math.max(.1,aspect))*1.28/zoom};
}
export class WorkshopCamera{
  constructor(){this.subject='body';this.pending=true;this.points=[];this.last=null;this.frozen=false;}
  request(subject=this.subject){this.subject=subject;this.pending=true;}
  freeze(){this.frozen=true;}
  release(){this.frozen=false;}
  view(entity,options){if(this.frozen&&this.last)return this.last;if(this.pending){this.points=focusPoints(entity,this.subject);this.pending=false;}return this.last=fitCameraPoints(this.points,{...options,minimum:this.subject==='body'?1.8:.35});}
}
