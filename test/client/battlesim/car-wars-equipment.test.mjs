import test from 'node:test';
import assert from 'node:assert/strict';
import {installEquipment,repairAmmunitionFault,applySectionMaintenance,applyAmmunitionEffect} from '../../../public/js/battlesim/engines/car-wars/equipment.js';
import {assignPassengerGunner} from '../../../public/js/battlesim/engines/car-wars/crew.js';
import {startFight,fightRound,weaponAvailable} from '../../../public/js/battlesim/engines/car-wars/multi-combat.js';
const car=()=>({name:'Car',key:'car',kind:'vehicle',hp:20,maxHp:30,defenseClass:20,driving:1,gunnery:1,handling:1,
  driverHp:2,driverArmour:1,gunnerHp:0,ownedStateKey:'car',powerPlant:{boxes:2,maxBoxes:3},
  gadgets:[{computerFor:'either',boxes:0,maxBoxes:1,bonus:1}],
  weapons:[{name:'Machine gun',direction:'front',boxes:2,maxBoxes:3,damageDice:1,bonus:0,ammo:7}]});

test('equipment comes from the supplied profile, has per-vehicle limits, and requires a stopped vehicle',()=>{
  const item={key:'vertical',effect:'weapon',maximum:2,weapon:{name:'Vertical rocket',direction:'up',boxes:3,damageDice:3,bonus:-1,oneShot:true,ammo:1}};
  const original=car();let unit=installEquipment(original,item);unit=installEquipment(unit,item);
  assert.equal(unit.weapons.length,3);assert.equal(unit.weapons[1].direction,'up');
  assert.equal(original.weapons.length,1);
  assert.throws(()=>installEquipment(unit,item),/limit/);
  assert.throws(()=>installEquipment(original,item,{}, {driving:true}),/Stop/);
  assert.throws(()=>installEquipment(original,item,{}, {fighting:true}),/Stop/);
  const switched=installEquipment(original,{key:'switch',effect:'voice-switch',maximum:1},{weaponIndex:0});
  assert.deepEqual(switched.voiceSwitch,{status:'untested',weaponIndex:0});
  assert.throws(()=>installEquipment(switched,{key:'switch',effect:'voice-switch'}),/only one/);
});

test('computer trade-in and body armour affect only their chosen simulator components',()=>{
  const original=car();
  const upgraded=installEquipment(original,{key:'computer',effect:'targeting-computer',bonus:2});
  assert.equal(upgraded.gadgets[0].bonus,2);assert.equal(upgraded.gadgets[0].boxes,1);
  assert.equal(upgraded.hp,20);assert.equal(upgraded.weapons[0].boxes,2);
  const armoured=installEquipment(upgraded,{key:'armour',effect:'body-armour',hp:2});
  assert.equal(armoured.driverArmour,2);assert.equal(armoured.driverHp,2);
  assert.equal(original.gadgets[0].bonus,1);
});

test('faulty ammunition can damage its weapon on every firing attempt and a stopped Mechanic repair clears the defect',()=>{
  const unit=installEquipment(car(),{key:'ammo',effect:'faulty-ammunition',weaponSelfDamageOnDie:6});
  const foe={...car(),key:'foe',canAttack:false};
  let state=startFight(unit,{section:'custom',enemies:[foe],rules:{scenarioCombat:true,kind:'vehicle',playerFacing:['front'],enemyFacing:['front']}},{advancedAmmo:true});
  state=fightRound(state,{target:0,weapons:[0]},()=>6);
  assert.equal(state.hero.weapons[0].boxes,1);assert.equal(state.enemies[0].hp,20);
  state=fightRound(state,{target:0,weapons:[0]},()=>6);
  assert.equal(state.hero.weapons[0].boxes,0);assert.equal(state.hero.weapons[0].ammo,18);
  assert.equal(unit.weapons[0].boxes,2);
  const failed=repairAmmunitionFault(state.hero,0,1,()=>2);
  assert.equal(failed.success,false);assert.ok(failed.unit.weapons[0].ammoFault);
  assert.throws(()=>repairAmmunitionFault(state.hero,0,1,()=>1,{fighting:true}),/Stop/);
  const repaired=repairAmmunitionFault(state.hero,0,1,()=>1);
  assert.equal(repaired.success,true);assert.equal(repaired.unit.weapons[0].ammoFault,undefined);
  assert.equal(repaired.unit.weapons[0].boxes,1);
});

