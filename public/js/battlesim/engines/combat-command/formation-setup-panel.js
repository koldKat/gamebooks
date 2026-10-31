// Collect editable current forces and explicit chart choices for one formation encounter.
import { createOpponentEditor,validateOpponents } from '../../opponents.js';
import { personnelSelect,personnelChartOptions,personnelButton } from './personnel-form.js';
import { prepareFormationEncounter,customFormationEncounter } from './formation-catalog.js';

const fields = [{key:'count',label:'Current Manpower',min:0},{key:'ordnance',label:'Ordnance',min:0},
  {key:'melee',label:'Melee',min:0},{key:'morale',label:'Current Morale',min:0},
  {key:'casualtyRemainder',label:'Casualties since last Morale reduction',min:0},
  {key:'routedFlag',label:'Status',options:[{value:'no',label:'Active'},{value:'yes',label:'Routed'}]}];

export function createFormationSetupPanel({document,holder,id,t,getUnitProfiles,getPlayerDefaults}) {
  let preset,playerEditor,enemyEditor,locked=false,choices={},custom={};
  const editors = () => [playerEditor,enemyEditor].filter(Boolean);
  const attacks = () => preset ? [...(preset.opening??[]),...preset.rounds.flatMap(sequence=>sequence.attacks)] : [];
  function required(side,key,field) {
    const unit = (side==='player'?preset?.playerUnits:preset?.enemies)?.find(unit=>unit.key===key);
    if (field==='count') return true;
    if (!preset) {
      if (field==='morale') return custom[side+'Morale']?.value!=='none';
      if (field==='casualtyRemainder') return custom[side+'Morale']?.value==='10';
      return field===(custom[side+'Stat']?.value??'melee');
    }
    if (field==='casualtyRemainder') return (unit?.moraleLoss?.per??0)>1;
    if (field==='morale' && unit?.moraleLoss) return true;
    return attacks().some(attack=>{
      if (attack.side===side && !Object.hasOwn(attack,'fixedStrength')) {
        return attack.actors?.some(actor=>[actor.key,...(actor.fallbackKeys??[])].includes(key)
          && actor.stat===field && actor.value===undefined);
      }
      return attack.side!==side && field==='morale'
        && (attack.alwaysCheckMorale?.includes(key)||attack.moralePenalty?.key===key);
    });
  }
  function unavailable(side,field,row) {
    if (required(side,row.key,field)) return false;
    if (field==='casualtyRemainder') return true;
    return row[field]===null||row[field]===undefined||row[field]==='';
  }
  function adjust() {
    for (const [side,editor] of [['player',playerEditor],['enemy',enemyEditor]]) {
      if (!editor) continue;
      const rows=editor.snapshot();
      for (const [index,row] of [...editor.element.querySelectorAll('fieldset')].entries()) {
        for (const input of row.querySelectorAll('[data-stat]')) {
          if (input.dataset.stat==='routedFlag'&&!input.value)input.value='no';
          const missing=unavailable(side,input.dataset.stat,rows[index]);
          input.dataset.unavailable=String(missing);input.disabled=locked||missing;
          input.closest('label').hidden=missing;
        }
      }
    }
  }
  const editable = unit => ({...structuredClone(unit),displayName:unit.name,
    casualtyRemainder:unit.casualtyRemainder??0,routedFlag:unit.retired==='routed'?'yes':'no'});
  function editor(side,units) {
    const result=createOpponentEditor({document,id:id+'-'+side,t,fields,
      presets:preset?[]:getUnitProfiles().map(editable),onSelect:adjust,
      isStatUnavailable:(field,row)=>unavailable(side,field,row)});
    result.element.querySelector('summary').textContent=side==='player'?'Your current force':'Enemy force';
    result.set(units.map(editable));result.fixCount(Boolean(preset));holder.appendChild(result.element);
    result.element.addEventListener('input',adjust);
    result.element.addEventListener('click',()=>queueMicrotask(adjust));
    return result;
  }
  function mount(state,selected) {
    holder.replaceChildren();preset=selected;locked=false;choices={};custom={};
    playerEditor=enemyEditor=null;
    const defaults=getPlayerDefaults();
    if (!preset) {
      for (const side of ['player','enemy']) {
        custom[side+'Stat']=personnelSelect(document,holder,side==='player'?'Your attack value':'Enemy attack value',
          [{value:'melee',label:'Melee'},{value:'ordnance',label:'Ordnance'}],state.custom?.[side+'Stat']??'melee');
        custom[side+'Chart']=personnelSelect(document,holder,side==='player'?'Your chart':'Enemy chart',
          personnelChartOptions,state.custom?.[side+'Chart']??'');
        custom[side+'Morale']=personnelSelect(document,holder,side==='player'?'Your casualty morale rule':'Enemy casualty morale rule',
          [{value:'none',label:'No casualty morale checks'},{value:'1',label:'Lose 1 Morale per casualty'},
            {value:'10',label:'Lose 1 Morale per 10 casualties'}],state.custom?.[side+'Morale']??'none');
        for (const field of ['Stat','Chart','Morale'])custom[side+field].id=id+'-'+side+'-'+field.toLowerCase();
        custom[side+'Stat'].addEventListener('change',adjust);custom[side+'Morale'].addEventListener('change',adjust);
      }
      custom.initiative=personnelSelect(document,holder,'Initiative',
        [{value:'player',label:'You first'},{value:'enemy',label:'Enemy first'}],state.custom?.initiative??'player');
      custom.initiative.id=id+'-initiative';
    }
    for (const input of preset?.chartInputs??[]) {
      choices[input.key]=personnelSelect(document,holder,input.label,personnelChartOptions,'');
      choices[input.key].id=id+'-chart-'+input.key;
    }
    const previous=state.fight?.config.section===(preset?.section??'custom')?state.fight:null;
    playerEditor=editor('player',previous?.player??preset?.playerUnits??state.custom?.player??[defaults.customPlayer]);
    if ((previous?.enemies??preset?.enemies??[defaults.customEnemy]).length) {
      enemyEditor=editor('enemy',previous?.enemies??preset?.enemies??state.custom?.enemies??[defaults.customEnemy]);
    }
    if (preset) {
      const reset=personnelButton(document,holder,'Use printed starting values',()=>{
        if (locked) return;
        playerEditor.set(preset.playerUnits.map(editable));enemyEditor?.set(preset.enemies.map(editable));adjust();
      });reset.id=id+'-printed-values';
    }
    if (previous) for (const attack of [...(previous.config.opening??[]),...previous.config.rounds.flatMap(sequence=>sequence.attacks)]) {
      if (attack.chartInput&&choices[attack.chartInput]) choices[attack.chartInput].value=attack.chart;
    }
    adjust();
  }
  function readRows(instance,side) {
    if (!instance) return [];
    const raw=instance.snapshot().map(row=>({...row,routedFlag:row.routedFlag||'no'}));
    const units=validateOpponents(raw,fields,(field,row)=>unavailable(side,field,row));
    return units.map((row,index)=>{
      const value={...row,key:preset?(side==='player'?preset.playerUnits:preset.enemies)[index].key:side+'-'+index,
        name:row.displayName||'Unnamed formation'};
      // A new encounter starts from the entered survivors. Existing fights keep
      // their original engagement counts internally and are never restarted on render.
      value.initialCount=value.count;
      if (row.routedFlag==='yes')value.retired='routed';
      else delete value.retired;
      if (!preset) {
        delete value.moraleLoss;
        const policy=custom[side+'Morale'].value;
        if (policy!=='none')value.moraleLoss={per:Number(policy)};
      }
      if (!value.moraleLoss)value.casualtyRemainder=0;
      else if (value.moraleLoss.per===1)value.casualtyRemainder=0;
      return value;
    });
  }
  function read() {
    const player=readRows(playerEditor,'player'),enemies=readRows(enemyEditor,'enemy');
    if (preset) return prepareFormationEncounter(preset,{player,enemies,
      chartChoices:Object.fromEntries(Object.entries(choices).map(([key,input])=>[key,input.value]))});
    const values=Object.fromEntries(Object.entries(custom).map(([key,input])=>[key,input.value]));
    return {...customFormationEncounter(player,enemies,values),custom:{...values,player,enemies}};
  }
  function lock(value) {
    locked=value;for (const item of editors())item.lock(value);
    for (const input of holder.querySelectorAll('input,select,button'))input.disabled=value||input.dataset.unavailable==='true';
    adjust();
  }
  return {mount,read,lock};
}
