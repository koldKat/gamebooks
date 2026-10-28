import test from 'node:test';
import assert from 'node:assert/strict';
import {startFight, fightRound, combatantOut, tactic, resumeFight, combatTargets} from '../../../public/js/battlesim/engines/car-wars/multi-combat.js';
import {firingCrew, targetingBonus, assignWeapons, testVoiceSwitch, disconnectVoiceSwitch} from '../../../public/js/battlesim/engines/car-wars/crew.js';

const weapon = patch => ({name:'Gun',direction:'front',bonus:0,damageDice:1,boxes:3,...patch});
const car = patch => ({name:'Vehicle',key:'unit',kind:'vehicle',hp:100,defenseClass:30,handling:1,driving:1,gunnery:1,
  driverHp:3,powerPlant:{boxes:12},weapons:[weapon()],...patch});
const person = patch => ({name:'Person',key:'person',kind:'person',hp:3,defenseClass:9,gunnery:1,armour:3,
  weapon:{name:'Pistol',bonus:0,flatDamage:1},...patch});
const entry = (enemies,rules={}) => ({section:'test',enemies,rules:{scenarioCombat:true,kind:'vehicle',
  playerFacing:['front','rear','turret','up'],enemyFacing:['front','rear','turret'],victory:'won',defeat:'lost',...rules}});
const sequence = (...values) => {let i=0;return()=>{assert.ok(i<values.length,'Unexpected die '+i);return values[i++];};};

test('evasive driving temporarily protects the hero and penalizes only their own shots', () => {
  const hero=car({key:'hero',defenseClass:9,gunnery:1});
  const foe=car({key:'foe',defenseClass:9,gunnery:1});
  let state=startFight(hero,entry([foe],{evasive:{defenseBonus:2,attackModifier:-2,toggleable:true}}));
  state=fightRound(state,{target:0,weapons:[0],evasive:true},sequence(5,5,5,5));
  assert.equal(state.hero.hp,100);
  assert.equal(state.enemies[0].hp,100);
  assert.equal(state.hero.defenseClass,9);
  state=fightRound(state,{target:0,weapons:[0],evasive:false},sequence(5,5,2,5,5,2));
  assert.equal(state.hero.hp,98);
  assert.equal(state.enemies[0].hp,98);
  assert.equal(state.hero.defenseClass,9);
  assert.equal(state.hero.gunnery,1);
  assert.throws(()=>fightRound(startFight(hero,entry([foe])),{evasive:true},sequence()),/not offered/);
});

test('turning around preserves wounds, ammunition and the original support clock', () => {
  const state=startFight(car({hp:73}),entry([car({key:'foe',hp:51})],{
    playerFacing:['rear','turret'],fireSupport:{ordinaryTurns:10,lawMaximumShots:2},
    tactics:{turnAround:{once:true,playerFacing:['front','turret'],allPursuersCatchUp:true,supportUntilBattleEnd:true}},
  }));
  state.round=6; state.enemies[0].escaped=true; state.enemies[0].weapons[0].ammo=3;
  const next=tactic(state,'turnAround');
  assert.equal(next.status,'fighting');
  assert.equal(next.round,6);
  assert.equal(next.hero.hp,73);
  assert.equal(next.enemies[0].hp,51);
  assert.equal(next.enemies[0].weapons[0].ammo,3);
  assert.equal(next.enemies[0].escaped,undefined);
  assert.equal(next.rules.fireSupport.untilBattleEnd,true);
  assert.equal(next.rules.fireSupport.lawMaximumShots,2);
  assert.deepEqual(next.rules.playerFacing,['front','turret']);
  assert.equal(state.enemies[0].escaped,true);
  assert.throws(()=>tactic(next,'turnAround'),/already been used/);
  state.round=10;
  assert.equal(tactic(state,'turnAround').rules.fireSupport.untilBattleEnd,undefined);
});

test('an explicit plant-loss ending overrides the general immobilized firing allowance', () => {
  const hero=car({powerPlant:{boxes:0}});
  const ordinary=startFight(hero,entry([car()],{ownPlantAllowsNonLaserFire:true}));
  assert.equal(ordinary.status,'fighting');
  const ended=startFight(hero,entry([car()],{ownPlantAllowsNonLaserFire:true,heroPlantLossEnds:true}));
  assert.equal(ended.status,'loss');
  assert.equal(ended.section,'lost');
  assert.equal(ended.hero.allowImmobilizedFire,false);
});

const support = () => ({units:Array.from({length:4},(_,i)=>person({key:'support-'+i,gunnery:1,armour:0})),
  ordinaryTurns:10,lawTurns:[2,7],lawMaximumShots:2});

