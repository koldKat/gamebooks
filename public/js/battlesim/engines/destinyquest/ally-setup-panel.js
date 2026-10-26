// A second hero's simulator modifiers, not an application inventory manager.
export function createDestinyAllySetup({id,definition,tk,escape,title,number,select,check,textInput,el,integer,inventoryEditor,saveSetup}){
  const attributes=['speed','brawn','magic','armour','health','maxHealth'];
  const stats=definition.equipmentStats||['speed','brawn','magic','armour','health'];
  const slots=definition.equipmentSlots||['mainHand','leftHand','head','chest','feet','cloak','ring1','ring2'];
  const types=definition.equipmentTypes||['','axe','sword','dagger','spear','mace','hammer','bow','crossbow','shield','horn','totem','grapple','staff'];
  let owned,gearAbilities,gear={},slot=slots[0];
  const fields=()=>`<details><summary>${escape(tk('team'))}</summary>${check('teamEnabled')}<div id="${id}-allyFields" hidden>${textInput('allyName','',tk('secondHeroName'))}${attributes.map(key=>number('ally-'+key,definition.defaultHero[key],key==='health'||key==='maxHealth'?1:0,1000000,tk(key))).join('')}${textInput('allyCareer','',tk('career'))}<details><summary>${escape(tk('abilities'))}</summary><div id="${id}-allyOwned"></div></details><details><summary>${escape(tk('equipment'))}</summary><p>${escape(tk('loadoutNote'))}</p>${select('allyGearSlot',slots.map(key=>[key,tk(key)]),slot,tk('slot'))}${check('allyGearPresent',false,tk('gearPresent'))}${select('allyGearType',types.map(key=>[key,key?title(key):tk('none')]),'',tk('type'))}${stats.map(key=>number('allyGear-'+key,0,0,1000000,tk(key))).join('')}<div id="${id}-allyGearAbilities"></div></details></div></details>`;
  function storeGear(){
    if(!el('allyGearPresent').checked){delete gear[slot];return;}
    gear[slot]={...gear[slot],type:el('allyGearType').value,abilities:Object.keys(gearAbilities.read()),...Object.fromEntries(stats.map(key=>[key,integer('allyGear-'+key)]))};
  }
  function loadGear(){
    const item=gear[slot];el('allyGearPresent').checked=!!item;
    const picker=el('allyGearType');
    if(item?.type&&![...picker.options].some(option=>option.value===item.type)){
      const option=picker.ownerDocument.createElement('option');option.value=item.type;option.textContent=title(item.type);picker.appendChild(option);
    }
    picker.value=item?.type||'';for(const key of stats)el('allyGear-'+key).value=item?.[key]??0;
    gearAbilities.set(Object.fromEntries((item?.abilities||[]).map(name=>[name,1])));
  }
  function init(){owned=inventoryEditor(el('allyOwned'),true);gearAbilities=inventoryEditor(el('allyGearAbilities'),false);}
  function readSetup(){
    storeGear();
    return {teamEnabled:el('teamEnabled').checked,ally:{hero:{name:el('allyName').value.trim()||tk('secondHero'),...Object.fromEntries(attributes.map(key=>[key,integer('ally-'+key,key==='health'||key==='maxHealth'?1:0)]))},abilities:owned.read(),equipment:structuredClone(gear),character:{career:el('allyCareer').value.trim().toLowerCase()}}};
  }
  function hydrate(setup){
    const ally=setup.ally||{};el('teamEnabled').checked=!!setup.teamEnabled;el('allyFields').hidden=!setup.teamEnabled;
    el('allyName').value=ally.hero?.name||'';el('allyCareer').value=ally.character?.career||'';
    for(const key of attributes)el('ally-'+key).value=ally.hero?.[key]??definition.defaultHero[key];
    owned.set(ally.abilities||{});gear=structuredClone(ally.equipment||{});slot=slots[0];el('allyGearSlot').value=slot;loadGear();
  }
  function change(event){
    if(event.target.id===id+'-teamEnabled')el('allyFields').hidden=!event.target.checked;
    if(event.target.id!==id+'-allyGearSlot')return false;
    storeGear();slot=event.target.value;loadGear();saveSetup();return true;
  }
  return {fields,init,readSetup,hydrate,change};
}
