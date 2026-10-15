import { Group } from "three";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import { FURNITURE_MODELS, QUATERNIUS_MODELS, furnishingDimensions } from "./quaternius-catalog.js";
import { heightPixels, pixelsPerMeter } from "./world-scale.js";

export class WorldModels {
  constructor(pass, library, { createCanvas = () => document.createElement("canvas") } = {}) {
    this.pass=pass; this.library=library; this.createCanvas=createCanvas; this.cache=new Map();
    this.ready=Promise.all([...new Set([...Object.values(FURNITURE_MODELS).map(x=>x.asset),"Door_1"])].map(key=>library.request(key)));
  }

  model(type, locked = false) {
    const definition=FURNITURE_MODELS[type]; if(!definition) return null;
    const asset=this.library.get(definition.asset); if(!asset) return null;
    const root=new Group(),size=QUATERNIUS_MODELS.interiors[definition.asset].dimensions;
    const count=definition.count||1;
    for(let i=0;i<count;i++){const part=clone(asset.scene);part.position.x=(i-(count-1)/2)*size.width;part.position.z=definition.front?-.035:0;root.add(part);}
    if(definition.front&&(type==="locker"||locked)) {
      const door=this.library.get("Door_1");if(!door)return null;
      const front=clone(door.scene);front.scale.set(size.width/.86,size.height/1.985,1);
      front.position.z=size.depth/2;root.add(front);
    }
    return root;
  }

  draw(ctx, object, point) {
    if(!FURNITURE_MODELS[object.type])return false;
    const yaw=object.orientation==="y"?-Math.PI/2:0;
    return this.cached(ctx,`${object.type}-${Boolean(object.locked)}-${yaw}`,()=>this.model(object.type,object.locked),point,yaw,furnishingDimensions(object.type));
  }

  drawDoor(ctx, object, point, yaw) {
    return this.cached(ctx,`door-${yaw}`,()=>{const asset=this.library.get("Door_1");return asset?clone(asset.scene):null;},point,yaw,QUATERNIUS_MODELS.interiors.Door_1.dimensions);
  }

  cached(ctx,key,create,point,yaw,size) {
    const ratio=this.pass.pixelRatio||1,cacheKey=`${key}-${ratio}`;
    let cached=this.cache.get(cacheKey);
    if(!cached) {
      const root=create();if(!root)return false;root.rotation.y=yaw;
      const meters=Math.max(3.2,Math.hypot(size.width,size.depth)+.3,size.height*1.25+.5);
      const width=Math.ceil(meters*pixelsPerMeter*ratio),logical=width/ratio;
      const canvas=this.createCanvas();canvas.width=width;canvas.height=width;
      const surface=canvas.getContext("2d");surface.setTransform(ratio,0,0,ratio,0,0);
      const anchor={x:logical/2,y:logical/2+heightPixels(size.height/2)};
      this.pass.draw(surface,root,anchor,{software:true,viewMeters:meters,centerHeight:size.height/2});
      cached={canvas,size:logical,anchor};this.cache.set(cacheKey,cached);
      // Static geometry is rendered once at the actual device resolution.
      // A DPR change gets fresh images; retain at most the current/last set.
      if(this.cache.size>80)this.cache.delete(this.cache.keys().next().value);
    }
    ctx.drawImage(cached.canvas,point.x-cached.anchor.x,point.y-cached.anchor.y,cached.size,cached.size);return true;
  }
}
