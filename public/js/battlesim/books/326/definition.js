// Load this book's reviewed encounters and printed combat chart from the catalog.
import {createMagnakaiRosterLoader} from '../../engines/lone-wolf/magnakai-catalog.js';

export const definition = Object.freeze({id: 326, title: 'The Kingdoms of Terror',
  family: 'lone-wolf', stateKey: 'sim326', i18nPrefix: 'battlesim326'});
export let ENCOUNTERS = [];
export let ENCOUNTER_RULES = {};
export let COMBAT_TABLE = [];
export const loadRoster = createMagnakaiRosterLoader(definition, catalog => {
  COMBAT_TABLE = catalog.table;
  ENCOUNTERS = catalog.encounters;
  ENCOUNTER_RULES = catalog.rules;
});
