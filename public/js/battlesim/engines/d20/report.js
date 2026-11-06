// Display encounter totals, original combat notes, and a bounded readable log.
export function renderD20Report(parent, ui, state) {
  const open = new Set([...parent.querySelectorAll('details[open][data-notes]')].map(node=>node.dataset.notes));
  parent.replaceChildren(); const fight=state.fight;
  ui.text(parent,ui.tr(fight?'status.'+fight.status:'ready'),'h4').className='bsim-side-title';
  if (!fight) return;
  ui.text(parent,fight.opponent.name); ui.text(parent,ui.tr('roundNumber')+' '+(fight.round+1));
  const actors=[['player',fight.player],...fight.companions.map((actor,i)=>['ally'+i,actor]),...fight.groups.map((actor,i)=>['enemy'+i,actor])];
  const name=key=>{const actor=actors.find(([id])=>id===key)?.[1];return actor?actor.name+(key==='player'?'':' '+(Number(key.match(/\d+/)[0])+1)):key??'';};
  if (fight.openingAttacks.length) ui.text(parent,ui.tr('opening')+': '+fight.openingAttacks.map(name).join(', '));
  for(const [key,actor]of actors){
    const ac=actor.ac+actor.conditions.reduce((sum,item)=>sum+(item.acBonus??0),0);
    ui.text(parent,name(key)+' · '+ui.tr('hp')+' '+actor.hp+'/'+actor.maxHp+' · AC '+ac);
    if(actor.encounterAdvantageCharges)ui.text(parent,ui.tr('boonRemaining')+': '+actor.encounterAdvantageCharges);
    if(actor.bonusAttacksPending)ui.text(parent,ui.tr('bonusAttacks')+': '+actor.bonusAttacksPending);
    if(actor.movementLostThisTurn)ui.text(parent,ui.tr('movementLost')+': '+actor.movementLostThisTurn);
    if(actor.dead)ui.text(parent,ui.tr('dead'));
    if(actor.sourceMergedUntilRound != null)ui.text(parent,ui.tr('mergedUntilRound')+' '+(actor.sourceMergedUntilRound+1));
    if(actor.sourceTurnDisadvantage)ui.text(parent,ui.tr('darknessDisadvantage'));
    for(const attack of actor.attacks)if(attack.damagePenalty)ui.text(parent,attack.name+' · '+ui.tr('weaponDamagePenalty')+' '+attack.damagePenalty);
    for(const [i,condition]of actor.conditions.entries())ui.text(parent,(i+1)+'. '+ui.tr('condition.'+condition.name)+(condition.remainingTurns?' · '+condition.remainingTurns:''));
    if(actor.spellSlots)ui.text(parent,ui.tr('availableSlots')+': '+Object.entries(actor.spellSlots).map(([level,count])=>level+': '+count).join(' · '));
  }
  ui.text(parent,ui.tr('manualStory'));
  for(const [index,profile]of fight.opponent.profiles.entries())if(profile.sourceBlocks?.length){
    const notes=ui.group(parent,'sourceNotes',open.has(String(index)));notes.dataset.notes=String(index);ui.text(notes,profile.name,'h4');
    for(const block of profile.sourceBlocks){
      if(block.html){const template=ui.document.createElement('template');template.innerHTML=block.html;ui.text(notes,template.content.textContent);}
      else if(block.kind==='ability-table')ui.text(notes,block.headers.map((key,i)=>key+' '+block.values[i]+' ('+(block.modifiers[i]>=0?'+':'')+block.modifiers[i]+')').join(' · '));
    }
  }
  ui.text(parent,ui.tr('log'),'h4').className='bsim-side-title';const log=ui.document.createElement('div');log.className='bsim-log';parent.append(log);
  function check(result){
    if(!result)return'';
    return (result.rolls?.length?'['+result.rolls.join(', ')+'] '+(result.total??'')+' ':'')
      +(result.success!=null?ui.tr(result.success?'passed':'failed'):result.hit!=null?ui.tr(result.hit?'hit':'miss'):'');
  }
  for(const event of fight.events.slice().reverse()){
    let value=ui.tr('event.'+event.kind);
    if(event.actor)value+=' · '+name(event.actor);if(event.target)value+=' → '+name(event.target);
    if(event.attack)value+=' · '+event.attack;if(event.spell)value+=' · '+event.spell;
    if(event.note||event.reason)value+=' · '+(event.note??event.reason);
    if(event.amount!=null)value+=' · '+event.amount;
    if(event.check||event.save)value+=' · '+check(event.save??event.check);
    if(event.selection)value+=' · '+actors.find(([key])=>key===event.actor)?.[1].attacks[event.selection.attackIndex].name;
    if(event.order)value+=' · '+event.order.map(item=>name(item.key)+' '+item.check.total).join(', ');
    if(event.roll!=null)value+=' · '+event.roll;
    if(event.movement)value+=' · '+ui.tr('movementFeet')+' '+event.movement;
    if(event.droppedWeapon)value+=' · '+ui.tr('droppedWeaponHelp');
    ui.text(log,value);
    for(const effect of event.effects??[]){
      let detail=ui.tr('event.'+effect.kind);if(effect.condition)detail+=' · '+ui.tr('condition.'+effect.condition);
      if(effect.actor)detail+=' · '+name(effect.actor);if(effect.target)detail+=' → '+name(effect.target);
      if(effect.amount!=null)detail+=' · '+effect.amount;if(effect.current!=null)detail+=' → '+effect.current;
      if(effect.roll!=null)detail+=' · '+(typeof effect.roll==='number'?effect.roll:effect.roll.rolls?.join(', '));
      if(effect.check)detail+=' · '+check(effect.check);ui.text(log,detail);
    }
  }
  ui.text(parent,ui.tr('history'),'h4').className='bsim-side-title';
  for(const row of state.history.slice(-30).reverse())ui.text(parent,row.enemy+' · '+ui.tr('status.'+row.outcome));
}
