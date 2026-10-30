// Collect editable current personnel forces and explicit combat modifiers.
import { createOpponentEditor,validateOpponents } from '../../opponents.js';
import { personnelCheckbox, personnelSelect, personnelChartOptions, personnelButton } from './personnel-form.js';

const baseFields = [{key:'count',label:'Current Manpower',min:0},
  {key:'initialCount',label:'Manpower before earlier losses',min:0},
  {key:'ordnance',label:'Ordnance',min:0},{key:'melee',label:'Melee',min:0},
  {key:'stealth',label:'Stealth',min:0},{key:'morale',label:'Morale',min:0},
  {key:'chart',label:'Combat chart',options:personnelChartOptions}];
const extraFields = [{key:'charges',label:'Explosive charges remaining',min:0},
  {key:'chargeStrength',label:'Charge Attack Strength (if not specified)',min:0},
  {key:'chargeChart',label:'Charge chart (if not specified)',options:personnelChartOptions},
  {key:'lossCheckFrequency',label:'Casualty morale checks',options:[{value:'',label:'Choose when required'},
    {value:'once',label:'Once after the threshold is passed'}, {value:'each-round',label:'At the end of every round thereafter'}]},
  {key:'essentialFlag',label:'Mies is with this unit',options:[{value:'no',label:'No'},{value:'yes',label:'Yes'}]}];
const editable = unit => ({...unit, displayName:unit.name, initialCount:unit.initialCount??unit.count, chart:unit.chart??'', charges:unit.charges??0,
  chargeStrength:unit.chargeAttack?.strength??unit.chargeStrength??0,chargeChart:unit.chargeAttack?.chart??'',
  essentialFlag:unit.essential?'yes':'no',lossCheckFrequency:['once','each-round'].includes(unit.lossMorale?.frequency)?unit.lossMorale.frequency:''});

