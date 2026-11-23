import {createRosterLoader} from '../../roster-data.js';

export const definition = Object.freeze({
  id:32, title:'Кървав сняг', family:'bloody-snow', stateKey:'sim32', i18nPrefix:'battlesim32',
});
export const roster = {setup:null, encounters:[]};
export const loadRoster = createRosterLoader(32, 'ENCOUNTERS', rows => {
  const setup = rows[0]?.setup;
  if (rows.length !== 7 || new Set(rows.map(row => row.section)).size !== 7 ||
    setup?.heroes?.length !== 6 || !setup.weapons?.length ||
    rows.some(row => !row.name || !row.opponents?.length)) throw new Error('Incomplete Bloody Snow roster');
  roster.setup = setup;
  roster.encounters = rows;
});
