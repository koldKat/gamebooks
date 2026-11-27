function integer(value, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) throw new RangeError('Invalid combat value');
  return value;
}

export function normalizeEncounter(encounter) {
  const { section, name, kind, modifiers, winAtMost, loseAtLeast, successSection, failureSection } = encounter;
  if (typeof name !== 'string' || !name.trim() || name.length > 120
      || !['opposed', 'struggle', 'dexterity', 'disarm'].includes(kind)) throw new RangeError('Invalid encounter');
  if (!Array.isArray(modifiers) || modifiers.length !== (kind === 'struggle' ? 3 : 1)) throw new RangeError('Invalid combat modifiers');
  const phases = modifiers.map(value => integer(value, 0, 50));
  if (section != null) {
    for (const number of [section, successSection, failureSection]) integer(number, 100, 400);
  }
  if (kind === 'opposed' || kind === 'struggle') {
    integer(winAtMost, 0, 12);
    integer(loseAtLeast, winAtMost + 1, 13);
    if (kind === 'opposed' && loseAtLeast !== winAtMost + 1
        || kind === 'struggle' && 2 + phases[2] - 22 < loseAtLeast) throw new RangeError('Invalid combat cutoff');
  }
  return { section, name: name.trim(), kind, modifiers: phases, winAtMost, loseAtLeast, successSection, failureSection };
}

export function startFight(player, encounter) {
  return {
    rulesVersion: 1,
    player: { strength: integer(player.strength, 2, 11), dexterity: integer(player.dexterity, 2, 11) },
    opponent: normalizeEncounter(encounter),
    status: 'fighting', round: 1, destination: null, rolls: [],
  };
}

function resolve(player, opponent, round, dice) {
  if (!Array.isArray(dice) || dice.length !== 2) throw new RangeError('Enter two dice');
  const [first, second] = dice.map(value => integer(value, 1, 6));
  const { strength, dexterity } = player;
  const opposed = opponent.kind === 'opposed' || opponent.kind === 'struggle';
  const modifier = opponent.modifiers[round - 1];
  const reduction = opposed ? strength + dexterity : opponent.kind === 'disarm' ? Math.max(0, strength - 9) : 0;
  const total = first + second + modifier - reduction;
  const limit = opposed ? opponent.winAtMost : dexterity;
  const lossAt = opposed ? opponent.loseAtLeast : dexterity + 1;
  const outcome = total <= limit ? 'win' : total >= lossAt ? 'loss' : 'fighting';
  return { dice: [first, second], modifier, reduction, total, limit, lossAt, outcome };
}

export function validateFight(fight) {
  if (fight?.rulesVersion !== 1 || !Array.isArray(fight.rolls)) throw new RangeError('Invalid saved fight');
  const { player, opponent } = startFight(fight.player, fight.opponent);
  integer(fight.round, 1, opponent.modifiers.length);
  integer(fight.rolls.length, 0, opponent.modifiers.length);
  let status = 'fighting';
  for (const [index, roll] of fight.rolls.entries()) {
    if (status !== 'fighting') throw new RangeError('Invalid saved sequence');
    const expected = resolve(player, opponent, index + 1, roll.dice);
    if (Object.keys(expected).some(key => key !== 'dice' && roll[key] !== expected[key])) throw new RangeError('Invalid saved roll');
    status = expected.outcome;
  }
  const round = fight.rolls.length + (status === 'fighting' ? 1 : 0);
  const destination = status === 'win' ? opponent.successSection : opponent.failureSection;
  if (fight.status !== status || fight.round !== round
      || fight.destination !== (status === 'fighting' ? null : destination ?? null)) throw new RangeError('Invalid saved result');
  return fight;
}

export function rollFight(fight, dice = [1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)]) {
  validateFight(fight);
  if (fight.status !== 'fighting') throw new RangeError('Encounter has ended');
  const roll = resolve(fight.player, fight.opponent, fight.round, dice);
  const status = roll.outcome;
  const next = { ...fight, rolls: [...fight.rolls, roll], status };
  if (status === 'fighting') next.round++;
  else next.destination = (status === 'win' ? fight.opponent.successSection : fight.opponent.failureSection) ?? null;
  return validateFight(next);
}
