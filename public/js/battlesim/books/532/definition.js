export { loadRoster } from '../../engines/grailquest/tomb-of-nightmares-roster.js';
// Book identity and declarative defaults; no DOM or saved-state access.
export const definition = Object.freeze({
  "id": 532,
  "title": "Tomb of Nightmares",
  "family": "grailquest",
  "stateKey": "sim532",
  "i18nPrefix": "battlesim532"
});

export const ID = 'sim532';

export const fields = ['life', 'maxLife', 'hit', 'bonus', 'armour', 'permanent', 'experience', 'gold'];

export const supplies = ['potions', 'salves', 'bolts', 'fireballs', 'fruit', 'nauseaFights', 'pearlUses'];

export const flags = ['poisonImmune', 'fireballImmune', 'gills', 'goldenGarlic', 'deathOde', 'mould',
  'crystalDagger', 'vampireRing', 'blackRod', 'beeTraining', 'hologram', 'silverSword', 'dreamDisease'];

export const settings = ['killEnemies', 'useCompanion', 'fireAdds'];

export const spells = ['panic', 'pow', 'pill', 'pad', 'pip', 'pin', 'repeater', 'invisibility',
  'firefinger', 'fireball', 'plop', 'pid', 'pals', 'pil', 'pops'];