test('hospital and garage preserve unrelated data, ammunition and armour and never resurrect a dead passenger',()=>{
  const source={character:{hp:1,armour:1},vehicle:{...car(),passengers:[{name:'Hurt',hp:2,armour:0},{name:'Dead',hp:0,armour:0}]},
    inventory:['shared item'],equipment:{slot:'shared'},fight:{status:'paused'}};
  const healed=applySectionMaintenance(source,{restoreAllPeople:true,personalMaximumHp:3});
  assert.equal(healed.character.hp,3);assert.equal(healed.vehicle.driverHp,3);
  assert.equal(healed.vehicle.gunnerHp,0);assert.equal(healed.vehicle.passengers[0].hp,3);
  assert.equal(healed.vehicle.passengers[1].hp,0);
  const repaired=applySectionMaintenance(healed,{restoreVehicle:true});
  assert.equal(repaired.vehicle.hp,30);assert.equal(repaired.vehicle.powerPlant.boxes,3);
  assert.equal(repaired.vehicle.gadgets[0].boxes,1);assert.equal(repaired.vehicle.weapons[0].boxes,3);
  assert.equal(repaired.vehicle.weapons[0].ammo,7);assert.equal(repaired.vehicle.driverArmour,1);
  assert.deepEqual(repaired.inventory,source.inventory);assert.deepEqual(repaired.equipment,source.equipment);
  assert.equal(source.vehicle.hp,20);
  assert.throws(()=>applySectionMaintenance({...source,fight:{status:'fighting'}},{restoreVehicle:true}),/Stop/);
});

test('moving a passenger into the gunner seat retains their wounds and avoids duplicate passenger critical targets',()=>{
  const original={...car(),passengers:[{name:'Passenger',hp:2,armour:1}]};
  const unit=assignPassengerGunner(original,{name:'Passenger',hp:3,armour:3,gunnery:2});
  assert.equal(unit.gunnerHp,2);assert.equal(unit.gunnerArmour,1);assert.equal(unit.gunnerGunnery,2);
  assert.equal(unit.passengers.length,0);assert.equal(unit.gunnerDriving,null);
  const empty=assignPassengerGunner(unit,null);
  assert.equal(empty.gunnerHp,0);assert.equal(empty.passengers[0].hp,2);
  assert.equal(original.passengers.length,1);
  assert.throws(()=>assignPassengerGunner(original,{name:'Unknown',hp:3,gunnery:null}),/not print/);
});

test('section ammunition effects spend only the stated shots and cannot be accidentally applied twice',()=>{
  const unit=car();unit.weapons.push({...unit.weapons[0],ammo:8});
  const rule={section:'opening',once:true,changes:[{weaponName:'Machine gun',direction:'front',spent:1,onlyAdvanced:true}]};
  const recorded=applyAmmunitionEffect(unit,rule,{advancedAmmo:true});
  assert.deepEqual(recorded.weapons.map(weapon=>weapon.ammo),[6,7]);
  assert.throws(()=>applyAmmunitionEffect(recorded,rule,{advancedAmmo:true}),/already/);
  assert.deepEqual(applyAmmunitionEffect(unit,rule).weapons.map(weapon=>weapon.ammo),[7,8]);
  const empty={section:'gunner',changes:[{weaponName:'Machine gun',remaining:0,chooseOne:true}]};
  assert.deepEqual(applyAmmunitionEffect(unit,empty,{weaponIndex:1}).weapons.map(weapon=>weapon.ammo),[7,0]);
  assert.deepEqual(unit.weapons.map(weapon=>weapon.ammo),[7,8]);
});

test('explicit remaining shots and a required reload override unlimited basic ammunition',()=>{
  const unit=car(),foe={...car(),key:'foe',canAttack:false};
  const limited=applyAmmunitionEffect(unit,{section:'left',changes:[{weaponName:'Machine gun',remaining:2,finite:true}]});
  const source={section:'custom',enemies:[foe],rules:{scenarioCombat:true,kind:'vehicle',playerFacing:['front'],enemyFacing:['front']}};
  let state=startFight(limited,source);
  state=fightRound(state,{target:0,weapons:[0]},()=>2);
  state=fightRound(state,{target:0,weapons:[0]},()=>2);
  assert.equal(state.hero.weapons[0].ammo,0);
  assert.equal(weaponAvailable(state,state.hero,state.hero.weapons[0]),false);
  const empty=applyAmmunitionEffect(unit,{section:'empty',changes:[{weaponName:'Machine gun',remaining:0,chooseOne:true,requireReload:true}]},{weaponIndex:0});
  state=startFight(empty,source);
  assert.equal(weaponAvailable(state,state.hero,state.hero.weapons[0]),false);
  state.hero.weapons[0].ammo=20;
  assert.equal(weaponAvailable(state,state.hero,state.hero.weapons[0]),true);
});
