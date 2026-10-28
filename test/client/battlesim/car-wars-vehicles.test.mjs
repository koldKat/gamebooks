import test from 'node:test';
import assert from 'node:assert/strict';
import {switchVehicle,rememberCombatCharacter,applyMaintenance} from '../../../public/js/battlesim/engines/car-wars/vehicles.js';
const profile = (key='a',extra={}) => ({ownedStateKey:key,kind:'vehicle',hp:50,maxHp:50,driverHp:3,driverArmour:6,
  powerPlant:{boxes:10,maxBoxes:10},weapons:[{name:'Machine-gun',boxes:3,maxBoxes:3,ammo:20}],...extra});
const game = () => ({character:{hp:3,armour:6,gunnery:2,driving:3},fight:null,
  inventory:[{name:'Shared item'}],equipment:{weapon:'Shared weapon'}});

test('switching owned cars keeps each car’s damage, components and ammunition',()=>{
  let state=switchVehicle(game(),profile());state.vehicle.hp=21;state.vehicle.weapons[0].ammo=4;
  state.vehicle.powerPlant.boxes=3;
  state=switchVehicle(state,profile('b'));state.vehicle.hp=37;
  state=switchVehicle(state,profile());
  assert.equal(state.vehicle.hp,21);assert.equal(state.vehicle.weapons[0].ammo,4);
  assert.equal(state.vehicle.powerPlant.boxes,3);assert.equal(state.vehicles.b.hp,37);
});

test('character wounds travel between cars while the fixed NPC driver retains separate wounds',()=>{
  let state=switchVehicle(game(),profile('npc',{fixedDriver:true,driverHp:2,driverArmour:1,driving:3,gunnery:1}));
  assert.equal(state.vehicle.driverHp,2);assert.equal(state.vehicle.gunnerHp,3);
  state.vehicle.gunnerHp=2;state.vehicle.gunnerArmour=3;
  state=rememberCombatCharacter(state,state.vehicle);
  assert.equal(state.character.hp,2);assert.equal(state.character.armour,3);
  state=switchVehicle(state,profile());assert.equal(state.vehicle.driverHp,2);
  state=switchVehicle(state,profile('npc',{fixedDriver:true}));
  assert.equal(state.vehicle.driverHp,2);assert.equal(state.vehicle.driverArmour,1);
  assert.equal(state.vehicle.gunnerHp,2);
});

test('pit resupply restores only armour and ammunition, never HP or damaged components',()=>{
  let state=switchVehicle(game(),profile());state.character.hp=2;state.character.armour=1;
  state.vehicle.hp=17;state.vehicle.driverHp=2;state.vehicle.driverArmour=1;
  state.vehicle.weapons[0].ammo=0;state.vehicle.weapons[0].boxes=1;
  const before=structuredClone(state);
  const next=applyMaintenance(state,{section:'supply',armour:6,ammunition:true});
  assert.equal(next.character.hp,2);assert.equal(next.vehicle.hp,17);
  assert.equal(next.vehicle.weapons[0].boxes,1);assert.equal(next.vehicle.weapons[0].ammo,20);
  assert.equal(next.vehicle.driverArmour,6);assert.deepEqual(state,before);
  assert.deepEqual(next.inventory,game().inventory);assert.deepEqual(next.equipment,game().equipment);
});

test('repair allowances respect original maxima and the total component budget, and cannot be claimed twice',()=>{
  let state=switchVehicle(game(),profile());state.vehicle.hp=47;state.vehicle.powerPlant.boxes=7;
  const rule={section:'pit',repair:{generalHp:10,componentBoxes:2}};
  assert.throws(()=>applyMaintenance(state,rule,{parts:[{component:'plant',amount:3}]}),/that much/);
  const next=applyMaintenance(state,rule,{hp:10,parts:[{component:'plant',amount:2}]});
  assert.equal(next.vehicle.hp,50);assert.equal(next.vehicle.powerPlant.boxes,9);
  assert.equal(next.character.hp,3);assert.equal(next.character.armour,6);
  assert.throws(()=>applyMaintenance(next,rule,{hp:1}),/already been used/);
  assert.throws(()=>applyMaintenance({...state,fight:{status:'fighting'}},rule),/between fights/);
});
