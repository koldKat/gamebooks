import {createDestinyRosterFight} from './legion.js';
import {HEART_ABILITIES} from './heart-abilities.js';

export const HEART_BOOK_RULES=Object.freeze({deathMoves:false,deathPenalties:false});

// Encounter identities, stats and exceptions come from the database roster.
// No application entry is registered until the complete book is ready.
export function createHeartFight(hero,section,options={}){
  const fight=createDestinyRosterFight(hero,section,{...options,catalog:HEART_ABILITIES,bookRules:HEART_BOOK_RULES});
  fight.encounter.sourceBookId=1287;
  return fight;
}
