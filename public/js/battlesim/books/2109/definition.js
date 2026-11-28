import {normalizeD20Actor} from '../../engines/d20/core.js';
import {loadRosterDataset} from '../../roster-data.js';

export const definition = Object.freeze({
  id: 2109,
  title: "The Death Knight's Squire",
  family: 'd20',
  stateKey: 'sim2109',
  i18nPrefix: 'battlesim2109',
});

export let opponents = [];
export let companions = [];
export let encounters = [];
export let rules;
let pending;

function install(profiles, presets, [sourceRules]) {
  const fighters = new Map(profiles.map(actor => [actor.key, normalizeD20Actor(actor)]));
  if (!sourceRules || !presets.length || fighters.size !== profiles.length) {
    throw new RangeError('Incomplete Death Knight combat data');
  }
  function fighter(key) {
    const result = fighters.get(key);
    if (!result) throw new RangeError('Unknown Death Knight combatant');
    return result;
  }
  const allies = sourceRules.companionKeys.map(fighter);
  const groups = presets.map(preset => {
    const profiles = preset.groups.map(({opponentKey, count}) => ({...fighter(opponentKey), count}));
    if (!profiles.length) throw new RangeError('Empty combat encounter');
    return {...preset, profiles, contextRules: sourceRules};
  });
  companions = allies;
  opponents = [...fighters.values()].filter(actor => !sourceRules.companionKeys.includes(actor.key));
  encounters = groups;
  rules = sourceRules;
}

export function loadRoster(fetcher) {
  if (rules) return Promise.resolve();
  if (!pending) {
    const response = Promise.resolve().then(() => fetcher('/api/books/2109/enemies'));
    pending = response.then(async result => {
      if (!result.ok) throw new Error('Could not load Death Knight combat data');
      const rows = await result.json();
      const fetchRows = async () => ({ok: true, json: () => rows});
      install(...await Promise.all(['OPPONENTS', 'ENCOUNTERS', 'RULES'].map(dataset =>
        loadRosterDataset(definition.id, dataset, fetchRows))));
    }).finally(() => { pending = null; });
  }
  return pending;
}
