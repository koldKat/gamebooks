import { CHECKS, ENCOUNTERS } from './definition.js';

const equipment = {113: 'knife', 117: 'spray', 119: 'holyWater', 143: 'knife', 144: 'spray', 146: 'holyWater'};
const loss = section => ({section, outcome: 'loss', scoreDelta: -5, retry: 71});
const fixed = {
  113: loss(113), 118: loss(118), 143: loss(143), 144: loss(144), 145: loss(145),
  117: {section: 117, outcome: 'win', scoreDelta: 0, next: 120},
  119: {section: 119, outcome: 'win', scoreDelta: 0, next: 120},
  146: {section: 146, outcome: 'win', scoreDelta: 1, next: 147, consumed: 'holyWater'},
};

export function resolveCheck(section, stats, items = {}) {
  if (!Object.hasOwn(CHECKS, section)) throw new RangeError('Unknown check');
  const check = CHECKS[section];
  if (check.item && items[check.item] !== true) throw new RangeError('Required equipment');
  const total = Object.entries(check.terms).reduce((sum, [key, multiplier]) => {
    if (!Number.isSafeInteger(stats[key]) || stats[key] < 0) throw new RangeError('Invalid quality');
    return sum + stats[key] * multiplier;
  }, 0);
  const passed = total > check.threshold;
  return {total, threshold: check.threshold, passed, section: passed ? check.success : check.failure};
}

export function resolveEncounter(encounter, method, stats, items = {}) {
  if (!Object.hasOwn(ENCOUNTERS, encounter) || !ENCOUNTERS[encounter].includes(method)) throw new RangeError('Invalid method');
  if (equipment[method] && items[equipment[method]] !== true) throw new RangeError('Required equipment');
  if (fixed[method]) return {...fixed[method]};
  const checked = resolveCheck(method, stats, items);
  if (encounter === 'skinhead') return {...checked, outcome: checked.passed ? 'win' : 'loss',
    scoreDelta: checked.passed ? 0 : -6, ...(checked.passed ? {next: 36} : {retry: 7}),
    ...(method === 26 && checked.passed ? {consumed: 'pipe'} : {})};
  if (encounter === 'goblins') return {...checked, outcome: checked.passed ? 'win' : 'loss',
    scoreDelta: checked.passed ? 0 : -5, ...(checked.passed ? {next: 120} : {retry: 71})};
  if (!checked.passed) return {...checked, outcome: 'loss', scoreDelta: -5, retry: 71};
  if (method === 140) return {...checked, outcome: 'win', scoreDelta: 1, next: 147};
  const escape = resolveCheck(137, stats);
  return {...escape, attackCheck: checked, outcome: escape.passed ? 'escape' : 'loss',
    scoreDelta: escape.passed ? 0 : -5, ...(escape.passed ? {next: 147} : {retry: 71})};
}
