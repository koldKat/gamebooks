import { fabledInteger, fabledDie, fabledDice, fabledDefence, validateFabledCharacter } from './character.js';

function finish(fight, status) {
  fight.status = status;
  fight.destination = status === 'win' ? fight.config.win ?? null : fight.config.loss ?? null;
  if (fight.config.nonfatal) fight.character.stamina = fight.staminaBefore;
  else if (status === 'loss' && fight.config.lossStamina) fight.character.stamina = fight.config.lossStamina;
}

function validateFight(fight) {
  if (!fight || fight.rulesRevision !== 1 || fight.status !== 'fighting' || !fight.config
    || !Array.isArray(fight.enemies) || !fight.enemies.length || !Array.isArray(fight.events)) {
    throw new RangeError('No active Fabled Lands fight');
  }
  validateFabledCharacter(fight.character, true);
  fabledInteger(fight.target, 0, fight.enemies.length - 1);
  fabledInteger(fight.rounds); fabledInteger(fight.defence, 1);
  fabledInteger(fight.attackModifier, -1000, 1000);
  for (const enemy of fight.enemies) {
    if (!enemy || typeof enemy.name !== 'string') throw new RangeError('Invalid enemy');
    fabledInteger(enemy.combat); fabledInteger(enemy.defence, 1); fabledInteger(enemy.stamina);
  }
}

export function startFabledFight(config, input, options = {}, roll) {
  validateFabledCharacter(input, true);
  if (!config || !Array.isArray(config.enemies) || !config.enemies.length
    || !options || typeof options !== 'object' || Array.isArray(options)) throw new RangeError('Invalid encounter');
  const { applyEntry = true, attackModifier = 0, defence = fabledDefence(input), ratPoison = false } = options;
  if (typeof applyEntry !== 'boolean' || typeof ratPoison !== 'boolean') throw new RangeError('Invalid entry setting');
  fabledInteger(attackModifier, -1000, 1000); fabledInteger(defence, 1);
  const modifier = attackModifier + fabledInteger(config.attackModifier ?? 0, -1000, 1000) + (ratPoison ? 3 : 0);
  fabledInteger(modifier, -1000, 1000);
  if (ratPoison && (!config.ratPoison || !input.ratPoison)) throw new RangeError('Rat poison unavailable');
  const fight = { rulesRevision: 1, config: structuredClone(config), character: structuredClone(input),
    enemies: structuredClone(config.enemies), staminaBefore: input.stamina,
    target: 0, rounds: 0, wounded: false, status: 'fighting', destination: null,
    defence, attackModifier: modifier, events: [] };
  validateFight(fight);
  if (ratPoison) {
    fight.character.ratPoison--;
    fight.events.push({ kind: 'ratPoison', modifier: 3 });
  }
  if (config.nonfatal !== undefined && typeof config.nonfatal !== 'boolean') throw new RangeError('Invalid duel setting');
  if (config.threshold !== undefined) fabledInteger(config.threshold);
  if (config.lossStamina !== undefined) fabledInteger(config.lossStamina, 1);
  for (const enemy of fight.enemies) if (!enemy.stamina) throw new RangeError('Enemy already defeated');
  if (applyEntry && (config.entryDamage || config.entryDice)) {
    let damage = fabledInteger(config.entryDamage ?? 0);
    const count = fabledInteger(config.entryDice ?? 0, 0, 3);
    for (let index = 0; index < count; index++) damage += fabledDie(roll);
    if (config.entryArmour) damage = Math.max(0, damage - fight.character.armour);
    fight.character.stamina = Math.max(0, fight.character.stamina - damage);
    fight.events.push({ kind: 'entry', damage });
    if (!fight.character.stamina) finish(fight, 'loss');
  }
  return fight;
}

export function fabledRound(input, options = {}, roll) {
  validateFight(input);
  if (!options || typeof options !== 'object' || Array.isArray(options)) throw new RangeError('Invalid round setting');
  const { combatBlessing = false, luckReroll = null } = options;
  if (typeof combatBlessing !== 'boolean' || ![null, 'player', 'enemy'].includes(luckReroll)) {
    throw new RangeError('Invalid round setting');
  }
  if (combatBlessing && !input.character.combatBlessing || luckReroll && !input.character.luckBlessing) {
    throw new RangeError('Blessing unavailable');
  }
  const fight = structuredClone(input), enemy = fight.enemies[fight.target];
  fight.rounds++;
  const attack = (direction, combat, defence) => {
    let dice = fabledDice(roll);
    const reroll = luckReroll === direction || direction === 'player' && combatBlessing && dice + combat <= defence;
    if (reroll) {
      const blessing = luckReroll === direction ? 'luckBlessing' : 'combatBlessing';
      fight.character[blessing] = false;
      fight.events.push({ kind: 'reroll', direction, blessing, previous: dice });
      dice = fabledDice(roll);
    }
    const total = dice + combat, damage = Math.max(0, total - defence);
    fight.events.push({ kind: 'attack', direction, dice, total, defence, damage });
    return damage;
  };
  const playerAttack = () => {
    enemy.stamina = Math.max(0, enemy.stamina - attack('player', fight.character.combat + fight.attackModifier, enemy.defence));
    if (enemy.stamina > (fight.config.threshold ?? 0)) return false;
    if (fight.config.threshold !== undefined || fight.target === fight.enemies.length - 1) finish(fight, 'win');
    else fight.target++;
    return true;
  };
  const enemyAttack = () => {
    const damage = attack('enemy', enemy.combat, fight.defence);
    fight.character.stamina = Math.max(0, fight.character.stamina - damage);
    if (damage) fight.wounded = true;
    if (!fight.character.stamina) finish(fight, 'loss');
    else if (damage && fight.config.woundDestination) {
      finish(fight, 'loss');
      fight.destination = fight.config.woundDestination;
    }
    return fight.status === 'loss';
  };
  if (fight.config.playerFirst === false) {
    if (!enemyAttack()) playerAttack();
  } else if (!playerAttack()) enemyAttack();
  return fight;
}

export function surrenderFabledFight(input) {
  validateFight(input);
  if (!input.config.surrender) throw new RangeError('Surrender unavailable');
  const fight = structuredClone(input);
  fight.status = 'surrender';
  fight.destination = fight.config.surrender;
  return fight;
}

export function fleeFabledFight(input, roll) {
  validateFight(input);
  const escape = input.config.flee;
  if (!escape || typeof escape !== 'object') throw new RangeError('Fleeing unavailable');
  const count = fabledInteger(escape.dice ?? 0, 0, 3);
  fabledInteger(escape.destination, 1);
  const fight = structuredClone(input);
  let damage = 0;
  for (let index = 0; index < count; index++) damage += fabledDie(roll);
  if (escape.armour) damage = Math.max(0, damage - fight.character.armour);
  fight.character.stamina = Math.max(0, fight.character.stamina - damage);
  fight.wounded ||= damage > 0;
  fight.events.push({ kind: 'entry', damage });
  fight.status = 'fled';
  fight.destination = escape.destination;
  if (!fight.character.stamina) finish(fight, 'loss');
  return fight;
}
