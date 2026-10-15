import { ARROW_LIMIT, ENCOUNTERS, INITIAL_GOLD, INITIAL_PROVISIONS, RULES_REVISION } from './definition.js';

const clone = value => structuredClone(value);
export function integer(value, min = 0, max = 10000) {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new RangeError('Invalid Khare value');
  return value;
}
export function die(roll = sides => Math.floor(Math.random() * sides) + 1) { return integer(roll(6), 1, 6); }
export function rollDice(roll) { return die(roll) + die(roll); }

export function validateCharacter(character, alive = false) {
  if (!character || !['warrior', 'wizard'].includes(character.role) || alive && character.dead) throw new RangeError('No living character');
  for (const key of ['skill', 'stamina', 'luck']) {
    integer(character[key], alive && key === 'stamina' ? 1 : 0);
    integer(character[key + 'Initial'], 1);
    if (character[key] > character[key + 'Initial']) throw new RangeError('Stat exceeds initial value');
  }
  for (const key of ['gold', 'provisions', 'mealsToday', 'goblinTeeth', 'giantTeeth', 'pebbles', 'medicines']) integer(character[key]);
  if (!Array.isArray(character.afflictions) || character.afflictions.some(value => typeof value !== 'string')) throw new RangeError('Invalid afflictions');
  for (const key of ['attackModifier', 'nextFightSkill']) integer(character[key], -1000, 1000);
  integer(character.silverArrows, 0, ARROW_LIMIT);
  integer(character.explosiveDarts, 0, 2);
  integer(character.cakeHalves, 0, 2);
  integer(character.predictionBets, 0, 5);
  if (character.wheelWon !== undefined && typeof character.wheelWon !== 'boolean') throw new RangeError('Invalid Wheel state');
  if (!['sword', 'broadsword', 'other'].includes(character.weapon)) throw new RangeError('Invalid weapon');
  for (const key of ['dead', 'libraUsed', 'libraChampion', 'luckCharm', 'luckRollCharm', 'wax', 'sunJewel', 'boneBracelet',
    'helpfulGlove', 'cursedGlove', 'magicChain', 'intoxicated', 'noEatingToday']) {
    if (typeof character[key] !== 'boolean') throw new RangeError('Invalid character equipment');
  }
  return character;
}

export function newCharacter(role = 'warrior', roll) {
  if (!['warrior', 'wizard'].includes(role)) throw new RangeError('Invalid class');
  const skill = die(roll) + (role === 'wizard' ? 4 : 6), stamina = rollDice(roll) + 12, luck = die(roll) + 6;
  return { role, skill, skillInitial: skill, stamina, staminaInitial: stamina, luck, luckInitial: luck,
    gold: INITIAL_GOLD, provisions: INITIAL_PROVISIONS, mealsToday: 0, weapon: 'sword', attackModifier: 0,
    nextFightSkill: 0, goblinTeeth: 0, giantTeeth: 0, pebbles: 0, medicines: 0, afflictions: [], silverArrows: 0, explosiveDarts: 0, cakeHalves: 0,
    predictionBets: 0, wheelWon: false, dead: false, libraUsed: false, libraChampion: false, luckCharm: false, luckRollCharm: false,
    wax: false, sunJewel: false, boneBracelet: false, helpfulGlove: false, cursedGlove: false, magicChain: false,
    intoxicated: false, noEatingToday: false };
}

export function testLuck(character, roll, { cake = false } = {}) {
  validateCharacter(character, true);
  if (cake ? !character.cakeHalves : !character.luck) throw new RangeError('Luck unavailable');
  const next = clone(character);
  let value = null, effective = null, lucky = true;
  if (cake) next.cakeHalves--;
  else {
    value = rollDice(roll);
    effective = value - (next.luckRollCharm ? 1 : 0);
    lucky = effective <= next.luck;
    if (lucky || !next.luckCharm) next.luck = Math.max(0, next.luck - 1);
  }
  return { character: next, lucky, roll: value, effective, cake };
}

