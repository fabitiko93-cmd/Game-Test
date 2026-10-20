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
    this.inspectionCamera = new OrthographicCamera(-1, 1, 1, -1, .1, 30);
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

  // Menus share the renderer, but have their own eye-level camera. Invalidate
  // the size cache afterwards so the next world pass restores its resolution.
  drawInspection(canvas, root, { height = 2.15, center = new Vector3(0,.9,0), elevation = 0 } = {}) {
    const rect=canvas.getBoundingClientRect(), ratio=Math.min(2,globalThis.devicePixelRatio||1);
    if(rect.width<1||rect.height<1)return null;
    const width=Math.round(rect.width*ratio),pixelsHeight=Math.round(rect.height*ratio);
    if(canvas.width!==width||canvas.height!==pixelsHeight){canvas.width=width;canvas.height=pixelsHeight;}
    const ctx=canvas.getContext('2d'),camera=this.inspectionCamera,half=height/2,aspect=width/pixelsHeight;
    Object.assign(camera,{left:-half*aspect,right:half*aspect,top:half,bottom:-half});
    camera.position.copy(center).add(new Vector3(0,Math.sin(elevation)*10,Math.cos(elevation)*10));
    camera.lookAt(center);camera.updateProjectionMatrix();camera.updateMatrixWorld(true);
    ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,width,pixelsHeight);
    root.updateMatrixWorld(true);
    if(this.renderer&&this.status==='ready'){
      this.renderer.setPixelRatio(ratio);this.renderer.setSize(rect.width,rect.height,false);
      this.scene.add(root);
      try {this.renderer.clear(true,true,true);this.renderer.render(this.scene,camera);ctx.drawImage(this.renderer.domElement,0,0,width,pixelsHeight);}
      finally {this.scene.remove(root);this.deviceRatio=null;}
    } else this.drawSoftware(ctx,root,{x:width/2,y:pixelsHeight/2},false,{camera,width,height:pixelsHeight,offsetY:0});
    return point=>{const p=point.clone().project(camera);return {x:(p.x+1)*rect.width/2,y:(1-p.y)*rect.height/2};};
  }

  drawSoftware(ctx, root, point, hurt = false, {camera=this.camera,width=this.size,height=this.size,offsetY=heightPixels(this.centerHeight)} = {}) {
    // The new models use material colours. A canvas-only browser can therefore
    // draw their actual posed triangles, retaining clothing and animation.
    root.updateMatrixWorld(true);
    const faces = [], direction = camera.getWorldDirection(new Vector3()).negate();
    const light = new Vector3(-3, 7, 4).normalize(), normal = new Vector3(), edge = new Vector3();
    root.traverseVisible(mesh => {
      if (!mesh.isMesh) return;
      const geometry = mesh.geometry, positions = geometry.attributes.position, index = geometry.index;
      const vertices = Array.from({ length: positions.count }, (_, i) => mesh.getVertexPosition(i, new Vector3()).applyMatrix4(mesh.matrixWorld));
      const projected = vertices.map(v => {
        const p = v.clone().project(camera);
        return { x: point.x + p.x*width/2, y: point.y - p.y*height/2 - offsetY };
      });
      const count = index ? index.count : positions.count;
      for (let i=0; i<count; i+=3) {
        const ids = [0,1,2].map(k => index ? index.getX(i+k) : i+k), v = ids.map(k=>vertices[k]);
        let material = mesh.material;
        if (Array.isArray(material)) material = material[geometry.groups.find(group=>i>=group.start&&i<group.start+group.count)?.materialIndex || 0];
        normal.subVectors(v[1],v[0]).cross(edge.subVectors(v[2],v[0])).normalize();
        if (normal.dot(direction)<0) { if (material.side!==DoubleSide) continue; normal.negate(); }
        const shade = .64+.36*Math.max(0,normal.dot(light));
        const color = new Color().copy(material.color), vertexColors=geometry.attributes.color;
        if(material.vertexColors&&vertexColors){
          const tint=new Color(0,0,0);
          for(const id of ids)tint.add(new Color(vertexColors.getX(id),vertexColors.getY(id),vertexColors.getZ(id)));
          color.multiply(tint.multiplyScalar(1/3));
        }
        color.multiplyScalar(shade).convertLinearToSRGB();
        faces.push({ points: ids.map(k=>projected[k]), depth: v.reduce((sum,p)=>sum+p.dot(direction),0),
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
