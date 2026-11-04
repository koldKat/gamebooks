// Resolve independent CS-versus-DS encounters using a database-supplied Shinté chart.
const copy = value => structuredClone(value);
export function integer(value, min = 0, max = 10000) {
  if (value === '' || value == null || !Number.isInteger(Number(value)) || Number(value) < min || Number(value) > max) {
    throw new RangeError('Enter a valid whole number.');
  }
  return Number(value);
}

export function validateChart(chart) {
  if (!chart || !Array.isArray(chart.columnLabels) || !Array.isArray(chart.rowLabels)
      || !Array.isArray(chart.values) || !chart.columnLabels.length || chart.values.length !== chart.rowLabels.length
      || chart.columnLabels.some(value => typeof value !== 'string') || chart.rowLabels.some(value => typeof value !== 'string')
      || chart.values.some(row => !Array.isArray(row) || row.length !== chart.columnLabels.length
        || row.some(value => value !== 'K' && (!Number.isInteger(value) || value < 0)))) {
    throw new RangeError('The printed combat chart is unavailable.');
  }
  return chart;
}

export function chartColumn(chart, difference, zeroColumn = null) {
  validateChart(chart);
  if (!Number.isInteger(difference)) throw new RangeError('Invalid combat difference.');
  if (difference === 0) {
    if (zeroColumn == null || zeroColumn === '') throw new RangeError('Choose a printed chart column for a difference of zero.');
    return integer(zeroColumn, 0, chart.columnLabels.length - 1);
  }
  const index = chart.columnLabels.findIndex(label => {
    let match;
    if ((match = label.match(/^<=([+-]?\d+)$/))) return difference <= Number(match[1]);
    if ((match = label.match(/^>=([+-]?\d+)$/))) return difference >= Number(match[1]);
    if ((match = label.match(/^([+-]?\d+)\/([+-]?\d+)$/))) return difference >= Number(match[1]) && difference <= Number(match[2]);
    return difference === Number(label);
  });
  if (index < 0) throw new RangeError('Choose a printed chart column for this difference.');
  return index;
}

export function chartResult(chart, difference, total, zeroColumn = null) {
  const column = chartColumn(chart, difference, zeroColumn);
  integer(total, 2, 12);
  const row = chart.rowLabels.findIndex(label => {
    const match = label.match(/^(\d+)-(\d+)$/);
    return match ? total >= Number(match[1]) && total <= Number(match[2]) : total === Number(label);
  });
  if (row < 0) throw new RangeError('The roll is absent from the printed chart.');
  return {column, columnLabel: chart.columnLabels[column], row, result: chart.values[row][column]};
}

function ready(fight) {
  if (!fight || fight.rulesVersion !== 1 || fight.outcome) throw new RangeError('No active combat.');
}
function finish(fight) {
  if (fight.playerPP <= 0) fight.outcome = 'loss';
  else {
    while (fight.enemyIndex < fight.enemies.length && fight.enemies[fight.enemyIndex].pp <= 0) fight.enemyIndex++;
    if (fight.enemyIndex === fight.enemies.length) fight.outcome = 'win';
  }
  if (fight.outcome) fight.pending = null;
  return fight;
}
function nextTurn(fight) {
  const enemyIndex = fight.enemyIndex;
  fight.turns++;
  fight.next = fight.next === 'player' ? 'enemy' : 'player';
  finish(fight);
  if (!fight.outcome && fight.enemyIndex !== enemyIndex) fight.next = fight.first;
  return fight;
}
function dice(roll, manual) {
  if (manual !== undefined && manual !== '') return {total: integer(manual, 2, 12), dice: null};
  const values = [integer(roll(), 1, 6), integer(roll(), 1, 6)];
  return {total: values[0] + values[1], dice: values};
}

