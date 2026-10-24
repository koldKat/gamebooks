import { createRosterLoader } from '../../roster-data.js';

export let WONDERLAND_ENCOUNTERS = [];
export const loadRoster = createRosterLoader(636, 'ENCOUNTERS', rows => { WONDERLAND_ENCOUNTERS = rows; });
