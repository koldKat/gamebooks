import {captureDestinyItemChoices,planDestinyItemLoss} from './shared-item-loss.js';

export function createDestinyState(definition, getContext) {
  const current = () => {
    const context = getContext();
    return Number(context.getBookId()) === definition.id ? context.getRun() : null;
  };
  const read = () => current()?.[definition.stateKey] ?? null;
  const capture = () => {
    const run = current(), value = read();
    return {run, value, fight:value?.fight};
  };
  const matches = snapshot => Boolean(snapshot.run && current() === snapshot.run && read() === snapshot.value && read()?.fight === snapshot.fight);
  const commit = (snapshot, value) => {
    if (!matches(snapshot)) return false;
    snapshot.run[definition.stateKey] = value;
    getContext().saveState();
    return true;
  };
  const itemChoices=snapshot=>matches(snapshot)?captureDestinyItemChoices(snapshot.run):[];
  const commitItemLoss=(snapshot,choice,resolve)=>{
    if(!matches(snapshot)||snapshot.fight?.turn?.pendingAbility?.type!=='shared-item-loss')return false;
    const plan=planDestinyItemLoss(snapshot.run,choice);if(!plan)return false;
    const value=resolve(plan.receipt);
    if(!value||typeof value.then==='function')throw new RangeError('Resolve shared item loss synchronously');
    const acknowledgement=value.fight?.history?.findLast(event=>event.type==='shared-item-loss'&&event.round===snapshot.fight.round)?.item;
    if(value.fightId!==snapshot.value.fightId||!value.fight?.turn?.sharedItemLossResolved||!acknowledgement||!['source','key','itemId','quantity','reason'].every(key=>acknowledgement[key]===plan.receipt[key]))throw new RangeError('Acknowledge the selected shared item loss before saving');
    if(!matches(snapshot)||!planDestinyItemLoss(snapshot.run,choice))return false;
    Object.assign(snapshot.run,plan.patch);
    snapshot.run[definition.stateKey]=value;
    getContext().saveState();return true;
  };
  return {current, read, capture, matches, commit, itemChoices, commitItemLoss};
}
