// Queue saved Fatemaster flame-round damage and paralysis saves independently of ordinary attacks.
import {conscious, integer} from './rules.js';
import {event, pump} from './flow.js';

export function validateFatemasterHazards(rules) {
  if (rules.response !== 'flame') return;
  integer(rules.flameDamage, 'flame damage', 1, 100);
  if (!['apply', 'skip', 'ask'].includes(rules.flameOnFinal)) throw new Error('Choose flame timing for the final blow');
}

export function queueFatemasterFlameRound(fight, missed) {
  const final = fight.opponents.every(enemy => !conscious(enemy));
  fight.flameRoundPending = true;
  if (final && fight.rules.flameOnFinal === 'ask') {
    fight.queue.push({kind:'flame-round', amount:fight.rules.flameDamage});
  } else if (!final || fight.rules.flameOnFinal === 'apply') {
    fight.queue.push({kind:'damage', source:'flame', amount:fight.rules.flameDamage});
  }
  if (missed) fight.queue.push({kind:'hostile-save', effect:'paralysis'});
  fight.queue.push({kind:'flame-round-end'});
  if (!final) fight.queue.push({kind:'round-end'});
}

export function settleFatemasterFlameRound(fight, apply) {
  if (typeof apply !== 'boolean') throw new Error('Choose whether the final flame damage applies');
  const amount = fight.pending.amount;
  fight.pending = null;
  event(fight, 'flame-final-choice', {apply, amount});
  if (apply) fight.queue.unshift({kind:'damage', source:'flame', amount});
  return pump(fight);
}

export function queueFatemasterSpellParalysis(fight, casting) {
  if (fight.rules.response !== 'flame') return;
  const hostileFailed = ['bolt', 'slumber'].includes(casting.spell) && !casting.hadEffect;
  if (casting.failed || casting.resisted || hostileFailed) {
    fight.queue.unshift({kind:'hostile-save', effect:'paralysis'});
  }
}
