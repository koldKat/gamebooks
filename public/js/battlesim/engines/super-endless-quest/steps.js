// Resolve successive printed combat checks, leaving every story transition manual.
const clone = value => structuredClone(value);
const integer = (value, min, max = 1000000) => {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new RangeError('Invalid combat value');
  return value;
};
const section = value => {
  if (!/^[1-9]\d{0,5}$/.test(String(value))) throw new RangeError('Invalid combat section');
  return String(value);
};
const flags = ['sword', 'cloak', 'gem'];
function damage(value = 0) {
  if (Number.isSafeInteger(value)) return {base:integer(value, 0)};
  const out = {base:integer(value?.base, 0)};
  for (const flag of flags) if (value[flag] != null) out[flag] = integer(value[flag], 0);
  return out;
}
function route(value) {
  const out = {destination:section(value?.destination), damage:damage(value.damage)};
  if (value.outcome != null) {
    if (!['win', 'loss', 'fled', 'surrendered'].includes(value.outcome) || value.next != null) {
      throw new RangeError('Invalid combat outcome');
    }
    out.outcome = value.outcome;
  } else {
    out.next = section(value.next);
    if (out.next !== out.destination) throw new RangeError('Combat continuation must match printed destination');
  }
  return out;
}

export function normalizeStagedEncounter(input) {
  const name = String(input?.displayName ?? input?.name ?? '').trim();
  if (!name || name.length > 200 || !Array.isArray(input.steps) || !input.steps.length || input.steps.length > 100) {
    throw new RangeError('Invalid combat encounter');
  }
  const out = {name, section:section(input.section), steps:[]}, ids = new Set();
  for (const source of input.steps) {
    const step = {section:section(source.section), entryDamage:damage(source.entryDamage)};
    if (ids.has(step.section)) throw new RangeError('Duplicate combat step');
    ids.add(step.section);
    if (source.choices) {
      if (!Array.isArray(source.choices) || !source.choices.length || source.choices.length > 4) throw new RangeError('Invalid combat choices');
      step.choices = source.choices.map(route);
      if (new Set(step.choices.map(r => r.destination)).size !== step.choices.length) throw new RangeError('Duplicate combat choice');
    } else {
      step.dice = integer(source.dice, 1, 2);
      if (!['fighting', 'agility'].includes(source.skill)) throw new RangeError('Invalid combat skill');
      step.skill = source.skill; step.target = integer(source.target, 1);
      step.swordBonus = integer(source.swordBonus ?? 0, 0);
      step.success = route(source.success); step.failure = route(source.failure);
    }
    out.steps.push(step);
  }
  if (!ids.has(out.section)) throw new RangeError('Missing combat entry');
  for (const step of out.steps) for (const target of step.choices ?? [step.success, step.failure]) {
    if (target.next && !ids.has(target.next)) throw new RangeError('Missing combat continuation');
  }
  out.target = out.steps.find(step => step.section === out.section).target ?? 1;
  return out;
}

function character(input) {
  const maxHp = integer(input?.maxHp, 1);
  const out = {maxHp, hp:integer(input.hp, 1, maxHp), fighting:integer(input.fighting, 1),
    agility:integer(input.agility, 1), experience:integer(input.experience, 0)};
  for (const flag of flags) {
    if (input[flag] != null && typeof input[flag] !== 'boolean') throw new RangeError('Invalid combat modifier');
    out[flag] = input[flag] ?? false;
  }
  return out;
}
function deduct(fight, rule) {
  const amount = Math.min(rule.base, ...flags.filter(flag => fight.player[flag] && rule[flag] != null).map(flag => rule[flag]));
  fight.player.hp = Math.max(0, fight.player.hp - amount);
  if (!fight.player.hp) { fight.status = 'loss'; fight.phase = 'complete'; delete fight.pending; }
}
const current = fight => fight.opponent.steps.find(step => step.section === fight.step);
function enter(fight, target, acknowledged = false) {
  fight.step = target; fight.destination = target; delete fight.pending;
  const step = current(fight);
  fight.phase = step.choices ? 'choice' : 'attack';
  if (!acknowledged) deduct(fight, step.entryDamage);
}

