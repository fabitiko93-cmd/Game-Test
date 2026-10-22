import {BufferGeometry,Float32BufferAttribute,Mesh,MeshStandardMaterial} from 'three';

// Authored low-poly ammunition, in metres. Open case mouths, extraction rims,
// primers and bottle necks are modelled; no projectile is left on spent cases.
// Dimensions are visual approximations, not manufacturing specifications.
export const CARTRIDGES=Object.freeze({
  ammo_9mm:{caseLength:.019,radius:.0049,neck:.0048,total:.029,impact:1},
  ammo_45:{caseLength:.023,radius:.006,neck:.0057,total:.032,impact:1.05},
  ammo_44:{caseLength:.033,radius:.0061,neck:.0057,total:.041,impact:1.15,rim:true},
  ammo_50ae:{caseLength:.033,radius:.0069,neck:.0064,total:.041,impact:1.25},
  ammo_556x45:{caseLength:.045,radius:.0048,neck:.0031,total:.057,impact:1.05,bottle:true},
  ammo_762x39:{caseLength:.039,radius:.0057,neck:.0042,total:.056,impact:1.15,bottle:true},
});
const cache=new Map(),material=new MeshStandardMaterial({vertexColors:true,roughness:.45,metalness:.25});
export function cartridgeData(type='ammo_9mm',spent=true){
  const key=`${type}|${spent}`;if(cache.has(key))return cache.get(key);
  const def=CARTRIDGES[type]||CARTRIDGES.ammo_9mm,L=def.caseLength,R=def.radius,N=def.neck;
  const rings=[[0,R*(def.rim?1.12:1)],[.001,R*(def.rim?1.12:1)],[.0015,R*.87],[.0025,R],
    [def.bottle?L*.72:L,R*.95],...(def.bottle?[[L*.84,N],[L,N]]:[])];
  if(spent)rings.push([L,N*.8],[L-.003,N*.8]);
  else rings.push([L,N*.92],[def.total-.004,N*.86],[def.total-.001,N*.45],[def.total,0]);
  const positions=[],colors=[],sides=10;
  const add=(a,b,c,color)=>{positions.push(...a,...b,...c);for(let i=0;i<3;i++)colors.push(...color);};
  const at=(ring,i)=>{const t=i/sides*Math.PI*2;return[Math.cos(t)*ring[1],Math.sin(t)*ring[1],ring[0]-L/2];};
  for(let j=0;j<rings.length-1;j++)for(let i=0;i<sides;i++){
    const a=at(rings[j],i),b=at(rings[j],i+1),c=at(rings[j+1],i),d=at(rings[j+1],i+1);
    const color=spent&&j>=rings.length-2?[.11,.075,.026]:!spent&&rings[j][0]>=L?[.42,.19,.09]:[.53,.34,.10];
    add(a,b,c,color);add(b,d,c,color);
  }
  for(let i=0;i<sides;i++)add([0,0,-L/2],at(rings[0],i+1),at(rings[0],i),[.40,.27,.09]);
  if(spent)for(let i=0;i<sides;i++)add([0,0,L/2-.003],at(rings.at(-1),i),at(rings.at(-1),i+1),[.065,.045,.015]);
  const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute(positions,3));geometry.setAttribute('color',new Float32BufferAttribute(colors,3));geometry.computeVertexNormals();
  const data={geometry,positions,colors,length:spent?L:def.total,radius:R,definition:def};cache.set(key,data);return data;
}
export function cartridgeMesh(type,spent=false){return new Mesh(cartridgeData(type,spent).geometry,material);}
