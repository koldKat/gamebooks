import test from 'node:test';
import assert from 'node:assert/strict';
import {startFight,fightRound,resumeFight,validateCombatant,combatantOut} from '../../../public/js/battlesim/engines/car-wars/scenario-combat.js';

const car={name:'Player',key:'player',kind:'vehicle',hp:17,defenseClass:10,driving:1,gunnery:1,handling:1,
  driverHp:3,powerPlant:{boxes:3},weapons:[{name:'Gun',direction:'front',bonus:0,damageDice:1,boxes:3}]};
const entry={section:'chase',label:'Chase',enemies:[{name:'Opponent',kind:'chase',controlRoll:5}],
  rules:{chase:{noCombat:true,mode:'success-lead',leadRequired:2,turnLimit:10,timeout:'timeout'},victory:'win',defeat:'lose'}};
const sequence=(...values)=>{let i=0;return()=>{assert.ok(i<values.length);return values[i++];};};

test('shared panel lifecycle drives a pure chase without inventing opponent combat statistics',()=>{
  let state=startFight(car,entry);
  state=fightRound(state,{weapons:[0]},sequence(1,6));
  assert.equal(state.status,'fighting');
  state=resumeFight({...state,status:'paused'},entry);
  assert.equal(state.heroRolls.successes,1);
  assert.equal(state.round,1);
  state=fightRound(state,{},sequence(1,6));
  assert.equal(state.status,'win');
  assert.equal(state.section,'win');
  assert.deepEqual(state.enemies,entry.enemies);
  assert.equal(state.hero.hp,17);
  assert.equal(state.hero.powerPlant.boxes,3);
  assert.equal(state.encounter,'Chase');
  assert.equal(state.rulesVersion,1);
  assert.throws(()=>resumeFight(state,entry),/unfinished chase/);
});

test('chase-only opponents need a Control target but no health, Gunnery or Defense Class',()=>{
  const enemy=validateCombatant(entry.enemies[0]);
  assert.equal(enemy.hp,undefined);
  assert.equal(enemy.defenseClass,undefined);
  assert.equal(combatantOut(enemy),false);
  assert.equal(combatantOut({...enemy,escaped:true}),true);
  assert.throws(()=>validateCombatant({...enemy,controlRoll:null}),/Control roll/);
  assert.throws(()=>resumeFight({...startFight(car,entry),status:'paused'},{...entry,section:'other'}),/matching/);
});
