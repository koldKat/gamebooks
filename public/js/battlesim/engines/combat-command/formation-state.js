// Preserve one playthrough's formation fight and record actual terminal combat outcomes once.
const empty = () => ({encounter:'',custom:{},history:[],fight:null});

export function createFormationState(getContext) {
  function context() {
    const value = getContext();
    if (!value?.run || Number(value.bookId) !== value.definition?.id) return null;
    return value;
  }
  function read() {
    const value = context();
    return value ? value.run[value.definition.stateKey] ?? empty() : null;
  }
  function update(change, expectedFight) {
    const value = context();
    if (!value) return false;
    const {run,definition} = value, original = run[definition.stateKey];
    if (expectedFight !== undefined && original?.fight !== expectedFight) return false;
    const next = change(structuredClone(original ?? empty()));
    const live = context();
    if (!next || !live || live.run !== run || live.definition.stateKey !== definition.stateKey
        || run[definition.stateKey] !== original) return false;
    const fight = next.fight;
    if (fight?.formationRulesVersion === 1) {
      next.playerForce = structuredClone(fight.player);
      const actualCombat = fight.history.some(event => event.attacks.length);
      if (actualCombat && !fight.recorded && ['win','loss','escaped'].includes(fight.status)) {
        fight.recorded = true;
        next.history.push({enemy:fight.config.label,outcome:fight.status,section:fight.section,
          ts:Math.max(Date.now(),(next.history.at(-1)?.ts ?? 0) + 1)});
        next.history = next.history.slice(-100);
      }
    }
    run[definition.stateKey] = next;
    value.saveState();
    return true;
  }
  return {read,snapshot:() => {const value=read();return value?structuredClone(value):null;},update};
}
