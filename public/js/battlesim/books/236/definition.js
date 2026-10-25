import { createRosterLoader } from '../../roster-data.js';

// Book identity and declarative defaults; no DOM or saved-state access.
export const definition = Object.freeze({
  "id": 236,
  "title": "Dead of Night",
  "family": "fighting-fantasy",
  "stateKey": "sim236",
  "i18nPrefix": "battlesim236"
});

export let SERVANT_NAME_RULES = [];
export const MYURR_RULES = {};
const loadServantRules = createRosterLoader(236, 'SERVANT_NAME_RULES', entries => {
  SERVANT_NAME_RULES = entries.map(entry => new RegExp(entry.namePattern, entry.flags));
});
const loadMyurrRules = createRosterLoader(236, 'MYURR_RULES', entries => {
  if (entries.length !== 1 || !Number.isSafeInteger(entries[0].extraAttacks) || entries[0].extraAttacks < 0) throw new Error('Incomplete Myurr attack settings');
  Object.assign(MYURR_RULES, entries[0]);
});

export async function loadRoster(fetcher) {
  let response;
  const fetchOnce = async path => {
    response ||= Promise.resolve(fetcher(path)).then(async result => ({ ok: result.ok, rows: result.ok ? await result.json() : [] }));
    const result = await response;
    return { ok: result.ok, json: async () => result.rows };
  };
  await Promise.all([loadServantRules(fetchOnce), loadMyurrRules(fetchOnce)]);
}
