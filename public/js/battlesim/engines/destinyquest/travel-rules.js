// Story gold and equipment are local to the book character. These operations
// never touch account currencies, XP, inventory tables or another player's run.
const slots=['mainHand','leftHand','head','chest','gloves','cloak','feet','talisman','necklace','ring1','ring2'];
const active=(inventory,catalog)=>Object.entries(catalog).filter(([name])=>inventory[name]>0).map(([,spec])=>spec);
const amount=value=>{if(!Number.isSafeInteger(value)||value<1||value>1000000)throw new RangeError('Choose a positive amount');return value;};

export function destinyCanEquipItem(inventory,catalog,item,slot){
  if(!slots.includes(slot)||!item||typeof item!=='object'||Array.isArray(item))return false;
  if(item.hand===undefined||item.hand===slot)return true;
  return ['mainHand','leftHand'].includes(slot)&&['mainHand','leftHand'].includes(item.hand)&&item.type==='sword'&&active(inventory,catalog).some(spec=>spec.swapSwordHands);
}

export function applyDestinyTravelAction(session,action,payload={},catalog){
  if(!catalog||typeof catalog!=='object')throw new RangeError('A book catalog is required');
  if(session.fight?.status==='active')throw new RangeError('Finish combat before a story action');
  const next=structuredClone(session);
  next.character??={};next.setup??={};
  const character=next.character,inventory=next.setup.abilities??character.abilities??{},equipment=structuredClone(next.setup.equipment??character.equipment??{});
  const specs=active(inventory,catalog);
  const gold=character.gold??0;
  if(!Number.isSafeInteger(gold)||gold<0)throw new RangeError('Invalid story gold balance');
  let awarded=0;
  if(action==='discover-gold'||action==='reward-gold'){
    awarded=amount(payload.amount);
    if(action==='discover-gold')awarded*=Math.max(1,...specs.map(spec=>spec.discoveredGoldMultiplier||1));
  }else if(action==='loot-instead'){
    if(next.fight?.status!=='win'||!next.fightId||character.convertedLootIds?.includes(next.fightId))throw new RangeError('Choose unclaimed loot from a won fight');
    awarded=Math.max(0,...specs.map(spec=>spec.goldInsteadOfLoot||0));
    if(!awarded)throw new RangeError('Loot conversion is unavailable');
    (character.convertedLootIds??=[]).push(next.fightId);
  }else if(action==='replace-equipment'){
    if(next.fight?.status==='active')throw new RangeError('Finish combat before replacing equipment');
    const {slot,item,keepAbility}=payload,old=equipment[slot];
    if(!destinyCanEquipItem(inventory,catalog,item,slot))throw new RangeError('Cannot equip this item in that slot');
    if(!Array.isArray(item.abilities||[])||(item.abilities||[]).some(name=>!Object.hasOwn(catalog,name)))throw new RangeError('Invalid item ability');
    const replacement=structuredClone(item);replacement.abilities=[...new Set(item.abilities||[])];
    if(keepAbility){
      if(!old?.abilities?.includes(keepAbility)||!specs.some(spec=>spec.retainEquipmentAbilitySlots?.includes(slot)))throw new RangeError('This old ability cannot be retained');
      replacement.abilities=[...new Set([...replacement.abilities,keepAbility])];
    }
    if(old)awarded=Math.max(0,...specs.map(spec=>spec.goldForReplacedEquipment||0));
    const counts={...inventory};
    for(const name of new Set(old?.abilities||[]))if(counts[name]){if(--counts[name]===0)delete counts[name];}
    for(const name of replacement.abilities)counts[name]=(counts[name]||0)+1;
    equipment[slot]=replacement;
    next.setup.equipment=structuredClone(equipment);character.equipment=equipment;
    next.setup.abilities={...counts};character.abilities=counts;
  }else throw new RangeError('Unknown story action');
  if(!Number.isSafeInteger(gold+awarded))throw new RangeError('Story gold balance is too large');
  character.gold=gold+awarded;
  if(next.fight?.character)next.fight.character=structuredClone(character);
  return next;
}
