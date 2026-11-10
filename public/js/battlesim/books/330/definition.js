// Identify The Dungeons of Torgar and load its printed encounters from the catalog.
import {createMagnakaiRosterLoader} from '../../engines/lone-wolf/magnakai-catalog.js';

export const definition = Object.freeze({
  id: 330, title: 'The Dungeons of Torgar', family: 'lone-wolf', stateKey: 'sim330', i18nPrefix: 'battlesim330',
  supportsArchery: false, enduranceStep: 0.5, allowPriorRounds: true,
  controls: [['animal','nextAnimal'],['tracking','nextTracking'],['spirit','nextSpirit'],
    ['unarmedMastery','nextUnarmedMastery'],['weapon','nextWeapon']],
});
export let ENCOUNTERS = [];
export let ENCOUNTER_RULES = {};
export let COMBAT_TABLE = [];
export const loadRoster = createMagnakaiRosterLoader(definition, catalog => {
  COMBAT_TABLE = catalog.table;
  ENCOUNTERS = catalog.encounters;
  ENCOUNTER_RULES = catalog.rules;
});
