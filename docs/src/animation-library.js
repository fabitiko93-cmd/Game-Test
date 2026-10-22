import {ANIMATION_STORAGE,emptyAnimation,parseAnimation,validateAnimation} from './animation-document.js';

const ACTIVE=ANIMATION_STORAGE+'-active';
let document=emptyAnimation(),revision=0,loaded=false;
export function appliedAnimation(){
  if(!loaded){loaded=true;try{const saved=globalThis.localStorage?.getItem(ACTIVE);if(saved)document=parseAnimation(saved);}catch(_){/* Export/import remains available without browser storage. */}}
  return{document,revision};
}
export function applyAnimation(documentInput,storage=globalThis.localStorage){
  const next=validateAnimation(documentInput);
  if(!storage)throw Error('Speichern ist nicht verfügbar. Entwurf bitte exportieren.');
  storage.setItem(ACTIVE,JSON.stringify(next));document=next;revision++;loaded=true;
  return revision;
}
