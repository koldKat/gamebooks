// Present explicit round choices, withdrawal and resumable dice controls for personnel combat.
import { beginPersonnelRound, resolvePersonnelRoll, canEscapePersonnelFight, escapePersonnelFight } from './personnel-battle.js';
import { personnelLiving } from './personnel-rules.js';
import { personnelField, personnelCheckbox, personnelSelect, personnelButton } from './personnel-form.js';

export function createPersonnelControlsPanel({document,holder,id,dispatch}) {
  let shown;
  function render(fight) {
    if(shown===fight)return;
    shown=fight;holder.replaceChildren();
    if(!fight||fight.status!=='fighting')return;
    const rules=fight.config.rules;
    const send=update=>dispatch(update,fight);
    if(fight.phase==='roll'){
      const paragraph=document.createElement('p');paragraph.textContent=fight.pending.label;holder.appendChild(paragraph);
      const total=document.createElement('input');total.type='number';total.min=String(fight.pending.dice);
      total.max=String(fight.pending.dice*6);total.step='1';total.id=id+'-roll-total';
      personnelField(document,holder,`${fight.pending.dice}d6 total (blank to roll)`,total);
      const read=()=>{
        if(!total.value.trim())return undefined;
        const value=Number(total.value);
        if(!Number.isSafeInteger(value)||value<fight.pending.dice||value>fight.pending.dice*6)throw new RangeError('Enter a valid dice total.');
        return value;
      };
      personnelButton(document,holder,'Resolve this roll',()=>send(current=>resolvePersonnelRoll(current,read()))).id=id+'-resolve-roll';
      personnelButton(document,holder,'Resolve remaining rolls',()=>send(current=>{
        let next=resolvePersonnelRoll(current,read());
        for(let i=0;next.phase==='roll'&&i<2000;i++)next=resolvePersonnelRoll(next);
        if(next.phase==='roll')throw new RangeError('Too many pending combat checks');
        return next;
      })).id=id+'-resolve-round';
      return;
    }
    const inputs={},charges=[];
    const enemies=personnelLiving(fight.enemies);
    if(fight.openingRemaining>0||!rules.waves&&enemies.length>1)inputs.target=personnelSelect(document,holder,
      fight.openingRemaining>0?'Wave for all opening attacks':'Target',
      [{value:'',label:'Choose opponent'},...enemies.map(u=>({value:u.key,label:u.name}))],fight.openingTarget??'');
    if(rules.meleeFromRound&&!fight.melee&&fight.round+1>=rules.meleeFromRound)inputs.melee=
      personnelCheckbox(document,holder,'Commit to close combat (cannot withdraw afterward)');
    if(!fight.melee)for(const unit of personnelLiving(fight.player))if(unit.charges>0&&(rules.charge||unit.chargeAttack))charges.push({key:unit.key,
      input:personnelCheckbox(document,holder,`${unit.name}: use an explosive charge (${unit.charges} left)`)});
    const tactics=[{value:'',label:'Ordinary attack'}];
    if(rules.searchlight&&!fight.searchlightDestroyed)tactics.push({value:'searchlight',label:'Mies shoots the searchlight'});
    if(rules.vehicleShot)tactics.push({value:'vehicle-shot',label:'Mies shoots a floater'});
    if(tactics.length>1&&!fight.melee){
      inputs.tactic=personnelSelect(document,holder,'Special shot',tactics);
      if(rules.vehicleShot){
        inputs.duration=personnelSelect(document,holder,'Firing exclusion: choose how to apply the ambiguous printed duration',
          [{value:'',label:'Choose duration'},{value:'round',label:'Only the round of Mies’ floater attempt'},
            {value:'continuing',label:'Keep Mies’ 2 points out of subsequent firing'}]);
        const row=inputs.duration.closest('label');row.hidden=true;
        inputs.tactic.addEventListener('change',()=>{row.hidden=inputs.tactic.value!=='vehicle-shot';});
      }
    }
    if(rules.escape?.window==='after-player')inputs.escape=personnelCheckbox(document,holder,
      'Try to escape after firing if the police casualty threshold has been reached');
    const options=()=>({targetKey:inputs.target?.value||fight.openingTarget,
      melee:Boolean(inputs.melee?.checked),charges:charges.filter(c=>c.input.checked).map(c=>c.key),
      tactic:inputs.tactic?.value||undefined,exclusionDuration:inputs.duration?.value,
      escapeAfterAttack:Boolean(inputs.escape?.checked)});
    personnelButton(document,holder,fight.openingRemaining>0?'Next opening attack':'Begin next round',
      ()=>send(current=>beginPersonnelRound(current,options()))).id=id+'-begin-round';
    if(rules.talk)personnelButton(document,holder,'Cease fire and talk (one enemy attack)',
      ()=>send(current=>beginPersonnelRound(current,{talk:true}))).id=id+'-talk';
    if(rules.escape||rules.openingEscapeChoice){
      const withdraw=personnelButton(document,holder,'Withdraw',()=>send(escapePersonnelFight));
      withdraw.id=id+'-withdraw';withdraw.disabled=!canEscapePersonnelFight(fight);
    }
  }
  return {render};
}
