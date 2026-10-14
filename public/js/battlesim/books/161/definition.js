// Book identity and declarative defaults; no DOM or saved-state access.
export const definition = Object.freeze({
  "id": 161,
  "title": "Blood of the Zombies",
  "family": "fighting-fantasy",
  "stateKey": "sim161",
  "i18nPrefix": "battlesim161"
});

export const WEAPONS = [
  { id: 'bare',     nameKey: 'battlesim161.weapon.bare',     dice: 1, sides: 6, mod: -3 },
  { id: 'melee',    nameKey: 'battlesim161.weapon.melee',    dice: 1, sides: 6, mod: 0 },
  { id: 'handgun',  nameKey: 'battlesim161.weapon.handgun',  dice: 1, sides: 6, mod: 2 },
  { id: 'sawnoff',  nameKey: 'battlesim161.weapon.sawnoff',  dice: 1, sides: 6, mod: 4 },
  { id: 'shotgun',  nameKey: 'battlesim161.weapon.shotgun',  dice: 1, sides: 6, mod: 5 },
  { id: 'chainsaw', nameKey: 'battlesim161.weapon.chainsaw', dice: 2, sides: 6, mod: 3 },
  { id: 'browning', nameKey: 'battlesim161.weapon.browning', dice: 2, sides: 6, mod: 15 },
  { id: 'custom',   nameKey: 'battlesim161.weapon.custom',   dice: 1, sides: 6, mod: 0 },
];
