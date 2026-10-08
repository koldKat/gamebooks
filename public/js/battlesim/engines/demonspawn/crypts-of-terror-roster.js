const attributes = ["strength","speed","stamina","courage","skill","luck","charm","attraction","power","lifePoints"];
const printed = [
  ["Panther", [72,80,48,64,20,16,null,null,null,300]],
  ["King's Guard", [64,48,56,56,15,48,24,32,null,343]],
  ["Tanith", [56,88,88,88,60,64,64,88,null,596]],
  ["Giant Rat", [96,64,48,48,10,null,null,null,null,266]],
  ["Vampire", [48,48,48,48,48,48,48,48,null,384]],
  ["Worm", [96,8,96,96,15,null,null,null,null,311]],
  ["Statue", [150,48,100,100,30,null,null,null,null,428]],
  ["Alchiller", [80,96,80,88,50,64,48,56,100,562]],
  ["Horn Monster", [150,50,80,120,50,80,null,null,150,530]],
  ["Palace Guard", [64,48,56,64,35,48,40,56,null,411]],
  ["Manticore", [120,50,80,90,25,64,null,null,88,429]],
  ["Pseudo-Spawn", [48,48,48,48,48,48,null,null,100,288]],
  ["Elemental", [100,50,50,100,50,100,null,null,null,450]],
  ["Clementine", [64,88,72,64,30,48,48,40,null,454]],
  ["Demonspawn", [100,100,100,100,100,100,null,null,50,650]],
  ["Fortress Guard", [48,56,56,56,25,48,48,48,null,385]],
  ["Harkaan Prince", [56,64,56,64,50,48,56,64,250,458]],
];

export const CRYPTS_ROSTER = Object.freeze(printed.map(([name, values]) =>
  Object.freeze({ name, ...Object.fromEntries(attributes.map((key, index) => [key, values[index]])) })));

export function cryptsEnemy(name, overrides = {}) {
  const enemy = CRYPTS_ROSTER.find(entry => entry.name === name);
  if (!enemy) throw new Error('Unknown Crypts of Terror enemy');
  return { ...enemy, maxLife: enemy.lifePoints, maxPower: enemy.power, ...overrides };
}

