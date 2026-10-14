// Book identity and declarative defaults; no DOM or saved-state access.
export const definition = Object.freeze({
  "id": 555,
  "title": "The Darkness over Arkham",
  "family": "arkham-darkness",
  "stateKey": "sim555",
  "i18nPrefix": "battlesim555"
});

export const ID = 'sim555';

export const fields = ['willpower', 'intellect', 'combat', 'health', 'sanity', 'clues', 'resources', 'doom'];

export const flags = ['agile', 'rites', 'fear'];

export const initialStats = { willpower: 5, intellect: 2, combat: 2, health: 6, sanity: 8 };
