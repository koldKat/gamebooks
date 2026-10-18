import {die, integer, rollDice, damageWithLuck} from '../../engines/sorcery/core.js';
import {validateOpponents} from '../../opponents.js';
import {encounterFor, RULES_REVISION} from './definition.js';

export function validateCharacter(character, alive = false) {
  if (!character || typeof character.dead !== 'boolean' || alive && character.dead) throw new RangeError('Invalid character');
  for (const stat of ['skill', 'stamina', 'luck']) {
    integer(character[stat + 'Initial'], 1);
    integer(character[stat], alive && stat === 'stamina' ? 1 : 0, character[stat + 'Initial']);
  }
  integer(character.attackModifier, -1000, 1000);
  integer(character.weaponBonus, 0, 1);
  integer(character.provisions, 0, 10000);
  integer(character.potionUses, 0, 1);
  if (!['skill', 'strength', 'fortune'].includes(character.potion)
    || typeof character.ring !== 'boolean' || typeof character.armour !== 'boolean') throw new RangeError('Invalid equipment');
  return character;
}

export function newCharacter(random) {
  const skill = die(random) + 6, stamina = rollDice(random) + 12, luck = die(random) + 6;
  return {skill, skillInitial: skill, stamina, staminaInitial: stamina, luck, luckInitial: luck,
    provisions: 10, potion: 'skill', potionUses: 1, weaponBonus: 0, ring: false, armour: false,
    attackModifier: 0, dead: false};
}

export function testLuck(character, random) {
  validateCharacter(character);
  if (character.dead) throw new RangeError('Character is dead');
  const next = structuredClone(character), value = rollDice(random), lucky = value <= next.luck;
  next.luck = Math.max(0, next.luck - 1);
  return {character: next, value, lucky};
}

export function recover(character, kind) {
  validateCharacter(character, true);
  const next = structuredClone(character);
  if (kind === 'meal') {
    if (!next.provisions || next.stamina === next.staminaInitial) throw new RangeError('No meal needed');
    next.provisions--;
    next.stamina = Math.min(next.staminaInitial, next.stamina + 4);
  } else if (kind === 'potion') {
    if (!next.potionUses) throw new RangeError('Potion used');
    next.potionUses--;
    const stat = {skill: 'skill', strength: 'stamina', fortune: 'luck'}[next.potion];
    if (stat === 'luck') next.luckInitial++;
    next[stat] = next[stat + 'Initial'];
  } else throw new RangeError('Unknown recovery');
  return validateCharacter(next, true);
}

const retired = enemy => enemy.stamina <= (enemy.floor ?? 0);
const activeIndices = fight => fight.config.groups[fight.group].filter(index => !retired(fight.enemies[index]));

function end(fight, outcome, destination = null) {
  fight.outcome = outcome;
  fight.destination = destination;
  fight.pending = null;
  fight.character.dead = fight.character.stamina === 0;
  return fight;
}

function victory(fight) {
  const {config: c, enemies: e} = fight;
  if (c.stopConditions) return c.stopConditions.every(([index, floor]) => e[index].stamina <= floor);
  if (c.stopEnemy !== undefined) return retired(e[c.stopEnemy]);
  if (c.stopAny) return e.some(retired);
  if (c.winHits && fight.hits >= c.winHits) return true;
  return e.every(retired);
}

function settle(fight) {
  if (fight.character.stamina === 0) return end(fight, 'loss', fight.config.loss);
  if (fight.interruption) return end(fight, 'interrupted', fight.interruption);
  if (fight.config.playerFloor && fight.character.stamina <= fight.config.playerFloor) {
    return end(fight, 'interrupted', fight.config.interruption);
  }
  const won = victory(fight), expired = fight.config.roundLimit && fight.rounds >= fight.config.roundLimit;
  if (won || expired) {
    if (fight.config.endLuck) {
      fight.pending = {kind: 'route'};
      return fight;
    }
    return end(fight, won ? 'win' : 'interrupted', won ? fight.config.win : fight.config.interruption);
  }
  while (!activeIndices(fight).length && fight.group + 1 < fight.config.groups.length) fight.group++;
  return fight;
}

export function startFight(section, character, options = {}) {
  validateCharacter(character, true);
  const preset = encounterFor(section);
  if (!preset && Number(section) !== 0) throw new RangeError('Unknown encounter');
  const rows = validateOpponents(options.opponents ?? preset?.enemies,
    [{key: 'skill', max: 10000}, {key: 'stamina', min: 1, max: 10000}]);
  if (preset && rows.length !== preset.enemies.length) throw new RangeError('Wrong opponent count');
  const config = structuredClone(preset ?? {section: 0, name: 'Свободен бой', win: null,
    groups: rows.map((_, index) => [index])});
  const enemies = rows.map((row, index) => ({...config.enemies?.[index], displayName: row.displayName,
    skill: row.skill, stamina: row.stamina, staminaInitial: row.stamina}));
  for (const row of enemies) if ((row.floor ?? 0) >= row.stamina) throw new RangeError('Opponent already retired');
  const fight = {rulesRevision: RULES_REVISION, config, character: structuredClone(character), enemies,
    group: 0, rounds: 0, hits: 0, pending: null, exchanges: [], cursor: 0,
    events: [], outcome: null, destination: null, interruption: null};
  if (options.applyOpening) {
    fight.character.stamina = Math.max(0, fight.character.stamina - (config.openingStamina ?? 0));
    fight.character.skill = Math.max(0, fight.character.skill - (config.openingSkill ?? 0));
    fight.events.push({kind: 'opening', stamina: config.openingStamina ?? 0, skill: config.openingSkill ?? 0});
  }
  return settle(fight);
}

