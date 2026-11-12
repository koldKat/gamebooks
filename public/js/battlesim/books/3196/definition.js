// Book identity and API-backed encounter presets.
import {createRosterLoader} from '../../roster-data.js';

export const definition = Object.freeze({id:3196, title:'Отмъщението на гоблина',
  family:'usborne-adventure', stateKey:'sim3196', i18nPrefix:'battlesim3196'});
export let ENCOUNTERS = [];
export const loadRoster = createRosterLoader(3196, 'ENCOUNTERS', rows => { ENCOUNTERS = rows; });
export const encounterFor = key => ENCOUNTERS.find(row => row.key === String(key)) ?? null;
