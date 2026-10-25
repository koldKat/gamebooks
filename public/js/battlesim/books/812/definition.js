import { createRosterLoader } from '../../roster-data.js';

export const definition = Object.freeze({id: 812, title: 'В Гората на забравата', family: 'alternating-attack-defence', stateKey: 'sim812', i18nPrefix: 'battlesim812'});
export const RULES_REVISION = 1;
export let ENCOUNTERS = [];
export const FOREST_RULES = {};
export const loadRoster = createRosterLoader(812, 'CATALOG', entries => {
  const rules = entries.find(entry => entry.support)?.support.rules;
  if (!rules) throw new Error('Incomplete Forest settings');
  Object.assign(FOREST_RULES, rules);
  ENCOUNTERS = entries.flatMap(entry => entry.variants).sort((a, b) => a.order - b.order).map(variant => variant.spec);
});
