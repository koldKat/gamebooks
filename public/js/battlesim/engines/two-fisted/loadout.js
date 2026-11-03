// Apply only the selected combat equipment modifiers supplied by the database catalog.
export function combatLoadout(actor, mode, round) {
  const weapon = actor.loadout?.[mode];
  const result = {expertise: weapon?.expertiseBonus ?? 0, damage: weapon?.damage ?? actor.damage ?? 1,
    fists: actor.badgeActive ? 1 : 0, roll: 0};
  for (const effect of actor.loadout?.extras ?? []) {
    if (effect.modes && !effect.modes.includes(mode) || effect.firstRound && round !== 1) continue;
    result.fists += effect.fistsBonus ?? 0; result.roll += effect.rollBonus ?? 0;
  }
  return result;
}

export function trobbleActive(player) {
  return Boolean(player.trobble && !player.trobble.inactive && !player.trobble.discarded);
}
