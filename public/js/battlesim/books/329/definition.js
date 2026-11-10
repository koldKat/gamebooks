// Identify The Cauldron of Fear and load its printed encounters from the catalog.
import {createMagnakaiRosterLoader} from '../../engines/lone-wolf/magnakai-catalog.js';

export const definition = Object.freeze({
  id: 329, title: 'The Cauldron of Fear', family: 'lone-wolf', stateKey: 'sim329', i18nPrefix: 'battlesim329',
  supportsArchery: false, allowPriorRounds: true,
  controls: [['animal','nextAnimal'],['tracking','nextTracking'],['divination','nextDivination'],
    ['unarmedMastery','nextUnarmedMastery'],['sommerwerd','nextSommerwerd']],
});
export let ENCOUNTERS = [];
export let ENCOUNTER_RULES = {};
export let COMBAT_TABLE = [];
export const loadRoster = createMagnakaiRosterLoader(definition, catalog => {
  COMBAT_TABLE = catalog.table;
  ENCOUNTERS = catalog.encounters;
  ENCOUNTER_RULES = catalog.rules;
});
