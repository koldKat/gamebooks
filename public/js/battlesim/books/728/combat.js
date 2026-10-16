import { ARCS, SHIPS, PIRATES, RULE_VERSION, TACTICS, SHOT_LIMITS } from './definition.js';
import { validateOpponents } from '../../opponents.js';

const numeric = value => Number.isFinite(value) && value >= 0 && value <= 1000000;
const event = (fight, value) => { fight.events.push({ section: fight.section, ...value }); fight.events = fight.events.slice(-120); };
const active = fight => {
  if (!fight || fight.ruleVersion !== RULE_VERSION || fight.outcome) throw new RangeError('Inactive naval battle');
};

export function ammunition(size, supplies) {
  if (!SHIPS[size] || !['full', 'partial', 'none'].includes(supplies)) throw new RangeError('Invalid ship supplies');
  return supplies === 'full' ? 16 : supplies === 'none' ? 0 : size === 'small' ? 12 : 9;
}

export function newShip(size = 'medium', supplies = 'full') {
  if (!SHIPS[size]) throw new RangeError('Invalid ship');
  return { size, ...SHIPS[size], ammo: ammunition(size, supplies), soldiers: 0,
    soldierType: 'professional', seaWolves: false, weapons: 'full' };
}

export function validateShip(player) {
  if (!SHIPS[player?.size] || !['professional', 'mercenary'].includes(player.soldierType)
      || !['full', 'partial', 'none'].includes(player.weapons) || typeof player.seaWolves !== 'boolean'
      || !['speed', 'manoeuvre', 'durability', 'ammo', 'soldiers'].every(key => numeric(player[key]))
      || !Number.isInteger(player.ammo)) throw new RangeError('Invalid ship values');
  return player;
}

function damage(fight, durability = 0, movement = 0) {
  fight.player.durability = Math.max(0, fight.player.durability - durability);
  fight.player.speed = Math.max(0, fight.player.speed - movement);
  fight.player.manoeuvre = Math.max(0, fight.player.manoeuvre - movement);
  event(fight, { kind: 'damage', durability, movement });
  if (!fight.player.durability) fight.outcome = 'loss';
}

function enter(fight, section) {
  fight.section = section;
  fight.shots = [];
  fight.settled = false;
  const p = fight.player, d = fight.distances;
  event(fight, { kind: 'position' });
  switch (section) {
    case 95: d.A = d.B = 6; break;
    case 56: d.A += 10 - p.manoeuvre; d.B += p.speed - 12; break;
    case 66: d.A += p.speed + p.manoeuvre - 20; d.B += p.speed + p.manoeuvre - 24; break;
    case 76: d.A = Math.max(1, d.A + p.speed - 16); d.B -= 6; break;
    case 86: d.A += p.speed - 10; d.B += 6 - p.manoeuvre; damage(fight, 0, 1); break;
    case 67: d.A = d.B = 6; damage(fight, 10, 2); break;
    case 77: d.A = 4; d.B = 2; break;
    case 57: d.A -= 2; d.B = 1; damage(fight, 0, 2); break;
    case 96: d.A = d.B = 2; damage(fight, 0, 3); break;
    case 97: d.A = d.B = 1; break;
    case 58: fight.attackers = ['A', 'B']; break;
    case 68: fight.attackers = ['B']; break;
    case 87: fight.attackers = ['A']; break;
    case 59: casualties(fight, p.soldiers / 2); break;
    case 60: p.speed /= 2; damage(fight, 10); casualties(fight, 10); break;
    case 70: p.manoeuvre = 2; damage(fight, 10); casualties(fight, 5); break;
    case 69: casualties(fight, 10); break;
    case 80: case 90: casualties(fight, p.soldiers / 2); break;
    case 89: fight.virtualTroops = ({ large: 50, medium: 30, small: 15 })[p.size]; break;
    case 100: p.speed /= 2; p.manoeuvre /= 2; p.durability /= 2; break;
    case 101: fight.outcome = 'win'; fight.destination = 101; break;
  }
  return fight;
}

function casualties(fight, amount) {
  if (fight.ignoreCasualties) return;
  const loss = Math.min(fight.player.soldiers, amount);
  fight.player.soldiers -= loss;
  event(fight, { kind: 'casualties', amount: loss });
}

export function startFight(player, options = {}) {
  validateShip(player);
  if (!player.durability) throw new RangeError('A sunk ship cannot fight');
  const pirates = structuredClone(PIRATES);
  if (options.opponents) {
    if (options.opponents.length !== 2) throw new RangeError('Two opposing ships are required');
    const enemies = validateOpponents(options.opponents, [{key: 'durability', min: 1}]);
    for (const [index, key] of ['A', 'B'].entries()) pirates[key] = {durability: enemies[index].durability, name: enemies[index].displayName};
  }
  return enter({ ruleVersion: RULE_VERSION, player: structuredClone(player),
    pirates, distances: { A: 6, B: 6 }, attackers: [],
    ignoreCasualties: false, virtualTroops: null, events: [], outcome: null }, 95);
}

