// Preserve one run's Shinté combat setup, current health, active fight and reward history.
import { definition } from './definition.js';

export const initialSetup = () => ({hero: {cs: '', ds: '', pp: '', maxPP: '', sp: '', maxSP: '', agility: '', guile: ''},
  first: '', zeroColumn: '', styles: {}, shinGuards: false, ambush: false, indigo: false,
  openingDamage: 0, retreatAllowed: false, opponents: [{}]});

export function createState(getContext) {
  function read() {
    const live = getContext();
    return Number(live.currentBookId) === definition.id ? live.currentPlaythrough()?.[definition.stateKey] ?? null : null;
  }
  function change(update) {
    const live = getContext(), run = live.currentPlaythrough();
    if (Number(live.currentBookId) !== definition.id || !run) return false;
    const original = run[definition.stateKey];
    const next = structuredClone(original ?? {schemaVersion: 1, setup: initialSetup(), fight: null, history: [], log: []});
    if (next.schemaVersion !== 1 || !Array.isArray(next.history) || !Array.isArray(next.log)) throw new RangeError('Unsupported combat state.');
    if (update(next)?.then) throw new TypeError('Synchronous updates only.');
    if (['win', 'loss'].includes(next.fight?.outcome) && !next.fight.recorded) {
      next.fight.recorded = true;
      next.history.push({enemy: next.fight.enemies.map(enemy => enemy.name).join(', '), outcome: next.fight.outcome,
        section: next.fight.section, ts: Math.max(Date.now(), (next.history.at(-1)?.ts ?? 0) + 1)});
    }
    next.log = next.log.slice(-160);
    const current = getContext();
    if (Number(current.currentBookId) !== definition.id || current.currentPlaythrough() !== run
        || run[definition.stateKey] !== original) return false;
    run[definition.stateKey] = next;
    current.saveState();
    return true;
  }
  return {read, change};
}
