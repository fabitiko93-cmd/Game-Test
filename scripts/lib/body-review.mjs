import {smoothBareBody} from '../../docs/src/character-abdomen.js';

// The review and the game now use the same approved abdominal surface.
export function previewBodySmoothing(entity,sex){
 return smoothBareBody(entity.clothing.torso,entity.clothing.legs,sex);
}
