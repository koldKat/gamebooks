// Book identity and declarative defaults; no DOM or saved-state access.
export const definition = Object.freeze({
  "id": 108,
  "title": "Ледените пирати",
  "family": "standalone",
  "stateKey": "sim108",
  "i18nPrefix": "battlesim108"
});

export const WEAPON_TIER = { rk: 0, kinj: 1, mech: 2 };

export const COMBAT_TABLE = [
  [[3, 'dead'], [4, 9],      [5, 8], [6, 6], [8, 4], [10, 2], ['dead', 0]],
  [[1, 'dead'], [3, 10],     [3, 9], [4, 7], [5, 5], [7, 4],  [10, 2]],
  [[0, 'dead'], [1, 'dead'], [2, 10], [4, 8], [5, 6], [6, 6], [8, 4]],
];