const actor = spec => ({ ...clone(spec), staminaInitial: spec.stamina });
const aliveEnemy = (fight, enemy) => enemy.stamina > (fight.config.enemyFloor ?? 0) && !enemy.bound && !enemy.disabled;
export function targets(fight) {
  if (!fight || fight.outcome) return [];
  const active = fight.enemies.flatMap((enemy, index) => aliveEnemy(fight, enemy) ? [index] : []);
  if (['limbs', 'harpies', 'separate-attacks'].includes(fight.config.mode)) return active;
  if (fight.config.mode === 'street-alliance' && fight.reinforcementArrived && active.includes(1)) return [1];
  return active.slice(0, 1);
}
function activatePlayer(fight) {
  if (fight.playerFightStarted) return;
  fight.playerFightStarted = true;
  fight.nextFightSkill = fight.player.nextFightSkill;
  fight.player.nextFightSkill = 0;
  fight.glovePenalty = fight.player.cursedGlove ? -1 : 0;
  fight.player.cursedGlove = false;
}
function finish(fight, outcome, reason, destination) {
  if (fight.outcome) return;
  fight.outcome = outcome;
  fight.reason = reason;
  fight.destination = destination ?? (outcome === 'win' ? fight.config.win : null) ?? null;
  fight.pending = [];
  fight.decision = null;
  if (!fight.player.stamina) fight.player.dead = true;
  if (outcome === 'win' && fight.config.prize) fight.player.gold += fight.config.prize;
}
function fatal(fight, reason) { fight.player.stamina = 0; finish(fight, 'loss', reason); }
function opponentSkill(fight, index) {
  const temporary = fight.config.temporaryEnemySkill;
  return temporary && fight.rounds <= temporary.rounds ? temporary.skill : fight.enemies[index].skill;
}
function playerSkill(fight) { return Math.max(0, fight.player.skill + fight.nextFightSkill); }
function playerAttack(fight, dice) {
  return dice[0] + dice[1] + playerSkill(fight) + fight.player.attackModifier + fight.glovePenalty
    - (fight.player.weapon === 'broadsword' && fight.config.mode !== 'silver-arrows' ? 1 : 0);
}
function queue(fight, source, target, damage = 2, extra = {}) {
  fight.pending.push({ source, target, damage, ...extra });
}
const playerRef = () => ({ team: 'player', index: 0 });
const enemyRef = index => ({ team: 'enemy', index });
const allyRef = index => ({ team: 'ally', index });
function combatant(fight, ref) {
  const value = ref.team === 'player' ? fight.player : ref.team === 'enemy' ? fight.enemies[ref.index] : fight.allies[ref.index];
  if (!value) throw new RangeError('Missing combatant');
  return value;
}
function playerHit(fight, index) {
  queue(fight, playerRef(), enemyRef(index), fight.player.weapon === 'broadsword' ? 3 : 2,
    { multiplier: fight.waxActive ? 2 : 1, immune: !!fight.config.immune });
}
function enemyHit(fight, index, target = playerRef()) {
  if (fight.enemies[index].bound || fight.config.harmlessEnemy) return;
  queue(fight, enemyRef(index), target, fight.config.incomingDamage ?? 2);
}
function complete(fight) {
  if (fight.outcome || fight.pending.length || fight.decision) return;
  if (!fight.player.stamina) { finish(fight, 'loss', 'stamina'); return; }
  if (fight.config.mode === 'spectator') {
    const alive = fight.enemies.filter(enemy => enemy.stamina > 0);
    if (alive.length < 2) {
      fight.winner = alive[0]?.key ?? null;
      finish(fight, 'resolved', 'spectator', fight.config.win);
    }
    return;
  }
  if (fight.config.mode === 'giant-statue' && !fight.allies[0].stamina) {
    fight.config.mode = 'statue-after-giant';
    fight.config.immune = true;
    fight.giantActive = false;
    activatePlayer(fight);
    fight.events.push({ kind: 'giantDefeated' });
  }
  if (fight.config.summonGiant && fight.config.mode === 'champion' && !fight.allies[0].stamina) {
    finish(fight, 'loss', 'giantDefeated'); return;
  }
  if (fight.enemies.every(enemy => !aliveEnemy(fight, enemy))) {
    const destination = fight.config.mode === 'street-alliance' ? fight.config.allyDestinations[fight.allyKey] : undefined;
    finish(fight, 'win', 'defeated', destination);
    return;
  }
  if (fight.config.mode === 'silver-arrows' && !fight.player.silverArrows) { fatal(fight, 'arrowsExhausted'); return; }
  if (fight.config.roundLimit && fight.rounds >= fight.config.roundLimit) finish(fight, 'redirect', 'paintingComplete', fight.config.timeoutDestination);
}

