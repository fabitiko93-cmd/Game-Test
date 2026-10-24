// Browser-only reference and small device-local thumbnails; never game assets.
export class WorkshopReference{
  constructor(image,storage){this.image=image;this.storage=storage;this.thumbnails={};try{const input=JSON.parse(storage?.getItem('sperrkreis-workshop-thumbnails')||'{}');if(input&&typeof input==='object'&&!Array.isArray(input))this.thumbnails=Object.fromEntries(Object.entries(input).filter(([,v])=>typeof v==='string'&&/^data:image\/(webp|png);base64,/.test(v)));}catch(_){} }
  load(file){if(!file||!file.type.startsWith('image/'))throw Error('Bitte ein Bild auswählen.');if(file.size>15000000)throw Error('Referenzbild ist zu groß (maximal 15 MB).');this.clear();this.url=URL.createObjectURL(file);this.image.src=this.url;this.image.hidden=false;}
  clear(){if(this.url)URL.revokeObjectURL(this.url);this.url=null;this.image.removeAttribute('src');this.image.hidden=true;}
  capture(key,canvas){
    const preview=document.createElement('canvas');preview.width=112;preview.height=112;const ctx=preview.getContext('2d');
    const size=Math.min(canvas.width,canvas.height);ctx.drawImage(canvas,(canvas.width-size)/2,(canvas.height-size)/2,size,size,0,0,112,112);
    this.thumbnails[key]=preview.toDataURL('image/webp',.65);
    try{this.storage?.setItem('sperrkreis-workshop-thumbnails',JSON.stringify(this.thumbnails));}catch(_){/* Pose data is saved independently of optional thumbnails. */}
  }
}