test('support gunners stop at their original ten turns and the LAW fires only on its two turns', () => {
  let state=startFight(car(),entry([car({canAttack:false})],{fireSupport:support()}));
  for(let turn=1;turn<=11;turn++)state=fightRound(state,{hold:true},()=>1);
  assert.deepEqual(state.supporters.map(unit=>unit.shotsFired),[10,10,10,2]);
  assert.equal(state.hero.hp,100);
  assert.equal(state.status,'fighting');
});

test('support remains wounded and targetable without becoming a required vehicle victory target', () => {
  const initial=startFight(car({gunnery:20,weapons:[weapon({flatDamage:1})]}),
    entry([car({canAttack:false})],{fireSupport:support()}));
  let state=fightRound(initial,{target:1,weapons:[0]},sequence(6,6,1,1,1,1,1,1));
  assert.equal(state.supporters[0].hp,2);
  assert.equal(initial.supporters[0].hp,3);
  assert.equal(combatTargets(state).length,5);
  state.enemies[0].out=true;
  state=fightRound(state,{hold:true},sequence());
  assert.equal(state.status,'win');
  assert.equal(state.supporters[0].hp,2);
});

test('turning around while support is in range extends MG fire without granting extra LAW shots', () => {
  let state=startFight(car(),entry([car({canAttack:false})],{fireSupport:support(),
    tactics:{turnAround:{once:true,playerFacing:['front','turret'],allPursuersCatchUp:true,supportUntilBattleEnd:true}}}));
  for(let turn=1;turn<=8;turn++)state=fightRound(state,{hold:true},()=>1);
  state=tactic(state,'turnAround');
  for(let turn=9;turn<=12;turn++)state=fightRound(state,{hold:true},()=>1);
  assert.deepEqual(state.supporters.map(unit=>unit.shotsFired),[12,12,12,2]);
});

test('combat pursuit rolls retain damage and the original support clock when the pursuers catch up', () => {
  const source=entry([car({key:'foe',hp:42})],{fireSupport:support(),
    ownPlantAllowsNonLaserFire:true,heroPlantLossEnds:true,
    chase:{failuresToDropOut:2,heroFailuresDestination:'combat',pursuersCanFire:false}});
  source.section='pursuit';
  let state=startFight(car({hp:71}),source);
  // Six dice are the three support misses; then the two Control rolls.
  state=fightRound(state,{hold:true},sequence(1,1,1,1,1,1,6,1));
  // Turn two also includes the LAW miss.
  state=fightRound(state,{hold:true},sequence(1,1,1,1,1,1,1,1,6,1));
  assert.equal(state.status,'branch');
  assert.equal(state.section,'combat');
  const next=resumeFight(state,{section:'combat',baseSection:'pursuit',rules:{carryChaseStateFrom:'pursuit',heroPlantLossEnds:false,playerFacing:['rear','turret']}});
  assert.equal(next.status,'fighting');
  assert.equal(next.round,2);
  assert.equal(next.hero.hp,71);
  assert.equal(next.enemies[0].hp,42);
  assert.equal(next.rules.chase,undefined);
  assert.equal(next.hero.allowImmobilizedFire,true);
  assert.deepEqual(next.supporters.map(unit=>unit.shotsFired),[2,2,2,1]);
});

test('a newly entered scenario variant applies its incoming damage once without resetting the original round',()=>{
  const state=startFight(car(),entry([car({canAttack:false})]));
  state.round=4;state.status='paused';
  const variant={section:'incoming',baseSection:'test',rules:{scenarioCombat:true,entryDamageDice:1}};
  const next=resumeFight(state,variant,sequence(2));
  assert.equal(next.hero.hp,98);assert.equal(next.round,4);assert.equal(state.hero.hp,100);
  const again=resumeFight({...next,status:'paused'},variant,sequence());
  assert.equal(again.hero.hp,98);assert.equal(again.round,4);
});

test('a printed personal-ammunition timeout empties both weapons while retaining the fight history',()=>{
  const source=entry([person({defenseClass:30})],{kind:'personal',roundLimit:{turns:2,destination:'empty',exhaustPersonalWeapons:true}});
  let state=startFight(person({defenseClass:30}),source);
  state=fightRound(state,{hold:true},sequence(1,1));
  assert.equal(state.status,'fighting');
  state=fightRound(state,{hold:true},sequence(1,1));
  assert.equal(state.status,'branch');assert.equal(state.section,'empty');
  assert.equal(state.hero.weapon.ammo,0);assert.equal(state.enemies[0].weapon.ammo,0);
  assert.equal(state.hero.hp,3);assert.equal(state.round,2);
});

test('an immobilized player retains non-laser fire only under the explicit source rule', () => {
  const unit=car({allowImmobilizedFire:true,powerPlant:{boxes:0}});
  assert.equal(combatantOut(unit),false);
  assert.deepEqual(firingCrew(unit,1),['driver']);
  assert.equal(combatantOut({...unit,allowImmobilizedFire:false}),true);
});