export function startFight(section, character, options = {}, roll) {
  validateCharacter(character, true);
  const original = ENCOUNTERS.find(item => item.section === section);
  if (!original) throw new RangeError('Unknown encounter');
  if ((original.entryCost || original.summonGoblins) && character.role !== 'wizard') throw new RangeError('Only a wizard can cast spells');
  const config = clone(original), player = clone(character);
  const fight = { rulesRevision: RULES_REVISION, config, player, enemies: config.enemies.map(actor), allies: [],
    rounds: 0, pending: [], decision: null, events: [], outcome: null, destination: null, nextFightSkill: 0,
    glovePenalty: 0, playerFightStarted: false, waxActive: false, shieldActive: false, reinforcementArrived: false,
    chainUsed: false, chainRecoveryAttempted: false, landedHits: 0, receivedHits: 0, giantActive: false,
    pebbleWindow: !!config.explosivePebbles };
  if (config.mode === 'double') fight.enemies = [actor({ key: 'double', skill: Math.max(0, player.skill + player.nextFightSkill), stamina: player.stamina })];
  if (config.enemySkillModifier) fight.enemies[0].skill = Math.max(0, fight.enemies[0].skill + config.enemySkillModifier);
  if (config.mode === 'champion') {
    const choice = options.champion ?? 'ogre';
    const selected = fight.enemies.find(enemy => enemy.key === choice);
    if (!selected) throw new RangeError('Invalid champion');
    fight.enemies = [selected];
  }
  if (config.mode === 'street-alliance') {
    fight.allyKey = options.ally ?? 'sprite';
    const ally = fight.enemies.find(enemy => enemy.key === fight.allyKey);
    if (!ally) throw new RangeError('Invalid ally');
    fight.allies = [ally];
    fight.enemies = fight.enemies.filter(enemy => enemy !== ally);
  } else if (config.ally) fight.allies = [actor(config.ally)];
  if (config.mode === 'spectator') {
    fight.favoured = integer(options.favoured ?? 0, 0, 1);
    if (config.boneBracelet && player.boneBracelet) fight.enemies[1 - fight.favoured].stamina = Math.max(0, fight.enemies[1 - fight.favoured].stamina - config.illusionDamage);
    fight.sunActive = !!config.sunJewel && player.sunJewel;
    if (config.clumsyRounds) {
      const value = die(roll);
      fight.clumsyActors = value <= 3 ? [fight.favoured] : value <= 5 ? [1 - fight.favoured] : [0, 1];
      fight.events.push({ kind: 'clumsy', roll: value, actors: fight.clumsyActors });
    }
  }
  if (config.summonGiant && player.giantTeeth) { player.giantTeeth--; fight.giantActive = true; }
  else if (config.summonGiant) fight.allies = [];
  const summonCount = config.summonGoblins ? integer(options.summonCount ?? player.goblinTeeth, 0, player.goblinTeeth) : 0;
  if (summonCount) {
    player.goblinTeeth -= summonCount;
    for (let index = 0; index < summonCount; index++) fight.allies.push(actor(config.goblin));
  }
  fight.waxActive = !!config.wax && player.wax;
  fight.shieldActive = !!config.shield && player.gold > 0;
  if (fight.shieldActive) player.gold--;
  const missing = config.wax && !fight.waxActive || config.shield && !fight.shieldActive || config.summonGiant && !fight.giantActive;
  const cost = config.summonGoblins ? summonCount * config.summonCost || config.missingItemCost : config.entryCost ?? 0;
  const damage = (config.entryDamage ?? 0) + (missing ? config.missingItemDamage ?? 0 : 0)
    + (config.explosivePebbles && !player.pebbles ? config.missingItemDamage ?? 0 : 0);
  player.stamina = Math.max(0, player.stamina - cost - damage);
  if (cost || damage) fight.events.push({ kind: 'entry', cost, damage });
  if (!player.stamina) { fatal(fight, 'entry'); return fight; }
  if (missing && config.missingItemDestination) { finish(fight, 'redirect', 'missingItem', config.missingItemDestination); return fight; }
  if (config.mode !== 'spectator' && !fight.giantActive) activatePlayer(fight);
  if (options.enemyStamina !== undefined) {
    if (!Array.isArray(options.enemyStamina) || options.enemyStamina.length !== fight.enemies.length) throw new RangeError('Invalid enemy health');
    fight.enemies.forEach((enemy, index) => { enemy.stamina = integer(options.enemyStamina[index], 1, enemy.staminaInitial); });
  }
  if (options.beggarStamina !== undefined && config.mode === 'harpies') fight.allies[0].stamina = integer(options.beggarStamina, 0, 8);
  if (config.confuseHarpy) {
    const mode = options.confuse ?? 'skip';
    if (!['skip', 'luck', 'cake'].includes(mode)) throw new RangeError('Invalid confusion choice');
    if (mode !== 'skip') {
      const tested = testLuck(fight.player, roll, { cake: mode === 'cake' });
      fight.player = tested.character;
      fight.events.push({ kind: 'luck', roll: tested.roll, effective: tested.effective, lucky: tested.lucky, cake: tested.cake });
      if (tested.lucky) {
        const coin = die(roll), target = coin % 2;
        fight.enemies[target].disabled = true;
        fight.events.push({ kind: 'confusedHarpy', enemy: target, roll: coin });
      }
    }
  }
  if (config.openingArrow) {
    const value = die(roll);
    fight.events.push({ kind: 'openingArrow', roll: value });
    if (value === 1) { fatal(fight, 'arrow'); return fight; }
    const wound = [0, 0, 5, 3, 2, 1, 0][value];
    player.stamina = Math.max(0, player.stamina - wound);
    if (value === 5) player.skill = Math.max(0, player.skill - 2);
  }
  if (config.openingSilverArrow) {
    if (!player.silverArrows) throw new RangeError('No silver arrows');
    silverArrow(fight, 0, roll);
  }
  settle(fight);
  return fight;
}