function requireFight(fight) {
  if (!fight || fight.rulesRevision !== RULES_REVISION || fight.outcome) throw new RangeError('No active fight');
  validateCharacter(fight.character);
}

function advance(fight) {
  while (fight.cursor < fight.exchanges.length) {
    const exchange = fight.exchanges[fight.cursor++], enemy = fight.enemies[exchange.enemy];
    const {playerAttack, enemyAttack} = exchange;
    fight.events.push({kind: 'attack', name: enemy.displayName, playerAttack, enemyAttack,
      playerDice: exchange.playerDice, enemyDice: exchange.enemyDice});
    if (playerAttack === enemyAttack) continue;
    const outgoing = playerAttack > enemyAttack;
    if (outgoing && !exchange.target) continue;
    const special = outgoing ? fight.config.hitDie : fight.config.enemyDie;
    if (special) {
      fight.events.push({kind: 'special', value: exchange.specialRoll});
      if (special.face === exchange.specialRoll || special.min && exchange.specialRoll >= special.min) {
        fight.interruption = special.destination;
        return end(fight, 'interrupted', special.destination);
      }
    }
    const damage = outgoing ? fight.config.playerDamage ?? 2 : enemy.damage ?? 2;
    const before = outgoing ? enemy.stamina : fight.character.stamina;
    if (outgoing) {
      enemy.stamina = Math.max(0, enemy.stamina - damage);
      fight.hits++;
    } else {
      fight.character.stamina = Math.max(0, fight.character.stamina - damage);
      if (enemy.skillDrain) fight.character.skill = Math.max(0, fight.character.skill - 1);
      const capture = fight.config.capture;
      if (capture && capture.enemy === exchange.enemy && enemyAttack >= capture.attack) fight.interruption = capture.destination;
    }
    fight.events.push({kind: 'wound', name: enemy.displayName, outgoing, damage});
    // Keep the unclamped wound balance so Luck can avert a lethal pending hit.
    fight.pending = {kind: outgoing ? 'outgoing' : 'incoming', enemy: exchange.enemy, damage, balance: before - damage};
    return fight;
  }
  fight.exchanges = [];
  fight.cursor = 0;
  return settle(fight);
}

export function round(input, target, random) {
  requireFight(input);
  if (input.pending || input.exchanges.length) throw new RangeError('Resolve the current exchange first');
  const fight = structuredClone(input), indices = activeIndices(fight);
  integer(target, 0, fight.enemies.length - 1);
  if (!indices.includes(target)) throw new RangeError('Inactive target');
  const required = fight.config.targetOrder?.find(index => indices.includes(index));
  if (required !== undefined && target !== required) throw new RangeError('Follow the printed target order');
  fight.rounds++;
  fight.events = [];
  fight.exchanges = indices.map(index => {
    const playerDice = [die(random), die(random)], enemyDice = [die(random), die(random)];
    const playerAttack = playerDice[0] + playerDice[1] + fight.character.skill + fight.character.attackModifier
      + fight.character.weaponBonus + Number(fight.character.ring) + Number(fight.character.armour) + (fight.config.skillBonus ?? 0);
    const enemyAttack = enemyDice[0] + enemyDice[1] + fight.enemies[index].skill;
    const special = playerAttack > enemyAttack && index === target ? fight.config.hitDie
      : enemyAttack > playerAttack ? fight.config.enemyDie : null;
    return {enemy: index, target: index === target, playerDice, enemyDice, playerAttack, enemyAttack,
      specialRoll: special ? die(random) : null};
  });
  return advance(fight);
}

export function resolveLuck(input, useLuck, random) {
  requireFight(input);
  if (!input.pending || typeof useLuck !== 'boolean') throw new RangeError('No pending Luck choice');
  const fight = structuredClone(input), pending = fight.pending;
  fight.events = [];
  let lucky = null;
  if (pending.kind === 'route' || useLuck) {
    const result = testLuck(fight.character, random);
    fight.character = result.character;
    lucky = result.lucky;
    fight.events.push({kind: 'luck', value: result.value, lucky});
  }
  fight.pending = null;
  if (pending.kind === 'route') return end(fight, 'interrupted', fight.config.endLuck[lucky ? 0 : 1]);
  const damage = damageWithLuck(pending.kind, pending.damage, lucky);
  const remaining = Math.max(0, pending.balance + pending.damage - damage);
  if (pending.kind === 'outgoing') fight.enemies[pending.enemy].stamina = remaining;
  else fight.character.stamina = remaining;
  if (fight.character.stamina === 0) return end(fight, 'loss', fight.config.loss);
  return advance(fight);
}
