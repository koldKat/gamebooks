// Resolve printed martial combat checks without advancing the reader or story.
const clone = value => structuredClone(value);
const skills = ['prowess', 'perception', 'kenjutsu'];
const integer = (value, min = 0, max = 1000000) => {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new RangeError('Invalid combat value');
  return value;
};
const section = value => {
  if (!/^[1-9]\d{0,5}$/.test(String(value))) throw new RangeError('Invalid combat section');
  return String(value);
};
const label = value => {
  const text = String(value ?? '').trim();
  if (!text || text.length > 200) throw new RangeError('Invalid combat label');
  return text;
};

export function normalizeMartialEncounter(input) {
  if (!Array.isArray(input?.steps) || !input.steps.length || input.steps.length > 100) {
    throw new RangeError('Invalid combat procedure');
  }
  const out = {name:label(input.displayName ?? input.name), section:section(input.section),
    training:input.training, defeatSection:section(input.defeatSection), steps:[]};
  if (typeof out.training !== 'boolean') throw new RangeError('Invalid combat type');
  const ids = new Set();
  for (const source of input.steps) {
    const step = {section:section(source.section), kind:source.kind, damage:[]};
    if (ids.has(step.section)) throw new RangeError('Duplicate combat section');
    ids.add(step.section);
    if (source.damage != null && (!Array.isArray(source.damage) || source.damage.length > 4)) {
      throw new RangeError('Invalid combat damage');
    }
    step.damage = (source.damage ?? []).map(damage => {
      if (damage.dice != null) {
        if (damage.dice !== 1 || damage.fixed != null) throw new RangeError('Invalid damage die');
        return {dice:1};
      }
      return {fixed:integer(damage.fixed, 1)};
    });
    if (step.kind === 'check') {
      if (!skills.includes(source.skill)) throw new RangeError('Invalid combat skill');
      Object.assign(step, {skill:source.skill, target:integer(source.target, 1),
        pass:section(source.pass), fail:section(source.fail)});
    } else if (step.kind === 'choice') {
      if (!Array.isArray(source.choices) || !source.choices.length || source.choices.length > 4) {
        throw new RangeError('Invalid combat choices');
      }
      step.choices = source.choices.map(choice => ({label:label(choice.label), to:section(choice.to)}));
      if (new Set(step.choices.map(choice => choice.to)).size !== step.choices.length) {
        throw new RangeError('Duplicate combat choice');
      }
      if (source.hpGate != null) {
        step.hpGate = {threshold:integer(source.hpGate.threshold, 1), low:section(source.hpGate.low)};
      }
    } else if (step.kind === 'hp') {
      Object.assign(step, {threshold:integer(source.threshold, 1),
        low:section(source.low), high:section(source.high)});
    } else if (step.kind === 'continue') step.next = section(source.next);
    else if (step.kind === 'outcome') {
      if (!['win', 'loss', 'fled'].includes(source.outcome)) throw new RangeError('Invalid combat outcome');
      if (source.zeroHp != null && (typeof source.zeroHp !== 'boolean'
          || source.zeroHp && source.outcome !== 'loss')) {
        throw new RangeError('Invalid terminal damage');
      }
      step.outcome = source.outcome;
      step.zeroHp = source.zeroHp === true;
    } else throw new RangeError('Invalid combat step');
    out.steps.push(step);
  }
  if (!ids.has(out.section)) throw new RangeError('Missing combat entry');
  for (const step of out.steps) {
    const targets = step.kind === 'check' ? [step.pass, step.fail]
      : step.kind === 'choice' ? [...step.choices.map(choice => choice.to), ...(step.hpGate ? [step.hpGate.low] : [])]
      : step.kind === 'hp' ? [step.low, step.high] : step.kind === 'continue' ? [step.next] : [];
    if (targets.some(target => !ids.has(target))) throw new RangeError('Missing combat continuation');
  }
  return out;
}

