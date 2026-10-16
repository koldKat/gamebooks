import { validateOpponents } from '../../opponents.js';

export const meleeOpponentFields = [
  {key:'aggression',min:1,max:4},{key:'skillCode',min:1,max:4},
  ...['strength','dexterity','speed','damageCode','weaponCode'].map(key=>({key,max:1000000})),
  {key:'endurance',min:.5,max:1000000,step:.5},
];
export const shootingOpponentFields = [
  {key:'aggression',min:1,max:4},{key:'skillCode',min:1,max:4},
  ...['effectiveFire','weaponPower','strength','dexterity','speed','cover','distance'].map(key=>({key,max:1000000})),
];
export function customMoneyOpponents(rows, shooting = false) {
  return validateOpponents(rows,shooting?shootingOpponentFields:meleeOpponentFields).map(row=>({...row,
    displayName:row.displayName||'Противник'}));
}
