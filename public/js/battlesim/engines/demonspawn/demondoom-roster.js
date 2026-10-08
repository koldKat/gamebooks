const attributes = ['strength', 'speed', 'stamina', 'courage', 'skill', 'luck', 'charm', 'attraction', 'power', 'lifePoints'];
const printed = [
  ['Assassin', [80,95,70,80,70,20,15,25,null,385]],
  ['Rock Leopard', [75,98,50,90,65,35,10,8,null,431]],
  ['Village Spawn', [80,92,95,80,50,70,0,0,null,467]],
  ['Satzensqquash', [null,90,400,200,null,50,null,null,null,900]],
  ['Desert Lion', [80,90,50,85,60,20,10,0,null,395]],
  ['Serpent Guardian', [98,60,55,60,30,15,1,0,null,319]],
  ['Cave Bear', [90,40,60,80,30,10,2,0,null,312]],
  ['Stone Villager 1', [48,36,90,80,44,48,40,16,null,402]],
  ['Stone Villager 2', [50,48,48,40,30,30,20,5,null,271]],
  ['Stone Villager 3', [60,50,48,55,25,12,15,9,null,274]],
  ['Stone Villager 4', [58,55,50,70,22,16,8,20,null,299]],
  ['Dragon', [150,80,50,100,80,60,5,0,null,525]],
  ['Spawn Regent', [150,110,100,150,100,0,0,0,null,610]],
  ['Sea Serpent', [80,35,30,90,40,5,0,0,null,280]],
  ['Green Guardian', [150,100,100,100,80,90,50,25,null,695]],
  ['Amoebix', [96,50,90,70,20,10,0,0,null,336]],
  ['Dianthrope Regina', [85,96,50,80,60,40,10,40,null,461]],
  ['Desert Snake', [80,20,55,60,30,30,5,20,null,300]],
  ['Cupric', [120,50,80,90,25,64,0,0,null,429]],
  ['Golden Web', [null,null,null,null,null,null,null,null,null,500]],
  ['Golden Guard 1', [70,70,50,70,70,70,90,95,null,585]],
  ['Golden Guard 2', [80,80,60,80,80,80,95,99,null,654]],
  ['Golden Guard 3', [90,90,70,90,90,90,99,99,null,718]],
  ['Flying Lizard', [72,80,48,64,20,16,0,0,null,300]],
  ['Demonspawn', [100,100,100,100,100,100,0,0,50,650]],
  ['Spawn Captain', [110,100,100,120,100,100,0,0,75,705]],
];

// Printed Life totals are authoritative, including discrepancies with the attributes.
export const DEMONDOOM_ROSTER = Object.freeze(printed.map(([name, values]) =>
  Object.freeze({ name, ...Object.fromEntries(attributes.map((key, index) => [key, values[index]])) })));

export function demondoomEnemy(name, overrides = {}) {
  const enemy = DEMONDOOM_ROSTER.find(entry => entry.name === name);
  if (!enemy) throw new Error('Unknown Demondoom enemy');
  return { ...enemy, maxLife: enemy.lifePoints, maxPower: enemy.power, ...overrides };
}
