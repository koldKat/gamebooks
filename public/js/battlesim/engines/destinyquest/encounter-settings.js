import { hasDestinyAbility } from './effects.js';

// Expand declarative roster settings against the current combatant group.
// Templates contain data only; they never evaluate source text or mutate saves.
function expand(value, count, index, dead) {
  if (Array.isArray(value)) return value.map(item => expand(item, count, index, dead));
  if (!value || typeof value !== 'object') return value;
  if (value.$op === 'index') return index;
  if (value.$op === 'dead') return dead;
  if (value.$op === 'opponents' || value.$op === 'opponentMap') {
    const entries = Array.from({ length: Math.max(0, count - (value.from || 0)) }, (_, offset) => {
      const target = offset + (value.from || 0);
      const item = expand(value.value, count, target, dead);
      return value.$op === 'opponentMap' ? [target, item] : item;
    });
    return value.$op === 'opponentMap' ? Object.fromEntries(entries) : entries;
  }
  if (value.$op === 'opponentPairs') {
    return Array.from({ length: count }, (_, defeated) => Array.from({ length: count }, (_, target) =>
      defeated === target ? [] : [expand(value.value, count, target, defeated)])).flat(2);
  }
  if (value.$op) throw new TypeError('Unknown encounter settings template');
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, expand(item, count, index, dead)]));
}

function matches(condition, fight, options) {
  if (condition.all) return condition.all.every(item => matches(item, fight, options));
  if (condition.any) return condition.any.some(item => matches(item, fight, options));
  if (condition.ability) return hasDestinyAbility(fight, condition.ability);
  const root = condition.option ? options : fight;
  const path = condition.option || condition.path;
  if (typeof path !== 'string') throw new TypeError('Invalid encounter condition');
  const value = path.split('.').reduce((parent, key) => parent?.[key], root);
  if (Object.hasOwn(condition, 'includes')) return Array.isArray(value) && value.includes(condition.includes);
  return value === condition.equals;
}

export function destinyEncounterSettings(fight, preset, options = {}) {
  const adapter = preset?.adapter;
  if (adapter?.schemaVersion !== 1 || adapter.implemented !== true || !adapter.rules) {
    throw new RangeError('This encounter still needs its complete rules adapter');
  }
  if (adapter.requiresTransport && !fight.equipment?.transport) throw new RangeError('Choose the transport used in this encounter');
  const rules = structuredClone(adapter.rules);
  for (const variation of adapter.variations || []) {
    if (!matches(variation.when, fight, options)) continue;
    Object.assign(rules, structuredClone(variation.set));
    for (const key of variation.unset || []) delete rules[key];
  }
  for (const [name, grant] of Object.entries(rules.grantedAbilities || {})) {
    if (grant.requires && !matches(grant.requires, fight, options)) delete rules.grantedAbilities[name];
  }
  return expand(rules, fight.opponents.length);
}

export function destinyEncounterAction(fight, preset, action) {
  const settings = preset?.adapter?.actions?.[action];
  if (!settings) throw new RangeError('Unknown encounter action');
  return expand(settings, fight.opponents.length);
}

export function destinyEncounterEventSettings(fight, roster, kind) {
  if (!Array.isArray(roster)) throw new TypeError('Load the book roster before resolving an encounter event');
  const preset = roster.find(entry => entry.section === String(fight.encounter?.sourceSection));
  const settings = preset?.adapter?.eventRules?.[kind];
  if (!settings) throw new RangeError('Missing encounter event settings');
  return expand(settings, fight.opponents.length);
}