test('a shared targeting computer benefits exactly one selected crew member', () => {
  const unit=car({gadgets:[{computerFor:'either',bonus:2,boxes:1}]});
  assert.equal(targetingBonus(unit,'driver'),2);
  assert.equal(targetingBonus(unit,'gunner'),0);
  unit.computerSeat='gunner';
  assert.equal(targetingBonus(unit,'driver'),0);
  assert.equal(targetingBonus(unit,'gunner'),2);
});

test('a working bound voice switch grants two driver systems in addition to the gunner', () => {
  const unit=car({gunnerSeat:true,gunnerHp:3,gunnerGunnery:2,
    weapons:[weapon(),weapon(),weapon()],voiceSwitch:{status:'working',weaponIndex:2}});
  const actions=assignWeapons(unit,[0,1,2],1);
  assert.deepEqual(actions.map(action=>action.seat),['driver','gunner','driver']);
  assert.equal(actions[2].gunnery,unit.gunnery);
  const alone={...unit,gunnerSeat:false};
  assert.deepEqual(assignWeapons(alone,[0,2],1).map(action=>action.seat),['driver','driver']);
  assert.throws(()=>assignWeapons(alone,[0,1],1),/One weapon system/);
});

test('voice-switch failure disables the computer until disconnected while stopped, and never rerolls', () => {
  const unit=car({gadgets:[{computerFor:'either',bonus:2,boxes:1}],voiceSwitch:{status:'untested',weaponIndex:0}});
  const failed=testVoiceSwitch(unit,sequence(4)).unit;
  assert.equal(targetingBonus(failed,'driver'),0);
  assert.equal(unit.voiceSwitch.status,'untested');
  assert.throws(()=>testVoiceSwitch(failed,sequence()),/already been tested/);
  assert.throws(()=>disconnectVoiceSwitch(failed,{fighting:true}),/Stop/);
  assert.throws(()=>disconnectVoiceSwitch(failed,{driving:true}),/Stop/);
  assert.equal(targetingBonus(disconnectVoiceSwitch(failed),'driver'),2);
  assert.equal(testVoiceSwitch(unit,sequence(5)).working,true);
});

test('mines require no Attack roll, consume finite stock, and use the following target Control roll', () => {
  const hero=car({key:'hero',weapons:[weapon({name:'Mine',direction:'rear',delivery:'mine',ammo:2})]});
  const foe=car({key:'foe',canAttack:false,relativePosition:'behind'});
  let state=startFight(hero,entry([foe]));
  state=fightRound(state,{target:0,weapons:[0]},sequence(6,4));
  assert.equal(state.enemies[0].hp,96);
  assert.equal(state.hero.weapons[0].ammo,1);
  state=fightRound(state,{target:0,weapons:[0]},sequence(1));
  assert.equal(state.enemies[0].hp,96);
  assert.equal(state.hero.weapons[0].ammo,0);
  assert.throws(()=>fightRound(state,{target:0,weapons:[0]},sequence()),/unavailable/i);
  const ahead=startFight(hero,entry([{...foe,relativePosition:'ahead'}]));
  assert.throws(()=>fightRound(ahead,{target:0,weapons:[0]},sequence()),/following target/);
});

test('two opening Gunnery checks use one die each and armour absorbs their fixed damage', () => {
  const state=startFight(person(),entry([person({armour:1})],{kind:'personal',
    openingGunneryChecks:{count:2,target:2,flatDamage:1}}),{},sequence(2,6));
  assert.equal(state.hero.armour,2);
  assert.equal(state.hero.hp,3);
});

test('surrender occurs after body damage beyond armour rather than an ordinary knockout', () => {
  const foe=person({armour:1,canAttack:false});
  let state=startFight(person({gunnery:10}),entry([foe],{kind:'personal',opponentBodyHpAtSurrender:2}));
  state=fightRound(state,{target:0},sequence(1,1));
  assert.equal(state.status,'fighting');
  assert.equal(state.enemies[0].hp,3);
  state=fightRound(state,{target:0},sequence(1,1));
  assert.equal(state.status,'win');
  assert.equal(state.enemies[0].hp,2);
});

test('paint zeros skills for exactly the following three turns while preserving their saved values', () => {
  const painter=car({key:'painter',gunnery:10,weapons:[weapon({name:'Paint',effect:'paint',damageDice:0,flatDamage:0})]});
  let state=startFight(car({key:'hero',gunnery:5,defenseClass:9}),entry([painter]));
  state=fightRound(state,{hold:true},sequence(6,6));
  assert.equal(state.hero.blindUntilRound,4);
  state.enemies[0].canAttack=false;
  state.enemies[0].defenseClass=10;
  for(let i=0;i<3;i++)state=fightRound(state,{target:0,weapons:[0]},sequence(5,5));
  assert.equal(state.enemies[0].hp,100);
  state=fightRound(state,{target:0,weapons:[0]},sequence(5,5,2));
  assert.equal(state.enemies[0].hp,98);
  assert.equal(state.hero.gunnery,5);
});

