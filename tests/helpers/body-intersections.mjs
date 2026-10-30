import {Vector3,Ray} from 'three';

// Intersect limb centre lines with the actual deformed body triangles.
// This intentionally does not reuse the runtime avoidance volumes.
export function bodyIntersections(e){const meshes=[];for(const part of [e.clothing.torso,e.clothing.legs])part.traverse(m=>{if(!m.isSkinnedMesh)return;const g=m.geometry,ix=g.index,si=g.attributes.skinIndex,sw=g.attributes.skinWeight,faces=[];
 const body=i=>{let sum=0;for(let j=0;j<4;j++)if(!/Arm|Shoulder|Wrist|Index|Middle|Ring|Pinky|Thumb|Neck|Head/.test(m.skeleton.bones[si.getComponent(i,j)].name))sum+=sw.getComponent(i,j);return sum>.98;};
 for(let k=0;k<(ix?.count||g.attributes.position.count);k+=3){const ids=[0,1,2].map(j=>ix?ix.getX(k+j):k+j);if(ids.every(body))faces.push(ids);}meshes.push({m,faces});});
 return()=>{let hits=[];const at=n=>e.model.getObjectByName(n).getWorldPosition(new Vector3());for(const {m,faces}of meshes){m.skeleton.update();const verts=new Map();const pos=i=>{if(!verts.has(i))verts.set(i,m.getVertexPosition(i,new Vector3()).applyMatrix4(m.matrixWorld));return verts.get(i);};
 for(const side of ['L','R'])for(const [a,b]of [['LowerArm','Wrist'],['Wrist','Middle4'],['Wrist','Index4'],['Wrist','Pinky4']]){const from=at(a+side),to=at(b+side),d=to.clone().sub(from),len=d.length(),ray=new Ray(from,d.normalize());for(const ids of faces){const p=ray.intersectTriangle(...ids.map(pos),false,new Vector3());if(p&&p.distanceTo(from)<len-.002&&p.distanceTo(from)>.002){hits.push(side+a);break;}}}}
 return [...new Set(hits)];};}
