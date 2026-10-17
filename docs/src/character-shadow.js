import { Vector3 } from "three";
import { cameraElevationSine, pixelsPerMeter } from "./world-scale.js";

// Cache a few vertices from each real sole, not a screen-space actor anchor.
// Only these probes are skinned each frame; clothing meshes are inspected once.
export function createSoleProbes(root, meshRoot = root) {
  root.updateMatrixWorld(true);
  const vertices = [];
  meshRoot.traverseVisible(mesh => {
    if (!mesh.isSkinnedMesh) return;
    for (let index = 0; index < mesh.geometry.attributes.position.count; index++) {
      const point = mesh.getVertexPosition(index, new Vector3()).applyMatrix4(mesh.matrixWorld);
      const weights=mesh.geometry.attributes.skinWeight,joints=mesh.geometry.attributes.skinIndex;
      let strongest=0;for(let k=1;k<4;k++)if(weights.getComponent(index,k)>weights.getComponent(index,strongest))strongest=k;
      vertices.push({ mesh, index, point: root.worldToLocal(point), bone:mesh.skeleton.bones[joints.getComponent(index,strongest)] });
    }
  });
  if (!vertices.length) return [];
  const minY = Math.min(...vertices.map(v => v.point.y));
  // A source rig may already lift one foot. Find both low leg chains first,
  // then select the bottom of each foot independently.
  const soles = vertices.filter(v => v.point.y < minY + .18 / root.scale.y);
  const bones=new Set(soles.map(v=>v.bone)),groups=new Map();
  for(const vertex of soles) {
    // Foot/toe joints share a leg; x-based splitting would mix feet in a
    // crossed or rotated rest pose and create a long streak during walking.
    let bone=vertex.bone;for(let parent=bone?.parent;parent;parent=parent.parent)if(bones.has(parent))bone=parent;
    if(!groups.has(bone))groups.set(bone,[]);groups.get(bone).push(vertex);
  }
  const bottom=foot=>Math.min(...foot.map(v=>v.point.y));
  const feet=[...groups.values()].sort((a,b)=>bottom(a)-bottom(b)).slice(0,2);
  return feet.map(vertices => {
    const min=bottom(vertices),foot=vertices.filter(v=>v.point.y<min+.035/root.scale.y);
    const selected = new Set();
    // Extremes around the sole retain heel/toe contact as the foot rolls.
    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 4) {
      const x = Math.cos(angle), z = Math.sin(angle);
      selected.add(foot.reduce((a, b) => a.point.x*x + a.point.z*z > b.point.x*x + b.point.z*z ? a : b));
    }
    return [...selected].map(({ mesh, index }) => ({ mesh, index }));
  });
}

export function sampleSoleContacts(probes) {
  return probes.map(foot => {
    const points = foot.map(({ mesh, index }) => mesh.getVertexPosition(index, new Vector3()).applyMatrix4(mesh.matrixWorld));
    const height = Math.min(...points.map(p => p.y));
    const low = points.filter(p => p.y < height + .025);
    const center = low.reduce((sum, p) => sum.add(p), new Vector3()).divideScalar(low.length);
    let heel = points[0], toe = points[0], length = 0;
    for (const a of points) for (const b of points) {
      const distance = Math.hypot(a.x-b.x, a.z-b.z);
      if (distance > length) { length = distance; heel = a; toe = b; }
    }
    const direction = new Vector3(toe.x-heel.x, 0, toe.z-heel.z).normalize();
    if (!direction.lengthSq()) direction.set(0, 0, 1);
    return { center, height, direction, length };
  });
}

export function projectGround(point, origin) {
  return { x: origin.x + (point.x-point.z)*pixelsPerMeter/Math.SQRT2,
    y: origin.y + (point.x+point.z)*pixelsPerMeter*cameraElevationSine/Math.SQRT2 };
}

function softPatch(ctx, origin, center, direction, length, width, alpha) {
  const p = projectGround(center, origin), side = { x: -direction.z, z: direction.x };
  const u = projectGround(direction, { x: 0, y: 0 }), v = projectGround(side, { x: 0, y: 0 });
  ctx.save();
  ctx.transform(u.x*length, u.y*length, v.x*width, v.y*width, p.x, p.y);
  const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  gradient.addColorStop(0, `rgba(0,0,0,${alpha})`);
  gradient.addColorStop(.35, `rgba(0,0,0,${alpha*.65})`);
  gradient.addColorStop(.75, `rgba(0,0,0,${alpha*.15})`);
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = gradient; ctx.fillRect(-1, -1, 2, 2); ctx.restore();
}

export function drawSoleShadows(ctx, contacts, origin, scale = 1) {
  for (const foot of contacts) {
    const lift = Math.max(0, foot.height-.025), alpha = .36*Math.exp(-lift*15);
    softPatch(ctx, origin, foot.center, foot.direction,
      Math.max(.12*scale, foot.length*.65) + lift*.2, .10*scale + lift*.15, alpha);
  }
}

// Loading/sprite fallback: soft metric footprint, rotated with the person.
export function drawFallbackShadow(ctx, origin, height = 1.8, yaw = 0, prone = false) {
  const scale = height/1.8;
  softPatch(ctx, origin, { x: 0, z: 0 }, { x: Math.sin(yaw), z: Math.cos(yaw) },
    (prone ? .85 : .25)*scale, (prone ? .25 : .22)*scale, prone ? .23 : .22);
}
