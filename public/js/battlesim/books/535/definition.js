export { loadRoster } from '../../engines/demonspawn/crypts-of-terror-encounters.js';
// Book identity and declarative defaults; no DOM or saved-state access.
export const definition = Object.freeze({
  "id": 535,
  "title": "The Crypts of Terror",
  "family": "demonspawn",
  "stateKey": "sim535",
  "i18nPrefix": "battlesim535"
});

export const ID='sim535';

export const options=['haroldWarning','cursedStone','orb','clementineUnarmed'];

export const actions=['initiative','player_attack','enemy_attack','end_round','death_luck','box','orb_test','wand','wight_hit'];
