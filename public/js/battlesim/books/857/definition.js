export const definition = Object.freeze({id: 857, title: 'Изумрудената планина', family: 'nti', stateKey: 'sim857', i18nPrefix: 'battlesim857'});
export const RULES_REVISION = 1;
export const DEFAULT_CHARACTER = Object.freeze({combat: 2, movement: 0, life: 10, damage: 2, armour: 1, gold: 30});
export const ENCOUNTERS = [
  {id: '8', displayName: 'Разбойник', combat: 1, movement: 0, hp: 8, damage: 1, armour: 0, win: '23'},
  {id: '16', displayName: 'Чудовище', combat: 2, movement: 1, hp: 12, damage: 0, armour: 0, win: '11'},
];
export function encounterPreset(id) {
  const encounter = ENCOUNTERS.find(row => row.id === String(id));
  if (!encounter) throw new RangeError('Unknown encounter');
  return structuredClone(encounter);
}
