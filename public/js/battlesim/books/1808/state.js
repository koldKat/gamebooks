import { currentBookId, currentPlaythrough, isReadOnlySimulator, saveState } from '../../run-context.js';
import { defaultPlayer, definition } from './definition.js';

export function readState() {
  if (Number(currentBookId) !== definition.id) return null;
  const run = currentPlaythrough();
  return run[definition.stateKey] ??= { player: { ...defaultPlayer }, selected: 'custom', fight: null, log: [], history: [] };
}

export function changeState(update) {
  const data = readState();
  if (!data || isReadOnlySimulator()) return false;
  update(data);
  const fight = data.fight;
  if (fight && !fight.recorded && ['win', 'loss'].includes(fight.status)) {
    fight.recorded = true;
    const ts = Math.max(Date.now(), (data.history.at(-1)?.ts ?? 0) + 1);
    data.history.push({ enemy: fight.spec.name, outcome: fight.status, ts });
  }
  data.log = data.log.slice(-100);
  data.history = data.history.slice(-50);
  saveState();
  return true;
}
