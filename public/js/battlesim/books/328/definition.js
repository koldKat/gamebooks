// Identify The Jungle of Horrors and load its reviewed encounters from the catalog.
import {createMagnakaiRosterLoader} from '../../engines/lone-wolf/magnakai-catalog.js';

export const definition = Object.freeze({
  id: 328, title: 'The Jungle of Horrors', family: 'lone-wolf', stateKey: 'sim328', i18nPrefix: 'battlesim328',
  supportsArchery: false, enduranceStep: 0.5, allowPriorRounds: true,
  controls: [['animal','nextAnimal'],['tracking','nextTracking'],['screen','nextScreen'],
    ['curingPrimate','nextCuringPrimate'],['nexusPrimate','nextNexusPrimate'],
    ['unarmedMastery','nextUnarmedMastery'],['spirit','nextSpirit'],['sommerwerd','nextSommerwerd']],
});
export let ENCOUNTERS = [];
export let ENCOUNTER_RULES = {};
export let COMBAT_TABLE = [];
export const loadRoster = createMagnakaiRosterLoader(definition, catalog => {
  COMBAT_TABLE = catalog.table;
  ENCOUNTERS = catalog.encounters;
  ENCOUNTER_RULES = catalog.rules;
});
