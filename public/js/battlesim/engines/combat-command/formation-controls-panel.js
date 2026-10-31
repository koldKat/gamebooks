// Present saved formation dice rolls, explicit casualty choices and round boundaries.
import { beginFormationRound,resolveFormationRoll,allocateFormationCasualties } from './formation-battle.js';
import { formationEngagedCount } from './formation-rules.js';
import { personnelButton,personnelField } from './personnel-form.js';

export function createFormationControlsPanel({document,holder,id,dispatch}) {
  let shown;
  const number = (input,minimum,maximum,optional=false) => {
    if (optional&&!input.value.trim())return undefined;
    const value=Number(input.value);
    if (!input.value.trim()||!Number.isSafeInteger(value)||value<minimum||value>maximum) throw new RangeError('Enter a valid whole number.');
    return value;
  };
  function render(fight) {
    if (shown===fight)return;
    shown=fight;holder.replaceChildren();if (!fight)return;
    const send=action=>dispatch(action,fight);
    if (fight.status==='paused') {
      const note=document.createElement('p');note.textContent='Combat paused at the printed checkpoint. Keep these survivors and consult the reader.';
      holder.appendChild(note);return;
    }
    if (fight.status!=='fighting')return;
    if (fight.phase==='allocation') {
      const pending=fight.pending,units=pending.side==='player'?fight.player:fight.enemies,inputs={};
      const capacity=pending.targets.reduce((sum,key)=>sum+formationEngagedCount(units.find(unit=>unit.key===key),Math.max(1,fight.round),fight.config.engagements?.[pending.side]?.[key]),0);
      const note=document.createElement('p');note.textContent=pending.message+' Allocate '+Math.min(pending.hits,capacity)+' casualties.';holder.appendChild(note);
      for (const key of pending.targets) {
        const unit=units.find(unit=>unit.key===key),cap=formationEngagedCount(unit,Math.max(1,fight.round),fight.config.engagements?.[pending.side]?.[key]);
        const input=document.createElement('input');input.type='number';input.min='0';input.max=String(cap);input.step='1';input.value='0';input.dataset.unitKey=key;
        inputs[key]={input,cap};personnelField(document,holder,unit.name+' ('+cap+' engaged)',input);
      }
      personnelButton(document,holder,'Apply casualties',()=>send(current=>{
        const values=Object.fromEntries(Object.entries(inputs).map(([key,{input,cap}])=>[key,number(input,0,cap)]));
        return allocateFormationCasualties(current,values);
      })).id=id+'-apply-casualties';
      return;
    }
    if (fight.phase==='roll') {
      const pending=fight.pending,note=document.createElement('p');
      note.textContent=pending.label+(pending.kind==='morale'?' (current Morale '+pending.morale+')':'');holder.appendChild(note);
      const input=document.createElement('input');input.type='number';input.min='2';input.max='12';input.step='1';input.id=id+'-roll-total';
      personnelField(document,holder,'2d6 total (blank to roll)',input);
      personnelButton(document,holder,'Resolve this roll',()=>send(current=>resolveFormationRoll(current,number(input,2,12,true)))).id=id+'-resolve-roll';
      personnelButton(document,holder,'Resolve remaining rolls',()=>send(current=>{
        let next=resolveFormationRoll(current,number(input,2,12,true));
        for(let i=0;next.status==='fighting'&&next.phase==='roll'&&i<2000;i++)next=resolveFormationRoll(next);
        return next;
      })).id=id+'-resolve-round';return;
    }
    personnelButton(document,holder,'Begin next round',()=>send(beginFormationRound)).id=id+'-begin-round';
  }
  return {render};
}
