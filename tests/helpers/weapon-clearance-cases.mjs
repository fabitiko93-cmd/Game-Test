const pistols=['pistol_9mm','usp_9mm','scorpion_45','desert_eagle_50'];
const scenarios=[
 {track:'toAim',movement:'crouch'},{track:'toCarry',movement:'crouch'},
 {track:'toAim',movement:'crouchWalk'},{track:'toCarry',movement:'crouchWalk'},
 {track:'reload',movement:'walk'},{track:'reload',movement:'crouch'},
 {scenario:'transitions'},{scenario:'interrupt'},
];

export function* pistolClearanceCases(rates=[15,30,60]){
 for(const sex of ['male','female'])for(const type of pistols)for(const scenario of scenarios)for(const fps of rates){
  yield {sex,type,...scenario,fps};
 }
}
