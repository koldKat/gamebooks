import {loadRosterDataset} from '../../roster-data.js';
import {normalizeD20Actor} from '../../engines/d20/core.js';

export const definition = Object.freeze({
  id:1751,
  title:"Archmage's Gate I: Saross",
  family:'d20',
  stateKey:'sim1751',
  i18nPrefix:'battlesim1751',
});

export let OPPONENTS = [];
export let COMPANIONS = [];
export let ENCOUNTERS = [];
export let RULES = null;
let pending;

function install(profiles, presets, [rules]) {
  if (!rules?.minimumPlayerInputs?.length || !rules.companionKeys?.length || !profiles.length || !presets.length) {
    throw new RangeError('Incomplete Saross combat roster');
  }
  const byKey = new Map(profiles.map(profile => [profile.key, normalizeD20Actor(profile)]));
  if (byKey.size !== profiles.length || new Set(presets.map(preset => preset.key)).size !== presets.length) {
    throw new RangeError('Duplicate Saross combat entry');
  }
  function requireProfile(key) {
    const profile = byKey.get(key);
    if (!profile?.sourcePdfPages?.length) throw new RangeError('Missing Saross profile');
    return profile;
  }
  const opponentKeys = new Set();
  const encounters = presets.map(preset => {
    const fighters = preset.groups.map(({opponentKey, count}) => {
      if (!Number.isSafeInteger(count) || count < 1 || count > 20) throw new RangeError('Invalid Saross opponent count');
      opponentKeys.add(opponentKey);
      return {...requireProfile(opponentKey), count};
    });
    if (!fighters.length || fighters.reduce((total, fighter) => total + fighter.count, 0) > 30) {
      throw new RangeError('Invalid Saross encounter');
    }
    (preset.allyKeys ?? []).forEach(requireProfile);
    const playerProfile = preset.playerProfileKey ? requireProfile(preset.playerProfileKey) : undefined;
    return {...preset, profiles:fighters, playerProfile, contextRules:rules};
  });
  const companions = rules.companionKeys.map(requireProfile);
  OPPONENTS = [...opponentKeys].map(requireProfile);
  COMPANIONS = companions;
  ENCOUNTERS = encounters;
  RULES = rules;
}

export function loadRoster(fetcher) {
  if (RULES) return Promise.resolve();
  if (!pending) {
    const rows = Promise.resolve().then(async () => {
      const response = await fetcher('/api/books/1751/enemies');
      if (!response.ok) throw new Error('Could not load the Saross roster');
      return response.json();
    });
    const fetchRows = async () => ({ok:true, json:() => rows});
    pending = Promise.all(['OPPONENTS','ENCOUNTERS','RULES'].map(dataset => loadRosterDataset(1751, dataset, fetchRows)))
      .then(args => install(...args)).finally(() => { pending = null; });
  }
  return pending;
}
