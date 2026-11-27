import {loadRosterDataset} from '../../roster-data.js';
import {normalizeD20Actor} from '../../engines/d20/core.js';

export const definition = Object.freeze({
  id:1982,
  title:'The Saviour of Sharn',
  family:'d20',
  stateKey:'sim1982',
  i18nPrefix:'battlesim1982',
});

export let OPPONENTS = [];
export let COMPANIONS = [];
export let ENCOUNTERS = [];
export let RULES = null;
let pending;

function install(profiles, presets, [rules]) {
  if (!profiles.length || !presets.length || !rules?.companionKeys?.length) {
    throw new RangeError('Incomplete Sharn combat roster');
  }
  const catalog = new Map(profiles.map(profile => [profile.key, normalizeD20Actor(profile)]));
  if (catalog.size !== profiles.length || new Set(presets.map(preset => preset.key)).size !== presets.length) {
    throw new RangeError('Duplicate Sharn combat data');
  }
  function profile(key) {
    const actor = catalog.get(key);
    if (!actor) throw new RangeError('Missing Sharn combatant');
    return actor;
  }
  const companions = rules.companionKeys.map(profile);
  const encounters = presets.map(preset => {
    if (!preset.groups?.length) throw new RangeError('Empty Sharn encounter');
    const opponents = preset.groups.map(({opponentKey, count, name, excludedAttacks, battlefieldDefenses}) => {
      if (!Number.isSafeInteger(count) || count < 1 || count > 20) throw new RangeError('Invalid Sharn group size');
      const actor = profile(opponentKey);
      const immunities = [...new Set([...actor.defenses.immunities, ...(battlefieldDefenses?.immunities ?? [])])];
      return {
        ...actor,
        name:name ?? actor.name,
        count,
        defenses:{...actor.defenses, immunities},
        attacks:actor.attacks.filter(attack => !excludedAttacks?.includes(attack.name)),
      };
    });
    return {
      ...preset,
      profiles:opponents,
      companions:(preset.allyKeys ?? []).map(profile),
      contextRules:rules,
    };
  });
  OPPONENTS = [...catalog.values()].filter(actor => !rules.companionKeys.includes(actor.key));
  COMPANIONS = companions;
  ENCOUNTERS = encounters;
  RULES = rules;
}

export function loadRoster(fetcher) {
  if (RULES) return Promise.resolve();
  if (!pending) {
    const rows = Promise.resolve().then(async () => {
      const response = await fetcher('/api/books/1982/enemies');
      if (!response.ok) throw new Error('Could not load the Sharn roster');
      return response.json();
    });
    const fetchRows = async () => ({ok:true, json:() => rows});
    pending = Promise.all(['OPPONENTS','ENCOUNTERS','RULES'].map(dataset => loadRosterDataset(1982, dataset, fetchRows)))
      .then(result => install(...result)).finally(() => { pending = null; });
  }
  return pending;
}