const current = fight => fight.opponent.steps.find(step => step.section === fight.step);
function ready(fight) {
  const step = current(fight);
  if (fight.damageIndex < step.damage.length) { fight.phase = 'damage'; return; }
  if (step.hpGate && fight.player.hp <= step.hpGate.threshold) {
    fight.phase = 'continue'; fight.pending = step.hpGate.low; return;
  }
  fight.phase = step.kind === 'outcome' ? 'finish' : step.kind === 'hp' ? 'continue' : step.kind;
  if (step.kind === 'continue') fight.pending = step.next;
  if (step.kind === 'hp') fight.pending = fight.player.hp <= step.threshold ? step.low : step.high;
}
function enter(fight, target, damageAlreadyApplied = false) {
  fight.step = target; fight.destination = target; delete fight.pending;
  fight.damageIndex = damageAlreadyApplied ? current(fight).damage.length : 0;
  ready(fight);
}
export function startMartialFight(input, encounter, openingDamageAlreadyApplied = false) {
  if (typeof openingDamageAlreadyApplied !== 'boolean') throw new RangeError('Invalid damage acknowledgment');
  const maxHp = integer(input?.maxHp, 1);
  const player = {maxHp, hp:integer(input.hp, 1, maxHp), experience:integer(input.experience)};
  for (const skill of skills) player[skill] = integer(input[skill], 1);
  const opponent = normalizeMartialEncounter(encounter);
  const fight = {rulesVersion:1, initial:{player:clone(player), openingDamageAlreadyApplied},
    player, opponent, status:'fighting', round:0, events:[]};
  enter(fight, opponent.section, openingDamageAlreadyApplied);
  return fight;
}
function die(value, random) {
  if (value === undefined) {
    const sample = random();
    if (!Number.isFinite(sample) || sample < 0 || sample >= 1) throw new RangeError('Invalid random die');
    value = Math.floor(sample * 6) + 1;
  }
  return integer(value, 1, 6);
}
function apply(fight, action) {
  if (fight.status !== 'fighting') throw new RangeError('Completed combat');
  const step = current(fight), from = fight.step;
  let detail = {};
  if (action.kind === 'roll') {
    if (fight.phase !== 'check') throw new RangeError('No combat check available');
    const spent = integer(action.spent, 0, fight.player.experience), value = die(action.die);
    const total = value + spent + fight.player[step.skill], success = total >= step.target;
    fight.player.experience -= spent; fight.round++;
    fight.pending = success ? step.pass : step.fail; fight.destination = fight.pending; fight.phase = 'continue';
    detail = {die:value, spent, total, success};
  } else if (action.kind === 'damage') {
    if (fight.phase !== 'damage') throw new RangeError('No damage available');
    const rule = step.damage[fight.damageIndex];
    const spent = integer(action.spent ?? 0, 0, rule.dice ? fight.player.experience : 0);
    const value = rule.dice ? die(action.die) : null;
    if (!rule.dice && action.die != null) throw new RangeError('Fixed damage cannot be rolled');
    const amount = rule.dice ? value + spent : rule.fixed;
    fight.player.experience -= spent; fight.player.hp = Math.max(0, fight.player.hp - amount);
    fight.damageIndex++; detail = {amount, spent, die:value};
    if (!fight.player.hp) {
      fight.status = 'loss'; fight.phase = 'complete'; fight.destination = fight.opponent.defeatSection;
    } else ready(fight);
  } else if (action.kind === 'choice') {
    const choice = fight.phase === 'choice' && step.choices.find(choice => choice.to === action.destination);
    if (!choice) throw new RangeError('Unavailable combat choice');
    fight.pending = choice.to; fight.destination = choice.to; fight.phase = 'continue';
    detail = {destination:choice.to};
  } else if (action.kind === 'continue') {
    if (fight.phase === 'finish') {
      fight.status = step.outcome; fight.phase = 'complete';
      if (step.zeroHp) {
        fight.player.hp = 0;
        fight.destination = fight.opponent.defeatSection;
      }
    } else {
      if (fight.phase !== 'continue' || action.destination !== fight.pending) {
        throw new RangeError('Unavailable combat continuation');
      }
      const destination = fight.pending; enter(fight, destination); detail = {destination};
    }
  } else if (action.kind === 'cancel') { fight.status = 'cancelled'; fight.phase = 'complete'; delete fight.pending; }
  else throw new RangeError('Invalid combat action');
  fight.events.push({kind:action.kind, section:from, ...detail, hp:fight.player.hp, experience:fight.player.experience});
  return fight;
}

export function validateMartialFight(fight) {
  if (fight?.rulesVersion !== 1 || !Array.isArray(fight.events) || fight.events.length > 2000) {
    throw new RangeError('Invalid saved combat');
  }
  const replay = startMartialFight(fight.initial?.player, fight.opponent, fight.initial?.openingDamageAlreadyApplied);
  for (const event of fight.events) {
    apply(replay, event);
    if (JSON.stringify(replay.events.at(-1)) !== JSON.stringify(event)) throw new RangeError('Invalid combat event');
  }
  for (const key of ['initial','player','opponent','status','phase','step','damageIndex','pending','destination','round']) {
    if (JSON.stringify(replay[key]) !== JSON.stringify(fight[key])) throw new RangeError('Invalid saved combat state');
  }
  return fight;
}
export function martialAction(fight, action, random = Math.random) {
  validateMartialFight(fight);
  if (fight.status !== 'fighting' || action?.expectedEvent !== fight.events.length || fight.events.length >= 2000) {
    throw new RangeError('Stale combat action');
  }
  const input = clone(action), step = current(fight);
  if (input.kind === 'roll' || input.kind === 'damage') {
    const rolling = input.kind === 'roll' || step.damage[fight.damageIndex]?.dice === 1;
    if (fight.phase !== (input.kind === 'roll' ? 'check' : 'damage')) throw new RangeError('Unavailable roll');
    integer(input.spent ?? 0, 0, rolling ? fight.player.experience : 0);
    input.spent ??= 0;
    if (rolling) input.die = die(input.die, random);
  }
  return apply(clone(fight), input);
}