test('helicopter stabilizing rotor damage disables the aircraft through its printed special table', () => {
  const heli=car({key:'heli',helicopter:true,canAttack:false,defenseClass:0,stabilizingRotor:{hp:4}});
  let state=startFight(car({key:'hero',gunnery:10}),entry([heli],{
    helicopterSpecialDamage:{4:{part:'stabilizingRotor',damageDice:1}}}));
  state=fightRound(state,{target:0,weapons:[0]},sequence(6,6,1,2,2,4,1));
  assert.equal(state.enemies[0].stabilizingRotor.hp,0);
  assert.equal(state.status,'win');
});

test('a helicopter gunner being unconscious is distinct from killed, and pilot death has its own outcome', () => {
  const heli=car({helicopter:true,gunnerHp:1,gunnerSeat:true,gunnerGunnery:3});
  const rules={pilotKilledDestination:'pilot',gunnerKilledDestination:'gunner'};
  assert.equal(startFight(car(),entry([heli],rules)).status,'fighting');
  assert.equal(startFight(car(),entry([{...heli,gunnerHp:0}],rules)).section,'gunner');
  assert.equal(startFight(car(),entry([{...heli,driverHp:0}],rules)).section,'pilot');
});

test('a helicopter spends a full turn without firing when changing weapon systems', () => {
  const heli=car({key:'heli',helicopter:true,gunnery:null,gunnerHp:3,gunnerSeat:true,gunnerGunnery:3,
    weapons:[weapon({name:'Primary',damageDice:2}),weapon({name:'Secondary',damageDice:1})]});
  let state=startFight(car({key:'hero'}),entry([heli],{enemyWeaponSwitchNoFireTurns:1}));
  state=fightRound(state,{hold:true},sequence(1,1));
  state.enemies[0].weapons[0].boxes=0;
  state=fightRound(state,{hold:true},sequence());
  assert.ok(state.events.some(text=>text.includes('without firing')));
  state=fightRound(state,{hold:true},sequence(1,1));
  assert.ok(state.events.some(text=>text.includes('Secondary')));
});

test('explicit enemy basic ammo does not silently limit the player ammunition', () => {
  const foe=car({key:'foe',gunnery:0});
  let state=startFight(car({key:'hero',weapons:[weapon({ammo:7})]}),entry([foe],{explicitBasicAmmo:1,victoryWhenAnyEnemyOutOrEmpty:true}));
  state=fightRound(state,{target:0,weapons:[0]},sequence(1,1,1,1));
  assert.equal(state.hero.weapons[0].ammo,7);
  assert.equal(state.enemies[0].weapons[0].ammo,0);
  assert.equal(state.status,'win');
});

test('parked vehicles have no invented crew skills, cannot retaliate, and may only be attempted once', () => {
  const parked=car({unattended:true,driving:null,gunnery:null});
  const source=entry([{...parked,key:'a'},{...parked,key:'b'}],{
    parkedPass:{oneShotPerTarget:true,heroAttackBonus:1,ramTargets:2,ramDamageDice:4,atLeastDisabled:2,victory:'clear',otherwise:'pursuit'}});
  let state=startFight(car(),source);
  state=fightRound(state,{target:0,weapons:[0]},sequence(1,1));
  assert.throws(()=>fightRound(state,{target:0,weapons:[0]},sequence()),/untried/);
  state=fightRound(state,{target:1,weapons:[0]},sequence(1,1));
  assert.equal(state.status,'branch');
  assert.equal(state.section,'pursuit');
  assert.equal(state.hero.hp,100);
});

test('ramming parked vehicles requires a fresh pair, applies four damage dice, and preserves their outcomes', () => {
  const parked=car({unattended:true,driving:null,gunnery:null});
  const source=entry([{...parked,key:'a'},{...parked,key:'b'}],{
    parkedPass:{ramTargets:2,ramDamageDice:4,atLeastDisabled:2,victory:'clear',otherwise:'pursuit'}});
  const initial=startFight(car(),source);
  assert.throws(()=>fightRound(initial,{ramTargets:[0]},sequence()),/fresh pair/);
  const state=fightRound(initial,{ramTargets:[0,1]},sequence(2,2,2,2));
  assert.equal(state.hero.hp,92);
  assert.equal(state.enemies.filter(unit=>unit.out).length,2);
  assert.equal(state.status,'win');
  assert.equal(initial.hero.hp,100);
});
