import { BoxGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial } from "three";

const wood=new MeshStandardMaterial({color:0x755238,roughness:.9});
const steel=new MeshStandardMaterial({color:0x4a5050,roughness:.65});
const dark=new MeshStandardMaterial({color:0x272d2e,roughness:.8});

// Existing equipment without a matching pack asset keeps a distinct, metre-sized
// silhouette. WristR's local Z runs from the grip toward the held tool's tip.
export function heldEquipment(type) {
  const root=new Group();root.name=type;
  const box=(x,y,z,cx,cy,cz,material)=>{
    const mesh=new Mesh(new BoxGeometry(x,y,z),material);mesh.position.set(cx,cy,cz);root.add(mesh);return mesh;
  };
  const shaft=(length,radius,z,material=wood)=>{
    const mesh=new Mesh(new CylinderGeometry(radius,radius,length,7),material);
    mesh.rotation.x=Math.PI/2;mesh.position.z=z;root.add(mesh);return mesh;
  };
  if(type==="baseball_bat") {
    shaft(.32,.014,.04);shaft(.5,.034,.45);
  } else if(type==="hammer"||type==="axe") {
    const axe=type==="axe",length=axe?.65:.3;
    shaft(length,axe?.018:.014,length/2-.06);
    box(axe?.2:.14,axe?.035:.045,axe?.12:.055,.035,0,length-.1,steel);
  } else if(type==="shotgun_12g"||type==="hunting_rifle") {
    const shotgun=type==="shotgun_12g";
    box(.055,.095,.3,0,0,-.16,wood);box(.06,.06,.3,0,0,.12,dark);
    shaft(.58,.014,.45,steel);
    if(shotgun){const barrel=shaft(.58,.014,.45,steel);barrel.position.x=.027;}
    box(.055,.045,.26,0,-.018,.31,wood);
  } else return null;
  return root;
}
