// Preserve Dracula's Castle combat setup, active encounter and reward history per run.
import {definition} from './definition.js';

export const initialSetup = () => ({role:'harker', hero:{lifePoints:'',speed:'',courage:'',strength:'',skill:'',psi:''},
  section:'custom', groupMode:'manual', weapon:'none', garlicOil:false, partyCard:false, cursed:false,
  opponents:[{}],useAllies:false,allies:[{}]});

export function createState(getContext) {
  function read() {
    const context = getContext();
    return Number(context.currentBookId) === definition.id ? context.currentPlaythrough()?.[definition.stateKey] ?? null : null;
  }
  function change(update) {
    const context = getContext(), run = context.currentPlaythrough();
    if (Number(context.currentBookId) !== definition.id || !run) return false;
    const original = run[definition.stateKey];
    const next = structuredClone(original ?? {schemaVersion:1,setup:initialSetup(),fight:null,history:[],log:[]});
    if (next.schemaVersion !== 1 || !Array.isArray(next.history) || !Array.isArray(next.log)) {
      throw new RangeError('Unsupported combat state.');
    }
    if (update(next)?.then) throw new TypeError('Synchronous updates only.');
    if (['win','loss'].includes(next.fight?.outcome) && !next.fight.recorded) {
      next.fight.recorded = true;
      next.history.push({enemy:next.fight.enemies.map(e=>e.name).join(', '),outcome:next.fight.outcome,
        section:next.fight.section,ts:Math.max(Date.now(),(next.history.at(-1)?.ts ?? 0)+1)});
    }
    next.log = next.log.slice(-160);
    const current = getContext();
    if (Number(current.currentBookId) !== definition.id || current.currentPlaythrough() !== run
        || run[definition.stateKey] !== original) return false;
    run[definition.stateKey] = next;
    current.saveState();
    return true;
  }
  return {read,change};
}
