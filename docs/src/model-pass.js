import { Color, DirectionalLight, DoubleSide, HemisphereLight, NoToneMapping, OrthographicCamera,
  Scene, SRGBColorSpace, Vector3, WebGLRenderer } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { gunzipSync } from "three/addons/libs/fflate.module.js";
import { heightPixels, pixelsPerMeter } from "./world-scale.js";

export async function loadModelAsset(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
  const compressed = new Uint8Array(await response.arrayBuffer());
  const bytes = compressed[0] === 31 && compressed[1] === 139 ? gunzipSync(compressed) : compressed;
  return new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset+bytes.byteLength), new URL(".", url).href);
}

// One WebGL context for zombies, the player and cached furnishings. The camera
// always uses the same metre scale and elevation as the surrounding 2:1 world.
export class ModelPass {
  constructor({ createRenderer = options => new WebGLRenderer(options) } = {}) {
    this.status = "ready"; this.pixelRatio = 1;
    this.scene = new Scene();
    this.camera = new OrthographicCamera(-1.6, 1.6, 1.6, -1.6, .1, 30);
    this.scene.add(new HemisphereLight(0xe7eadb, 0x454537, 2));
    const sun = new DirectionalLight(0xffedcf, 2.1); sun.position.set(-3, 7, 4); this.scene.add(sun);
    try {
      this.renderer = createRenderer({ alpha: true, antialias: true, powerPreference: "high-performance" });
      this.renderer.setClearColor(0x000000, 0);
      this.renderer.outputColorSpace = SRGBColorSpace; this.renderer.toneMapping = NoToneMapping;
      this.renderer.domElement.addEventListener("webglcontextlost", event => { event.preventDefault(); this.status = "context-lost"; });
      this.renderer.domElement.addEventListener("webglcontextrestored", () => { this.status = "ready"; });
    } catch (error) { this.status = "unavailable"; }
  }

  beginFrame(pixelRatio) { this.pixelRatio = pixelRatio; this.setView(); }

  setView(viewMeters = 3.2, centerHeight = .95) {
    const size = Math.ceil(viewMeters*pixelsPerMeter*this.pixelRatio)/this.pixelRatio;
    if (this.size === size && this.centerHeight === centerHeight && this.deviceRatio === this.pixelRatio) return;
    this.size = size; this.centerHeight = centerHeight; this.deviceRatio = this.pixelRatio;
    this.renderer?.setPixelRatio(this.pixelRatio); this.renderer?.setSize(size, size, false);
    this.anchor = { x: size/2, y: size/2+heightPixels(centerHeight) };
    const extent = size/pixelsPerMeter/2;
    Object.assign(this.camera, { left: -extent, right: extent, top: extent, bottom: -extent });
    this.camera.position.set(Math.sqrt(.375)*10, centerHeight+5, Math.sqrt(.375)*10);
    this.camera.lookAt(0, centerHeight, 0); this.camera.updateProjectionMatrix(); this.camera.updateMatrixWorld(true);
  }

  draw(ctx, root, point, { hurt = false, software = false, viewMeters = 3.2, centerHeight = .95 } = {}) {
    this.setView(viewMeters, centerHeight);
    if (!this.renderer || this.status !== "ready") {
      if (!software) return false;
      this.drawSoftware(ctx, root, point, hurt); return true;
    }
    this.scene.add(root); this.renderer.clear(true, true, true); this.renderer.render(this.scene, this.camera);
    ctx.save(); if (hurt) ctx.globalAlpha *= .55;
    ctx.imageSmoothingEnabled = false;
    const x = Math.round((point.x-this.anchor.x)*this.pixelRatio)/this.pixelRatio;
    const y = Math.round((point.y-this.anchor.y)*this.pixelRatio)/this.pixelRatio;
    ctx.drawImage(this.renderer.domElement, x, y, this.size, this.size);
    ctx.restore(); this.scene.remove(root); return true;
  }

  drawSoftware(ctx, root, point, hurt = false) {
    // The new models use material colours. A canvas-only browser can therefore
    // draw their actual posed triangles, retaining clothing and animation.
    root.updateMatrixWorld(true);
    const faces = [], camera = new Vector3(Math.sqrt(.375), .5, Math.sqrt(.375));
    const light = new Vector3(-3, 7, 4).normalize(), normal = new Vector3(), edge = new Vector3();
    root.traverseVisible(mesh => {
      if (!mesh.isMesh) return;
      const geometry = mesh.geometry, positions = geometry.attributes.position, index = geometry.index;
      const vertices = Array.from({ length: positions.count }, (_, i) => mesh.getVertexPosition(i, new Vector3()).applyMatrix4(mesh.matrixWorld));
      const projected = vertices.map(v => {
        const p = v.clone().project(this.camera);
        return { x: point.x + p.x*this.size/2, y: point.y - p.y*this.size/2 - heightPixels(this.centerHeight) };
      });
      const count = index ? index.count : positions.count;
      for (let i=0; i<count; i+=3) {
        const ids = [0,1,2].map(k => index ? index.getX(i+k) : i+k), v = ids.map(k=>vertices[k]);
        let material = mesh.material;
        if (Array.isArray(material)) material = material[geometry.groups.find(group=>i>=group.start&&i<group.start+group.count)?.materialIndex || 0];
        normal.subVectors(v[1],v[0]).cross(edge.subVectors(v[2],v[0])).normalize();
        if (normal.dot(camera)<0) { if (material.side!==DoubleSide) continue; normal.negate(); }
        const shade = .64+.36*Math.max(0,normal.dot(light));
        const color = new Color().copy(material.color).multiplyScalar(shade).convertLinearToSRGB();
        faces.push({ points: ids.map(k=>projected[k]), depth: v.reduce((sum,p)=>sum+p.dot(camera),0),
          color: `rgb(${Math.round(color.r*255)},${Math.round(color.g*255)},${Math.round(color.b*255)})` });
      }
    });
    ctx.save(); if (hurt) ctx.globalAlpha *= .55;
    for (const face of faces.sort((a,b)=>a.depth-b.depth)) {
      ctx.fillStyle=face.color; ctx.beginPath();
      face.points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.fill();
    }
    ctx.restore();
  }
}