export function fire(original, target, arc) {
  active(original);
  if (!TACTICS.includes(original.section) || !PIRATES[target] || !ARCS[arc]) throw new RangeError('Invalid volley');
  const fight = structuredClone(original), config = ARCS[arc], limit = SHOT_LIMITS[fight.section];
  if (fight.pirates[target].durability <= 0 || fight.player.ammo < config.cost
      || fight.distances[target] < 1 || !Number.isFinite(fight.distances[target])) throw new RangeError('Unavailable volley');
  if (limit != null && fight.shots.length >= limit) throw new RangeError('Volley limit');
  if (![56, 57, 77, 96, 97].includes(fight.section) && fight.shots.some(shot => shot.target === target)) throw new RangeError('One volley per target');
  if (fight.section === 95 && arc !== (target === 'A' ? 'broadside' : 'stern')) throw new RangeError('Wrong opening arc');
  const index = ['large', 'medium', 'small'].indexOf(fight.player.size);
  const distance = fight.distances[target], inRange = distance <= config.range[index];
  const amount = inRange ? Math.max(0, config.power[index] - distance) : 0;
  fight.player.ammo -= config.cost;
  fight.pirates[target].durability = Math.max(0, fight.pirates[target].durability - amount);
  fight.shots.push({ target, arc, amount });
  event(fight, { kind: 'volley', target, arc, amount, cost: config.cost, inRange });
  return fight;
}

function settle(fight) {
  if (fight.settled) return;
  fight.settled = true;
  if (fight.section === 56) damage(fight, Math.max(0, 12 - fight.distances.A));
  if (fight.section === 76) damage(fight, 10, 2);
}

function routes(fight) {
  const p = fight.player, a = fight.attackers, count = fight.virtualTroops ?? p.soldiers;
  const both = a.length === 2, onlyB = a.length === 1 && a[0] === 'B';
  const result = (destinations, manual = null) => ({ destinations, manual });
  switch (fight.section) {
    case 95: return result([56, 66]);
    case 56: return result([76, 86]);
    case 66: return result([96, 56, 86]);
    case 76: return result([fight.pirates.B.durability === 0 ? 87 : 57]);
    case 86: return result([67, 77]);
    case 67: return result(fight.shots.length ? [95] : [95, 77]);
    case 77: return result([97]);
    case 57:
      if (fight.pirates.B.durability === 0) return result([87]);
      if (fight.shots.some(shot => shot.target === 'A')) return result([78]);
      return result(['manual'], 'missing57');
    case 96: return result([78]);
    case 97: return result([fight.pirates.A.durability < 16 ? 68 : 58]);
    case 58: case 68: case 87: return result([78]);
    case 78: return result([p.soldiers > 0 ? 88 : p.seaWolves ? 98 : 'loss']);
    case 88:
      if (onlyB) return result([69]);
      if (!both) return result([count < 30 ? 59 : 69]);
      if (count < 40) return result([59]);
      if (count > 60) return result([69]);
      if (count > 40 && count < 60) return result([p.soldierType === 'professional' ? 69 : 59]);
      return result([59, 69], 'missing88');
    case 59: case 79: return result([60, 70]);
    case 60: case 70: case 80: return result([99]);
    case 69: case 89: return result([both ? 80 : 90]);
    case 90:
      if (p.size === 'small') return result([99]);
      return result([onlyB || count > 50 ? 101 : 99]);
    case 98: return result([79, 89]);
    case 99:
      if (p.weapons === 'none') return result(['loss']);
      if (p.weapons === 'full') return result([p.size === 'small' && count === 0 ? 100 : 101]);
      if ((p.size === 'large' || count >= 50) && (p.size !== 'large' || count < 50)) return result([101, 100], 'overlap99');
      return result([p.size === 'large' || count >= 50 ? 101 : 100]);
    case 100:
      if (p.size !== 'large' && count === 0 && !p.seaWolves) return result(['loss']);
      if (!(p.size === 'large' || count >= 10 || p.seaWolves)) return result(['manual'], 'missing100');
      if (both) return result(['loss']);
      if (onlyB || fight.pirates.A.durability < 30) return result([101]);
      return result(['manual'], 'missing100');
    default: throw new RangeError('Unknown naval passage');
  }
}

export function options(original) {
  if (!original || original.outcome) return { destinations: [], manual: null };
  active(original);
  const fight = structuredClone(original);
  settle(fight);
  return fight.outcome ? { destinations: ['loss'], manual: null } : routes(fight);
}

export function advance(original, destination) {
  active(original);
  const fight = structuredClone(original);
  settle(fight);
  if (fight.outcome) return fight;
  if (!routes(fight).destinations.includes(destination)) throw new RangeError('Invalid naval transition');
  if (destination === 'loss' || destination === 'manual') {
    fight.outcome = destination;
    event(fight, { kind: 'outcome', outcome: destination });
    return fight;
  }
  if (fight.section === 96) fight.attackers = fight.pirates.B.durability === 0 ? ['A']
    : fight.pirates.A.durability < 20 ? ['B'] : ['A', 'B'];
  if (fight.section === 57 && destination === 78) fight.attackers = ['A', 'B'];
  if (fight.section === 67 && destination === 77 && fight.shots.length) throw new RangeError('Escape requires no volleys');
  if (fight.section === 98) fight.ignoreCasualties = true;
  return enter(fight, destination);
}

// Only distances absent or nonsensical in a printed transition need a manual ruling.
export function overrideDistances(original, distances) {
  active(original);
  if (!TACTICS.includes(original.section) || !['A', 'B'].every(key => numeric(distances[key]) && distances[key] >= 1)) throw new RangeError('Invalid distances');
  const fight = structuredClone(original);
  fight.distances = { A: distances.A, B: distances.B };
  event(fight, { kind: 'manualDistances', ...fight.distances });
  return fight;
}
