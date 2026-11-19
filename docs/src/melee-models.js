import { BufferGeometry, Float32BufferAttribute, Mesh, MeshStandardMaterial } from 'three';
import models from '../assets/weapons/melee-models.json' with { type: 'json' };
import grips from '../assets/weapons/melee-grips.json' with { type: 'json' };

export const MELEE_GRIPS = grips;
const geometries = new Map();
const material = new MeshStandardMaterial({ vertexColors: true, roughness: .78 });

export function createMeleeModel(type, sex) {
  const source = models[type], grip = grips[type]?.[sex];
  if (!source || !grip) return null;
  if (!geometries.has(type)) {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(source.positions, 3));
    geometry.setAttribute('color', new Float32BufferAttribute(source.colors, 3));
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometries.set(type, geometry);
  }
  const model = new Mesh(geometries.get(type), material);
  model.name = type;
  model.position.fromArray(grip.position);
  model.quaternion.fromArray(grip.rotation);
  model.scale.fromArray(grip.scale);
  model.frustumCulled = false;
  return model;
}
