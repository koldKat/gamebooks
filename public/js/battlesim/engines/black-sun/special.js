// Apply encounter-specific resistance tracks, body parts and incoming combat effects.
export function blackSunTargetAllowed(fight, target) {
  return !(target.protectedBy ?? []).some(key => fight.opponents.some(enemy => enemy.key === key && enemy.resistance > 0));
}

export function applyBlackSunDamage(fight, target, damage, {shieldCost = 2} = {}) {
  const before = target.resistance;
  if (!target.track) target.resistance = Math.max(0, before - damage);
  else {
    let position = target.track.length - target.resistance;
    while (damage > 0 && position < target.track.length) {
      const cost = target.track[position] === 'shield' ? shieldCost : 1;
      if (damage < cost) break; // Partial shield damage never carries into another round.
      damage -= cost;
      if (cost === 1) target.trueResistanceDamage = (target.trueResistanceDamage ?? 0) + 1;
      else target.shieldsRemoved = (target.shieldsRemoved ?? 0) + 1;
      target.resistance--; position++;
    }
  }
  return before - target.resistance;
}

export function blackSunHitEffect(fight, report) {
  const e = fight.encounter;
  if (e.harpoon && report.enemyLoss > 0) {
    fight.harpooned = true;
    fight.harpoonTarget = report.target;
  }
  if (e.firstHitEvent && !fight.acknowledged.includes(e.firstHitEvent.id)) return e.firstHitEvent;
  if (e.partsDisabledEvent && !fight.acknowledged.includes(e.partsDisabledEvent.id)
      && !fight.opponents.some(enemy => enemy.attack != null && enemy.resistance > 0)) return e.partsDisabledEvent;
  return null;
}

export function blackSunIncomingAttacks(fight, combinedAttack) {
  if (fight.harpooned) return [];
  if (fight.encounter.separatePartAttacks) {
    return fight.opponents.filter(enemy => enemy.resistance > 0 && enemy.attack != null)
      .map(enemy => ({name: enemy.name, attack: enemy.attack}));
  }
  return [{attack: combinedAttack}];
}

export function blackSunDefenseEffect(fight, report) {
  const e = fight.encounter;
  if (e.mentalCombat) {
    if (e.ignoreFirstMentalHit && !fight.mentalHitIgnored) { fight.mentalHitIgnored = true; return {ignore: true}; }
    return {ignore: true, event: report.round <= 2 ? e.earlyMentalHitEvent : e.lateMentalHitEvent};
  }
  if (fight.ally && report.page.base <= fight.ally.lowBaseMax) fight.ally.vitality = Math.max(0, fight.ally.vitality - 1);
  return {ignore: false};
}
