// Resolve database-defined combat actions without changing the reader or campaign.
const copy = value => structuredClone(value);
const MAX = 1000000;
const outcomes = new Set(['win', 'loss', 'fled', 'ended', 'cancelled']);
const reserved = new Set(['__proto__', 'prototype', 'constructor', 'roll', 'total', 'spent']);
const arities = {add:2, sub:2, mul:2, min:2, max:2, mod:2, eq:2, ne:2,
  ge:2, gt:2, le:2, lt:2, and:2, or:2, not:1, if:3};
function integer(value, min = -MAX, max = MAX) {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new RangeError('Invalid combat value');
  return value;
}
function text(value, max = 400) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new RangeError('Invalid combat label');
  return value.trim();
}
function identifier(value) {
  if (typeof value !== 'string' || !/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(value)
      || reserved.has(value)) throw new RangeError('Invalid combat variable');
  return value;
}
function nodeId(value) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(value)) {
    throw new RangeError('Invalid combat action reference');
  }
  return value;
}
function section(value) {
  if (!/^[1-9]\d{0,5}$/.test(String(value))) throw new RangeError('Invalid printed combat reference');
  return String(value);
}
function expression(value, names, depth = 0) {
  if (Number.isSafeInteger(value)) return integer(value);
  if (!Array.isArray(value) || depth > 12) throw new RangeError('Invalid combat expression');
  if (value[0] === 'var' && value.length === 2 && (names.has(value[1])
      || ['roll', 'total', 'spent'].includes(value[1]))) return ['var', value[1]];
  if (!Object.hasOwn(arities, value[0]) || value.length !== arities[value[0]] + 1) {
    throw new RangeError('Invalid combat expression');
  }
  return [value[0], ...value.slice(1).map(part => expression(part, names, depth + 1))];
}
function evaluate(expr, fight) {
  if (typeof expr === 'number') return expr;
  const [op, ...args] = expr;
  if (op === 'var') {
    if (['roll', 'total', 'spent'].includes(args[0])) {
      if (!fight.lastRoll) throw new RangeError('A combat roll is required');
      return fight.lastRoll[args[0]];
    }
    return fight.player[args[0]];
  }
  const a = evaluate(args[0], fight);
  // Conditional branches are lazy so an unavailable calculation is never used.
  if (op === 'if') return evaluate(args[a ? 1 : 2], fight);
  if (op === 'not') return Number(!a);
  if (op === 'and' && !a) return 0;
  if (op === 'or' && a) return 1;
  const b = evaluate(args[1], fight);
  const value = op === 'add' ? a + b : op === 'sub' ? a - b : op === 'mul' ? a * b
    : op === 'min' ? Math.min(a, b) : op === 'max' ? Math.max(a, b)
    : op === 'mod' ? a % b : op === 'eq' ? Number(a === b) : op === 'ne' ? Number(a !== b)
    : op === 'ge' ? Number(a >= b) : op === 'gt' ? Number(a > b)
    : op === 'le' ? Number(a <= b) : op === 'lt' ? Number(a < b)
    : op === 'and' ? Number(!!b) : Number(!!b);
  return integer(value);
}

