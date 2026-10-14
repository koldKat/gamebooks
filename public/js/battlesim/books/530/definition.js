// Book identity and declarative defaults; no DOM or saved-state access.
export const definition = Object.freeze({
  "id": 530,
  "title": "Kingdom of Horror",
  "family": "grailquest",
  "stateKey": "sim530",
  "i18nPrefix": "battlesim530"
});

export const ID = 'sim530';

export const fields = ['life', 'maxLife', 'armour', 'permanent', 'experience', 'gold'];

export const supplies = ['potions', 'salves', 'rations', 'yarrow', 'invisibleDoses', 'speedCombats', 'sectionPoison', 'confusionFights', 'luckyRolls'];

export const flags = ['vronTooth', 'cherryBlossom', 'passageToken', 'ruby', 'ebonyRod', 'gnurlbash'];

export const options = ['killEnemies', 'neckArmed', 'ebonyRod', 'halfEnemyLife'];
