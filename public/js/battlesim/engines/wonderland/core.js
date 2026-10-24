import { WONDERLAND_ENCOUNTERS } from './roster.js';
import { wonderlandDraw, wonderlandInteger } from './random.js';

const rulesFor = encounter => encounter.specialRules ?? WONDERLAND_ENCOUNTERS.find(row => row.section === encounter.section)?.specialRules ?? {};
const clone = value => structuredClone(value);
const weapons = new Set(['unarmed', 'scissors', 'spade', 'knife', 'tusk', 'axe', 'vorpal', 'club', 'mallet']);
const protections = new Set(['none', 'shell', 'tray', 'coat']);
function endurance(value, min = 0) {
  if (!Number.isFinite(value) || value < min || value > 1000000 || !Number.isInteger(value * 2)) throw new RangeError('Invalid Endurance');
  return value;
}
function actor(value) {
  return { ...clone(value), combat: wonderlandInteger(value.combat), endurance: endurance(value.endurance, .5) };
}
function initiative(value) {
  if (!['player', 'enemy', 'none'].includes(value)) throw new RangeError('Choose the printed initiative');
  return value;
}

export function startWonderlandFight(player, encounter, options = {}) {
  if (!encounter || !encounter.enemies?.length) throw new RangeError('Missing encounter');
  const weapon = options.weapon ?? 'unarmed', protection = options.protection ?? 'none';
  if (!weapons.has(weapon) || !protections.has(protection)) throw new RangeError('Invalid equipment');
  const mode = options.mode ?? 'dice';
  if (!['dice', 'cards'].includes(mode)) throw new RangeError('Invalid random mode');
  const p = actor(player), enemies = encounter.enemies.map(actor);
  const penalty = wonderlandInteger(encounter.combatPenalty ?? 0, 0, 2);
  const cake = !!options.cake;
  if (cake) {
    wonderlandInteger(options.cakeUses, 1);
    p.endurance += 4;
  }
  if (options.pepper) {
    wonderlandInteger(options.pepperUses, 1);
    if (encounter.inanimate) throw new RangeError('Pepper does not affect animated objects');
    if (enemies.length !== 1) throw new RangeError('Choose the pepper target explicitly for a group');
    enemies[0].combat = Math.max(0, enemies[0].combat - 1);
  }
  const teapotInjury = !!rulesFor(encounter).teapotInjury && !!options.teapotInjury;
  const first = initiative(options.initiative ?? (teapotInjury ? 'enemy' : encounter.initiative));
  const activeCount = encounter.gardeners ? 2 : encounter.sequential ? 1 : encounter.stages?.[0] ?? enemies.length;
  return { player: p, enemies, initialEndurance: p.endurance, weapon, protection, mode,
    section: encounter.section, encounter: clone(encounter), initiative: first, startingInitiative: first,
    active: Array.from({ length: activeCount }, (_, i) => i), waiting: activeCount,
    round: 0, stage: 0, defeated: 0, status: 'fighting', pendingInitiative: false,
    combatModifier: (weapon === 'axe' ? -1 : weapon === 'vorpal' ? 1 : 0) - penalty - (teapotInjury ? 1 : 0) + (cake ? 1 : 0),
    cakeSpent: cake ? 1 : 0, pepperSpent: options.pepper ? 1 : 0,
    enemyStreaks: enemies.map(() => 0) };
}

function complete(fight, status) {
  fight.status = status;
  fight.pendingInitiative = false;
  const rules = rulesFor(fight.encounter);
  if (rules.restoreEndurance === 'always') fight.player.endurance = fight.initialEndurance;
  if (rules.restoreEndurance === 'winOrHalfLoss') {
    fight.player.endurance = status === 'win' ? fight.initialEndurance
      : fight.player.endurance + (fight.initialEndurance - fight.player.endurance) / 2;
  }
}

function advance(fight) {
  if (fight.player.endurance <= 0) { complete(fight, 'loss'); return; }
  const survivors = fight.active.filter(i => fight.enemies[i].endurance > 0);
  fight.defeated += fight.active.length - survivors.length;
  fight.active = survivors;
  if (fight.encounter.gardeners) {
    if (fight.defeated >= 2) { complete(fight, 'win'); return; }
    if (survivors.length < 2 && fight.waiting < fight.enemies.length) fight.active.push(fight.waiting++);
  } else if (!survivors.length && fight.waiting < fight.enemies.length) {
    const count = fight.encounter.sequential ? 1 : fight.encounter.stages?.[++fight.stage];
    if (!count) throw new RangeError('Missing group stage');
    fight.active = Array.from({ length: count }, () => fight.waiting++);
    fight.initiative = initiative(fight.encounter.stageInitiatives?.[fight.stage] ?? fight.startingInitiative);
    fight.pendingInitiative = false;
    return;
  }
  if (!fight.active.length) complete(fight, 'win');
}