export function startStagedQuestFight(input, encounter, openingDamageAlreadyApplied = false) {
  if (typeof openingDamageAlreadyApplied !== 'boolean') throw new RangeError('Invalid damage acknowledgment');
  const player = character(input), opponent = normalizeStagedEncounter(encounter);
  const fight = {rulesVersion:2, initial:{player:clone(player), openingDamageAlreadyApplied}, player,
    opponent, status:'fighting', round:0, events:[]};
  enter(fight, opponent.section, openingDamageAlreadyApplied);
  return fight;
}
function resolve(fight, target) {
  fight.destination = target.destination;
  deduct(fight, target.damage);
  if (fight.status !== 'fighting') return;
  if (target.outcome) { fight.status = target.outcome; fight.phase = 'complete'; }
  else { fight.phase = 'continue'; fight.pending = target.next; }
}
function rollDice(values, count, random) {
  if (values === undefined) values = Array.from({length:count}, () => {
    const value = random();
    if (!Number.isFinite(value) || value < 0 || value >= 1) throw new RangeError('Invalid random roll');
    return Math.floor(value * 6) + 1;
  });
  if (!Array.isArray(values) || values.length !== count) throw new RangeError('Wrong number of combat dice');
  return values.map(value => integer(value, 1, 6));
}
function apply(fight, action) {
  if (fight.status !== 'fighting') throw new RangeError('Completed encounter');
  const step = current(fight), from = fight.step;
  if (action.kind === 'roll') {
    if (fight.phase !== 'attack') throw new RangeError('No attack available');
    const dice = rollDice(action.dice, step.dice), spent = integer(action.spent, 0, fight.player.experience);
    const total = dice.reduce((sum, value) => sum + value, 0) + fight.player[step.skill] + spent
      + (fight.player.sword ? step.swordBonus : 0);
    fight.player.experience -= spent; fight.round++;
    const success = total >= step.target;
    resolve(fight, success ? step.success : step.failure);
    fight.events.push({kind:'roll', section:from, dice, spent, total, target:step.target, success,
      hp:fight.player.hp, experience:fight.player.experience});
  } else if (action.kind === 'continue') {
    if (fight.phase !== 'continue' || action.destination !== fight.pending) throw new RangeError('Unavailable combat continuation');
    enter(fight, fight.pending);
    fight.events.push({kind:'continue', section:from, destination:action.destination, hp:fight.player.hp});
  } else if (action.kind === 'choice') {
    const target = fight.phase === 'choice' && step.choices.find(r => r.destination === action.destination);
    if (!target) throw new RangeError('Unavailable combat choice');
    resolve(fight, target);
    fight.events.push({kind:'choice', section:from, destination:action.destination, hp:fight.player.hp});
  } else if (action.kind === 'cancel') {
    fight.status = 'cancelled'; fight.phase = 'complete'; delete fight.pending;
    fight.events.push({kind:'cancel', section:from, hp:fight.player.hp});
  } else throw new RangeError('Invalid combat action');
  return fight;
}

export function validateStagedQuestFight(fight) {
  if (fight?.rulesVersion !== 2 || !Array.isArray(fight.events) || fight.events.length > 10000) {
    throw new RangeError('Invalid saved encounter');
  }
  const replay = startStagedQuestFight(fight.initial?.player, fight.opponent, fight.initial?.openingDamageAlreadyApplied);
  for (const event of fight.events) {
    apply(replay, event);
    if (JSON.stringify(replay.events.at(-1)) !== JSON.stringify(event)) throw new RangeError('Invalid saved combat action');
  }
  for (const key of ['initial', 'player', 'opponent', 'status', 'phase', 'step', 'pending', 'destination', 'round']) {
    if (JSON.stringify(replay[key]) !== JSON.stringify(fight[key])) throw new RangeError('Invalid saved combat state');
  }
  return fight;
}
export function stagedQuestAction(fight, action, random = Math.random) {
  validateStagedQuestFight(fight);
  if (action?.expectedEvent !== fight.events.length || fight.events.length >= 10000 || fight.status !== 'fighting') {
    throw new RangeError('Stale combat action');
  }
  const input = clone(action);
  if (input.kind === 'roll') {
    if (fight.phase !== 'attack') throw new RangeError('No attack available');
    integer(input.spent ?? 0, 0, fight.player.experience);
    input.spent ??= 0;
    input.dice = rollDice(input.dice, current(fight).dice, random);
  }
  return apply(clone(fight), input);
}
