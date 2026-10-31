// Display graded duel results, the wound transcript and saved outcome history.
export function renderKnightmareReport(document, holder, state, t) {
  const tr=(key,params)=>t('battlesim.knightmare.'+key,params);
  const add=(value,tag='p')=>{const node=document.createElement(tag);node.textContent=value;holder.append(node);return node;};
  const grade=value=>tr('grade.'+value),fight=state.fight;
  holder.replaceChildren();
  add(tr(fight?'status.'+fight.status:'ready'),'h4').className='bsim-side-title';
  if(fight){
    add(tr('player')+': '+grade(fight.player.lifeForce));
    add(fight.opponent.name+': '+grade(fight.opponent.lifeForce));
    add(tr('charges_left',{count:fight.luckCharges}));
  }
  add(tr('combat_log'),'h4').className='bsim-side-title';
  const log=document.createElement('div');log.className='bsim-log';holder.append(log);
  for(const step of [...(fight?.rounds??[])].reverse()){
    const node=document.createElement('p');
    const rolled=step.usedLuck?tr('luck_used'):tr('die_value',{value:step.die});
    const name=step.wounded==='player'?tr('player'):fight.opponent.name;
    node.textContent=tr('round',{round:step.round})+' · '+rolled+' · '+tr('wounded',{name})
      +' · '+grade(step.wounded==='player'?step.playerLifeForce:step.opponentLifeForce);
    log.append(node);
  }
  add(tr('history'),'h4').className='bsim-side-title';
  for(const item of state.history.slice(-30).reverse())add(item.enemy+' · '+tr('status.'+item.outcome));
}
