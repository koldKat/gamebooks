export function legendaryEnemyZone(fight, enemy) {
  if (enemy.zone === 'walkwayOrPool') return fight.participants.some(index =>
    fight.party[index].health > 0 && fight.zones[index] === 'walkway') ? 'walkway' : 'pool';
  return enemy.zone;
}

export function legendaryCanReach(fight, memberIndex, enemy, magic) {
  const zone = legendaryEnemyZone(fight, enemy);
  return !zone || fight.zones[memberIndex] === zone || (magic && !!enemy.outsideSpellsAllowed);
}

export function requireLegendaryLocation(fight, memberIndex, enemy, magic) {
  if (!legendaryCanReach(fight, memberIndex, enemy, magic))
    throw new RangeError('This opponent is out of reach from the current location');
}

export function legendaryZoneRecipients(fight, enemy) {
  const zone = legendaryEnemyZone(fight, enemy);
  return fight.participants.filter(index => fight.party[index].health > 0 && (!zone || fight.zones[index] === zone));
}