export function startFight({player, enemies, first, csModifier = 0, dsModifier = 0, receiver = 'Tsai',
  receiverPP, receiverMaxPP, openingDamage = 0, openingAttackSpent = false, zeroColumn = null,
  section = 'custom', retreatAllowed = false, netAllowed = false, netBonus = 0, turtleEligible = false}) {
  if (!['player', 'enemy'].includes(first) || !['Tsai', 'Duchess'].includes(receiver)
      || !Array.isArray(enemies) || !enemies.length || enemies.length > 100) throw new RangeError('Choose combatants and initiative.');
  integer(player.pp, 1);
  const fight = {rulesVersion: 1, section: String(section),
    player: {cs: integer(player.cs), ds: integer(player.ds)},
    playerPP: integer(receiverPP ?? player.pp, 1), receiver,
    playerMaxPP: integer(receiverMaxPP ?? player.maxPP ?? receiverPP ?? player.pp, 1),
    enemies: enemies.map(enemy => ({name: String(enemy.displayName ?? enemy.name ?? 'Opponent').trim().slice(0, 200),
      cs: integer(enemy.cs), ds: integer(enemy.ds), pp: integer(enemy.pp, 1), maxPP: integer(enemy.pp, 1)})),
    enemyIndex: 0, first, next: openingAttackSpent ? 'enemy' : first,
    csModifier: integer(csModifier, -10000), dsModifier: integer(dsModifier, -10000),
    zeroColumn: zeroColumn == null || zeroColumn === '' ? null : integer(zeroColumn, 0, 100),
    turns: openingAttackSpent ? 1 : 0, outcome: null, pending: null,
    retreatAllowed: retreatAllowed === true, netAllowed: netAllowed === true, netBonus: integer(netBonus),
    netUsed: false, turtleEligible: turtleEligible === true, turtleUsed: false, events: []};
  if (fight.playerPP > fight.playerMaxPP) throw new RangeError('Current PP cannot exceed maximum PP.');
  const damage = integer(openingDamage);
  if (damage) {
    fight.enemies[0].pp = Math.max(0, fight.enemies[0].pp - damage);
    fight.events.push({kind: 'opening', damage, receiver: fight.enemies[0].name});
  }
  return finish(fight);
}

export function attack(original, chart, {roll = () => 1 + Math.floor(Math.random() * 6), total} = {}) {
  ready(original);
  if (original.pending) throw new RangeError('Resolve the printed K result first.');
  const fight = copy(original), actor = fight.next, enemy = fight.enemies[fight.enemyIndex];
  const difference = actor === 'player' ? fight.player.cs + fight.csModifier - enemy.ds
    : enemy.cs - fight.player.ds - fight.dsModifier;
  // Validate the column before drawing any random numbers, so a missing choice cannot consume a roll.
  chartColumn(chart, difference, fight.zeroColumn);
  const pick = dice(roll, total), result = chartResult(chart, difference, pick.total, fight.zeroColumn);
  fight.events = [{kind: 'attack', actor, enemy: enemy.name, difference, ...pick, ...result}];
  if (result.result === 'K') {
    fight.pending = {kind: 'K', actor, enemyIndex: fight.enemyIndex};
    return fight;
  }
  if (actor === 'player') enemy.pp = Math.max(0, enemy.pp - result.result);
  else fight.playerPP = Math.max(0, fight.playerPP - result.result);
  return nextTurn(fight);
}

export function resolveK(original, {playerPP, enemyPP}) {
  ready(original);
  if (original.pending?.kind !== 'K') throw new RangeError('No printed K result to resolve.');
  const fight = copy(original);
  fight.playerPP = integer(playerPP, 0, fight.playerMaxPP);
  fight.enemies[fight.enemyIndex].pp = integer(enemyPP, 0, fight.enemies[fight.enemyIndex].maxPP);
  fight.pending = null;
  fight.events = [{kind: 'manual-k', playerPP: fight.playerPP, enemyPP: fight.enemies[fight.enemyIndex].pp}];
  return nextTurn(fight);
}

export function chooseZeroColumn(original, index, chart) {
  ready(original);
  if (original.pending) throw new RangeError('Resolve the printed K result first.');
  validateChart(chart);
  return {...copy(original), zeroColumn: integer(index, 0, chart.columnLabels.length - 1), events: []};
}

export function switchWeapon(original, {cs, ds}) {
  ready(original);
  if (original.pending || original.next !== 'player') throw new RangeError('Switch weapons on your own turn instead of attacking.');
  const fight = copy(original);
  fight.player = {cs: integer(cs), ds: integer(ds)};
  fight.events = [{kind: 'weapon-switch', ...fight.player}];
  return nextTurn(fight);
}

export function useNet(original, roll = () => 1 + Math.floor(Math.random() * 6)) {
  ready(original);
  if (!original.netAllowed || original.netUsed || original.pending) throw new RangeError('The net is unavailable.');
  const fight = copy(original), pick = dice(roll);
  const damage = pick.total + fight.netBonus;
  fight.enemies[fight.enemyIndex].pp = Math.max(0, fight.enemies[fight.enemyIndex].pp - damage);
  fight.netUsed = true;
  fight.events = [{kind: 'net', ...pick, damage}];
  return finish(fight);
}

export function retreat(original) {
  ready(original);
  if (!original.retreatAllowed || original.next !== 'player' || original.pending) throw new RangeError('Retreat is not available on this turn.');
  return {...copy(original), outcome: 'retreated', events: [{kind: 'retreat'}]};
}

export function cancelFight(original) {
  ready(original);
  return {...copy(original), pending: null, outcome: 'cancelled', events: []};
}
