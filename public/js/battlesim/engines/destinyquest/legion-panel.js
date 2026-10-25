// Source-specific controls opt into the shared DestinyQuest panel. Combat and
// saved-state changes still pass through the common session coordinator.
export function createLegionBookControls({id,tk,escape,number,select,check,textInput,button,el,data,apply,integer,getRoster}){
  const potionStats=['health','speed','brawn','magic','armour'];
  const flags=()=>{
    const preset=getRoster().find(entry=>entry.section===el('encounter')?.value),result=new Map();
    const visit=condition=>{
      if(condition.option)result.set(condition.option,false);
      for(const key of ['all','any'])for(const item of condition[key]||[])visit(item);
    };
    for(const variation of preset?.adapter?.variations||[])visit(variation.when);
    for(const option of Object.values(preset?.adapter?.itemOptions||{}))result.set(option,false);
    for(const [companion,choice]of Object.entries(preset?.adapter?.allyOptions||{}))result.set(choice.option,data().character.companions?.[companion]?.alive??choice.defaultAlive);
    return {preset,result};
  };
  function conditions(options=data().setup.encounterOptions||{}){
    const container=el('sourceConditions');if(!container)return;
    const {preset,result}=flags();
    let html=[...result].map(([key,fallback])=>check('condition-'+key,options[key]??fallback,tk('condition.'+key))).join('');
    if(preset?.adapter?.rodContext){
      const rods=options.rodPlacements||data().character.rodPlacements||{};
      html+=['north','east','west'].map(direction=>select('rod-'+direction,[['',tk('chooseRod')],...['enfeeblement','slowing','rending'].map(rod=>[rod,tk('rod.'+rod)])],rods[direction]||'',tk('passage.'+direction))).join('');
    }
    container.innerHTML=html;container.closest('details').hidden=!html;
  }
  return {
    setupFields:()=>`<details><summary>${escape(tk('storyConditions'))}</summary><div id="${id}-sourceConditions"></div></details>`,
    characterFields:()=>`${textInput('career')}${textInput('keywords')}${number('gold')}${number('defeats')}<details><summary>${escape(tk('potionEffects'))}</summary><p>${escape(tk('potionNote'))}</p>${potionStats.map(stat=>`<details><summary>${escape(tk('potion.'+stat))}</summary>${number('potion-'+stat+'-amount',0,0,1000000,tk('effectAmount'))}${number('potion-'+stat+'-uses',0,0,1000000,tk('remainingUses'))}${stat==='health'?'':number('potion-'+stat+'-duration',1,0,100,tk('effectRounds'))}</details>`).join('')}</details>`,
    readSetup(){
      const encounterOptions={...data().setup.encounterOptions};
      for(const [key]of flags().result)encounterOptions[key]=!!el('condition-'+key)?.checked;
      if(el('rod-north'))encounterOptions.rodPlacements=Object.fromEntries(['north','east','west'].map(direction=>[direction,el('rod-'+direction).value]));
      return {encounterOptions};
    },
    readCharacter(){return {potionModifiers:Object.fromEntries(potionStats.map(stat=>{
      const duration=stat==='health'?1:integer('potion-'+stat+'-duration',0,100);
      return [stat,{...data().character.potionModifiers?.[stat],amount:integer('potion-'+stat+'-amount'),uses:integer('potion-'+stat+'-uses'),duration:duration||null}];
    }))};},
    hydrate(d){
      conditions(d.setup.encounterOptions||{});
      for(const stat of potionStats){
        const modifier=d.character.potionModifiers?.[stat];el('potion-'+stat+'-amount').value=modifier?.amount??0;el('potion-'+stat+'-uses').value=modifier?.uses??0;
        if(stat!=='health')el('potion-'+stat+'-duration').value=modifier?.duration===null?0:modifier?.duration??1;
      }
    },
    combatFields(fight){
      const available=potionStats.filter(stat=>fight.character?.potionModifiers?.[stat]?.uses>0&&fight.character.potionModifiers[stat].amount>0);
      return available.length&&!fight.encounter?.disableBackpack?`<details><summary>${escape(tk('potionEffects'))}</summary>${select('potionEffect',available.map(stat=>[stat,`${tk('potion.'+stat)} (${fight.character.potionModifiers[stat].uses})`]),undefined,tk('effect'))}${button('potion-modifier',tk('usePotion'))}</details>`:'';
    },
    action(name){if(name!=='potion-modifier')return false;apply(name,{attribute:el('potionEffect').value});return true;},
    change(event){if(event.target.id===id+'-encounter')conditions();},
  };
}
