import {normalizeD20Actor} from '../../engines/d20/core.js';
import {loadRosterDataset} from '../../roster-data.js';

export const definition = Object.freeze({
  id: 2112,
  title: 'The Mystery of Witchhaven',
  family: 'd20',
  stateKey: 'sim2112',
  i18nPrefix: 'battlesim2112',
});

export let opponents = [];
export let encounters = [];
export let rules;
let pending;

async function install(fetcher) {
  const response = await fetcher(`/api/books/${definition.id}/enemies`);
  if (!response.ok) throw new Error('Could not load Witchhaven combat data');
  const rows = await response.json();
  const fetchRows = async () => ({ok:true, json:() => rows});
  const [profiles, presets, [sourceRules]] = await Promise.all(['OPPONENTS','ENCOUNTERS','RULES']
    .map(dataset => loadRosterDataset(definition.id,dataset,fetchRows)));
  const fighters = new Map(profiles.map(row => [row.key,normalizeD20Actor(row)]));
  if (!sourceRules || !presets.length || fighters.size !== profiles.length) throw new RangeError('Incomplete Witchhaven combat data');
  const groups = presets.map(preset => {
    const participants = preset.groups.map(({opponentKey,count,attackPenalty = 0}) => {
      const fighter = fighters.get(opponentKey);
      if (!fighter) throw new RangeError('Unknown Witchhaven opponent');
      const actor = {...fighter,count};
      if (attackPenalty) actor.encounterAttackPenalty = {amount:attackPenalty};
      return actor;
    });
    if (!participants.length) throw new RangeError('Empty combat encounter');
    return {...preset, profiles:participants, contextRules:sourceRules};
  });
  opponents = [...fighters.values()];
  encounters = groups;
  rules = sourceRules;
}

export function loadRoster(fetcher) {
  if (rules) return Promise.resolve();
  if (!pending) pending = install(fetcher).finally(() => { pending = null; });
  return pending;
}
