// Identify the book's optional numerical duels and load their source presets from the database.
import {createRosterLoader} from '../../roster-data.js';
import {normalizeEncounter} from './combat.js';

export const definition = Object.freeze({id:732, title:'Нашествието на викингите',
  family:'viking-duel', stateKey:'sim732', i18nPrefix:'battlesim732'});
export const encounters = [];
export const customEncounter = Object.freeze({key:'', section:'', kind:'opposed', name:'',
  strengthFactor:2, energyFactor:2, enemyBase:18,
  outcomes:Object.fromEntries(['wide', 'edge', 'tie', 'behind'].map((key, index) =>
    [key, {section:null, damage:Math.max(0, index - 1), result:'win'}]))});
export const loadRoster = createRosterLoader(732, 'CATALOG', rows => {
  const entries = rows.map(normalizeEncounter);
  if (entries.length !== 8 || new Set(entries.map(entry => entry.key)).size !== 8
      || entries.filter(entry => entry.kind === 'ragnar').length !== 3) throw new Error('Incomplete duel roster');
  encounters.splice(0, encounters.length, ...entries);
});
