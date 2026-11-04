// Resolve pre-combat flight and the source's separate fatal archery encounter.
import {ready} from './core.js';
import {fighter, effectiveStats, rollDice, number} from './math.js';

function record(fight, event) {
  fight.events.push(event);
  fight.events = fight.events.slice(-160);
}

export function attemptFlight(input, {total, enemyIndex = 0, failedRule} = {}, die) {
  ready(input);
  if (input.roundActions || input.round !== 1 || input.flightAttempted || input.special) {
    throw new RangeError('Flight is available only before combat begins.');
  }
  if (!['detailed','synopsis'].includes(failedRule)) throw new RangeError('Choose the printed failed-flight damage rule.');
  const fight = structuredClone(input), enemy = fight.enemies[enemyIndex];
  if (!enemy || enemy.withdrawn || enemy.lifePoints <= (enemy.rules.defeatAt ?? 0)) throw new RangeError('Choose an active opponent.');
  const roll = rollDice(2,die,total), score = roll.total + (fight.options.cursed ? 1 : 0) + number(fight.options.luckBonus ?? 0,0,2);
  fight.flightAttempted = true;
  if (score >= 9) fight.outcome = 'escaped';
  else {
    fight.first = 'enemy';
    if (score >= 5) {
      enemy.status.doubleDiceNext = true;
      fight.retreatPending = true;
      fight.flightEnemyIndex = enemyIndex;
    } else if (failedRule === 'detailed') enemy.status.doubleNext = true;
    else enemy.status.doubleDiceNext = true;
  }
  record(fight,{kind:'flight',roll,score,failedRule,route:score >= 9 ? 'available-exit' : score >= 5 ? 'previous-section' : 'blocked'});
  return fight;
}

export function startArchery({player, role, name = 'Archer', section = 'custom', options = {}} = {}) {
  if (!['harker','dracula'].includes(role)) throw new RangeError('Choose a role.');
  return {rulesVersion:1,section:String(section),role,player:fighter(player,{player:true}),
    // No invented opponent Life Points or combat stats are assigned.
    enemies:[{name:String(name).slice(0,200),rules:{archery:true}}],options:structuredClone(options),
    special:{kind:'archery',stage:'speed'},outcome:null,pending:null,events:[]};
}

export function archeryCheck(input, {total} = {}, die) {
  ready(input);
  if (input.special?.kind !== 'archery' || input.special.stage === 'manual') throw new RangeError('Choose an available archery check.');
  const fight = structuredClone(input), stage = fight.special.stage;
  const roll = rollDice(stage === 'speed' ? 1 : 2,die,total);
  const modifier = fight.options.cursed ? (stage === 'player' ? 1 : -1) : 0;
  const score = roll.total + modifier;
  if (stage === 'speed') {
    const speed = effectiveStats(fight.player,fight.options).speed;
    fight.special.stage = score > speed ? 'enemy' : score < speed ? 'player' : 'manual';
    if (score === speed) fight.special.reason = 'equal-speed';
  } else if (stage === 'enemy') {
    if (score > 7) {fight.player.lifePoints = 0; fight.outcome = 'loss';}
    else fight.special.stage = 'player';
  } else if (stage === 'player') {
    if (score > 7) fight.outcome = 'win';
    else {fight.special.stage = 'manual'; fight.special.reason = 'missed-throat-attack';}
  } else throw new RangeError('Unknown archery stage.');
  record(fight,{kind:'archery',stage,roll,score,next:fight.special.stage,outcome:fight.outcome});
  return fight;
}

export function resolveArchery(input, {decision,note} = {}) {
  ready(input);
  if (input.special?.kind !== 'archery' || input.special.stage !== 'manual'
      || !['speed','enemy','player','win','loss','cancelled'].includes(decision)
      || !String(note || '').trim()) throw new RangeError('Record your source ruling for the unresolved archery result.');
  const fight = structuredClone(input);
  if (['win','loss','cancelled'].includes(decision)) {
    fight.outcome = decision;
    if (decision === 'loss') fight.player.lifePoints = 0;
  } else fight.special.stage = decision;
  record(fight,{kind:'manual-archery',decision,note:String(note).trim().slice(0,500)});
  return fight;
}
