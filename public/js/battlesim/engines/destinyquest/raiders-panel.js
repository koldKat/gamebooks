import {createHeartBookControls} from './heart-panel.js';
import {getRaidersPetCatalog} from './raiders.js';
import {hasDestinyAbility,isDestinyOpponentActive,destinyStat} from './effects.js';

// UI choices use the loaded source profiles and the current private session.
export function createRaidersBookControls(context){
  const base=createHeartBookControls(context);
  const {id,tk,escape,title,number,select,check,textInput,button,el,data,apply,integer,getRoster,abilityCatalog}=context;
  const selected=()=>getRoster().find(entry=>entry.section===el('encounter')?.value);
  const pets=()=>getRaidersPetCatalog(getRoster());
  const living=fight=>fight.opponents.flatMap((opponent,target)=>isDestinyOpponentActive(fight,target)?[[target,opponent.name]]:[]);
  const unused=(fight,categories)=>Object.keys(fight.abilities).filter(name=>hasDestinyAbility(fight,name)&&categories.includes(abilityCatalog[name]?.category)&&!fight.used[name]);
  function petFields(value={}){
    const source=value.id==='custom'?value:pets().find(pet=>pet.id===value.id);
    const picker=select('petPreset',[['',tk('noPet')],...pets().map(pet=>[pet.id,pet.name]),['custom',tk('customPet')]],value.id||'',tk('pet'));
    if(!source)return picker;
    const preset=selected(),choices=(preset?.parts||data().setup.opponents||[{name:tk('opponent')}]).flatMap((part,index)=>preset?.adapter.rules.inactiveTargets?.includes(index)?[]:[[index,part.name]]);
    return picker+(value.id==='custom'?textInput('petName',source.name||'',tk('name'))+select('petType',[['pet',tk('pet')],['minion',tk('minion')]],source.type||'pet',tk('type'))+select('petDamageStat',[['brawn',tk('brawn')],['magic',tk('magic')]],source.damageStat||'brawn',tk('damageStat')):'')+
      number('petPower',value.power??source[source.damageStat]??0,0,1000000,tk(source.damageStat||'brawn'))+
      number('petArmour',value.armour??source.armour??0,0,1000000,tk('armour'))+
      number('petHealth',value.health??source.health??1,0,1000000,tk('health'))+
      number('petMaxHealth',value.maxHealth??source.maxHealth??source.health??1,1,1000000,tk('maxHealth'))+
      select('petInitialStance',[['passive',tk('passiveStance')],['aggressive',tk('aggressiveStance')]],value.stance||'passive',tk('stance'))+
      select('petInitialTarget',choices,value.target??choices[0]?.[0]??0,tk('petTarget'))+
      (value.carriedHealth!==undefined?`<p>${escape(tk('petCarriedHealth',{n:value.carriedHealth}))}</p>`:'');
  }
  function readPet(){
    const petId=el('petPreset').value;if(!petId)return null;
    const previous=data().setup.pet,custom=petId==='custom',source=custom?{name:el('petName').value.trim(),type:el('petType').value,damageStat:el('petDamageStat').value,abilities:[]}:pets().find(pet=>pet.id===petId);
    if(!source)throw new RangeError(tk('invalidPet'));
    return {...source,id:petId,power:integer('petPower'),armour:integer('petArmour'),health:integer('petHealth'),maxHealth:integer('petMaxHealth',1),
      stance:el('petInitialStance').value,target:integer('petInitialTarget'),...(previous?.id===petId&&previous.carriedHealth!==undefined?{carriedHealth:previous.carriedHealth}:{})};
  }
  function combatFields(fight){
    let html=base.combatFields(fight);
    if(fight.phase==='start'){
      if(fight.pet?.health>0&&!fight.encounter?.disablePet)html+=select('roundPetStance',[['passive',tk('passiveStance')],['aggressive',tk('aggressiveStance')]],fight.pet.stance,tk('stance'));
      for(const aid of fight.encounter?.roundAid||[])if((aid.used||0)<aid.maximum&&fight.round+1>(aid.untilRound||0))html+=check('roundAid-'+aid.option,false,aid.name);
    }
    const actions=selected()?.adapter.actions||{};
    const attributeChoices=[...new Set(Object.values(actions).flatMap(action=>action.chooseAttribute||[]))];
    if(attributeChoices.length)html+=select('actionAttribute',attributeChoices.map(value=>[value,tk(value)]),undefined,tk('attribute'));
    if(Object.values(actions).some(action=>['pursuit-reroll','spend-ability-avoid-end-test'].includes(action.kind)))html+=select('actionAbility',unused(fight,['sp']).map(name=>[name,title(name)]),undefined,tk('unusedSpeed'));
    if(fight.turn?.pendingAbility?.event?.kind==='pursuit')html+=check('pursuitDie0',true,tk('firstDie'))+check('pursuitDie1',true,tk('secondDie'));
    if(fight.turn?.pendingAbility?.event?.kind==='arcane-control')html+=number('arcaneAmount',1,1,Math.max(1,destinyStat(fight,'hero','magic')),tk('magicToSpend'));
    if(fight.turn?.pendingAbility?.type==='allocated-damage')html+=fight.turn.pendingAbility.dice.map((face,index)=>select('allocated-'+index,living(fight),fight.target,tk('assignDie',{n:index+1,face}))).join('')+button('resolve-allocated',tk('confirmChoice'));
    return html;
  }
  return {...base,
    setupFields:()=>base.setupFields()+`<details><summary>${escape(tk('pet'))}</summary><div id="${id}-petSetup"></div></details>`,
    readSetup:()=>({...base.readSetup(),pet:readPet()}),
    hydrate(d){base.hydrate(d);el('petSetup').innerHTML=petFields(d.setup.pet||{});},
    combatFields,
    idleFields:()=>base.idleFields()+(data().setup.pet?.carriedHealth!==undefined?button('rest-companion',tk('restCompanion')):''),
    handlesNext:fight=>fight.turn?.pendingAbility?.type==='allocated-damage',
    nextOptions(){const fight=data().fight,options={...base.nextOptions()};if(fight?.phase==='start'){if(el('roundPetStance'))options.petStance=el('roundPetStance').value;for(const aid of fight.encounter?.roundAid||[])options[aid.option]=!!el('roundAid-'+aid.option)?.checked;}return options;},
    actionOptions(){return {...base.actionOptions(),...(el('actionAbility')?{ability:el('actionAbility').value}:{}),...(el('actionAttribute')?{attribute:el('actionAttribute').value}:{}),...(el('arcaneAmount')?{amount:integer('arcaneAmount',1)}:{}),...(el('pursuitDie0')?{dice:[0,1].filter(index=>el('pursuitDie'+index).checked)}:{})};},
    abilityFields(fight,name){if(name==='pack-spirit')return select('packAbility',unused(fight,['sp','co']).map(value=>[value,title(value)]),undefined,tk('unusedAbility'));if(name==='minor-mirage')return select('mirageRecipient',[['hero',tk('hero')],...(fight.pet?.health>0&&fight.pet.type==='minion'?[['pet',fight.pet.name]]:[])],'hero',tk('recipient'));return '';},
    abilityOptions(fight,name){return {...(name==='pack-spirit'?{ability:el('packAbility').value}:{}),...(name==='minor-mirage'?{recipient:el('mirageRecipient').value}:{})};},
    statusFields(fight){const rows=[];if(fight.pet)rows.push(`${fight.pet.name}: ${fight.pet.health}/${fight.pet.maxHealth} · ${tk(fight.pet.stance==='passive'?'passiveStance':'aggressiveStance')}`);for(const [target,shield] of Object.entries(fight.encounter?.shieldsByTarget||{}))rows.push(`${fight.opponents[target].name} · ${tk('shieldHealth')}: ${shield.health}`);for(const [key,value] of Object.entries(fight.encounter?.resources||{}))rows.push(`${title(key)}: ${value}`);for(const target of fight.encounter?.regrowingTargets||[])if(fight.encounter.inactiveTargets?.includes(target))rows.push(`${fight.opponents[target].name} · ${tk('regrowing')}`);return rows.map(text=>`<div class="bsim-combatant">${escape(text)}</div>`).join('');},
    action(name,event){if(name==='rest-companion'){apply(name);return true;}if(name==='resolve-allocated'){apply('resolve-ability',{options:{targets:data().fight.turn.pendingAbility.dice.map((_,index)=>integer('allocated-'+index))}});return true;}return base.action(name,event);},
    change(event){base.change(event);if(event.target.id===id+'-petPreset'){const source=pets().find(pet=>pet.id===event.target.value);el('petSetup').innerHTML=petFields(source||{id:event.target.value,type:'pet',damageStat:'brawn',abilities:[],health:1,maxHealth:1});}else if(event.target.id===id+'-encounter')el('petSetup').innerHTML=petFields(data().setup.pet||{});},
  };
}
