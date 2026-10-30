// Save Fatemaster fight choices and outcome history only in the currently bound playthrough.
export function emptyFatemasterState() {
  return {rulesVersion:1, encounter:'', variant:'', player:null, custom:[], fight:null, history:[]};
}

export function rememberFatemasterFight(state, now = Date.now()) {
  const fight = state.fight;
  if (!fight) return state;
  state.player = structuredClone(fight.player);
  if (!fight.recorded && ['win', 'loss', 'withdrawn'].includes(fight.status)) {
    if (!Number.isSafeInteger(now) || now < 0) throw new Error('Invalid history timestamp');
    fight.recorded = true;
    state.history.push({enemy:fight.label ?? 'Custom fight',section:fight.section ?? 'custom',outcome:fight.status,
      ts:Math.max(now,(state.history.at(-1)?.ts ?? 0) + 1)});
  }
  return state;
}

export function createFatemasterState(getContext) {
  function context() {
    const value = getContext();
    if (!value?.run || Number(value.bookId) !== value.definition.id) return null;
    return value;
  }
  function snapshot() {
    const ctx = context();
    return ctx ? {run:ctx.run, original:ctx.run[ctx.definition.stateKey],
      state:structuredClone(ctx.run[ctx.definition.stateKey] ?? emptyFatemasterState())} : null;
  }
  function update(change, token = snapshot()) {
    let ctx = context();
    if (!ctx || !token || ctx.run !== token.run || ctx.run[ctx.definition.stateKey] !== token.original) return false;
    const next = change(structuredClone(token.state));
    if (!next) return false;
    if (next.rulesVersion !== 1 || !Array.isArray(next.history)) throw new Error('Invalid saved Fatemaster state');
    rememberFatemasterFight(next);
    ctx = context();
    if (!ctx || ctx.run !== token.run || ctx.run[ctx.definition.stateKey] !== token.original) return false;
    ctx.run[ctx.definition.stateKey] = next;
    ctx.saveState();
    return true;
  }
  return {snapshot, update, read:() => snapshot()?.state ?? null};
}
