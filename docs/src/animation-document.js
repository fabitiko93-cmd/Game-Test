// Versioned, portable editing data. Positions are metres in the character's
// facing frame; rotations are degrees. Original mesh and animation assets stay intact.
export const ANIMATION_FORMAT='sperrkreis-animation';
export const ANIMATION_STORAGE='sperrkreis-animation-workshop-v1';
export const TRACKS={carry:'Tragen',aim:'Angelegt',hip:'Hüfte',crouchCarry:'Schleichstillstand',crouchAim:'Schleichend angelegt',toCarry:'Übergang zum Tragen',toAim:'Übergang zum Anlegen',toHip:'Übergang zur Hüfte',reload:'Nachladen',shot:'Schuss'};
export const CHANNELS={
  weapon:{label:'Waffe / Waffenhand',size:6,limit:[.30,.30,.30,90,90,90]},
  support:{label:'Stützhand',size:6,limit:[.30,.30,.30,90,90,90]},
  elbowR:{label:'Rechter Ellenbogen',size:3,limit:[.30,.30,.30]},
  elbowL:{label:'Linker Ellenbogen',size:3,limit:[.30,.30,.30]},
  chest:{label:'Brustkorb',size:3,limit:[35,35,35]},
  shoulderR:{label:'Rechte Schulter',size:3,limit:[35,35,35]},
  shoulderL:{label:'Linke Schulter',size:3,limit:[35,35,35]},
  head:{label:'Kopf',size:3,limit:[45,45,45]},
  fingersR:{label:'Finger rechts',size:1,limit:[.8]},
  fingersL:{label:'Finger links',size:1,limit:[.8]},
};
export const WEAPON_TYPES=['pistol_9mm','usp_9mm','scorpion_45','desert_eagle_50','revolver_44','ak_762','m4_556','vector_9mm'];
export const emptyAnimation=()=>({format:ANIMATION_FORMAT,version:1,profiles:{}});
export const emptyValues=()=>Object.fromEntries(Object.entries(CHANNELS).map(([name,c])=>[name,Array(c.size).fill(0)]));
export const profileKey=(sex,type)=>`${sex}:${type}`;
const copy=value=>JSON.parse(JSON.stringify(value));
const safeTime=t=>Math.round(Math.max(0,Math.min(1,t))*10000)/10000;

export function validateAnimation(input){
  if(!input||input.format!==ANIMATION_FORMAT||input.version!==1||!input.profiles||typeof input.profiles!=='object'||Array.isArray(input.profiles))throw Error('Unbekanntes Animationsformat.');
  const output=emptyAnimation();
  if(JSON.stringify(input).length>1500000)throw Error('Animationsprojekt ist zu groß.');
  if(Object.keys(input.profiles).length>16)throw Error('Zu viele Körper-/Waffenprofile.');
  for(const [key,profile] of Object.entries(input.profiles)){
    const [sex,type,...rest]=key.split(':');
    if(rest.length||!['male','female'].includes(sex)||!WEAPON_TYPES.includes(type)||!profile?.tracks||typeof profile.tracks!=='object')throw Error('Ungültiges Körper-/Waffenprofil.');
    const tracks={};
    for(const [name,frames]of Object.entries(profile.tracks)){
      if(!Object.hasOwn(TRACKS,name)||!Array.isArray(frames)||frames.length>120)throw Error('Ungültige Animationsspur.');
      let previous=-1;
      tracks[name]=frames.map(frame=>{
        if(!Number.isFinite(frame.time)||frame.time<0||frame.time>1||frame.time<=previous)throw Error('Schlüsselstellungen müssen zeitlich geordnet sein.');
        previous=frame.time;
        const values=emptyValues();
        if(!frame.values||typeof frame.values!=='object')throw Error('Schlüsselstellung ohne Pose.');
        for(const [channel,array]of Object.entries(frame.values)){
          const c=CHANNELS[channel];
          if(!c||!Array.isArray(array)||array.length!==c.size||array.some((v,i)=>!Number.isFinite(v)||Math.abs(v)>c.limit[i]+1e-8))throw Error('Pose enthält ungültige Werte.');
          values[channel]=array.slice();
        }
        return{time:frame.time,values};
      });
    }
    output.profiles[key]={tracks};
  }
  return output;
}

export function parseAnimation(text){
  if(typeof text!=='string'||text.length>1500000)throw Error('Animationsdatei ist zu groß.');
  return validateAnimation(JSON.parse(text));
}

export function sampleTrack(document,key,track,time){
  const frames=document?.profiles?.[key]?.tracks?.[track];
  if(!frames?.length)return emptyValues();
  time=Math.max(0,Math.min(1,time));
  if(time<=frames[0].time)return copy(frames[0].values);
  if(time>=frames.at(-1).time)return copy(frames.at(-1).values);
  const index=frames.findIndex(f=>f.time>=time),a=frames[index-1],b=frames[index];
  const u=(time-a.time)/(b.time-a.time),t=u*u*(3-2*u),values=emptyValues();
  for(const name of Object.keys(CHANNELS))values[name]=values[name].map((_,i)=>a.values[name][i]+(b.values[name][i]-a.values[name][i])*t);
  return values;
}

export function putFrame(document,key,track,time,values){
  const output=copy(document);time=safeTime(time);
  output.profiles[key]||={tracks:{}};
  const frames=output.profiles[key].tracks[track]||=[{time:0,values:emptyValues()},{time:1,values:emptyValues()}];
  const frame={time,values:copy(values)},index=frames.findIndex(f=>Math.abs(f.time-time)<.00001);
  if(index>=0)frames[index]=frame;else frames.push(frame);
  frames.sort((a,b)=>a.time-b.time);
  return validateAnimation(output);
}

export class AnimationProject{
  constructor(storage=null){this.storage=storage;this.document=emptyAnimation();this.saved=emptyAnimation();this.undoStack=[];this.redoStack=[];this.revision=0;this.error='';
    try{const text=storage?.getItem(ANIMATION_STORAGE);if(text)this.document=this.saved=parseAnimation(text);}catch(error){this.error=error.message;}
  }
  replace(document){const next=validateAnimation(document);this.undoStack.push(copy(this.document));if(this.undoStack.length>80)this.undoStack.shift();this.redoStack=[];this.document=next;this.revision++;}
  undo(){if(!this.undoStack.length)return false;this.redoStack.push(this.document);this.document=this.undoStack.pop();this.revision++;return true;}
  redo(){if(!this.redoStack.length)return false;this.undoStack.push(this.document);this.document=this.redoStack.pop();this.revision++;return true;}
  save(){if(!this.storage)throw Error('Lokales Speichern ist nicht verfügbar. Bitte exportieren.');this.storage.setItem(ANIMATION_STORAGE,JSON.stringify(this.document));this.saved=copy(this.document);this.error='';}
  serialize(){return JSON.stringify(this.document,null,2)+'\n';}
}
