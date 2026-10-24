import { validateOpponents } from '../../opponents.js';
import { createRosterLoader } from '../../roster-data.js';

export let LAREGOD_ENCOUNTERS = {};
export const loadRoster = createRosterLoader(644, 'ENCOUNTERS', rows => {
  const entries = Object.fromEntries(rows.map(row => [row.context, row]));
  if (!['yard', 'market', 'guard'].every(key => entries[key])) throw new Error('Incomplete Laregod catalog');
  LAREGOD_ENCOUNTERS = entries;
});
const sourceEncounter = context => LAREGOD_ENCOUNTERS[context] ?? Object.values(LAREGOD_ENCOUNTERS).find(row => row.manualDefault);

const clone = value => structuredClone(value);
const contexts = new Set(['yard', 'market', 'guard', 'manual']);
const opponents = new Set(['wingrugur', 'butchersword', 'other']);

function integer(value, maximum = 1000000) {
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) throw new RangeError('Invalid combat number');
  return value;
}
function die() {
  return Math.floor(Math.random() * 6) + 1;
}
function draw(roll) {
  const value = integer(roll(), 6);
  if (!value) throw new RangeError('A die must roll 1-6');
  return value;
}

export function laregodPoints(equipment = {}, opponent = 'other', context = 'manual') {
  if (!opponents.has(opponent) || !contexts.has(context)) throw new RangeError('Invalid encounter');
  const armour = ['sword', 'mail', 'dagger'].filter(key => equipment[key]).length;
  const set = armour === 3 ? 20 : armour * 5;
  const scimitar = equipment.scimitar ? opponent === 'other' ? 5 : 20 : 0;
  const stone = equipment.stone ? context === 'market' ? 20 : context === 'guard' ? 10 : 0 : 0;
  return 20 + set + scimitar + stone + (equipment.success ? 10 : 0);
}

export function startLaregodFight(context, options = {}, roll = die) {
  if (!contexts.has(context)) throw new RangeError('Invalid fight context');
  const encounter = sourceEncounter(context);
  const opponent = context === 'manual' ? options.opponent ?? 'other' : encounter.opponent;
  const points = laregodPoints(options.equipment, opponent, context);
  const enemyNumber = options.enemyNumber === undefined ? draw(roll) : integer(options.enemyNumber);
  const custom = context === 'manual' && options.opponents ? validateOpponents(options.opponents,
    [{key:'points',max:10000030},{key:'endurance',min:1,max:10000},{key:'playerPoints',max:10000030},{key:'playerEndurance',min:1,max:10000}]) : null;
  if (custom && custom.length !== 1) throw new RangeError('Choose one opponent');
  const row = custom?.[0];
  return {
    ...(row ? {custom:true,displayName:row.displayName} : {}),
    rulesVersion: 1, context, opponent, encounter: clone(encounter), equipment: clone(options.equipment ?? {}),
    player: { points: row?.playerPoints ?? points, endurance: row?.playerEndurance ?? 10 },
    enemy: { points: row?.points ?? enemyNumber * encounter.enemy.points.perNumber + encounter.enemy.points.base, endurance: row?.endurance ?? encounter.enemy.endurance },
    enemyNumber, round: 0, status: 'fighting',
  };
}

export function laregodRound(fight, options = {}, roll = die) {
  if (fight.rulesVersion !== 1 || fight.status !== 'fighting') throw new RangeError('No active fight');
  if (!contexts.has(fight.context) || !opponents.has(fight.opponent)) throw new RangeError('Invalid fight');
  const encounter = fight.encounter ?? sourceEncounter(fight.context);
  integer(fight.player.points, 10000030); integer(fight.enemy.points, 10000030);
  if (!integer(fight.player.endurance, fight.custom ? 10000 : 10) || !integer(fight.enemy.endurance, fight.custom ? 10000 : encounter.enemy.endurance)) throw new RangeError('Fight already ended');
  integer(fight.round);
  const number = options.number === undefined ? draw(roll) : integer(options.number);
  const playerRating = fight.player.points + number, enemyRating = fight.enemy.points;
  const outcome = playerRating > enemyRating ? 'player' : playerRating < enemyRating ? 'enemy' : 'tie';
  const playerLoss = outcome === 'player' ? 0 : outcome === 'enemy' ? encounter.enemy.damage : 1;
  const enemyLoss = outcome === 'enemy' ? 0 : outcome === 'player' ? 2 : 1;
  const next = clone(fight);
  next.player.endurance = Math.max(0, next.player.endurance - playerLoss);
  next.enemy.endurance = Math.max(0, next.enemy.endurance - enemyLoss);
  next.round++;
  // A simultaneous fatal tie cannot leave a living player victorious.
  next.status = next.player.endurance === 0 ? 'loss' : next.enemy.endurance === 0 ? 'win' : 'fighting';
  return { fight: next, number, playerRating, enemyRating, outcome, playerLoss, enemyLoss };
}
