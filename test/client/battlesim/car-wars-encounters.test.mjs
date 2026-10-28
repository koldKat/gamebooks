import test from 'node:test';
import assert from 'node:assert/strict';
import {carrySurvivors} from '../../../public/js/battlesim/engines/car-wars/encounters.js';

const gun=(patch={})=>({name:'MG',direction:'front',boxes:3,ammo:20,...patch});
const car=(key,hp,patch={})=>({key,name:key,kind:'vehicle',hp,maxHp:18,driving:null,gunnery:null,
  driverHp:3,powerPlant:{boxes:3,maxBoxes:3},weapons:[gun()],...patch});
const entry={rules:{survivorsFrom:{section:'parked',count:4,order:'highest-hp',preserveComponents:true}},
  enemies:Array.from({length:4},(_,i)=>car('number-'+i,18,{driving:i,gunnery:3-i,
    weapons:i===3?[gun({boxes:2}),gun()]:[gun()]}))};

test('later encounter selects the most intact survivors without healing their vehicle or weapons',()=>{
  const previous={baseSection:'parked',status:'branch',enemies:[car('A',8),car('B',17),car('C',12),
    car('D',15,{powerPlant:{boxes:2,maxBoxes:3}}),car('E',10,{weapons:[gun({boxes:1,ammo:7})]}),
    car('rammed',18,{out:true}),car('disabled',18,{powerPlant:{boxes:0,maxBoxes:3}})]};
  const original=structuredClone(previous);
  const result=carrySurvivors(entry,previous);
  assert.deepEqual(result.enemies.map(unit=>unit.carriedFromKey),['B','D','C','E']);
  assert.deepEqual(result.enemies.map(unit=>unit.hp),[17,15,12,10]);
  assert.equal(result.enemies[1].powerPlant.boxes,2);
  assert.deepEqual(result.enemies.map(unit=>unit.driving),[0,1,2,3]);
  assert.equal(result.enemies[3].weapons[0].boxes,1);
  assert.equal(result.enemies[3].weapons[0].ammo,7);
  assert.equal(result.enemies[3].weapons[1].boxes,3);
  assert.equal(result.enemies[3].weapons[0].linkedGroup,undefined);
  assert.equal(result.enemies[0].unattended,false);
  assert.deepEqual(previous,original);
  assert.equal(entry.enemies[0].hp,18);
});

test('an unfinished, unrelated or depleted previous encounter cannot silently become fresh opponents',()=>{
  const previous={baseSection:'parked',status:'fighting',enemies:[car('A',10)]};
  assert.throws(()=>carrySurvivors(entry,previous),/Finish/);
  assert.throws(()=>carrySurvivors(entry,{...previous,status:'branch'}),/enough surviving/);
  assert.throws(()=>carrySurvivors(entry,{...previous,baseSection:'other',status:'branch'}),/Finish/);
  assert.deepEqual(carrySurvivors(entry,null),entry,'Without a saved earlier fight, the printed editable setup remains available');
});
