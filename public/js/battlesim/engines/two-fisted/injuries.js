// Apply the printed injury penalties consistently to combatants in any encounter mode.
export const coPilotSkills = Object.freeze(['combat', 'weapons', 'manoeuvre', 'shields']);

export function coPilotAlive(crew) {
  return Boolean(crew && !crew.dead && coPilotSkills.some(key => (crew[key] ?? 0) > 0));
}

export function injureCombatant(player, who, lethal = false) {
  const actor = who === 'hero' ? player : player.copilot;
  if (!actor) return null;
  if (lethal) {actor.dead = true; return {type: 'lethal-hit', who};}
  if (actor.armour === 'nova' || actor.traumaActive) return {type: 'injury-blocked', who};
  if (actor.traumaKit) {
    actor.traumaKit = false; actor.traumaActive = true;
    if (actor.traumaKitItem && player.inventory) player.inventory[actor.traumaKitItem] = Math.max(0, (player.inventory[actor.traumaKitItem] ?? 0) - 1);
    return {type: 'trauma-kit', who};
  }
  actor.injuries = (actor.injuries ?? 0) + 1;
  if (who === 'hero') {
    if (!actor.trueGrit) actor.expertise = Math.max(0, actor.expertise - 1);
  } else if (actor.trait === 'horizon' && !actor.armourInjuryUsed) actor.armourInjuryUsed = true;
  else {
    for (const key of coPilotSkills) if (actor[key] != null) actor[key] = Math.max(0, actor[key] - 1);
    actor.dead = !coPilotSkills.some(key => (actor[key] ?? 0) > 0);
  }
  return {type: 'injury', who};
}
