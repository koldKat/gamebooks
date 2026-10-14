// Book identity and declarative defaults; no DOM or saved-state access.
export const definition = Object.freeze({
  "id": 527,
  "title": "The Den of Dragons",
  "family": "grailquest",
  "stateKey": "sim527",
  "i18nPrefix": "battlesim527"
});

export const ID = 'sim527';

export const fields = ['life', 'maxLife', 'hit', 'bonus', 'armour', 'magicArmour', 'pendingWallop', 'permanent', 'experience', 'bolts', 'fireballs', 'lollipop', 'globs'];

export const flags = ['magicalWeapon', 'poisonProtected', 'invisible', 'dragonEJ', 'snuff', 'healingScroll', 'deathScroll', 'hypnosisScroll', 'antidoteScroll', 'disease'];

export const items = ['globs', 'snuff', 'healingScroll', 'deathScroll', 'hypnosisScroll', 'antidoteScroll'];

export const spells = ['panic', 'pow', 'pill', 'pad', 'pip', 'pin', 'repeat', 'invisibility', 'firefinger', 'fireball'];
