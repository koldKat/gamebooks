export function createFantasyState(definition, getContext) {
  function current() {
    const context = getContext();
    return Number(context.getBookId()) === definition.id ? {context,run:context.getRun()} : null;
  }
  return {
    read() { return current()?.run?.[definition.stateKey] ?? null; },
    change(update) {
      const state = current();
      if (!state?.run) return false;
      const {context,run} = state, before = run[definition.stateKey];
      const next = structuredClone(before ?? {character:null,setup:{},fight:null,history:[],log:[]});
      update(next);
      if (context.getRun() !== run || Number(context.getBookId()) !== definition.id || run[definition.stateKey] !== before) return false;
      if (next.fight) {
        next.character = structuredClone(next.fight.character);
        if (!next.fight.recorded && ['win','loss'].includes(next.fight.status)) {
          next.fight.recorded = true;
          next.history.push({enemy:next.fight.config.label,outcome:next.fight.status,
            ts:Math.max(Date.now(),(next.history.at(-1)?.ts ?? 0)+1)});
        }
      }
      next.log = next.log.slice(-100);
      run[definition.stateKey] = next; context.saveState(); return true;
    },
  };
}
