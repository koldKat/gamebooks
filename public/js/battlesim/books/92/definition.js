// Book identity and declarative defaults; no DOM or saved-state access.
export const definition = Object.freeze({
  "id": 92,
  "title": "Замъкът на таласъмите",
  "family": "old-forest-woodcutter",
  "stateKey": "sim92",
  "i18nPrefix": "battlesim92"
});

export const COMBAT_TABLE = {
  '-12': { enemy: 0,   player: 'dead' },
  '-11': { enemy: 0,   player: 'dead' },
  '-10': { enemy: 0,   player: -9 },
  '-9':  { enemy: 0,   player: -8 },
  '-8':  { enemy: -1,  player: -7 },
  '-7':  { enemy: -2,  player: -7 },
  '-6':  { enemy: -3,  player: -6 },
  '-5':  { enemy: -4,  player: -6 },
  '-4':  { enemy: -5,  player: -5 },
  '-3':  { enemy: -6,  player: -5 },
  '-2':  { enemy: -7,  player: -4 },
  '-1':  { enemy: -8,  player: -4 },
  '0':   { enemy: -9,  player: -3 },
  '1':   { enemy: -10, player: -3 },
  '2':   { enemy: -11, player: -3 },
  '3':   { enemy: -12, player: -2 },
  '4':   { enemy: -13, player: -2 },
  '5':   { enemy: -14, player: -2 },
  '6':   { enemy: -15, player: -1 },
  '7':   { enemy: -16, player: -1 },
  '8':   { enemy: -17, player: -1 },
  '9':   { enemy: -18, player: 0 },
  '10':  { enemy: 'dead', player: 0 },
  '11':  { enemy: 'dead', player: 0 },
  '12':  { enemy: 'dead', player: 0 },
};
