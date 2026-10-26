import {HEART_ABILITIES} from './heart-abilities.js';
import {destinyNeverUsedAbilities} from './abilities.js';

// Choices are read from the loaded source roster. No encounter identities,
// opponent statistics or universal inventory live in this panel.
export function createHeartBookControls({id,tk,escape,title,number,select,check,textInput,button,el,data,apply,integer,getRoster,abilityCatalog=HEART_ABILITIES}){
  const stats=['health','speed','brawn','magic','armour'];
  const selected=()=>getRoster().find(entry=>entry.section===el('encounter')?.value);
  const label=key=>title(key.replace(/([a-z])([A-Z])/g,'$1 $2'));
  const checks=(key,choices,values=[],heading=label(key))=>`<fieldset class="bsim-side" id="${id}-${key}"><legend>${escape(heading)}</legend>${choices.map(([value,name])=>`<label class="bsim-checkbox"><input type="checkbox" value="${escape(value)}"${values.includes(value)?' checked':''}>${escape(name)}</label>`).join('')}</fieldset>`;
  const checked=key=>[...el(key).querySelectorAll('input:checked')].map(input=>input.value);
  function flags(preset){
    const names=new Set(Object.values(preset?.adapter.itemOptions||{}));
    const visit=condition=>{
      if(condition.option&&typeof condition.equals==='boolean')names.add(condition.option);
      for(const key of ['all','any'])for(const child of condition[key]||[])visit(child);
    };
    for(const variation of preset?.adapter.variations||[])visit(variation.when);
    return names;
  }
  function conditions(options=data().setup.encounterOptions||{}){
    const container=el('heartConditions');if(!container)return;
    const preset=selected(),adapter=preset?.adapter;
    let html=[...flags(preset)].map(key=>check('condition-'+key,!!options[key],tk('condition.'+key))).join('');
    if(adapter?.attackAttributeOption)html+=select('attackAttribute',['brawn','magic'].map(key=>[key,tk(key)]),options[adapter.attackAttributeOption]||'brawn',tk('damageStat'));
    for(const rule of Object.values(adapter?.resourceOptions||{}))html+=number('resource-'+rule.option,options[rule.option]??data().character.sourceCounters?.[rule.fromCounter]??rule.default??0,0,rule.maximum??1000000,label(rule.option));
    for(const rule of [...adapter?.healthBonusesFromOptions||[],...adapter?.statBonusesFromOptions||[]])html+=number('source-'+rule.option,options[rule.option]??data().character.sourceCounters?.[rule.fromCounter]??0,0,1000000,label(rule.option));
    const resume=adapter?.challengeResume;
    if(resume)html+=number('priorChallengeRounds',options[resume.roundsOption]??0,0,preset.adapter.rules.lossAfterTotalRounds-1,tk('priorChallengeRounds'))+
      checks('priorChallengeAbilities',Object.keys(data().setup.abilities||{}).filter(name=>data().setup.abilities[name]>0&&!abilityCatalog[name]?.quotaStatus).map(name=>[name,title(name)]),options[resume.usedOption]||[],tk('priorChallengeAbilities'));
    const choice=adapter?.abilitySelection;
    if(choice)html+=checks('sourceAbilities',Object.entries(choice.definitions).map(([name,spec])=>[name,spec.label||title(name)]),options[choice.option]||[],tk('chooseEncounterAbilities',{n:choice.count}));
    container.innerHTML=html;container.closest('details').hidden=!html;
  }
  function readSetup(){
    const preset=selected(),adapter=preset?.adapter,options={...data().setup.encounterOptions};
    for(const key of flags(preset))options[key]=el('condition-'+key).checked;
    if(adapter?.attackAttributeOption)options[adapter.attackAttributeOption]=el('attackAttribute').value;
    for(const rule of Object.values(adapter?.resourceOptions||{}))options[rule.option]=integer('resource-'+rule.option,0,rule.maximum??1000000);
    for(const rule of [...adapter?.healthBonusesFromOptions||[],...adapter?.statBonusesFromOptions||[]])options[rule.option]=integer('source-'+rule.option);
    if(adapter?.challengeResume){options[adapter.challengeResume.roundsOption]=integer('priorChallengeRounds');options[adapter.challengeResume.usedOption]=checked('priorChallengeAbilities');}
    if(adapter?.abilitySelection)options[adapter.abilitySelection.option]=checked('sourceAbilities');
    return {encounterOptions:options};
  }
  function characterFields(){
    return `${textInput('career')}${textInput('keywords')}${number('gold')}${number('defeats')}<details><summary>${escape(tk('potionEffects'))}</summary><p>${escape(tk('potionNote'))}</p>${stats.map(stat=>`<details><summary>${escape(tk('potion.'+stat))}</summary>${number('potion-'+stat+'-amount',0,0,1000000,tk('effectAmount'))}${number('potion-'+stat+'-uses',0,0,1000000,tk('remainingUses'))}${stat==='health'?'':number('potion-'+stat+'-duration',1,0,100,tk('effectRounds'))}</details>`).join('')}</details>`;
  }
  function readCharacter(){return {potionModifiers:{...data().character.potionModifiers,...Object.fromEntries(stats.map(stat=>[stat,{amount:integer('potion-'+stat+'-amount'),uses:integer('potion-'+stat+'-uses'),duration:stat==='health'?1:integer('potion-'+stat+'-duration',0,100)||null}]))}};}
  function hydrate(d){
    conditions(d.setup.encounterOptions||{});
    for(const stat of stats){const potion=d.character.potionModifiers?.[stat];el('potion-'+stat+'-amount').value=potion?.amount??0;el('potion-'+stat+'-uses').value=potion?.uses??0;if(stat!=='health')el('potion-'+stat+'-duration').value=potion?.duration===null?0:potion?.duration??1;}
  }
  function combatFields(fight){
    let html='';
    if(fight.phase==='start'&&fight.encounter?.gridHazard){
      const grid=fight.encounter.gridHazard,positions=[];
      for(let y=1;y<=grid.rows;y++)for(let x=1;x<=grid.columns;x++)if(!grid.occupied.some(cell=>cell[0]===x&&cell[1]===y))positions.push([x+','+y,`${x}, ${y}`]);
      html+=select('gridPosition',positions,grid.hero?.join(',')||positions[0]?.[0],tk('gridPosition'));
    }
    const potions=stats.filter(stat=>fight.character?.potionModifiers?.[stat]?.uses>0&&fight.character.potionModifiers[stat].amount>0);
    if(potions.length&&!fight.encounter?.disableBackpack&&['speed','speed-rolled','damage','damage-rolled','ability-rolled','end'].includes(fight.phase))html+=select('potionEffect',potions.map(stat=>[stat,`${tk('potion.'+stat)} (${fight.character.potionModifiers[stat].uses})`]),undefined,tk('effect'))+button('potion-modifier',tk('usePotion'));
    const actions=getRoster().find(entry=>entry.section===fight.encounter?.sourceSection)?.adapter.actions;
    if(Object.values(actions||{}).some(action=>action.kind==='sacrifice-unused-for-stat'))html+=select('sourceSacrifice',destinyNeverUsedAbilities(fight).map(name=>[name,title(name)]),undefined,tk('unusedAbility'));
    return html;
  }
  function idleFields(){
    const d=data(),abilities=d.setup.abilities||{},owned=Object.keys(abilities).filter(name=>abilities[name]>0),permanent=owned.filter(name=>abilityCatalog[name]?.permanentBonus||abilityCatalog[name]?.permanentHealthBonus),counters=owned.filter(name=>abilityCatalog[name]?.scoreFromStory);
    return `<details><summary>${escape(tk('storyActions'))}</summary>${number('storyGold',1,1,1000000,tk('gold'))}<div class="bsim-btn-row">${button('discover-gold',tk('discoverGold'))}${button('reward-gold',tk('rewardGold'))}</div>${owned.some(name=>abilityCatalog[name]?.goldInsteadOfLoot)&&d.fight?.status==='win'?button('loot-instead',tk('lootInstead')):''}${permanent.map(name=>`<details><summary>${escape(title(name))}</summary>${abilityCatalog[name].permanentBonus?.countKey?number('permanentCount-'+name,d.character.permanentAbilityBonuses?.[name]??0,0,100,tk('spellbooks')):''}${check('included-'+name,false,tk('bonusAlreadyIncluded'))}${button('permanent-'+name,tk('applyPermanentBonus'))}</details>`).join('')}${counters.map(name=>`${number('sourceCount-'+name,d.character.sourceCounters?.[abilityCatalog[name].scoreFromStory.key]??0,0,abilityCatalog[name].scoreFromStory.maximum,tk('sourceCounter'))}${button('counter-'+name,tk('saveSourceCounter'))}`).join('')}</details>`;
  }
  function action(name){
    if(name==='potion-modifier'){apply(name,{attribute:el('potionEffect').value});return true;}
    if(['discover-gold','reward-gold','loot-instead'].includes(name)){apply('story-action',{name,options:name==='loot-instead'?{}:{amount:integer('storyGold',1)}});return true;}
    if(name.startsWith('permanent-')){const ability=name.slice(10),bonus=abilityCatalog[ability]?.permanentBonus;apply('story-action',{name:'permanent-bonus',options:{ability,bonusAlreadyIncluded:el('included-'+ability).checked,...(bonus?.countKey?{[bonus.countKey]:integer('permanentCount-'+ability,0,100)}:{})}});return true;}
    if(name.startsWith('counter-')){const ability=name.slice(8);apply('story-action',{name:'source-counter',options:{ability,count:integer('sourceCount-'+ability)}});return true;}
    return false;
  }
  return {setupFields:()=>`<details><summary>${escape(tk('storyConditions'))}</summary><div id="${id}-heartConditions"></div></details>`,characterFields,readSetup,readCharacter,hydrate,combatFields,idleFields,action,
    nextOptions:()=>el('gridPosition')?{gridPosition:el('gridPosition').value.split(',').map(Number)}:{},
    actionOptions:()=>({deferDamage:true,...(el('sourceSacrifice')?{ability:el('sourceSacrifice').value}:{})}),
    change(event){if(event.target.id===id+'-encounter')conditions();},
  };
}
