import { createRosterLoader } from '../../roster-data.js';

// Book identity and declarative defaults; no DOM or saved-state access.
export const definition = Object.freeze({
  "id": 206,
  "title": "House of Hell",
  "family": "fighting-fantasy",
  "stateKey": "sim206",
  "i18nPrefix": "battlesim206"
});

export let KRIS_KNIFE_RULES = [];
export const loadRoster = createRosterLoader(206, 'KRIS_KNIFE_RULES', entries => {
  const rules = entries.find(entry => entry.support)?.support.rules;
  if (!rules || !['fireSpriteLuckyDamage', 'fireSpriteUnluckyDamage', 'fireSpriteBaselineDamage', 'ghoulParalysisThreshold'].every(key => Number.isSafeInteger(rules[key]))) throw new Error('Incomplete House of Hell settings');
  FIRESPRITE_LUCKY_DMG = rules.fireSpriteLuckyDamage;
  FIRESPRITE_UNLUCKY_DMG = rules.fireSpriteUnluckyDamage;
  FIRESPRITE_BASELINE_DMG = rules.fireSpriteBaselineDamage;
  GHOUL_PARALYSIS_THRESHOLD = rules.ghoulParalysisThreshold;
  KRIS_KNIFE_RULES = entries.map(({support, ...entry}) => entry);
});

export let FIRESPRITE_LUCKY_DMG;

export let FIRESPRITE_UNLUCKY_DMG;

export let FIRESPRITE_BASELINE_DMG;

export let GHOUL_PARALYSIS_THRESHOLD;
