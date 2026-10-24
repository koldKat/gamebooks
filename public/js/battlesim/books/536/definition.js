export { loadRoster } from '../../engines/demonspawn/demondoom-encounters.js';
// Book identity and declarative defaults; no DOM or saved-state access.
export const definition = Object.freeze({
  "id": 536,
  "title": "Demondoom",
  "family": "demonspawn",
  "stateKey": "sim536",
  "i18nPrefix": "battlesim536"
});

export const actions=['initiative','player_attack','enemy_attack','end_round','death_luck','apply_damage','leprosy_tick','poison','reconsider'];