export function createPersonnelSetupPanel({document,holder,id,t,getRoster,getPlayerDefaults}) {
  let playerEditor,enemyEditor,preset,countSelect,initiative,modifiers={};
  const defaults=()=>getPlayerDefaults();
  function editor(suffix,title,values,fields,presets=[]) {
    const result=createOpponentEditor({document,id:id+'-'+suffix,t,fields,presets:presets.map(editable),
      isStatUnavailable:(key,row)=>key==='melee'&&row.melee===null,
      onSelect:()=>adjustFields()});
    result.element.querySelector('summary').textContent=title;
    result.set(values.map(editable));holder.appendChild(result.element);return result;
  }
  function adjustFields() {
    if (!playerEditor) return;
    const data=playerEditor.snapshot();
    for (const [index,row] of [...playerEditor.element.querySelectorAll('fieldset')].entries()) {
      const unit=data[index], charge=Boolean(preset?.rules.charge);
      for(const [key,visible]of [['chargeStrength',!charge&&Number(unit.charges)>0],['chargeChart',!charge&&Number(unit.charges)>0],
        ['lossCheckFrequency',Boolean(unit.lossMorale)],['initialCount',Boolean(unit.lossMorale)]])row.querySelector('[data-stat="'+key+'"]').closest('label').hidden=!visible;
      if(preset?.playerChart)row.querySelector('[data-stat="chart"]').disabled=true;
    }
    if(enemyEditor)for(const row of enemyEditor.element.querySelectorAll('fieldset'))row.querySelector('[data-stat="initialCount"]').closest('label').hidden=
      !(preset?.rules.escape?.enemyLosses!==undefined||preset?.rules.enemyMorale?.lossesOver!==undefined);
  }
  function mount(state,selected) {
    holder.replaceChildren();preset=selected;modifiers={};
    const maximum=preset?.rules.maxPlayerUnits;
    const players=preset?.playerUnits??state.playerForce??state.custom?.player??[defaults().customPlayer];
    const initial=maximum?players.slice(0,maximum):players;
    if(maximum===2){
      countSelect=personnelSelect(document,holder,'Friendly units engaged',[{value:1,label:'One unit'},
        {value:2,label:preset.rules.frontEssential?'Lead unit and support from 162':'Two units; first takes casualties'}],initial.length);
      countSelect.addEventListener('change',()=>{
        const values=playerEditor.snapshot();
        while(values.length<Number(countSelect.value))values.push(editable({...defaults().customPlayer,key:'player-'+values.length,essential:false}));
        playerEditor.set(values.slice(0,Number(countSelect.value)));adjustFields();
      });
    }
    playerEditor=editor('player','Your current force',initial,[...baseFields,...extraFields],defaults().friendlyProfiles);
    playerEditor.fixCount(Boolean(preset));
    playerEditor.element.addEventListener('input',adjustFields);
    let enemies=preset?.enemies??state.custom?.enemies??[defaults().customEnemy];
    if(preset?.rules.waves&&state.waveSurvivors)enemies=state.waveSurvivors;
    enemyEditor=null;
    if(!preset?.rules.fixedAttack){
      enemyEditor=editor('enemy',preset?.rules.waves?'Current surviving waves':'Enemy force',enemies,baseFields,
        getRoster().flatMap(entry=>entry.enemies));
      enemyEditor.fixCount(Boolean(preset));
      if(preset?.rules.waves&&state.waveSurvivors)personnelButton(document,holder,'Use printed starting waves',()=>{
        enemyEditor.set(preset.enemies.map(editable));
      });
    }
    if(!preset)initiative=personnelSelect(document,holder,'Initiative',[{value:'player',label:'You first'},
      {value:'enemy',label:'Enemy first'}],state.custom?.initiative??'player');
    const rules=preset?.rules??{};
    if(rules.scramblerOrdnance!==undefined||rules.scramblerStrength!==undefined)modifiers.useScrambler=
      personnelCheckbox(document,holder,'Use a power weapon scrambler');
    if(rules.waves)modifiers.suppliesDestroyed=personnelCheckbox(document,holder,'Supply depot was destroyed (enemy Ordnance −4)',Boolean(state.waveSupplyDestroyed));
    if(rules.openingEscapeChoice)modifiers.raidersEligible=personnelCheckbox(document,holder,'The defenders are Marco’s Raiders (eligible for opening withdrawal)');
    adjustFields();
  }
  function readRows(instance,side) {
    const values=instance.snapshot().map(row=>({...row,initialCount:row.initialCount===''?row.count:row.initialCount,...(side==='player'?{
      charges:row.charges||0,chargeStrength:row.chargeStrength||0,chargeChart:row.chargeChart||'',
      lossCheckFrequency:row.lossCheckFrequency||'',essentialFlag:row.essentialFlag||'no'}:{})}));
    return validateOpponents(values,side==='player'?[...baseFields,...extraFields]:baseFields,
      (key,row)=>key==='melee'&&row.melee===null).map((row,index)=>{
      const result={...row,key:side+'-'+index,name:row.displayName||'Unnamed force',chart:row.chart||null};
      if(side==='player'){
        result.profileKey=row.profileKey??row.key;
        delete result.retired;
        delete result.lossMoraleChecked;
        result.essential=row.essentialFlag==='yes';
        if(row.lossMorale)result.lossMorale={...row.lossMorale,frequency:row.lossCheckFrequency};
        if(row.chargeStrength&&row.chargeChart)result.chargeAttack={strength:row.chargeStrength,chart:row.chargeChart};
        else delete result.chargeAttack;
      }
      if(preset?.rules.waves&&side==='enemy')result.key=preset.enemies[index].key;
      return result;
    });
  }
  function read() {
    const player=readRows(playerEditor,'player');
    if(player.filter(unit=>unit.essential).length>1)throw new RangeError('Choose only one unit for Mies and his staff.');
    let enemies=enemyEditor?readRows(enemyEditor,'enemy'):[];
    if(preset)enemies=enemies.map((unit,index)=>({...unit,key:preset.enemies[index].key}));
    const config=preset?structuredClone(preset):{section:'custom',label:'Custom encounter',rules:{initiative:initiative.value},enemies};
    config.enemies=enemies;
    const setup=Object.fromEntries(Object.entries(modifiers).map(([key,input])=>[key,input.checked]));
    return {player,config,setup,custom:{player,enemies,initiative:initiative?.value??'player'}};
  }
  function lock(value) {
    playerEditor.lock(value);enemyEditor?.lock(value);
    for(const input of holder.querySelectorAll('input,select,button'))input.disabled=value||input.dataset.unavailable==='true';
    adjustFields();
  }
  return {mount,read,lock};
}
