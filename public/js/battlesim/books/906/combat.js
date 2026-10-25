import {createCombat} from '../../engines/starship-traveller/combat.js';
import {CREW, COMPANIONS, OFFICERS, COMPANION_PRESETS, STARSHIP_RULES, encounterFor} from './definition.js';

export const {newCharacter, validateCharacter, recover, startFight, round, resolveReroll, resolveConflict, surrender}
  = createCombat({CREW, COMPANIONS, OFFICERS, encounterFor, getCompanionPresets: () => COMPANION_PRESETS, getRules: () => STARSHIP_RULES});