export function normalizeProcedure(input) {
  if (!Array.isArray(input?.variables) || input.variables.length < 3 || input.variables.length > 64
      || !Array.isArray(input.steps) || !input.steps.length || input.steps.length > 512) {
    throw new RangeError('Invalid combat procedure');
  }
  const names = new Set();
  const variables = input.variables.map(source => {
    const key = identifier(source.key);
    if (names.has(key)) throw new RangeError('Duplicate combat variable');
    names.add(key);
    const row = {key, label:text(source.label, 120), min:integer(source.min), max:integer(source.max)};
    if (row.max < row.min) throw new RangeError('Invalid combat variable range');
    if (source.default != null) row.default = integer(source.default, row.min, row.max);
    if (source.internal != null) {
      if (typeof source.internal !== 'boolean' || source.internal && row.default == null) {
        throw new RangeError('Invalid internal combat variable');
      }
      row.internal = source.internal;
    }
    return row;
  });
  if (!['hp', 'maxHp', 'experience'].every(key => names.has(key))) throw new RangeError('Missing character stats');
  const effects = (rows = []) => {
    if (!Array.isArray(rows) || rows.length > 32) throw new RangeError('Invalid combat effects');
    return rows.map(row => {
      if (!names.has(row.key)) throw new RangeError('Unknown combat stat');
      return {key:row.key, value:expression(row.value, names)};
    });
  };
  const routes = rows => {
    if (!Array.isArray(rows) || !rows.length || rows.length > 32 || rows.at(-1).when != null) {
      throw new RangeError('Combat roll needs an explicit fallback');
    }
    return rows.map((row, index) => {
      if (index < rows.length - 1 && row.when == null) throw new RangeError('Unreachable combat route');
      return {to:nodeId(row.to), ...(row.when != null ? {when:expression(row.when, names)} : {})};
    });
  };
  const ids = new Set();
  const steps = input.steps.map(source => {
    const step = {id:nodeId(source.id), section:section(source.section), kind:source.kind,
      label:text(source.label), effects:effects(source.effects)};
    if (ids.has(step.id)) throw new RangeError('Duplicate combat action');
    ids.add(step.id);
    if (step.kind === 'roll') {
      step.dice = integer(source.dice, 1, 2);
      if (typeof source.experience !== 'boolean') throw new RangeError('Missing experience rule');
      step.experience = source.experience;
      step.bonus = expression(source.bonus ?? 0, names);
      if (source.bonusAfterSpending != null) {
        if (typeof source.bonusAfterSpending !== 'boolean') throw new RangeError('Invalid combat bonus timing');
        step.bonusAfterSpending = source.bonusAfterSpending;
      }
      step.routes = routes(source.routes);
    } else if (step.kind === 'choice') {
      if (!Array.isArray(source.choices) || !source.choices.length || source.choices.length > 32) {
        throw new RangeError('Invalid combat options');
      }
      step.choices = source.choices.map(row => ({id:nodeId(row.id), label:text(row.label),
        to:nodeId(row.to), effects:effects(row.effects),
        ...(row.when != null ? {when:expression(row.when, names)} : {})}));
      if (new Set(step.choices.map(row => row.id)).size !== step.choices.length) throw new RangeError('Duplicate combat option');
    } else if (step.kind === 'effect') step.routes = routes(source.routes);
    else if (step.kind === 'outcome') {
      if (!outcomes.has(source.outcome)) throw new RangeError('Invalid combat outcome');
      step.outcome = source.outcome;
      if (source.zeroHp != null) {
        if (typeof source.zeroHp !== 'boolean' || source.zeroHp && source.outcome !== 'loss') {
          throw new RangeError('Invalid explicit combat death');
        }
        step.zeroHp = source.zeroHp;
      }
    } else throw new RangeError('Invalid combat action');
    return step;
  });
  const terminalSource = input.terminalRules ?? [];
  if (!Array.isArray(terminalSource) || terminalSource.length > 16) throw new RangeError('Invalid terminal combat rules');
  const terminalRules = terminalSource.map(row => {
    if (!outcomes.has(row.outcome)) throw new RangeError('Invalid terminal combat outcome');
    return {when:expression(row.when, names), outcome:row.outcome,
      destination:row.destination == null ? null : section(row.destination)};
  });
  const entry = nodeId(input.entry);
  if (!ids.has(entry)) throw new RangeError('Missing combat entry');
  for (const step of steps) {
    if ((step.choices ?? step.routes ?? []).some(row => !ids.has(row.to))) throw new RangeError('Missing combat action');
  }
  if (input.custom != null && typeof input.custom !== 'boolean') throw new RangeError('Invalid combat procedure type');
  return {name:text(input.displayName ?? input.name, 200), section:section(input.section), entry,
    ...(input.custom != null ? {custom:input.custom} : {}),
    defeatSection:input.defeatSection == null ? null : section(input.defeatSection), variables, terminalRules, steps};
}