export function requireFight(fight) {
  if (!fight || fight.rulesRevision !== RULES_REVISION || fight.outcome) throw new RangeError('No active fight');
  validateCharacter(fight.player, true);
  if (!Array.isArray(fight.pending)) throw new RangeError('Invalid pending wounds');
}
function ready(fight) {
  requireFight(fight);
  if (fight.pending.length || fight.decision) throw new RangeError('Resolve the pending decision first');
}
function canUseLuck(fight, hit) {
  return !hit.noLuck && !hit.immune && (hit.source.team === 'player' || hit.target.team === 'player')
    && (fight.player.luck > 0 || fight.player.cakeHalves > 0);
}
function applyHit(fight, hit, modifier = 0) {
  const victim = combatant(fight, hit.target);
  const damage = hit.immune ? 0 : Math.max(0, hit.damage + modifier) * (hit.multiplier ?? 1);
  const floor = hit.target.team === 'enemy' ? fight.config.enemyFloor ?? 0 : 0;
  victim.stamina = Math.max(Math.min(floor, victim.stamina), victim.stamina - damage);
  fight.events.push({ kind: 'damage', ...hit, damage });
  if (hit.source.team === 'player' && hit.target.team === 'enemy') fight.landedHits++;
  if (hit.target.team === 'player') {
    fight.receivedHits++;
    if (fight.receivedHits === 1 && fight.config.firstEnemyHitDestination) fight.noticeDestination = fight.config.firstEnemyHitDestination;
  }
  if (!fight.player.stamina) { fatal(fight, 'stamina'); return; }
  if (hit.source.team !== 'player') return;
  const destination = fight.config.firstPlayerHitDestination;
  if (fight.config.mode === 'champion' && fight.player.libraChampion) {
    fight.player.libraChampion = false;
    victim.stamina = 0;
    fight.events.push({ kind: 'libraChampion' });
  }
  if (destination === 189) {
    fight.config.firstPlayerHitDestination = null;
    fight.config.winningRoundLuckDestination = 38;
    fight.noticeDestination = 189;
  } else if (destination === 11) {
    const next = ENCOUNTERS.find(item => item.section === 11);
    fight.config = clone(next);
    fight.enemies = next.enemies.map(actor);
    fight.noticeDestination = 11;
    fight.events.push({ kind: 'splitCorpse' });
  } else if (destination) finish(fight, 'redirect', 'immune', destination);
}
function settle(fight) {
  while (fight.pending.length && !fight.outcome && !canUseLuck(fight, fight.pending[0])) applyHit(fight, fight.pending.shift());
  complete(fight);
}
function silverArrow(fight, index, roll) {
  if (!fight.player.silverArrows) { fatal(fight, 'arrowsExhausted'); return; }
  fight.player.silverArrows--;
  const value = rollDice(roll), hit = value <= playerSkill(fight);
  fight.events.push({ kind: 'silverArrow', roll: value, hit, remaining: fight.player.silverArrows });
  if (hit) queue(fight, playerRef(), enemyRef(index), 2);
}
function drunkHit(fight, source, target, roll, player = false) {
  const value = die(roll);
  fight.events.push({ kind: 'intoxicated', actor: source, roll: value });
  if (value === 1) queue(fight, source, source, 2, { noLuck: true });
  else if (value % 2 === 0) {
    if (player) playerHit(fight, target.index);
    else enemyHit(fight, source.index, target);
  }
}
function duel(fight, index, attack, roll) {
  const enemyAttack = rollDice(roll) + opponentSkill(fight, index) - (fight.shieldActive ? 2 : 0);
  fight.events.push({ kind: 'attack', enemy: index, playerAttack: attack, enemyAttack });
  if (attack > enemyAttack) {
    if (fight.config.winningRoundLuckDestination) fight.decision = { kind: 'wraithLuck' };
    else if (fight.config.intoxicatedEnemies && fight.player.intoxicated) drunkHit(fight, playerRef(), enemyRef(index), roll, true);
    else if (fight.config.mode === 'silver-arrows') silverArrow(fight, index, roll);
    else playerHit(fight, index);
  } else if (enemyAttack > attack || enemyAttack === attack && fight.config.lowStaminaTies && fight.player.stamina <= fight.config.lowStaminaTies) {
    if (fight.config.intoxicatedEnemies) drunkHit(fight, enemyRef(index), playerRef(), roll);
    else enemyHit(fight, index);
  }
}

