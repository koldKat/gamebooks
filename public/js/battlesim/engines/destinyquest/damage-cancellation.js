// Keep defensive dice beside the original damage roll. Calculations filter a
// temporary view, preserving rolled faces, bonuses and provenance in saves.
export function prepareDestinyCancellation(fight,target,group,roll){
  if(!fight.encounter?.cancelMatchingDamageTargets?.includes(target))return;
  const values=(group.cancellationDiceByTarget??={})[target]??=[];
  while(values.length<group.dice.length){
    const value=roll();if(!Number.isInteger(value)||value<1||value>6)throw new RangeError('A die must roll 1-6');
    values.push(value);
  }
}

export function destinyUncancelledDice(group,target){
  const opposing=group.cancellationDiceByTarget?.[target];
  return group.dice.map((_,index)=>index).filter(index=>!opposing?.slice(0,group.dice.length).includes(group.dice[index]));
}

export function prepareDestinyScoreCancellation(fight,roll){
  if(!fight.encounter?.cancelMatchingDamageTargets?.includes(fight.target))return;
  const group={dice:fight.turn.damageDice,cancellationDiceByTarget:fight.turn.cancellationDiceByTarget};
  prepareDestinyCancellation(fight,fight.target,group,roll);
  fight.turn.cancellationDiceByTarget=group.cancellationDiceByTarget;
}

export function destinyCancellationScoreContext(fight){
  const opposing=fight.turn.cancellationDiceByTarget?.[fight.target];
  if(!opposing)return fight;
  const next=structuredClone(fight),group={dice:next.turn.damageDice,cancellationDiceByTarget:next.turn.cancellationDiceByTarget};
  const kept=destinyUncancelledDice(group,next.target);
  next.turn.damageDice=kept.map(i=>group.dice[i]);
  next.turn.damageDieBonuses=Object.fromEntries(kept.map((old,index)=>[index,next.turn.damageDieBonuses?.[old]||0]));
  next.turn.cancelledDamageDice=group.dice.map((_,i)=>i).filter(i=>!kept.includes(i));
  return next;
}
