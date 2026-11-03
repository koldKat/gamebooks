// Apply explicitly selected printed combat effects without acquiring or consuming story inventory.
import {applyBlackSunDamage} from './special.js';

function integer(value, min = 0, max = 1000) {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new RangeError('Invalid combat effect');
  return value;
}

export function blackSunEffectAvailable(fight, effect) {
  const p = fight.player;
  return (!effect.requiresDead || p.vitality >= (p.kesrani ? 6 : 5))
    && (!effect.requiresPendingSection || fight.pending?.section === effect.requiresPendingSection)
    && Object.entries(effect.requiresPlayer ?? {}).every(([key, value]) => p[key] === value)
    && !Object.entries(effect.excludesPlayer ?? {}).some(([key, value]) => p[key] === value)
    && (!effect.requiresAbility || fight.encounter[effect.requiresAbility])
    && p.karma >= (effect.minimumKarma ?? 0)
    && (effect.maxUses == null || (fight.effectUses?.[effect.id] ?? 0) < effect.maxUses);
}

export function applyBlackSunEffect(fight, effect, options = {}) {
  const p = fight.player, slot = fight.round + Number(!fight.roundStarted);
  if (!effect || typeof effect.id !== 'string' || !effect.id) throw new RangeError('Unknown combat effect');
  if (!blackSunEffectAvailable(fight, effect)) throw new RangeError('Combat effect unavailable');
  if (fight.encounter.defenseOnly && (effect.enemyDamage || effect.killEnemy || effect.karmaBurst)) throw new RangeError('Opponent has no resistance');
  if (p.karma < integer(effect.minimumKarma ?? 0)) throw new RangeError('Combat effect unavailable');
  const uses = fight.effectUses ??= {};
  if (effect.maxUses != null && (uses[effect.id] ?? 0) >= integer(effect.maxUses, 1)) throw new RangeError('Combat effect spent');
  const rounds = fight.effectRounds ??= {};
  if (effect.onePerRoundGroup && rounds[effect.onePerRoundGroup] === slot) throw new RangeError('Extra action already used this round');
  let cost = integer(effect.karmaCost ?? 0);
  let restore = effect.setVitality;
  const choose = effect.chooseVitality || effect.chooseVitalityOnMoon && options.moon === effect.chooseVitalityOnMoon
    || effect.chooseVitalityWithAbility && fight.encounter[effect.chooseVitalityWithAbility];
  if (effect.restoreFitWithAbility && fight.encounter[effect.restoreFitWithAbility]) restore = 0;
  else if (choose) restore = integer(options.vitality, 0, 4);
  else if (effect.vitalityByMoon) {
    restore = effect.vitalityByMoon[options.moon];
    if (restore == null) throw new RangeError('Choose a printed moon result');
  }
  if (restore != null) {
    integer(restore, 0, 4);
    if (restore > p.vitality) throw new RangeError('Restoration cannot worsen vitality');
    cost += (p.vitality - restore) * integer(effect.karmaPerHealedLevel ?? 0);
  }
  if (p.karma < cost) throw new RangeError('Not enough Karma');
  p.karma -= cost;
  if (effect.cancelIncoming) {
    const last = fight.log.at(-1);
    if (last?.round === fight.round && last.playerLoss > 0) { p.vitality--; last.playerLoss--; }
    else if (effect.cancelIncoming === 'required') throw new RangeError('No current hit to cancel');
  }
  if (restore != null) p.vitality = restore;
  p.vitality = Math.max(0, p.vitality - integer(effect.heal ?? 0));
  const moonLoss = effect.playerLossByMoon ? effect.playerLossByMoon[options.moon] : 0;
  p.vitality = Math.min(p.kesrani ? 6 : 5, p.vitality + integer(effect.playerLoss ?? 0)
    + integer(moonLoss));
  if (effect.attackBoost) {
    integer(effect.attackBoost.amount, -1000); integer(effect.attackBoost.rounds, 1);
    (fight.attackBoosts ??= []).push({amount: effect.attackBoost.amount, expires: slot + effect.attackBoost.rounds - 1});
  }
  if (effect.defenseBoost) {
    integer(effect.defenseBoost.amount, -1000); integer(effect.defenseBoost.rounds, 1);
    (fight.defenseBoosts ??= []).push({amount: effect.defenseBoost.amount, expires: slot + effect.defenseBoost.rounds - 1});
  }
  if (effect.skipRoundActions) fight.skipActionsRound = slot;
  if (effect.enemyAttackDelta) fight.enemyAttackPenalty = (fight.enemyAttackPenalty ?? 0) - integer(effect.enemyAttackDelta, -1000);
  let targetIndex = options.target ?? 0;
  if (effect.target === 'last') targetIndex = fight.opponents.length - 1;
  const target = fight.opponents[integer(targetIndex, 0, fight.opponents.length - 1)];
  if (effect.enemyDamage) applyBlackSunDamage(fight, target, integer(effect.enemyDamage, 1));
  if (effect.enemyDamageFrom === 'riderRank') applyBlackSunDamage(fight, target, integer(options.riderRank ?? p.riderRank, 1, 5));
  if (effect.killEnemy) target.resistance = 0;
  if (effect.karmaBurst) {
    if (p.karma < 1) throw new RangeError('No Karma left');
    applyBlackSunDamage(fight, target, p.karma, {shieldCost: 3}); p.karma = 0; fight.forcedAttackRound = slot;
  }
  if (effect.kyrnaLoss) {
    integer(p.kyrnaVitality, 0, 5);
    for (let n = integer(effect.kyrnaLoss, 1); n > 0 && p.kyrnaVitality < 5; n--) {
      if (p.kyrnaArmor && !p.kyrnaArmorSpent && p.kyrnaVitality === 1) p.kyrnaArmorSpent = true;
      else p.kyrnaVitality++;
    }
    if (p.kyrnaVitality === 5) {
      if (effect.dismountOnDragonDeath) p.mounted = false;
      else if (p.mounted) p.vitality = p.kesrani ? 6 : 5;
    }
  }
  uses[effect.id] = (uses[effect.id] ?? 0) + 1;
  if (effect.onePerRoundGroup) rounds[effect.onePerRoundGroup] = slot;
  return fight;
}