function playRound(fight, selected, dice, options, roll) {
  const attack = playerAttack(fight, dice), mode = fight.config.mode;
  if (mode === 'spectator' || fight.giantActive) {
    const a = mode === 'spectator' ? enemyRef(0) : allyRef(0), b = enemyRef(mode === 'spectator' ? 1 : 0);
    const strength = ref => {
      const oneDie = mode === 'spectator' && fight.rounds <= fight.config.clumsyRounds && fight.clumsyActors?.includes(ref.index);
      return combatant(fight, ref).skill + (oneDie ? die(roll) : rollDice(roll));
    };
    const first = strength(a), second = strength(b);
    fight.events.push({ kind: 'actorAttack', first, second, a, b });
    if (first !== second) {
      const victim = first > second ? b : a;
      const damage = fight.sunActive && fight.rounds <= fight.config.protectionRounds && victim.index === fight.favoured ? 1 : 2;
      queue(fight, first > second ? a : b, victim, damage, { noLuck: true });
    }
  } else if (mode === 'limbs' || mode === 'separate-attacks') {
    const target = mode === 'limbs' ? die(roll) - 1 : selected;
    const attacks = targets(fight).map(index => ({ index, attack: rollDice(roll) + fight.enemies[index].skill - (fight.shieldActive ? 2 : 0) }));
    const beat = attacks.filter(enemy => attack > enemy.attack);
    const chosen = mode === 'separate-attacks' && beat.length === 1 ? beat[0].index : target;
    const chooseAfter = mode === 'separate-attacks' && beat.length > 1;
    if (chooseAfter) fight.decision = { kind: 'target', targets: beat.map(enemy => enemy.index) };
    for (const enemy of attacks) {
      fight.events.push({ kind: 'attack', enemy: enemy.index, playerAttack: attack, enemyAttack: enemy.attack });
      if (!chooseAfter && enemy.index === chosen && attack > enemy.attack) playerHit(fight, enemy.index);
      if (enemy.attack > attack) {
        if (enemy.index === 0 && fight.config.headIllusions && die(roll) !== 6) fight.events.push({ kind: 'illusionMiss' });
        else enemyHit(fight, enemy.index);
      }
    }
    if (mode === 'limbs' && !attacks.some(enemy => enemy.index === target)) fight.events.push({ kind: 'disabledTarget', enemy: target });
  } else if (mode === 'harpies') {
    const active = targets(fight), beggar = fight.allies[0], other = active.find(index => index !== selected);
    const beggarAttack = beggar.stamina ? rollDice(roll) + beggar.skill : null;
    const strengths = new Map(active.map(index => [index, rollDice(roll) + fight.enemies[index].skill]));
    const beggarTarget = other ?? selected;
    for (const index of active) {
      const strength = strengths.get(index), victim = beggar.stamina && (index === other || active.length === 1 && options.enemyVictim === 'beggar') ? allyRef(0) : playerRef();
      const defence = victim.team === 'player' ? attack : beggarAttack;
      if (index === selected && attack > strength - (victim.team === 'player' && fight.shieldActive ? 2 : 0)) playerHit(fight, index);
      if (index === beggarTarget && beggarAttack > strength && beggar.stamina) queue(fight, allyRef(0), enemyRef(index));
      if (strength - (victim.team === 'player' && fight.shieldActive ? 2 : 0) > defence) enemyHit(fight, index, victim);
      fight.events.push({ kind: 'harpyAttack', enemy: index, playerAttack: attack, allyAttack: beggarAttack, enemyAttack: strength, victim });
    }
    const goblins = fight.allies.slice(1);
    const assignments = options.goblinTargets ?? goblins.map(() => selected);
    if (!Array.isArray(assignments) || assignments.length !== goblins.length || assignments.some(index => !active.includes(index))) throw new RangeError('Invalid goblin targets');
    goblins.forEach((goblin, offset) => {
      const index = assignments[offset], total = rollDice(roll) + goblin.skill;
      if (total > strengths.get(index)) queue(fight, allyRef(offset + 1), enemyRef(index));
      fight.events.push({ kind: 'goblinAttack', ally: offset + 1, enemy: index, attack: total });
    });
  } else if (mode === 'street-alliance') {
    const ally = fight.allies[0], opponent = fight.enemies[0];
    if (fight.reinforcementArrived && aliveEnemy(fight, fight.enemies[1])) {
      duel(fight, 1, attack, roll);
      if (ally.stamina && aliveEnemy(fight, opponent)) {
        const allyAttack = rollDice(roll) + ally.skill, enemyAttack = rollDice(roll) + opponent.skill;
        if (allyAttack > enemyAttack) queue(fight, allyRef(0), enemyRef(0));
        else if (enemyAttack > allyAttack) queue(fight, enemyRef(0), allyRef(0));
      }
    } else if (!ally.stamina) duel(fight, 0, attack, roll);
    else {
      const allyAttack = rollDice(roll) + ally.skill, enemyAttack = rollDice(roll) + opponent.skill;
      fight.events.push({ kind: 'allianceAttack', playerAttack: attack, allyAttack, enemyAttack });
      if (attack > enemyAttack) playerHit(fight, 0);
      if (allyAttack > enemyAttack) queue(fight, allyRef(0), enemyRef(0));
      if (enemyAttack > Math.max(attack, allyAttack)) {
        if (attack >= allyAttack) enemyHit(fight, 0);
        else queue(fight, enemyRef(0), allyRef(0));
      }
    }
    if (!fight.reinforcementArrived && fight.rounds >= fight.config.reinforcementAfter && opponent.stamina > 0) fight.reinforcementPending = true;
  } else duel(fight, selected, attack, roll);
  settle(fight);
  if (fight.reinforcementPending && !fight.pending.length && !fight.outcome && aliveEnemy(fight, fight.enemies[0])) {
    fight.enemies.push(actor(fight.config.reinforcement));
    fight.reinforcementArrived = true;
    fight.reinforcementPending = false;
    fight.events.push({ kind: 'reinforcement' });
  }
  return fight;
}

