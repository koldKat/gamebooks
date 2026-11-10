// Identify Castle Death and load its reviewed encounters from the catalog.
import {createMagnakaiRosterLoader} from '../../engines/lone-wolf/magnakai-catalog.js';

export const definition = Object.freeze({
  id: 327, title: 'Castle Death', family: 'lone-wolf', stateKey: 'sim327', i18nPrefix: 'battlesim327',
  supportsArchery: false,
  controls: [['tracking','nextTracking'],['nexus','nextNexus'],['curing','nextCuring'],
    ['circleLight','nextCircleLight'],['cloth','nextCloth'],['invisibility','nextInvisibility']],
});
export let ENCOUNTERS = [];
export let ENCOUNTER_RULES = {};
export let COMBAT_TABLE = [];
export const loadRoster = createMagnakaiRosterLoader(definition, catalog => {
  COMBAT_TABLE = catalog.table;
  ENCOUNTERS = catalog.encounters;
  ENCOUNTER_RULES = catalog.rules;
});
