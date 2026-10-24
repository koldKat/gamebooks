export { loadRoster } from '../../engines/grailquest/realm-of-chaos-roster.js';
// Book identity and declarative defaults; no DOM or saved-state access.
export const definition = Object.freeze({
  "id": 531,
  "title": "Realm of Chaos",
  "family": "grailquest",
  "stateKey": "sim531",
  "i18nPrefix": "battlesim531"
});

export const ID='sim531';

export const fields=['life','maxLife','hit','bonus','armour','permanent','experience','gold'];

export const supplies=['potions','salves','madFights','dragonCalls','pathwalker'];

export const flags=['fungoidRot','dreamDisease','healingWand','horrorgem','spookBasher','dragonStone'];

export const options=['killEnemies','openingApplied','stake','oneUseStone','allyTakesHits','ghastFullDice'];