export function round(input, selected = targets(input)[0], roll, options = {}) {
  ready(input);
  if (!targets(input).includes(selected)) throw new RangeError('Invalid target');
  const fight = clone(input);
  fight.events = [];
  fight.rounds++;
  fight.pebbleWindow = false;
  if (fight.config.fatalGrab && rollDice(roll) < opponentSkill(fight, selected)) { fatal(fight, 'mantisGrab'); return fight; }
  if (fight.config.mode === 'spectator' || fight.giantActive) return playRound(fight, selected, [0, 0], options, roll);
  const dice = [die(roll), die(roll)];
  if (fight.playerFightStarted && fight.player.helpfulGlove && fight.player.stamina < 5) {
    fight.decision = { kind: 'glove', dice, selected, options: clone(options) };
    return fight;
  }
  return playRound(fight, selected, dice, options, roll);
}

export function chooseGlove(input, index, roll) {
  requireFight(input);
  if (input.decision?.kind !== 'glove' || index !== null && ![0, 1].includes(index)) throw new RangeError('No glove decision');
  const fight = clone(input), { dice, selected, options } = fight.decision;
  fight.decision = null;
  if (index !== null) dice[index] = die(roll);
  fight.events = [{ kind: 'glove', index, dice: [...dice] }];
  return playRound(fight, selected, dice, options, roll);
}

