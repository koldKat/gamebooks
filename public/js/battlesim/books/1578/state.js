// Preserve Bounty Hunter setup, pending dice and combat history on its own run.
import {definition} from './definition.js';

export const initialSetup=()=>({section:'custom',variant:'',range:'range',initiative:'havet',woundedFett:false,
  blaster:'',lightsabre:'',technical:'',jediPoints:'',maxJediPoints:'',weapon:'blaster',ready:true,ammo:'',
  oneFewerImperial:false,extraRebels:false,extraRebelSkill:'',participation:'observe',survivingGuards:'',survivingRebels:'',opponents:[{}]});

export function createState(getContext) {
  const read=()=>{const context=getContext();return Number(context.currentBookId)===definition.id
    ? context.currentPlaythrough()?.[definition.stateKey] ?? null : null;};
  function change(update) {
    const context=getContext(),run=context.currentPlaythrough();
    if (Number(context.currentBookId)!==definition.id || !run) return false;
    const original=run[definition.stateKey];
    const next=structuredClone(original ?? {schemaVersion:1,setup:initialSetup(),fight:null,history:[]});
    if (next.schemaVersion!==1 || !Array.isArray(next.history)) throw new RangeError('Unsupported combat state.');
    if (update(next)?.then) throw new TypeError('Synchronous updates only.');
    const fight=next.fight;
    if (fight && !fight.recorded && ['win','loss'].includes(fight.outcome)) {
      fight.recorded=true;
      next.history.push({enemy:fight.name,section:fight.section,outcome:fight.outcome,
        ts:Math.max(Date.now(),(next.history.at(-1)?.ts ?? 0)+1)});
    }
    const current=getContext();
    if (Number(current.currentBookId)!==definition.id || current.currentPlaythrough()!==run || run[definition.stateKey]!==original) return false;
    run[definition.stateKey]=next;current.saveState();return true;
  }
  return {read,change};
}
