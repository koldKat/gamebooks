// Apply declared Fatemaster casting consequences without resolving story outcomes.
import {conscious, integer} from './rules.js';
import {event, pump} from './flow.js';

export function validateFatemasterSpellConsequences(rules) {
  if (rules.survivingCastBonusMode !== undefined && !['once', 'per-cast'].includes(rules.survivingCastBonusMode)) throw new Error('Choose a casting fury interpretation');
  if (rules.survivingCastDamageBonus !== undefined) {
    integer(rules.survivingCastDamageBonus, 'casting fury damage', 0, 10);
    if (!rules.survivingCastBonusMode) throw new Error('Choose a casting fury interpretation');
  }
  for (const key of ['pauseBeforeSpellEffects', 'pauseAfterSpellEffects']) {
    if (rules[key] !== undefined && (!Array.isArray(rules[key]) || rules[key].some(spell => typeof spell !== 'string'))) throw new Error('Invalid casting consequence');
  }
  if (rules.healingDetection !== undefined && typeof rules.healingDetection !== 'boolean') throw new Error('Invalid casting detection');
}

export function applyFatemasterCastFury(fight) {
  if (!fight.rules.survivingCastAttackBonus && !fight.rules.survivingCastDamageBonus) return;
  const bonus = integer(fight.rules.survivingCastAttackBonus ?? 0, 'casting frenzy bonus', 0, 10);
  const damageBonus = integer(fight.rules.survivingCastDamageBonus ?? 0, 'casting fury damage', 0, 10);
  const affected = [];
  for (const enemy of fight.opponents.filter(enemy => conscious(enemy) && !['asleep', 'helpless'].includes(enemy.condition))) {
    if (fight.rules.survivingCastBonusMode === 'once' && enemy.castFuryApplied) continue;
    enemy.attackBase += bonus;
    enemy.damage += damageBonus;
    enemy.castFuryApplied = true;
    affected.push(enemy.id);
  }
  event(fight, 'casting-frenzy', {bonus, damageBonus, enemyIds: affected});
}

export function pauseFatemasterSpell(fight) {
  event(fight, 'spell-reader-consequence', {spell: fight.casting.spell});
  fight.casting = null;
  fight.status = 'paused';
  fight.pauseReason = 'spell-consequence';
  return pump(fight);
}
