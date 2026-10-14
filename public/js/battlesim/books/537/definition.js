// Book identity and declarative defaults; no DOM or saved-state access.
export const definition = Object.freeze({
  "id": 537,
  "title": "Ancient Evil",
  "family": "demonspawn",
  "stateKey": "sim537",
  "i18nPrefix": "battlesim537"
});

export const toggles = ['shield', 'magicShield', 'fireproof', 'rubyPendant', 'meditationKnown'];

export const actions = ['initiative', 'player_attack', 'enemy_attack', 'end_round', 'death_luck', 'serpent', 'reconsider', 'apply_damage'];
