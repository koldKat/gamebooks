const clone = value => structuredClone(value);
export function policeInteger(value, minimum = 0, maximum = 1000000) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new RangeError('Invalid combat value');
  return value;
}
function die(roll, dice) {
  const value = policeInteger(roll(), 1, 6);
  dice.push(value);
  return value;
}
function actor(value) {
  const result = clone(value);
  for (const key of ['attack', 'defence', 'damage', 'life']) policeInteger(result[key], key === 'life' ? 1 : 0);
  return result;
}
function active(fight) {
  if (fight.status !== 'fighting' || fight.pending) throw new RangeError('Resolve the pending combat decision first');
}
function finish(fight) {
  if (fight.player.life <= 0) fight.status = 'loss';
  else if (fight.remaining <= 0) fight.status = 'win';
  return fight;
}
export function startPoliceFight(player, enemy, {
  count = 1, level = 1, tactic = 'dynamic', party = false, playerStrikes = 1,
  enemyFirst = undefined, nonfatal = false, spellsAllowed = true,
} = {}, roll = () => Math.floor(Math.random() * 6) + 1) {
  policeInteger(count, 1, 1000); policeInteger(level, 1, 6); policeInteger(playerStrikes, 1, 2);
  if (nonfatal !== false) policeInteger(nonfatal, 1);
  if (!['dynamic', 'aggressive', 'defensive', 'cautious'].includes(tactic)) throw new RangeError('Invalid tactic');
  const dice = [];
  const first = enemyFirst ?? (!party && die(roll, dice) + die(roll, dice) < level * 2);
  return { player: actor(player), enemy: actor(enemy), enemyMaxLife: enemy.life, remaining: count,
    party: !!party, tactic, playerStrikes, strikesLeft: playerStrikes, turn: first ? 'enemy' : 'player',
    status: 'fighting', nonfatal, spellsAllowed, round: 0, dice, pending: null, magicSpent: 0 };
}
function nextTurn(fight, acting) {
  if (acting === 'player' && --fight.strikesLeft > 0) return;
  fight.turn = acting === 'player' ? 'enemy' : 'player';
  if (fight.turn === 'player') fight.strikesLeft = fight.playerStrikes;
}
function applyEnemyDamage(fight, damage) {
  policeInteger(damage);
  if (fight.party) {
    // The source's casualty tolerance is contradictory; the player must resolve it.
    fight.pending = { kind: 'enemyCasualties', damage };
    return;
  }
  fight.enemy.life = Math.max(0, fight.enemy.life - damage);
  if (fight.enemy.life === 0) {
    fight.remaining--;
    if (fight.remaining > 0) fight.enemy.life = fight.enemyMaxLife;
  }
}
export function policeStrike(fight, { modifiers, spell } = {}, roll = () => Math.floor(Math.random() * 6) + 1) {
  active(fight);
  const next = clone(fight), dice = [], acting = next.turn;
  let playerAttack = next.player.attack, playerDefence = next.player.defence;
  let enemyAttack = next.enemy.attack, enemyDefence = next.enemy.defence;
  if (next.tactic === 'cautious') {
    if (!modifiers) throw new RangeError('Cautious tactic requires explicit resolved modifiers');
    for (const key of ['playerAttack', 'playerDefence', 'enemyAttack', 'enemyDefence']) {
      policeInteger(modifiers[key], -1000000);
    }
    playerAttack += modifiers.playerAttack; playerDefence += modifiers.playerDefence;
    enemyAttack += modifiers.enemyAttack; enemyDefence += modifiers.enemyDefence;
  } else if (next.tactic !== 'dynamic') {
    const n = die(roll, dice), sign = next.tactic === 'aggressive' ? 1 : -1;
    playerAttack += sign * n; playerDefence -= sign * n;
  }
  let hit, damage;
  if (spell) {
    if (acting !== 'player' || !next.spellsAllowed) throw new RangeError('Spells unavailable');
    policeInteger(spell.base); policeInteger(spell.minimum, 1); policeInteger(spell.spent, spell.minimum);
    policeInteger(spell.bonus ?? 0); policeInteger(next.player.magic);
    if (spell.spent > next.player.magic) throw new RangeError('Insufficient magic');
    next.player.magic -= spell.spent; next.magicSpent += spell.spent;
    hit = true; damage = spell.base + spell.spent + (spell.bonus ?? 0);
  } else {
    hit = acting === 'player' ? playerAttack > enemyDefence : enemyAttack > playerDefence;
    damage = hit ? (acting === 'player' ? next.player.damage : next.enemy.damage) : 0;
  }
  if (damage > 0) {
    if (acting === 'player') applyEnemyDamage(next, damage);
    else if (next.party) next.pending = { kind: 'allyCasualty', damage };
    else next.player.life = Math.max(0, next.player.life - damage);
  }
  next.round++; next.dice = dice;
  if (!next.pending) nextTurn(next, acting);
  finish(next);
  if (next.status === 'loss' && next.nonfatal) {
    next.status = 'defeat';
    next.player.life = next.nonfatal;
  }
  return { fight: next, acting, hit, damage, playerAttack, playerDefence, enemyAttack, enemyDefence, dice };
}
export function resolvePoliceCasualties(fight, { killed, player, enemyLife } = {}) {
  if (fight.status !== 'fighting' || !fight.pending) throw new RangeError('No pending casualty decision');
  const next = clone(fight);
  if (next.pending.kind === 'enemyCasualties') {
    policeInteger(killed, 0, Math.min(next.remaining, Math.ceil(next.pending.damage / next.enemyMaxLife)));
    // No automatic interpretation of the printed 30..40 example versus four-point tolerance.
    next.remaining -= killed;
    if (next.remaining) next.enemy.life = policeInteger(enemyLife, 1, next.enemyMaxLife);
    nextTurn(next, 'player');
  } else {
    if (!player) throw new RangeError('Enter the surviving party stats');
    if (player.life === 0) { next.player.life = 0; next.status = 'loss'; }
    else next.player = actor(player);
    nextTurn(next, 'enemy');
  }
  next.pending = null;
  return finish(next);
}
export function startPoliceDragon(lines, enemy, { heroLine = 1 } = {}) {
  policeInteger(heroLine, 1, 3);
  if (lines.length !== 3) throw new RangeError('Three formation lines required');
  const formation = lines.map(line => {
    if (!['warrior', 'archer', 'mage'].includes(line.type)) throw new RangeError('Invalid line type');
    const row = actor({ ...line, life: 1 });
    row.count = policeInteger(line.count, 1, 3);
    return row;
  });
  if (formation.reduce((sum, line) => sum + line.count, 0) !== 6) throw new RangeError('The formation requires six members');
  return { lines: formation, enemy: actor(enemy), heroLine, status: 'fighting', pending: null, round: 0, dice: [] };
}
export function policeDragonRound(fight, roll = () => Math.floor(Math.random() * 6) + 1) {
  active(fight);
  const next = clone(fight), dice = [], n = die(roll, dice);
  const index = [0, 1, 2, 1, 2, 0][n - 1], line = next.lines[index];
  const hit = line.count > 0 && next.enemy.attack > line.defence;
  if (hit) next.pending = { kind: 'dragonCasualty', line: index };
  // The dragon attacks first; remove its casualty before the surviving line strikes.
  const damage = hit ? 0 : dragonCounterattack(next, index);
  next.round++; next.dice = dice;
  return { fight: next, line: index + 1, hit, damage, dice };
}
function dragonCounterattack(fight, index) {
  const attackers = [fight.lines[index], ...(index === 1
    ? [fight.lines[0], fight.lines[2]].filter(row => row.type === 'warrior') : [])];
  let damage = 0;
  for (const row of attackers) if (row.count > 0 && row.attack > fight.enemy.defence) damage += row.damage;
  fight.enemy.life = Math.max(0, fight.enemy.life - damage);
  if (fight.enemy.life === 0) fight.status = 'win';
  return damage;
}
export function resolvePoliceDragonCasualty(fight, { heroKilled = false, survivor } = {}) {
  if (fight.status !== 'fighting' || fight.pending?.kind !== 'dragonCasualty') throw new RangeError('No dragon casualty');
  const next = clone(fight), index = next.pending.line, previous = next.lines[index];
  if (heroKilled && index + 1 !== next.heroLine) throw new RangeError('Hero is not in this line');
  if (heroKilled) next.status = 'loss';
  const count = previous.count - 1;
  if (count > 0 && !heroKilled) {
    const updated = actor({ ...survivor, life: 1 });
    next.lines[index] = { ...updated, type: previous.type, count };
  } else next.lines[index].count = count;
  next.pending = null;
  if (next.status !== 'loss') dragonCounterattack(next, index);
  return next;
}
export function startPoliceShip(ship, base, { targets, commandHits = 0, ammunition = 0, atmosphericShield = false } = {}) {
  policeInteger(ship.attack); policeInteger(ship.shield); policeInteger(ship.life, 1);
  policeInteger(base.attack); policeInteger(base.defence); policeInteger(targets, 1, 1000);
  policeInteger(commandHits, 0, 5); policeInteger(ammunition);
  return { ship: clone(ship), base: clone(base), targets, commandHits, ammunition,
    atmosphericShield, status: 'fighting', pending: null, round: 0, dice: [] };
}
export function policeShipRound(fight, { weapon = 'blaster', command = false } = {}, roll = () => Math.floor(Math.random() * 6) + 1) {
  active(fight);
  if (!['blaster', 'antiproton', 'atomic', 'pa', 'pb'].includes(weapon)) throw new RangeError('Unknown ship weapon');
  if (command && weapon === 'blaster') throw new RangeError('Blasters cannot target the command centre');
  if (weapon !== 'blaster' && fight.ammunition < 1) throw new RangeError('No ammunition');
  const next = clone(fight), dice = [];
  if (weapon !== 'blaster') next.ammunition--;
  const hit = weapon === 'blaster' ? next.ship.attack + die(roll, dice) + die(roll, dice) > next.base.defence
    : !next.atmosphericShield && (['antiproton', 'pa'].includes(weapon) || die(roll, dice) % 2 === 0);
  if (hit) {
    if (command) next.commandHits++;
    else if (weapon !== 'pa') next.targets--;
    if (weapon === 'pa') next.base.attack = Math.max(0, next.base.attack - 4);
  } else if (command) next.commandHits = 0;
  const attack = next.base.attack + die(roll, dice) + (weapon === 'blaster' ? die(roll, dice) : 0);
  const damage = weapon === 'blaster' ? Math.max(0, attack - next.ship.shield) : attack > next.ship.shield ? 10 : 0;
  next.ship.life = Math.max(0, next.ship.life - damage);
  if (next.ship.life === 0) next.status = 'loss';
  else if (next.commandHits === 6 || next.targets === 0) next.status = 'win';
  next.round++; next.dice = dice;
  return { fight: next, hit, damage, attack, dice };
}