export function chooseTarget(input, target) {
  requireFight(input);
  if (input.decision?.kind !== 'target' || !input.decision.targets.includes(target)) throw new RangeError('No target decision');
  const fight = clone(input);
  fight.decision = null;
  playerHit(fight, target);
  settle(fight);
  return fight;
}

export function resolveWound(input, mode = 'skip', roll) {
  requireFight(input);
  if (!input.pending.length || !['skip', 'luck', 'cake'].includes(mode)) throw new RangeError('No eligible wound');
  if (mode !== 'skip' && !canUseLuck(input, input.pending[0])) throw new RangeError('This wound cannot use Luck');
  const fight = clone(input), hit = fight.pending.shift();
  fight.events = [];
  let modifier = 0;
  if (mode !== 'skip') {
    const tested = testLuck(fight.player, roll, { cake: mode === 'cake' });
    fight.player = tested.character;
    modifier = hit.source.team === 'player' ? tested.lucky ? 2 : -1 : tested.lucky ? -1 : 1;
    fight.events.push({ kind: 'luck', roll: tested.roll, effective: tested.effective, lucky: tested.lucky, cake: tested.cake });
  }
  applyHit(fight, hit, modifier);
  settle(fight);
  if (fight.reinforcementPending && !fight.outcome && !fight.pending.length && aliveEnemy(fight, fight.enemies[0])) {
    fight.enemies.push(actor(fight.config.reinforcement));
    fight.reinforcementPending = false;
    fight.reinforcementArrived = true;
    fight.events.push({ kind: 'reinforcement' });
  }
  return fight;
}

export function decideWraithLuck(input, mode = 'skip', roll) {
  requireFight(input);
  if (input.decision?.kind !== 'wraithLuck' || !['skip', 'luck', 'cake'].includes(mode)) throw new RangeError('No wraith decision');
  const fight = clone(input);
  fight.decision = null;
  if (mode !== 'skip') {
    const tested = testLuck(fight.player, roll, { cake: mode === 'cake' });
    fight.player = tested.character;
    fight.events = [{ kind: 'luck', roll: tested.roll, effective: tested.effective, lucky: tested.lucky, cake: tested.cake }];
    if (tested.lucky) finish(fight, 'escape', 'wraithEscape', fight.config.winningRoundLuckDestination);
  }
  return fight;
}

