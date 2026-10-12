import { policeInteger } from './core.js';

// Null means absent or unclear in the source, never an assumed zero.
export const POLICE_ENCOUNTERS = [
  { id: 'brawler', section: 14, enemy: { attack: null, defence: null, damage: 10, life: 20 }, count: 1, party: false, unarmed: true, nonfatal: true },
  { id: 'bandits', section: 25, enemy: { attack: 12, defence: 12, damage: 12, life: 18 }, count: null, party: true },
  { id: 'troll', section: 66, enemy: { attack: 36, defence: 24, damage: null, life: 50 }, count: null, party: true },
  { id: 'banditLeader', section: 89, enemy: { attack: 8, defence: 6, damage: null, life: 12 }, count: 1, party: false },
  { id: 'bear', section: 103, enemy: { attack: 24, defence: 16, damage: null, life: 20 }, count: 1, party: false, hunt: true },
  { id: 'wolf', section: 103, enemy: { attack: 16, defence: 26, damage: null, life: 12 }, count: 1, party: false, hunt: true },
  { id: 'boar', section: 103, enemy: { attack: 20, defence: null, damage: null, life: 24 }, count: 1, party: false, hunt: true },
  { id: 'arenaTroll', section: 129, enemy: { attack: 36, defence: 24, damage: 24, life: 48 }, count: 1, party: false, arena: true, playerStrikes: 2 },
  { id: 'arenaHuman', section: 129, enemy: { attack: 12, defence: 12, damage: 12, life: 24 }, count: 1, party: false, arena: true },
  { id: 'arenaDwarf', section: 129, enemy: { attack: 8, defence: 24, damage: 8, life: 36 }, count: 1, party: false, arena: true },
  { id: 'orcs', section: 135, enemy: { attack: 6, defence: 6, damage: 6, life: 6 }, count: 3, party: true },
  { id: 'knight', section: 135, enemy: { attack: 16, defence: 16, damage: 16, life: 26 }, count: 1, party: true },
  { id: 'crownOrcs', section: 135, enemy: { attack: 6, defence: 6, damage: 6, life: 6 }, count: null, party: true },
  { id: 'slaveTroll', section: 139, enemy: { attack: 24, defence: 8, damage: 24, life: 36 }, count: 1, party: false, arena: true },
  { id: 'slaveHuman', section: 139, enemy: { attack: 12, defence: 12, damage: 12, life: 12 }, count: 1, party: false, arena: true },
  { id: 'slaveDwarf', section: 139, enemy: { attack: 8, defence: 24, damage: 8, life: 24 }, count: 1, party: false, arena: true },
  { id: 'forestOrcs', section: 145, enemy: { attack: 6, defence: 6, damage: 6, life: 6 }, count: 3, party: true },
  { id: 'manticores', section: 145, enemy: { attack: 16, defence: 16, damage: 12, life: null }, count: null, party: true },
  { id: 'largeOrcBand', section: 145, enemy: { attack: 6, defence: 6, damage: 6, life: 6 }, count: null, party: true },
  { id: 'forestKnight', section: 145, enemy: { attack: 16, defence: 16, damage: 16, life: null }, count: 1, party: true },
  { id: 'forestCrownOrcs', section: 145, enemy: { attack: 6, defence: 6, damage: 6, life: 6 }, count: null, party: true },
  { id: 'demons', section: 147, enemy: { attack: 48, defence: 36, damage: 36, life: null }, count: 110, party: false },
  { id: 'dragon', section: 149, enemy: { attack: 48, defence: 30, damage: 60, life: 60 }, count: 1, dragon: true },
  { id: 'spellDragon', section: 138, enemy: { attack: 48, defence: 30, damage: null, life: 60 }, count: 1, dragon: true },
];

export function preparePoliceEnemy(id, { level = 1, enemy: overrides = {}, count, cannotRun = false } = {}, roll = () => Math.floor(Math.random() * 6) + 1) {
  const spec = POLICE_ENCOUNTERS.find(row => row.id === id);
  if (!spec) throw new RangeError('Unknown encounter');
  policeInteger(level, 1, 6);
  const enemy = { ...spec.enemy }, dice = [];
  const die = () => { const n = policeInteger(roll(), 1, 6); dice.push(n); return n; };
  if (id === 'brawler') { enemy.attack = 6 + die(); enemy.defence = 6 + level * 2; }
  if (id === 'arenaHuman' && cannotRun) {
    for (const key of ['attack', 'defence', 'damage', 'life']) enemy[key] += die();
  }
  let amount = spec.count;
  if (id === 'bandits') amount = 10 + level * 2;
  if (id === 'crownOrcs') amount = 12 + die();
  if (id === 'forestCrownOrcs') amount = 20 + die();
  if (id === 'manticores') amount = die();
  Object.assign(enemy, overrides);
  for (const key of ['attack', 'defence', 'damage', 'life']) policeInteger(enemy[key], key === 'life' ? 1 : 0);
  amount = count ?? amount;
  policeInteger(amount, 1, 1000);
  return { spec, enemy, count: amount, dice };
}
