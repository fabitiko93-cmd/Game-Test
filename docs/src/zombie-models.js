import { AnimationMixer, DirectionalLight, Group, HemisphereLight, LoopOnce,
  NoToneMapping, OrthographicCamera, Scene, SRGBColorSpace, WebGLRenderer } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import { gunzipSync } from "three/addons/libs/fflate.module.js";
import MODELS from "../assets/zombies3d/models.json" with { type: "json" };
import { ZombieMotion } from "./zombie-motion.js";
import { heightPixels, pixelsPerMeter } from "./world-scale.js";

const ASSETS = new URL("../assets/zombies3d/", import.meta.url);
const VIEW_METERS = 3.2, CENTER_HEIGHT = .95;

async function loadZombieAsset(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
  const compressed = new Uint8Array(await response.arrayBuffer());
  // Hosts may additionally advertise Content-Encoding and let fetch unpack it.
  const bytes = compressed[0] === 31 && compressed[1] === 139 ? gunzipSync(compressed) : compressed;
  return new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset+bytes.byteLength), ASSETS.href);
}

// Each live skeletal pose is rendered at native display resolution, then
// composited at its ordinary sorted depth. Walls, trees, roofs and night fog
// therefore cover a 3D person exactly as they cover other world drawables.
// This is a fresh WebGL render EVERY frame, not a sprite or a frame cache.
export class ZombieModels {
  constructor({ createRenderer = options => new WebGLRenderer(options), loadAsset = loadZombieAsset } = {}) {
    this.motion = new ZombieMotion(MODELS);
    this.assets = new Map(); this.entities = new Map(); this.used = new Set();
    this.status = "loading"; this.pixelRatio = 0;
    try {
      this.renderer = createRenderer({ alpha: true, antialias: true, powerPreference: "high-performance" });
      this.renderer.setClearColor(0x000000, 0);
      this.renderer.outputColorSpace = SRGBColorSpace;
      this.renderer.toneMapping = NoToneMapping;
      this.scene = new Scene();
      this.camera = new OrthographicCamera(-VIEW_METERS/2, VIEW_METERS/2, VIEW_METERS/2, -VIEW_METERS/2, .1, 30);
      this.camera.position.set(Math.sqrt(.375)*10, CENTER_HEIGHT+5, Math.sqrt(.375)*10);
      this.camera.lookAt(0, CENTER_HEIGHT, 0);
      this.scene.add(new HemisphereLight(0xe7eadb, 0x454537, 2));
      const sunlight = new DirectionalLight(0xffedcf, 2.1); sunlight.position.set(-3, 7, 4); this.scene.add(sunlight);
      this.renderer.domElement.addEventListener("webglcontextlost", event => {
        event.preventDefault(); this.status = "context-lost";
      });
      this.renderer.domElement.addEventListener("webglcontextrestored", () => { this.status = "ready"; });
      // Shared immutable geometry/textures, independent skeleton per entity.
      this.ready = Promise.all(MODELS.variants.map(async (model, variant) => {
        try {
          const asset = await loadAsset(new URL(model.file, ASSETS).href);
          asset.scene.traverse(object => { if (object.isMesh) object.frustumCulled = false; });
          this.assets.set(variant, asset);
        } catch (error) {
          console.warn(`Zombie-Modell ${variant} konnte nicht geladen werden.`, error);
        }
      })).then(() => { if (this.status === "loading") this.status = this.assets.size === 10 ? "ready" : "partial"; });
    } catch (error) {
      this.status = "unavailable"; this.ready = Promise.resolve();
      console.warn("3D-Darstellung nicht verfügbar; Sprite-Ersatz aktiv.", error);
    }
  }

  beginFrame(pixelRatio) {
    this.used.clear();
    if (!this.renderer || this.pixelRatio === pixelRatio) return;
    this.pixelRatio = pixelRatio;
    this.size = Math.ceil(VIEW_METERS*pixelsPerMeter*pixelRatio)/pixelRatio;
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(this.size, this.size, false);
    this.anchor = { x: this.size/2, y: this.size/2+heightPixels(CENTER_HEIGHT) };
    const extent = this.size/pixelsPerMeter/2;
    Object.assign(this.camera, { left: -extent, right: extent, top: extent, bottom: -extent });
    this.camera.updateProjectionMatrix();
  }

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
    entity = { root, mixer, actions, current: null, clip: null, lastAttackProgress: 0 };
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
    this.scene.add(entity.root);
    // Clear both color and depth; no temporal blending / motion blur.
    this.renderer.clear(true, true, true);
    this.renderer.render(this.scene, this.camera);
    ctx.save();
    if (zombie.hurtFlash > 0) ctx.globalAlpha *= .55;
    ctx.imageSmoothingEnabled = false;
    const x = Math.round((point.x-this.anchor.x)*this.pixelRatio)/this.pixelRatio;
    const y = Math.round((point.y-this.anchor.y)*this.pixelRatio)/this.pixelRatio;
    ctx.drawImage(this.renderer.domElement, x, y, this.size, this.size);
    ctx.restore();
    this.scene.remove(entity.root);
    return true;
  }

  endFrame() {
    for (const [zombie, entity] of this.entities) if (!this.used.has(zombie)) {
      entity.mixer.stopAllAction(); entity.mixer.uncacheRoot(entity.mixer.getRoot());
      entity.root.traverse(object => { if (object.isSkinnedMesh) object.skeleton.dispose(); });
      this.entities.delete(zombie);
    }
  }
}
