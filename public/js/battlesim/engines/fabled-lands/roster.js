import { createRosterLoader } from '../../roster-data.js';

export let WAR_TORN_FIGHTS = [];
export const loadRoster = createRosterLoader(674, 'FIGHTS', rows => { WAR_TORN_FIGHTS = rows; });
