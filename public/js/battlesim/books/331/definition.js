// Identify The Prisoners of Time and load its printed encounters from the catalog.
import {createMagnakaiRosterLoader} from '../../engines/lone-wolf/magnakai-catalog.js';

export const definition = Object.freeze({
  id: 331, title: 'The Prisoners of Time', family: 'lone-wolf', stateKey: 'sim331', i18nPrefix: 'battlesim331',
  supportsArchery: false, allowPriorRounds: true,
  controls: [['tracking','nextTracking'],['unarmedMastery','nextUnarmedMastery'],
    ['scion','nextScion'],['curingMentora','nextCuringMentora'],['awkwardWeapon','nextAwkwardWeapon'],
    ['spirit','nextSpirit'],['psychicRing','nextPsychicRing'],['greyRing','nextGreyRing'],['visitedTomb','nextVisitedTomb']],
  numericControls: [['extraDisciplines','nextExtraDisciplines',0,7]],
});
export let ENCOUNTERS = [];
export let ENCOUNTER_RULES = {};
export let COMBAT_TABLE = [];
export const loadRoster = createMagnakaiRosterLoader(definition, catalog => {
  COMBAT_TABLE = catalog.table;
  ENCOUNTERS = catalog.encounters;
  ENCOUNTER_RULES = catalog.rules;
});
