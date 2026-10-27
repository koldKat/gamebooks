import {resourceFields} from './resources.js';

export function createCrossroadsState(definition, getContext) {
  function current() {
    const context = getContext();
    if (Number(context.getBookId()) !== definition.id) return null;
    return {context,run:context.getRun()};
  }
  return {
    read() {
      const state = current();
      return state?.run?.[definition.stateKey] ?? null;
    },
    change(update) {
      const state = current();
      if (!state?.run) return false;
      const {context,run} = state, before = run[definition.stateKey];
      const data = structuredClone(before ?? {character:null,setup:{},fight:null,history:[],log:[]});
      update(data);
      if (context.getRun() !== run || Number(context.getBookId()) !== definition.id || run[definition.stateKey] !== before) return false;
      const fight = data.fight;
      if (fight && data.character) {
        data.character.hp = fight.status === 'active' && fight.rules.nonfatal ? fight.startingHp : fight.hero.hp;
        if(fight.rules.mechanics?.hitCounters)data.character.age=fight.hero.age;
        for(const field of resourceFields(fight.rules.mechanics?.resources))data.character[field]=fight.hero[field];
        if (!fight.recorded && ['win','loss','draw'].includes(fight.status)) {
          fight.recorded = true;
          data.history.push({enemy:data.encounterName,outcome:fight.status,ts:Math.max(Date.now(),(data.history.at(-1)?.ts ?? 0)+1)});
        }
      }
      data.log = data.log.slice(-100);
      run[definition.stateKey] = data;
      context.saveState();
      return true;
    },
  };
}
