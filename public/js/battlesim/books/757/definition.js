export const definition = Object.freeze({
  id: 757, title: 'Истинска магия', family: 'true-magic', stateKey: 'sim757', i18nPrefix: 'battlesim757',
});

export const DEFAULT_CHARACTER = Object.freeze({attack: 1, defence: 0, mobility: 6, skill: 4, stamina: 120});
export const ATTACKERS = Object.freeze([
  Object.freeze({attack: 3, mobility: 3, skill: 2}),
  Object.freeze({attack: 4, mobility: 3, skill: 3}),
  Object.freeze({attack: 3, mobility: 4, skill: 1}),
]);

export const RITUAL_CHOICES = Object.freeze({
  55: [48, 37, 20, 78], 20: [48, 37, 45, 78], 37: [48, 20, 78],
  42: [37, 20, 78], 63: [37, 20, 78], 52: [34, 83], 47: [78],
});

export const DUEL_CHOICES = Object.freeze({
  263: [232, 257, 241, 239], 232: [260], 257: [261, 251], 251: [260],
  241: [254, 252], 254: [246], 252: [246], 239: [253, 242], 253: [246],
  242: [260], 247: [258], 250: [258], 234: [262],
});

export const SPELL_COSTS = Object.freeze({
  238: [5, 2], '244-small': [10, 1], '244-large': [20, 2],
  '249-focused': [50, 5], '249-ring': [20, 2], 259: [30, 3],
});