const current = fight => fight.opponent.steps.find(step => step.id === fight.step);
function checkPlayer(fight) {
  for (const row of fight.opponent.variables) integer(fight.player[row.key], row.min, row.max);
  integer(fight.player.maxHp, 1); integer(fight.player.hp, 0, fight.player.maxHp);
  integer(fight.player.experience, 0);
}
function terminal(fight) {
  if (!fight.player.hp) {
    fight.status = 'loss'; fight.destination = fight.opponent.defeatSection;
  } else {
    const rule = fight.opponent.terminalRules.find(row => evaluate(row.when, fight));
    if (rule) { fight.status = rule.outcome; fight.destination = rule.destination; }
  }
  if (fight.status !== 'fighting') { fight.phase = 'complete'; delete fight.pending; return true; }
  return false;
}
function enter(fight, id) {
  fight.step = id; delete fight.pending;
  const step = current(fight); fight.destination = step.section;
  fight.phase = step.kind === 'outcome' ? 'finish' : step.kind;
}
export function startProcedure(input, procedure) {
  const opponent = normalizeProcedure(procedure), player = {};
  for (const row of opponent.variables) player[row.key] = integer(input?.[row.key] ?? row.default, row.min, row.max);
  const fight = {family:'procedural-quest', rulesVersion:1, initial:copy(player), player, opponent,
    status:'fighting', round:0, events:[]};
  checkPlayer(fight);
  if (terminal(fight)) throw new RangeError('Character cannot start this encounter');
  enter(fight, opponent.entry);
  return fight;
}
function applyEffects(fight, rows) {
  for (const row of rows) {
    const bounds = fight.opponent.variables.find(variable => variable.key === row.key);
    fight.player[row.key] = integer(evaluate(row.value, fight), bounds.min, bounds.max);
  }
  checkPlayer(fight);
}
function pending(fight, routes) {
  if (terminal(fight)) return;
  const target = routes.find(row => row.when == null || evaluate(row.when, fight));
  fight.pending = target.to; fight.destination = fight.opponent.steps.find(step => step.id === target.to).section;
  fight.phase = 'continue';
}
function dice(values, count, random = Math.random) {
  if (values === undefined) values = Array.from({length:count}, () => {
    const value = random();
    if (!Number.isFinite(value) || value < 0 || value >= 1) throw new RangeError('Invalid random roll');
    return Math.floor(value * 6) + 1;
  });
  if (!Array.isArray(values) || values.length !== count) throw new RangeError('Wrong number of combat dice');
  return values.map(value => integer(value, 1, 6));
}
function rollBonus(fight, step, spent) {
  return evaluate(step.bonus, step.bonusAfterSpending
    ? {...fight, player:{...fight.player, experience:fight.player.experience - spent}} : fight);
}
function apply(fight, action) {
  if (fight.status !== 'fighting') throw new RangeError('Completed encounter');
  const step = current(fight), event = {kind:action.kind, step:step.id, section:step.section};
  if (action.kind === 'roll') {
    if (fight.phase !== 'roll') throw new RangeError('No combat roll available');
    const spent = integer(action.spent, 0, step.experience ? fight.player.experience : 0);
    const values = dice(action.dice, step.dice);
    const bonus = rollBonus(fight, step, spent);
    fight.player.experience -= spent;
    const roll = values.reduce((sum, value) => sum + value, 0);
    fight.lastRoll = {roll, spent, total:integer(roll + spent + bonus)};
    fight.round++; applyEffects(fight, step.effects); pending(fight, step.routes);
    Object.assign(event, {dice:values, ...fight.lastRoll});
  } else if (action.kind === 'effect') {
    if (fight.phase !== 'effect') throw new RangeError('No combat effect available');
    applyEffects(fight, step.effects); pending(fight, step.routes);
  } else if (action.kind === 'choice') {
    const choice = fight.phase === 'choice' && step.choices.find(row => row.id === action.choice);
    if (!choice || choice.when != null && !evaluate(choice.when, fight)) throw new RangeError('Unavailable combat option');
    applyEffects(fight, step.effects); applyEffects(fight, choice.effects);
    if (!terminal(fight)) { fight.pending = choice.to; fight.phase = 'continue';
      fight.destination = fight.opponent.steps.find(row => row.id === choice.to).section; }
    event.choice = choice.id;
  } else if (action.kind === 'continue') {
    if (fight.phase !== 'continue' || action.destination !== fight.pending) throw new RangeError('Unavailable combat continuation');
    event.destination = fight.pending; enter(fight, fight.pending);
  } else if (action.kind === 'finish') {
    if (fight.phase !== 'finish') throw new RangeError('No combat outcome available');
    applyEffects(fight, step.effects);
    if (step.zeroHp) {
      fight.player.hp = 0; fight.status = 'loss'; fight.phase = 'complete'; fight.destination = step.section;
    } else if (!terminal(fight)) { fight.status = step.outcome; fight.phase = 'complete'; }
  } else if (action.kind === 'cancel') { fight.status = 'cancelled'; fight.phase = 'complete'; delete fight.pending; }
  else throw new RangeError('Invalid combat action');
  Object.assign(event, {hp:fight.player.hp, experience:fight.player.experience});
  fight.events.push(event);
  return fight;
}

export function validateProcedureFight(fight) {
  if (fight?.family !== 'procedural-quest' || fight.rulesVersion !== 1
      || !Array.isArray(fight.events) || fight.events.length > 2000) throw new RangeError('Invalid saved combat');
  const replay = startProcedure(fight.initial, fight.opponent);
  for (const event of fight.events) {
    apply(replay, event);
    if (JSON.stringify(replay.events.at(-1)) !== JSON.stringify(event)) throw new RangeError('Invalid saved combat action');
  }
  for (const key of ['initial', 'player', 'opponent', 'status', 'phase', 'step', 'pending', 'destination', 'round', 'lastRoll']) {
    if (JSON.stringify(replay[key]) !== JSON.stringify(fight[key])) throw new RangeError('Invalid saved combat state');
  }
  return fight;
}
export function availableProcedureChoices(fight) {
  const step = current(fight);
  return fight.status === 'fighting' && fight.phase === 'choice'
    ? step.choices.filter(row => row.when == null || evaluate(row.when, fight)).map(row => ({id:row.id, label:row.label})) : [];
}
export function procedureAction(fight, action, random = Math.random) {
  validateProcedureFight(fight);
  if (action?.expectedEvent !== fight.events.length || fight.events.length >= 2000 || fight.status !== 'fighting') {
    throw new RangeError('Stale combat action');
  }
  const input = copy(action);
  if (input.kind === 'roll') {
    const step = current(fight);
    if (fight.phase !== 'roll') throw new RangeError('No combat roll available');
    const spent = integer(input.spent ?? 0, 0, step.experience ? fight.player.experience : 0);
    // Validate the modifier before drawing any dice, too.
    rollBonus(fight, step, spent);
    input.spent ??= 0; input.dice = dice(input.dice, step.dice, random);
  }
  return apply(copy(fight), input);
}
