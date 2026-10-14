// Book identity and declarative defaults; no DOM or saved-state access.
export const definition = Object.freeze({
  "id": 529,
  "title": "Voyage of Terror",
  "family": "grailquest",
  "stateKey": "sim529",
  "i18nPrefix": "battlesim529"
});

export const ID = 'sim529';

export const core = ['life', 'maxLife', 'armour', 'permanent', 'experience', 'gold'];

export const resources = ['bolts', 'poisonHits', 'potions', 'salves', 'quinine', 'antidotes',
  'dragonTeeth', 'cricriEggs', 'spinach', 'goldenKeys', 'armourPieces', 'sectionPoison'];

export const flags = ['vulcanArmour', 'crystalBlade', 'wallbanger', 'wallbangerUsed', 'illusion',
  'pigSpell', 'talisman', 'light', 'malaria', 'playerHalfNext', 'enemyHalfNext', 'weakeningPotion',
  'mongoose', 'gnurlbash'];

export const options = ['returnJourney', 'killEnemies', 'talismanAttack'];

export const spells = ['crystalBlade', 'wallbanger', 'illusion', 'pigSpell'];
