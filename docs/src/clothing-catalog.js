// Each visible starting garment has its own persistent item type. A source
// model identifies its original cut/colour; fitting to the other rig keeps it.
const outfits=[
  ['male-Casual_2',['tshirt_grey','Graues T-Shirt'],['jeans_dark','Dunkle Jeans'],['sneakers_red','Rote Turnschuhe']],
  ['male-Casual_Hoodie',['hoodie_purple','Violetter Kapuzenpullover'],['denim_shorts','Jeansshorts'],['sneakers_purple','Violette Turnschuhe']],
  ['male-Worker',['work_vest_m','Warnweste mit grauem Arbeitsshirt'],['work_trousers_m','Ockerfarbene Arbeitshose'],['work_boots_m','Schwarze Arbeitsschuhe']],
  ['male-Farmer',['farm_shirt','Landarbeiter-Oberteil mit Latz'],['dungarees','Blaue Arbeitshose'],['farm_boots','Braune Arbeitsstiefel']],
  ['male-Adventurer',['outdoor_shirt','Olivgrünes Outdoorhemd'],['cargo_trousers','Beige Cargohose'],['hiking_boots_m','Dunkle Wanderstiefel']],
  ['male-Suit',['suit_jacket','Anzugjacke mit Krawatte'],['suit_trousers_m','Dunkle Anzughose'],['dress_shoes_m','Schwarze Anzugschuhe']],
  ['male-Punk',['punk_vest','Schwarze Weste mit T-Shirt'],['ripped_jeans_m','Zerrissene blaue Jeans'],['punk_boots_m','Schwarze Schnürstiefel']],
  ['male-Swat',['tactical_top','Einsatzoberteil mit Schutzweste'],['tactical_trousers','Einsatzhose mit Knieschonern'],['tactical_boots','Schwarze Einsatzstiefel']],
  ['female-Casual',['tshirt_white','Weißes T-Shirt'],['trousers_rust','Rostbraune Stoffhose'],['casual_shoes_f','Dunkle Freizeitschuhe']],
  ['female-Worker',['work_vest_f','Warnweste mit weißem Arbeitsshirt'],['work_trousers_f','Braune Arbeitshose'],['work_shoes_f','Dunkle Arbeitsschuhe']],
  ['female-Adventurer',['outdoor_top','Grünes Outdooroberteil'],['outdoor_shorts','Olivgrüne Outdoorshorts'],['hiking_boots_f','Hohe Wanderstiefel']],
  ['female-Formal',['formal_top','Grünes Ausgehoberteil'],['skirt_green','Grüner Rock'],['flats_red','Rote Ballerinas']],
  ['female-Suit',['blazer_black','Schwarzer Blazer mit Bluse'],['suit_trousers_f','Schwarze Stoffhose'],['dress_shoes_f','Schwarze Halbschuhe']],
  ['female-Punk',['punk_top','Violettes Oberteil mit schwarzem Top'],['ripped_jeans_f','Zerrissene schwarze Jeans'],['punk_boots_f','Schwarze Stiefeletten']],
  ['female-Soldier',['military_top','Dunkles Oberteil mit Schutzweste'],['military_trousers','Graue Einsatzhose mit Knieschonern'],['military_boots','Hohe Einsatzstiefel']],
];
const stats={torso:{protection:.12,weight:1.05,condition:80},legs:{protection:.1,weight:.72,condition:85},feet:{protection:0,weight:.65,condition:85}};
export const CLOTHING_ITEMS=Object.freeze(Object.fromEntries(outfits.flatMap(([model,...parts])=>parts.map(([type,name],i)=>{
  const slot=['torso','legs','feet'][i];return [type,{name,short:name,type:'clothing',icon:'clothing',equipSlot:slot,stack:1,...stats[slot],clothingModel:model,
    description:`${name}. Einzeln an- und ablegbar.`}];
})).concat([
  ['hard_hat',{name:'Gelber Bauhelm',short:'Bauhelm',type:'clothing',icon:'clothing',equipSlot:'head',stack:1,condition:85,weight:.4,protection:.12,clothingModel:'male-Worker',description:'Gelber Bauhelm. Begrenzter Schutz für den Kopf.'}],
  ['farm_hat',{name:'Breiter Arbeitshut',short:'Arbeitshut',type:'clothing',icon:'clothing',equipSlot:'head',stack:1,condition:80,weight:.15,protection:0,clothingModel:'male-Farmer',description:'Breiter Hut mit rotem Hutband. Kein nennenswerter Bissschutz.'}],
  ['tactical_helmet',{name:'Einsatzhelm mit Visier',short:'Einsatzhelm',type:'clothing',icon:'clothing',equipSlot:'head',stack:1,condition:88,weight:1.3,protection:.42,clothingModel:'male-Swat',description:'Dunkler Einsatzhelm mit Gesichtsschutz.'}],
])));

export const CLOTHING_LOOT=Object.keys(CLOTHING_ITEMS).map(type=>[type,.035,1,1]);
export const HEADWEAR_MODELS=new Set(['male-Worker','female-Worker','male-Farmer','male-Swat']);
export const BODY_SOURCES={male:{torso:'male-Beach',legs:'male-Beach',feet:'male-Beach'},female:{torso:'female-Formal',legs:'male-Beach',feet:'male-Beach'}};

export const CHARACTER_HEADS={
  male:{Casual_2:'Braun · Zopf',Casual_Hoodie:'Braun · Kurz',Adventurer:'Braun · Bart',Suit:'Braun · Seitenscheitel',Punk:'Rot · Irokesenschnitt'},
  female:{Casual:'Blond · Bob',Adventurer:'Braun · Zurückgebunden',Formal:'Rot · Zurückgebunden',Punk:'Violett · Irokesenschnitt',Soldier:'Braun · Geflochten'},
};

// Keep inventory pictures and the worn part on the same source model, including
// the older generic clothing items. New named garments keep their original cut.
export function clothingModelFor(item,definition,sex='male') {
  if(definition?.clothingModel)return definition.clothingModel;
  const styles={work_jacket:'Worker',leather_jacket:'Punk',jeans:sex==='female'?'Casual':'Casual_2'};
  const style=styles[item?.type]||(['outfit_top','outfit_trousers'].includes(item?.type)?item.modelStyle||(sex==='female'?'Casual':'Casual_2'):null);
  return style?`${sex}-${style}`:null;
}
