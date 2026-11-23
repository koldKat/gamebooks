import { defaults } from './combat.js';
import { definition } from './definition.js';

export function createState(getContext) {
  function read() {
    const { run, bookId } = getContext();
    return Number(bookId) === definition.id && run ? run[definition.stateKey] : undefined;
  }

  function change(update) {
    const { run, bookId, readOnly, save } = getContext();
    if (!run || Number(bookId) !== definition.id || readOnly) return false;
    const data = structuredClone(read() ?? {
      player: defaults, setup: {}, fight: null, prayerUsed: false, log: [], history: [],
    });
    update(data);
    data.log = data.log.slice(-200);
    if (data.fight?.outcome && !data.fight.recorded) {
      const { fight, history } = data;
      history.push({
        enemy: fight.name,
        outcome: fight.outcome,
        section: fight.section,
        ts: Math.max(Date.now(), (history.at(-1)?.ts ?? 0) + 1),
      });
      fight.recorded = true;
    }
    run[definition.stateKey] = data;
    save();
    return true;
  }

  return { read, change };
}
