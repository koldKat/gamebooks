import { recordOutcome } from './combat.js';
import { definition } from './definition.js';

function initialState() {
  return {
    version: 1,
    hero: { skill: 2, wounds: [0, 0, 0], battles: 0, escapes: 0, skillBonus: false },
    setup: { encounter: '', technique: 'mist', hiddenWeapon: 'none', name: '', skill: 3, limit: 3, playerBonus: 0, enemyBonus: 0 },
    fight: null,
    history: [],
    log: [],
  };
}

export function createState(getContext) {
  const { id, stateKey } = definition;
  function read() {
    const { bookId, run } = getContext();
    return Number(bookId) === id ? run()?.[stateKey] ?? initialState() : null;
  }
  function change(update) {
    const { bookId, run } = getContext();
    const current = run();
    if (Number(bookId) !== id || !current) return false;
    const before = current[stateKey];
    const next = structuredClone(before ?? initialState());
    if (next.version !== 1) return false;
    update(next);
    const fight = next.fight;
    if (fight?.outcome && !fight.recorded) {
      next.hero = recordOutcome(next.hero, fight);
      next.history.push({ name: fight.encounter.name, outcome: fight.outcome,
        ts: Math.max(Date.now(), (next.history.at(-1)?.ts ?? 0) + 1) });
      fight.recorded = true;
      if (fight.outcome === 'fled' && next.hero.escapes === 5) fight.destination = 76;
    }
    next.log = next.log.slice(-100);
    const live = getContext();
    if (Number(live.bookId) !== id || live.run() !== current || before !== current[stateKey]) return false;
    current[stateKey] = next;
    live.save();
    return true;
  }
  return { read, change };
}