export function resolveWonderlandInitiative(fight, side) {
  if (fight.status !== 'fighting' || !fight.pendingInitiative) throw new RangeError('No initiative decision');
  const next = clone(fight);
  next.initiative = initiative(side);
  next.pendingInitiative = false;
  return next;
}

export function wonderlandRound(fight, { roll, random } = {}) {
  if (fight.status !== 'fighting' || fight.pendingInitiative) throw new RangeError('Fight is not ready');
  const next = clone(fight), draws = [], rules = rulesFor(fight.encounter);
  const draw = (count = 2) => {
    const result = wonderlandDraw(next.mode, roll, random, count);
    draws.push(result);
    return result;
  };
  const playerRating = draw().value + next.player.combat + next.combatModifier + (next.initiative === 'player' ? 1 : 0);
  const results = next.active.map(index => {
    const enemy = next.enemies[index];
    const rating = draw().value + enemy.combat + (next.initiative === 'enemy' ? 1 : 0);
    return { index, enemyRating: rating, outcome: playerRating > rating ? 'player' : playerRating < rating ? 'enemy' : 'tie' };
  });
  let incoming = 0, combatDrain = 0;
  for (const result of results) {
    const enemy = next.enemies[result.index];
    let loss = 0, damage = 0, bypassProtection = false;
    next.enemyStreaks[result.index] = result.outcome === 'enemy' ? next.enemyStreaks[result.index] + 1 : 0;
    if (result.outcome === 'player') {
      damage = next.weapon === 'unarmed' ? 2 : next.weapon === 'vorpal'
        ? next.encounter.ironScales ? 3 : 4 : 3;
      if (rules.playerDamage !== undefined) damage = rules.playerDamage;
      if (rules.scissors && next.weapon === 'scissors') {
        damage = rules.scissors.damage; enemy.combat = Math.max(0, enemy.combat - rules.scissors.combatDrain);
      }
      if (next.weapon === 'club' || next.weapon === 'mallet') {
        const hit = draw();
        const knockout = next.mode === 'cards' ? hit.cards[0].rank >= 12 : hit.value >= 11;
        if (knockout) { damage = enemy.endurance; result.knockout = true; }
      }
    } else if (result.outcome === 'enemy') {
      loss = rules.enemyDamage ?? 2;
      if (rules.dieDamage) {
        const hit = draw(1);
        loss = (next.mode === 'cards' ? hit.cards[0].red : hit.value % 2) ? rules.dieDamage.redOrOdd : rules.dieDamage.blackOrEven;
      }
      if (rules.steam) {
        const hit = draw();
        const steam = next.mode === 'cards' ? hit.cards[0].rank >= rules.steam.cardRank : hit.value >= rules.steam.dice;
        if (steam) loss += rules.steam.bonus;
      }
      if (rules.streak && next.enemyStreaks[result.index] >= rules.streak.hits) {
        loss = (rules.streak.damage ?? loss) + (rules.streak.bonus ?? 0);
        bypassProtection = !!rules.streak.bypassProtection;
        combatDrain += rules.streak.combatDrain ?? 0;
      }
      if (next.protection !== 'none' && !bypassProtection) loss = Math.max(0, loss - 1);
    } else {
      if (draw(1).value % 2 === 0) { loss = 1; damage = 1; }
      if (next.protection !== 'none') loss = Math.max(0, loss - 1);
    }
    enemy.endurance = Math.max(0, enemy.endurance - damage);
    incoming += loss;
    Object.assign(result, { playerLoss: loss, enemyLoss: damage });
  }
  next.player.endurance = Math.max(0, next.player.endurance - incoming);
  next.player.combat = Math.max(0, next.player.combat - combatDrain);
  next.round++;
  const winners = new Set(results.map(r => r.outcome));
  if (winners.size === 1) next.initiative = results[0].outcome === 'tie' ? 'none' : results[0].outcome;
  else {
    // Mixed group outcomes do not specify who receives the single initiative bonus.
    next.pendingInitiative = true;
  }
  advance(next);
  return { fight: next, playerRating, results, draws, playerLoss: incoming, combatDrain };
}
