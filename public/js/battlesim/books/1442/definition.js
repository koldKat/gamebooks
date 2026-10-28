import {createRosterLoader} from '../../roster-data.js';
export const definition = Object.freeze({id:1442,title:'Battle Road',family:'car-wars',stateKey:'sim1442',i18nPrefix:'battlesim1442'});
let roster = [], vehicles = [];
export const getRoster = () => roster;
export const getVehicles = () => vehicles;
export const loadRoster = createRosterLoader(definition.id, 'CATALOG', entries => {
  if (entries.length !== 11 || entries.some(e => !e.section || !e.enemies?.length || !e.rules)) throw new Error('Incomplete Car Wars roster');
  vehicles = entries.flatMap(e => e.playerVehicles ?? []);
  if (vehicles.length !== 8) throw new Error('Incomplete vehicle profiles');
  roster = entries.flatMap(entry => [
    {...entry, baseSection: entry.section},
    ...(entry.variants ?? []).map(variant => ({...entry, ...variant, baseSection:entry.section,
      rules:{...entry.rules,...variant.rules},
      enemies:(variant.enemyIndices ?? entry.enemies.map((_,i)=>i)).map(i=>structuredClone(entry.enemies[i])),
    })),
  ]);
  for (const entry of roster) if (entry.weaponReplacement && !entry.rules.resumePrior)
    entry.enemies[0].weapons[entry.weaponReplacement.index] = structuredClone(entry.weaponReplacement.weapon);
  if (roster.length !== 21 || new Set(roster.map(e=>e.section)).size !== 21) throw new Error('Incomplete encounter variants');
});
