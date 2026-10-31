// Expose immutable saved-state actions for one optional formation combat encounter.
import { validateFormationConfig, formationSideUnits } from './formation-config.js';
import { formationEngagedCount } from './formation-rules.js';
import { personnelDice } from './personnel-rules.js';
import { formationOutcome, formationNext, finishFormation, resolveFormationTask, applyFormationAttack } from './formation-flow.js';

function guard(fight, phase) {
  if (fight?.formationRulesVersion !== 1 || fight.status !== 'fighting' || phase && fight.phase !== phase) throw new RangeError('No matching formation action pending');
}

export function startFormationFight(player, encounter, charts) {
  const checked = validateFormationConfig(encounter, player, charts);
  const tracked = new Set();
  for (const attack of [...(checked.config.opening ?? []), ...checked.config.rounds.flatMap(sequence => sequence.attacks)]) {
    for (const actor of attack.actors ?? []) if (typeof actor.countLimit === 'object'
        && actor.countLimit.lossRound !== undefined) tracked.add(actor.countLimit.lossRound);
  }
  const fight = {formationRulesVersion:1,...checked,charts:structuredClone(charts),
    start:{player:structuredClone(checked.player),enemies:structuredClone(checked.enemies)},
    round:0,status:'fighting',phase:'ready',section:null,pending:null,queue:[],
    history:[{round:0,attacks:[],checks:[]}],trackedLossRounds:[...tracked],lossByRound:{}};
  if (fight.config.opening?.length) {
    fight.queue = [...fight.config.opening.map(attack => ({kind:'attack',attack})),{kind:'opening-end'}];
    formationNext(fight);
  } else formationOutcome(fight);
  return fight;
}

export function beginFormationRound(previous) {
  guard(previous,'ready');
  const fight = structuredClone(previous);
  if (formationOutcome(fight)) return fight;
  const round = fight.round + 1;
  if (fight.config.escapeAtStart) {
    const rule = fight.config.escapeAtStart;
    const units = formationSideUnits(fight,rule.side).filter(unit => rule.keys.includes(unit.key));
    const hasAttacker = units.some(unit => formationEngagedCount(unit,round,fight.config.engagements?.[rule.side]?.[unit.key]));
    if (!hasAttacker) {finishFormation(fight,'escaped');return fight;}
  }
  const sequence = fight.config.rounds.find(entry => round >= entry.from && round <= (entry.to ?? Infinity));
  if (!sequence) {finishFormation(fight,'paused');return fight;}
  fight.round = round;
  fight.history.push({round,attacks:[],checks:[]});
  fight.history = fight.history.slice(-100);
  fight.queue = [...sequence.attacks.map(attack => ({kind:'attack',attack:structuredClone(attack)})),{kind:'round-end'}];
  formationNext(fight);
  return fight;
}

export function resolveFormationRoll(previous, total, roll) {
  guard(previous,'roll');
  const fight = structuredClone(previous), task = fight.pending;
  if (!task || !['attack','morale'].includes(task.kind)) throw new RangeError('No formation dice pending');
  const result = personnelDice(total,2,roll);
  fight.pending = null;
  resolveFormationTask(fight,task,result);
  return fight;
}

export function allocateFormationCasualties(previous, allocation) {
  guard(previous,'allocation');
  const fight = structuredClone(previous), pending = fight.pending;
  if (pending?.kind !== 'allocation') throw new RangeError('No casualty choice pending');
  fight.pending = null;
  applyFormationAttack(fight,pending.task,pending.attackIndex,allocation);
  return fight;
}

export function cancelFormationFight(previous) {
  if (previous?.formationRulesVersion !== 1 || !['fighting','paused'].includes(previous.status)) throw new RangeError('No formation encounter to end');
  const fight = structuredClone(previous);
  finishFormation(fight,'cancelled');
  return fight;
}
