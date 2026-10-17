export const definition = Object.freeze({id: 860, title: 'В къщата на смъртта', family: 'standalone', stateKey: 'sim860', i18nPrefix: 'battlesim860'});
export const RULES_REVISION = 1;
export const ENCOUNTERS = Object.freeze([
  {id: '12', displayName: 'Братството на Ваал', threshold: 8, damageDice: 1},
  {id: '31', displayName: 'Съдия Смърт', threshold: 10, damageDice: 0, heavyWound: true},
  {id: '33', displayName: 'Капан в пощенската кутия', threshold: 6, damageDice: 1},
  {id: '37', displayName: 'Капан в шкафчето', threshold: 4, damageDice: 1},
  {id: '46', displayName: 'Капан на стълбището', threshold: 6, damageDice: 2},
  {id: '48', displayName: 'Съдия Страх', threshold: 8, damageDice: 2},
  {id: '63', displayName: 'Съдия Мортис', threshold: 8, damageDice: 2},
  {id: '72', displayName: 'Съдия Огън: първи удар', threshold: 0, damageDice: 1},
  {id: '73', displayName: 'Съдия Огън: повторна атака', threshold: 10, damageDice: 2},
  {id: '83', displayName: 'Братството на Ваал: засада', threshold: 12, damageDice: 1},
  {id: '86', displayName: 'Съдия Огън: тризъбец', threshold: 0, damageDice: 1},
]);

export function encounterPreset(id) {
  const row = ENCOUNTERS.find(entry => entry.id === String(id));
  if (!row) throw new RangeError('Unknown encounter');
  return structuredClone(row);
}