export function throwPebble(input, target, roll) {
  ready(input);
  if (!input.pebbleWindow || !input.player.pebbles || !targets(input).includes(target)) throw new RangeError('No explosive pebble');
  const fight = clone(input), value = rollDice(roll), hit = value <= playerSkill(fight);
  fight.player.pebbles--;
  fight.events = [{ kind: 'pebble', roll: value, hit, enemy: target }];
  if (hit) queue(fight, playerRef(), enemyRef(target), 1, { noLuck: true });
  settle(fight);
  return fight;
}

export function castLimbSpell(input, section) {
  ready(input);
  if (input.config.mode !== 'limbs' || input.player.role !== 'wizard' || ![357, 373, 435, 441, 450].includes(section)) throw new RangeError('Invalid corpse spell');
  const fight = clone(input), cost = section === 373 ? 4 : section === 435 ? 2 : 1;
  let damage = section === 357 ? 3 : 0;
  if (section === 435) fight.config.headIllusions = true;
  if (section === 441) {
    fight.config.explosivePebbles = true;
    fight.pebbleWindow = true;
    if (!fight.player.pebbles) damage = 2;
  }
  if (section === 450) {
    if (fight.player.gold) { fight.player.gold--; fight.shieldActive = true; }
    else damage = 2;
  }
  fight.player.stamina = Math.max(0, fight.player.stamina - cost - damage);
  fight.events = [{ kind: 'spell', section, cost, damage }];
  if (!fight.player.stamina) fatal(fight, 'spell');
  return fight;
}

export function useDart(input, target, roll) {
  ready(input);
  if (input.rounds || !input.player.explosiveDarts || !targets(input).includes(target)
    || input.config.mode === 'spectator' || input.giantActive) throw new RangeError('No explosive dart');
  const fight = clone(input), value = rollDice(roll), hit = value < playerSkill(fight);
  fight.player.explosiveDarts--;
  fight.events = [{ kind: 'dart', roll: value, hit, enemy: target }];
  if (hit) queue(fight, playerRef(), enemyRef(target), 2, { noLuck: true,
    immune: !!fight.config.immune || fight.config.mode === 'silver-arrows' });
  settle(fight);
  return fight;
}

export function bindEnemy(input, target) {
  ready(input);
  if (!input.player.magicChain || !targets(input).includes(target) || input.enemies[target].stamina > 3
    || input.config.mode === 'spectator' || input.giantActive) throw new RangeError('Magic chain unavailable');
  const fight = clone(input);
  fight.player.magicChain = false;
  fight.chainUsed = true;
  fight.enemies[target].bound = true;
  fight.events = [{ kind: 'bound', enemy: target }];
  complete(fight);
  return fight;
}

export function recoverChain(input, roll, modes = ['luck', 'luck']) {
  if (input?.outcome !== 'win' || !input.chainUsed || input.chainRecoveryAttempted || !Array.isArray(modes)
    || modes.length !== 2 || modes.some(mode => !['luck', 'cake'].includes(mode))) throw new RangeError('No chain recovery');
  const fight = clone(input);
  fight.chainRecoveryAttempted = true;
  fight.events = [];
  let success = true;
  for (const mode of modes) {
    if (mode === 'luck' && !fight.player.luck || mode === 'cake' && !fight.player.cakeHalves) { success = false; continue; }
    const tested = testLuck(fight.player, roll, { cake: mode === 'cake' });
    fight.player = tested.character;
    success = success && tested.lucky;
    fight.events.push({ kind: 'luck', roll: tested.roll, effective: tested.effective, lucky: tested.lucky, cake: tested.cake });
  }
  fight.player.magicChain = success;
  return fight;
}

export function chooseDestination(input, destination) {
  if (input?.outcome !== 'win' || !input.config.alternateWins?.includes(destination)) throw new RangeError('Invalid exit');
  return { ...clone(input), destination };
}
