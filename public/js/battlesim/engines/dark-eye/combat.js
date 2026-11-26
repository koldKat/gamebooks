const defaultRoll = sides => 1 + Math.floor(Math.random() * sides);

export function createFight({ hero, opponent, rules = {} }) {
  return {
    ruleVersion: 1,
    hero: { ...hero },
    opponent: { ...opponent },
    rules: { ...rules, opening: rules.opening?.map(attack => ({ ...attack })) },
    openingPending: Boolean(rules.opening?.length),
    round: 0,
    damageDealt: 0,
    status: 'fighting',
  };
}

function defenseChoice(defender, preference, { noParry, noDodge }) {
  const parry = noParry ? 0 : defender.parry;
  const dodge = noDodge ? 0 : defender.dodge;
  if (preference === 'parry' && parry) return { kind: 'parry', target: parry };
  if (preference === 'dodge' && dodge) return { kind: 'dodge', target: dodge };
  if (parry >= dodge && parry) return { kind: 'parry', target: parry };
  if (dodge) return { kind: 'dodge', target: dodge };
  return null;
}

function strike(fight, turn, preference, roll) {
  const heroAttacks = turn.attacker === 'hero';
  const attacker = heroAttacks ? fight.hero : fight.opponent;
  const defender = heroAttacks ? fight.opponent : fight.hero;
  const attackTarget = heroAttacks && fight.rules.halveHeroAttack
    ? Math.round(attacker.attack / 2)
    : attacker.attack;
  const attackRoll = roll(20);
  const event = { attacker: turn.attacker, attackRoll, attackTarget };
  if (attackRoll > attackTarget) return { ...event, result: 'miss' };

  const defense = defenseChoice(defender, heroAttacks ? 'best' : preference, {
    noParry: turn.noParry || (!heroAttacks && fight.rules.noHeroParry),
    noDodge: turn.noDodge,
  });
  if (defense) {
    event.defense = { ...defense, roll: roll(20) };
    if (event.defense.roll <= defense.target) return { ...event, result: 'defended' };
  }

  const damageRolls = Array.from({ length: attacker.damageDice }, () => roll(attacker.damageSides ?? 6));
  const damage = Math.max(0, damageRolls.reduce((total, die) => total + die, attacker.damageBonus) - defender.protection);
  defender.life = Math.max(0, defender.life - damage);
  if (heroAttacks) fight.damageDealt += damage;
  if (fight.hero.life === 0) fight.status = 'loss';
  else if (fight.rules.damageStopLife != null && fight.opponent.life <= fight.rules.damageStopLife) fight.status = 'threshold';
  else if (fight.opponent.life === 0) fight.status = 'win';
  else if (fight.rules.retreatDamage > 0 && fight.damageDealt >= fight.rules.retreatDamage) fight.status = 'retreated';
  return { ...event, result: 'hit', damageRolls, damageBonus: attacker.damageBonus, protection: defender.protection, damage };
}

export function advanceFight(previous, { defense = 'best', roll = defaultRoll } = {}) {
  if (previous.status !== 'fighting') return { fight: previous, events: [] };
  const fight = { ...previous, hero: { ...previous.hero }, opponent: { ...previous.opponent } };
  const opponentTurns = Array.from({ length: fight.rules.opponentAttacks ?? 1 }, () => ({ attacker: 'opponent' }));
  const heroTurn = { attacker: 'hero' };
  const opening = fight.openingPending;
  const turns = opening
    ? fight.rules.opening
    : fight.rules.opponentFirst ? [...opponentTurns, heroTurn] : [heroTurn, ...opponentTurns];
  if (opening) fight.openingPending = false;
  else fight.round += 1;

  const events = [];
  for (const turn of turns) {
    events.push({ ...strike(fight, turn, defense, roll), round: fight.round, opening });
    if (fight.status !== 'fighting') break;
  }
  if (fight.status === 'fighting' && fight.rules.roundLimit > 0 && fight.round >= fight.rules.roundLimit) {
    fight.status = 'survived';
  }
  return { fight, events };
}
