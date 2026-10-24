// Book identity and declarative defaults; no DOM or saved-state access.
export const definition = Object.freeze({
  "id": 557,
  "title": "The Kingsport Metamorphosis",
  "family": "kingsport",
  "stateKey": "sim557",
  "i18nPrefix": "battlesim557"
});

export const ID = 'sim557';

export const fields = ['willpower', 'intellect', 'combat', 'health', 'sanity', 'clues', 'resources', 'doom'];

export { loadRoster } from '../../engines/kingsport.js';
