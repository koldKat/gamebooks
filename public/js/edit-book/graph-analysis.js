import { state, isTerminal, parseSecId } from '../core/state.js';

export function maxSectionInUse(s = state) {
  let max = 1;
  const bump = n => { if (typeof n === 'number' && !isTerminal(n) && n > max) max = n; };
  bump(parseSecId(s.startSection));
  Object.keys(s.graph || {}).forEach(k => bump(parseSecId(k)));
  Object.values(s.graph || {}).forEach(d => (d.choices || []).forEach(bump));
  (s.playthroughs || []).forEach(pt => (pt.path || []).forEach(bump));
  return max;
}
