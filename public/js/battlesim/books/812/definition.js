export const definition = Object.freeze({id: 812, title: 'В Гората на забравата', family: 'alternating-attack-defence', stateKey: 'sim812', i18nPrefix: 'battlesim812'});
export const RULES_REVISION = 1;
export const ENCOUNTERS = [
  {section: 33, displayName: 'Вампир', attack: 1, defence: 0, life: 10, destination: '30', lossDestination: '8', readerDamage: 5},
  {section: 5, displayName: 'Демон (с ръкавиците)', attack: 1, defence: 1, life: 10, destination: '28', lossDestination: '58', readerDamage: 5, gloves: true},
  {section: 34, displayName: 'Демон (без ръкавиците)', attack: 1, defence: 1, life: 10, destination: '28', lossDestination: '58', readerDamage: 5, entryDamage: 3},
  {section: 54, displayName: 'Върколак', attack: 1, defence: 0, life: 10, destination: '37', lossDestination: '19', readerDamage: 6, werewolf: true},
  {section: 16, displayName: 'Ромир', attack: 1, defence: 1, life: 10, destination: null, lossDestination: null, readerDamage: 3, unarmed: true, dynamicLife: true},
];
