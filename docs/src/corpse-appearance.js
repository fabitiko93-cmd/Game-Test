import { createPlayerAppearance } from './quaternius-catalog.js';

// The placed people use the same authored body parts and death clip as survivors.
// No substitute uniform: choose only clothes actually present in the model pack.
export const HUMAN_CORPSE_PROFILES = Object.freeze({
  police: { sex:'male', head:'Casual_Hoodie', torso:'Swat', legs:'Swat', feet:'Swat', facingYaw:.65 },
  pharmacist: { sex:'female', head:'Casual', torso:'Casual', legs:'Suit', feet:'Suit', facingYaw:-1.05 },
  civilian: { sex:'male', head:'Casual_2', torso:'Casual_2', legs:'Casual_2', feet:'Casual_2', facingYaw:2.35 },
});

export function humanCorpseMetadata(corpse = {}) {
  if(corpse.zombieAppearance)return {};
  const named={POLIZIST:'police',APOTHEKERIN:'pharmacist'};
  const role=corpse.corpseRole||named[corpse.name]||'civilian';
  const profile=HUMAN_CORPSE_PROFILES[role]||HUMAN_CORPSE_PROFILES.civilian;
  return {corpseRole:role, facingYaw:corpse.facingYaw??profile.facingYaw,
    playerAppearance:corpse.playerAppearance||{...createPlayerAppearance(profile),bare:[],headwear:null}};
}
