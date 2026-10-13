import { orcStat } from './core.js';

export function parseOrcStat(text) {
  if (typeof text !== 'string') throw new RangeError('Enter a stat');
  const match = /^(\d+)(?:\s*\+\s*d(6|8|10))?$/i.exec(text.trim());
  if (!match) throw new RangeError('Use a whole number or base+d6/d8/d10');
  return orcStat({ base: Number(match[1]), sides: Number(match[2] ?? 0) });
}

export function formatOrcStat(value) {
  if (value === null) return '';
  const stat = orcStat(value);
  return String(stat.base) + (stat.sides ? '+d' + stat.sides : '');
}

export function parseOrcInteger(text, { minimum = 0, maximum = 1000000 } = {}) {
  if (typeof text !== 'string' || !/^-?\d+$/.test(text.trim())) throw new RangeError('Enter a whole number');
  const number = Number(text.trim());
  if (!Number.isSafeInteger(number) || number < minimum || number > maximum) throw new RangeError('Number out of range');
  return number;
}
