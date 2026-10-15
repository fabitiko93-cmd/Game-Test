import { AnimationMixer, Box3, Group, LoopOnce } from "three";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import { ModelPass, loadModelAsset } from "./model-pass.js";
import MODELS from "../assets/zombies3d/models.json" with { type: "json" };
import { ZombieMotion, zombieModelYaw } from "./zombie-motion.js";
import { zombieBodyProfile } from "./zombie-appearance.js";

const ASSETS = new URL("../assets/zombies3d/", import.meta.url);

// Each live skeletal pose is rendered at native display resolution, then
// composited at its ordinary sorted depth. Walls, trees, roofs and night fog
// therefore cover a 3D person exactly as they cover other world drawables.
// This is a fresh WebGL render EVERY frame, not a sprite or a frame cache.
export class ZombieModels {
  constructor({ createRenderer, loadAsset = loadModelAsset } = {}) {
    this.motion = new ZombieMotion(MODELS);
    this.assets = new Map(); this.entities = new Map(); this.used = new Set();
    this.status = "loading"; this.pass = new ModelPass({ createRenderer });
    if (this.pass.renderer) {
      // Shared immutable geometry/textures, independent skeleton per entity.
      this.ready = Promise.all(MODELS.variants.map(async (model, variant) => {
        try {
          const asset = await loadAsset(new URL(model.file, ASSETS).href);
          asset.scene.traverse(object => { if (object.isMesh) object.frustumCulled = false; });
          this.assets.set(variant, asset);
        } catch (error) {
          console.warn(`Zombie-Modell ${variant} konnte nicht geladen werden.`, error);
        }
      })).then(() => { this.assetStatus = this.assets.size === 10 ? "ready" : "partial"; });
    } else {
      this.status = "unavailable"; this.ready = Promise.resolve();
      console.warn("3D-Darstellung nicht verfügbar; Sprite-Ersatz aktiv.");
    }
  }

  beginFrame(pixelRatio) {
    this.used.clear();
    this.pass.beginFrame(pixelRatio);
  }

  get renderer() { return this.pass.renderer; }
  get status() { return this.pass && this.pass.status !== "ready" ? this.pass.status : this.assetStatus; }
  set status(value) { this.assetStatus = value; }
  get scene() { return this.pass.scene; }
  get camera() { return this.pass.camera; }
  get size() { return this.pass.size; }
  get pixelRatio() { return this.pass.pixelRatio; }

  entity(zombie, pose, asset) {
    let entity = this.entities.get(zombie);
    if (entity) return entity;
    const model = clone(asset.scene), root = new Group(); root.add(model);
    const mixer = new AnimationMixer(model);
    const actions = new Map(asset.animations.map(clip => {
      const action = mixer.clipAction(clip).setEffectiveTimeScale(0);
      if (clip.name.startsWith("attack")) { action.setLoop(LoopOnce, 1); action.clampWhenFinished = true; }
      return [clip.name, action];
    }));
    entity = { root, model, mixer, actions, current: null, clip: null, lastAttackProgress: 0 };
    this.entities.set(zombie, entity);
    return entity;
  }

  draw(ctx, zombie, time, point) {
    const pose = this.motion.sample(zombie, time), asset = this.assets.get(pose.variant);
    if (!asset || !this.renderer || ["context-lost", "unavailable"].includes(this.status)) return false;
    const entity = this.entity(zombie, pose, asset); this.used.add(zombie);
    const action = entity.actions.get(pose.clip);
    if (entity.clip !== pose.clip) {
      action.reset().setEffectiveTimeScale(0).setEffectiveWeight(1).play();
      if (entity.current) entity.current.crossFadeTo(action, pose.clip.startsWith("attack") ? .10 : .20, false);
      entity.current = action; entity.clip = pose.clip;
    }
    action.time = pose.progress*action.getClip().duration;
    entity.mixer.update(pose.delta);
    // Stop zero-weight old actions so successive blends cannot accumulate.
    for (const other of entity.actions.values()) if (other !== action && other.getEffectiveWeight() === 0) other.stop();
    entity.root.scale.setScalar(pose.scale);
    entity.root.rotation.y = pose.yaw;
    this.composite(ctx, entity.root, point, zombie.hurtFlash > 0);
    return true;
  }

  drawCorpse(ctx, corpse, point) {
    const appearance = corpse.zombieAppearance, body = zombieBodyProfile(appearance);
    const asset = this.assets.get(body.variant);
    if (!asset || !this.renderer || ["context-lost", "unavailable"].includes(this.status)) return false;
    const entity = this.entity(corpse, null, asset); this.used.add(corpse);
    if (!entity.corpse) {
      // The supplied pack has no death clip. Lay its real, frozen rest skeleton
      // on its back; retain the same mesh, texture, size and heading.
      const action = entity.actions.get("rest");
      action.reset().play(); entity.mixer.update(0);
      entity.model.rotation.x = -Math.PI/2;
      entity.root.rotation.y = zombieModelYaw(appearance);
      entity.root.scale.setScalar(body.scale);
      entity.root.updateMatrixWorld(true);
      const bounds = new Box3().setFromObject(entity.root, true);
      if (!bounds.isEmpty()) entity.root.position.set(
        -(bounds.min.x+bounds.max.x)/2, -bounds.min.y, -(bounds.min.z+bounds.max.z)/2);
      entity.root.updateMatrixWorld(true);
      entity.corpse = true;
    }
    this.composite(ctx, entity.root, point);
    return true;
  }

  composite(ctx, root, point, hurt = false) {
    this.pass.draw(ctx, root, point, { hurt });
  }

  endFrame() {
    for (const [zombie, entity] of this.entities) if (!this.used.has(zombie)) {
      entity.mixer.stopAllAction(); entity.mixer.uncacheRoot(entity.mixer.getRoot());
      entity.root.traverse(object => { if (object.isSkinnedMesh) object.skeleton.dispose(); });
      this.entities.delete(zombie);
    }
  }
}
