const copy=value=>structuredClone(value);
const integer=(value,min=0)=>{
  if(!Number.isSafeInteger(value)||value<min)throw new RangeError('Enter a valid whole number');
  return value;
};
const stopped=({fighting=false,driving=false}={})=>{
  if(fighting||driving)throw new RangeError('Stop driving and fighting before changing equipment');
};

export function installEquipment(source,item,choice={},context={}) {
  stopped(context);
  if(!item?.effect||!item.key)throw new RangeError('Choose simulator equipment');
  const unit=copy(source),index=integer(choice.weaponIndex??0),weapon=unit.weapons[index];
  unit.localEquipment??={};
  const count=unit.localEquipment[item.key]??0;
  if(item.maximum&&count>=item.maximum)throw new RangeError('This equipment limit has been reached');
  switch(item.effect) {
  case 'weapon': {
    if(!item.weapon)throw new RangeError('Missing weapon profile');
    const added=copy(item.weapon);added.maxBoxes??=added.boxes;
    if(item.tradeIn) {
      if(!weapon)throw new RangeError('Choose a weapon to replace');
      added.direction=weapon.direction;unit.weapons[index]=added;
    } else unit.weapons.push(added);
    break;
  }
  case 'voice-switch':
    if(!weapon||unit.voiceSwitch)throw new RangeError('Choose a weapon; only one voice switch may be installed');
    unit.voiceSwitch={status:'untested',weaponIndex:index};break;
  case 'targeting-computer': {
    const computer=unit.gadgets?.[integer(choice.computerIndex??0)];
    if(!computer?.computerFor)throw new RangeError('Trade in an existing targeting computer');
    computer.bonus=integer(item.bonus);computer.boxes=computer.maxBoxes??1;
    break;
  }
  case 'body-armour':
    unit[unit.fixedDriver?'gunnerArmour':'driverArmour']=integer(item.hp);break;
  case 'faulty-ammunition':
    if(!weapon)throw new RangeError('Choose the weapon using this ammunition');
    weapon.ammo=weapon.ammoCapacity??(/machine|vulcan|paint|oil/i.test(weapon.name)?20:10);
    weapon.ammoFault={die:integer(item.weaponSelfDamageOnDie,1),damage:1};break;
  case 'flinger':unit.flingerInstalled=true;break;
  default:throw new RangeError('Unsupported simulator equipment');
  }
  unit.localEquipment[item.key]=count+1;
  return unit;
}

export function repairAmmunitionFault(source,index,mechanic,roll,context={}) {
  stopped(context);integer(index);integer(mechanic);
  const unit=copy(source),weapon=unit.weapons[index];
  if(!weapon?.ammoFault)throw new RangeError('Choose a weapon with faulty ammunition');
  const value=integer(roll(6),1);if(value>6)throw new RangeError('Invalid die');
  const success=value<=mechanic;
  if(success){delete weapon.ammoFault;weapon.boxes=Math.min(weapon.maxBoxes??weapon.boxes,weapon.boxes+1);}
  return {unit,die:value,success};
}

export function applySectionMaintenance(source,rule,context={}) {
  stopped({...context,fighting:context.fighting||['fighting','awaitingDriver'].includes(source.fight?.status)});
  if(!rule)throw new RangeError('Choose section maintenance');
  const game=copy(source),unit=game.vehicle;
  if(rule.restoreAllPeople) {
    const maximum=integer(rule.personalMaximumHp,1);
    if(game.character?.hp>0)game.character.hp=Math.max(game.character.hp,maximum);
    if(unit) {
      for(const seat of ['driver','gunner'])if(unit[seat+'Hp']>0)unit[seat+'Hp']=Math.max(unit[seat+'Hp'],maximum);
      for(const passenger of unit.passengers??[])if(passenger.hp>0)passenger.hp=Math.max(passenger.hp,maximum);
    }
  }
  if(rule.restoreVehicle) {
    if(!unit)throw new RangeError('Choose a vehicle first');
    unit.hp=unit.maxHp;
    for(const part of [unit.powerPlant,...unit.weapons,...(unit.gadgets??[])])part.boxes=part.maxBoxes??part.boxes;
  }
  if(unit?.ownedStateKey){game.vehicles??={};game.vehicles[unit.ownedStateKey]=copy(unit);}
  return game;
}

export function applyAmmunitionEffect(source,rule,{advancedAmmo=false,weaponIndex}={}) {
  if(!rule?.section||!rule.changes?.length)throw new RangeError('Choose a section ammunition effect');
  const unit=copy(source);
  if(rule.once&&unit.appliedAmmunitionSections?.includes(rule.section))throw new RangeError('This section effect has already been recorded');
  for(const change of rule.changes) {
    if(change.onlyAdvanced&&!advancedAmmo)continue;
    let selected=unit.weapons.filter(weapon=>(!change.weaponName||weapon.name===change.weaponName)
      &&(!change.direction||weapon.direction===change.direction)&&(!change.delivery||weapon.delivery===change.delivery));
    if(change.chooseOne) {
      integer(weaponIndex);
      const chosen=unit.weapons[weaponIndex];
      if(!selected.includes(chosen))throw new RangeError('Choose one of the indicated weapons');
      selected=[chosen];
    }
    for(const weapon of selected) {
      if(change.remaining!=null)weapon.ammo=integer(change.remaining);
      else weapon.ammo=Math.max(0,integer(weapon.ammo)-integer(change.spent));
      if(change.requireReload)weapon.requiresReload=true;
      if(change.finite)weapon.explicitAmmoLimit=true;
    }
  }
  if(rule.once){unit.appliedAmmunitionSections??=[];unit.appliedAmmunitionSections.push(rule.section);}
  return unit;
}
