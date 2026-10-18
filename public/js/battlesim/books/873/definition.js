export const definition = Object.freeze({id: 873, title: 'Двоен агент', family: 'lucas-grey', stateKey: 'sim873', i18nPrefix: 'battlesim873'});
export {RULES_REVISION, HEALTH_BONUS, COVER_BONUS} from '../../engines/lucas-grey/rules.js';

export const ENCOUNTERS = Object.freeze([
  {id: '27', displayName: 'Петима войници в дима', enemies: 5, playerThreshold: 11, enemyThreshold: 8, win: '131', loss: '103'},
  {id: '63', displayName: 'Младият войник край казармата', enemies: 1, playerThreshold: 9, enemyThreshold: 7, win: '32', loss: '103'},
  {id: '65', displayName: 'Двамата стрелци', enemies: 2, playerThreshold: 9, enemyThreshold: 6, openingExtraShot: true, win: '123', loss: '103'},
  {id: '81', displayName: 'Пазачът и подкреплението', enemies: 1, playerThreshold: 9, enemyThreshold: 8, enemyFirst: true, reinforcement: true, win: '160', loss: '103'},
  {id: '88', displayName: 'Двама войници и експлозията', enemies: 2, playerThreshold: 9, enemyThreshold: 7, exposedFromRound: 3, exposedThreshold: 3, win: '32', loss: '103'},
  {id: '92', displayName: 'Пазачът на мушката', enemies: 1, playerThreshold: 10, enemyThreshold: 7, win: '118', loss: '103'},
  {id: '114', displayName: 'Бягащият шпионин на ледника', enemies: 1, playerThreshold: 9, enemyThreshold: 9, exchange: true, hurt: '38', hit: '41', miss: '98'},
  {id: '128', displayName: 'Шпионинът стреля пръв', enemies: 1, playerThreshold: 9, enemyThreshold: 8, enemyFirst: true, exchange: true, hurt: '38', hit: '41', miss: '98'},
  {id: '133', displayName: 'Двамата войници при оградата', enemies: 2, playerThreshold: 10, enemyThreshold: 7, win: '32', loss: '103'},
  {id: '152', displayName: 'Двата преследващи МИГ-а', enemies: 2, playerThreshold: 8, enemyThreshold: 7, aircraft: true, win: '30', loss: '12'},
  {id: '153', displayName: 'Том Рангли', enemies: 1, playerThreshold: 9, enemyThreshold: 9, win: '15', loss: '169'},
  {id: '163', displayName: 'Войникът пред казармата', enemies: 1, playerThreshold: 9, enemyThreshold: 7, win: '88', loss: '103'},
].map(row => Object.freeze(row)));

export function encounterPreset(id) {
  const row = ENCOUNTERS.find(entry => entry.id === String(id));
  if (!row) throw new RangeError('Unknown encounter');
  return structuredClone(row);
}
