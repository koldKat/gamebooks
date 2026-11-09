// Resolve a duplicate's mirrored martial attacks and automatic blocks.
const die = random => 1 + Math.floor(random() * 6);
const roll = random => die(random) + die(random);

export function initializeMirror(fight) {
  const enemy = fight.opponents[0];
  Object.assign(enemy, { endurance: fight.player.endurance, innerForce: fight.player.innerForce,
    punch: fight.player.punch, kick: fight.player.kick, throw: fight.player.throw, blockPenalty: false });
}

export function attackMirror(fight, action, random) {
  const enemy = fight.opponents[0], technique = action.technique;
  const defense = fight.rules.mirrorDefense ?? 7, followup = fight.followup;
  if (!['punch', 'kick', 'throw'].includes(technique)
      || !['punch', 'kick'].includes(action.mirrorFollowupTechnique || 'punch')
      || action.mirrorInnerForce && enemy.innerForce < 1) return false;
  if (!followup) {
    fight.rounds++; fight.blocksThisRound = 0;
    fight.mirroredTechnique = technique;
  }
  fight.followup = null;
  if (action.innerForce) fight.player.innerForce--;
  const modifier = (fight.player[technique] || 0) + (action.modifier || 0)
    + (followup?.modifier || 0) - (fight.blockPenalty ? 2 : 0);
  fight.blockPenalty = false;
  const attackRoll = roll(random), hit = attackRoll + modifier > defense;
  let damage = 0;
  if (hit && technique === 'throw') fight.followup = { target: 0, modifier: 1, damageBonus: 2 };
  else if (hit) {
    const blockRoll = roll(random), blocked = blockRoll < defense;
    enemy.blockPenalty = true;
    fight.log.push({ type: 'mirror-block', roll: blockRoll, blocked });
    if (!blocked) {
      damage = (die(random) + (technique === 'kick' ? 2 : 0) + (followup ? 2 : 0)) * (action.innerForce ? 2 : 1);
      enemy.endurance = Math.max(0, enemy.endurance - damage);
    }
  }
  fight.log.push({ type: 'attack', target: 0, technique, roll: attackRoll, modifier, defense, hit, damage });
  if (enemy.endurance <= 0) { fight.outcome = 'win'; return true; }
  if (fight.followup) return true;

  let reply = fight.mirroredTechnique, bonus = 0;
  const penalty = enemy.blockPenalty ? -2 : 0;
  enemy.blockPenalty = false;
  if (reply === 'throw') {
    const throwRoll = roll(random), throwModifier = (enemy.throw || 0) + penalty;
    fight.log.push({ type: 'counter', technique: 'throw', target: 0, roll: throwRoll, modifier: throwModifier, defense });
    // Throws cannot be blocked. Only the ensuing punch or kick is a blow.
    if (throwRoll + throwModifier <= defense) return true;
    reply = action.mirrorFollowupTechnique || 'punch';
    bonus = 1;
  }
  if (action.mirrorInnerForce) enemy.innerForce--;
  const counterRoll = roll(random);
  const counterModifier = (enemy[reply] || 0) + bonus + (fight.mirroredTechnique === 'throw' ? 0 : penalty);
  fight.log.push({ type: 'counter', technique: reply, target: 0, roll: counterRoll, modifier: counterModifier, defense });
  if (counterRoll + counterModifier > defense) fight.pendingHits.push({ target: 0, defense,
    damage: (die(random) + (reply === 'kick' ? 2 : 0) + (bonus ? 2 : 0)) * (action.mirrorInnerForce ? 2 : 1), blockable: true });
  return true;
}
