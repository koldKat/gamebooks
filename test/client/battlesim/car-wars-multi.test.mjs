import { readRosterDocument } from '../../helpers/roster-db.cjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {startFight,fightRound,resumeFight,combatantOut,replaceDriver,tactic} from '../../../public/js/battlesim/engines/car-wars/multi-combat.js';
const data=readRosterDocument(1444);
const entries=[...new Map(data.enemies.map(r=>[r.stats.entryIndex,r.stats.entry])).values()];
function source(section) {
  for(const entry of entries) {
    if(entry.section===String(section))return {...structuredClone(entry),baseSection:entry.section};
    const variant=entry.variants.find(v=>v.section===String(section));
    if(variant)return {...structuredClone(entry),...structuredClone(variant),baseSection:entry.section,
      rules:{...structuredClone(entry.rules),...structuredClone(variant.rules)}};
  }
  throw Error('Unknown source '+section);
}
const person=(patch={})=>({kind:'person',name:'Player',key:'hero',hp:20,defenseClass:100,gunnery:3,armour:0,
  weapon:{name:'Pistol',bonus:0,flatDamage:2},...patch});
const car=(patch={})=>({kind:'vehicle',name:'Car',key:'car',hp:100,defenseClass:100,driving:3,handling:3,
  gunnery:3,driverHp:3,driverArmour:6,powerPlant:{boxes:10},weapons:[
    {name:'Machine-gun',direction:'front',bonus:0,damageDice:1,boxes:3}],...patch});
const sequence=(...values)=>{let at=0;return()=>{assert.ok(at<values.length,'Unexpected die '+at);return values[at++];};};
const custom=(enemies,rules={})=>({section:'custom',enemies,rules:{kind:'vehicle',playerFacing:['front','turret'],
  enemyFacing:['front','turret'],...rules}});

test('complete source presets start with explicit manual missing stats, never a fabricated value',()=>{
  for(const base of entries)for(const entry of [source(base.section),...base.variants.filter(v=>!v.rules.resumePrior).map(v=>source(v.section))]) {
    for(const foe of entry.enemies)if(foe.gunnery==null&&foe.canAttack!==false&&!foe.gunnerSeat)foe.gunnery=2;
    let hero=entry.rules.kind==='personal'?person():car();
    if(entry.rules.heroIsGunner)hero={...hero,gunnerHp:3,gunnerArmour:6,gunnerGunnery:3,gunnerSeat:true};
    assert.doesNotThrow(()=>startFight(hero,entry,{},()=>3),entry.section);
  }
  assert.throws(()=>startFight(car(),source(49)),/missing driver Gunnery/);
  assert.throws(()=>startFight(person(),source(349)),/missing Gunnery/);
});

test('two crew fire independent weapon systems at different targets; linked weapons roll separately',()=>{
  const hero=car({gunnerSeat:true,gunnerHp:3,gunnerGunnery:2,weapons:[
    {name:'A',direction:'front',bonus:0,damageDice:1,boxes:3,linkedGroup:'pair'},
    {name:'B',direction:'front',bonus:0,damageDice:1,boxes:3,linkedGroup:'pair'},
    {name:'C',direction:'turret',bonus:0,damageDice:1,boxes:3}]});
  const fight=startFight(hero,custom([car({key:'a',hp:40,defenseClass:0}),car({key:'b',hp:40,defenseClass:0})]));
  const next=fightRound(fight,{weapons:[0,1,2],targets:[0,1]},()=>3);
  assert.deepEqual(next.enemies.map(e=>e.hp),[34,37]);
  assert.deepEqual(fight.enemies.map(e=>e.hp),[40,40],'input fight unchanged');
});

test('blank linked-group form fields leave enemy guns independent',()=>{
  const foe=car({key:'foe',weapons:[
    {name:'A',direction:'front',bonus:0,damageDice:1,boxes:3,linkedGroup:''},
    {name:'B',direction:'front',bonus:0,damageDice:1,boxes:3,linkedGroup:''},
  ]});
  const next=fightRound(startFight(car(),custom([foe])),{hold:true,weapons:[]},()=>2);
  assert.equal(next.round,1);
  assert.equal(next.events.filter(line=>line.includes('against')).length,1);
});

test('robot accuracy is the complete Combat Bonus and never gains extra weapon or computer accuracy',()=>{
  const hero=car({gadgets:[{boxes:1,computerFor:'gunner',bonus:2}],weapons:[
    {name:'Accurate gun',direction:'front',bonus:5,damageDice:1,boxes:3}]});
  const entry=custom([car({key:'foe',hp:40,defenseClass:9})],{robotGunner:{hp:2,combatBonus:3}});
  const next=fightRound(startFight(hero,entry),{weapons:[0],seats:['gunner']},()=>3);
  assert.equal(next.enemies[0].hp,40,'9 ties DC9 and misses');
  assert.match(next.events[0],/→ 9 vs DC 9: miss/);
});

test('resuming into a robot entry installs its crew once and never heals existing robot damage',()=>{
  const initial=startFight(car(),source(204));initial.status='paused';initial.hero.hp=71;initial.round=4;
  const robot=resumeFight(initial,source(92));
  assert.equal(robot.hero.gunnerHp,2);assert.equal(robot.hero.robotGunner.activeTurns,8);
  assert.equal(robot.hero.hp,71);assert.equal(robot.round,4);
  robot.hero.gunnerHp=1;robot.status='paused';
  assert.equal(resumeFight(robot,source(92)).hero.gunnerHp,1);
  const next=source(314);next.rules.robotGunner=source(92).rules.robotGunner;
  assert.equal(resumeFight(robot,next).hero.gunnerHp,1);
});

test('arena target tables apply to each rival; the named rival always targets the player',()=>{
  for(const section of [314,377]) {
    const entry=source(section);
    for(const e of entry.enemies)e.defenseClass=100;
    const next=fightRound(startFight(car({name:'Player'}),entry),{weapons:[]},()=>3);
    const fixed=entry.enemies[4].name;
    const firstFour=next.events.filter(e=>/against/.test(e)&&!e.startsWith(fixed+':'));
    assert.ok(firstFour.length>=4);
    assert.ok(firstFour.every(e=>e.includes('against '+(section===314?fixed:'Player'))));
    assert.ok(next.events.some(e=>e.startsWith(fixed+':')&&e.includes('against Player')));
  }
});

test('arena outcomes retain both the killer identity and whether the named rival is still active',()=>{
  for(const [carOut,fixedOut,byFixed,expected]of [
    [true,false,true,'387'],[true,false,false,'367'],[true,true,false,'274'],
    [false,false,true,'387'],[false,false,false,'167'],[false,true,false,'217']]) {
    const fight=startFight(car(),source(204));
    if(carOut)fight.hero.hp=0;else fight.hero.driverHp=1;
    fight.enemies[4].out=fixedOut;
    fight.lastHeroDamageBy=fight.enemies[byFixed?4:0].key;
    assert.equal(fightRound(fight).section,expected);
  }
});

test('an allied Control Roll failure immediately takes the printed branch',()=>{
  const entry=custom([car({key:'enemy',gunnery:10})],{anyAlliedControlFailure:'180'});
  const hero=car({key:'hero',defenseClass:0,driverArmour:0,handling:0,driving:1});
  const next=fightRound(startFight(hero,entry),{weapons:[]},sequence(3,3,1,1,6,6));
  assert.equal(next.status,'branch');assert.equal(next.section,'180');
  assert.equal(next.hero.hp,99);
});

test('returning from an alley preserves rounds and damage, and cannot replay the two free shots',()=>{
  const base=custom([car({key:'enemy'})]);base.section='265';
  const original=startFight(car(),base,{advancedAmmo:true});original.round=4;original.enemies[0].hp=73;
  const resumed=resumeFight(original,{baseSection:'265',section:'229',rules:{resumeGeneralDamage:10,resumeEnemyShots:[0,0]}},()=>3);
  assert.equal(resumed.hero.hp,90);assert.equal(resumed.round,4);assert.equal(resumed.enemies[0].hp,73);
  assert.equal(resumed.enemies[0].weapons[0].ammo,18);
  const again=resumeFight(resumed,{baseSection:'265',section:'229',rules:{resumeGeneralDamage:10,resumeEnemyShots:[0,0]}},()=>3);
  assert.equal(again.hero.hp,90);assert.equal(again.enemies[0].weapons[0].ammo,18);
});

test('the workshop gives two free shots, then the three unarmed people escape after two response turns',()=>{
  const entry=source(389);entry.enemies.forEach(e=>e.defenseClass=100);
  let fight=startFight(person(),entry);
  for(let i=0;i<2;i++)fight=fightRound(fight,{target:0},()=>3);
  assert.equal(fight.round,0);assert.equal(fight.openingShots,0);assert.equal(fight.hero.hp,20);
  for(let i=0;i<2;i++)fight=fightRound(fight,{target:0,hold:true},()=>3);
  assert.ok(fight.enemies.slice(0,3).every(e=>e.escaped));assert.equal(combatantOut(fight.enemies[3]),false);
});

test('weapon searching allows the opponent to swing before each search and does not grant a free attack',()=>{
  const entry=source(288),hero=person({defenseClass:0});
  const next=fightRound(startFight(hero,entry),{target:0},()=>3);
  assert.equal(next.hero.hp,19);assert.equal(next.searching,false);
  assert.equal(next.enemies[0].hp,3);assert.equal(next.enemies[0].armour,6);
});

test('Ransom being incapacitated takes the driver branch rather than the vehicle-wreck branch',()=>{
  const hero=car({gunnerSeat:true,gunnerHp:3,gunnerGunnery:3});
  const fight=startFight(hero,source(262));fight.hero.driverHp=1;
  assert.equal(fightRound(fight).section,'285');
  const wreck=startFight(hero,source(262));wreck.hero.hp=0;
  assert.equal(fightRound(wreck).section,'397');
});

test('the ten-turn kidnapper deadline is inclusive and the two victory paragraphs remain distinct',()=>{
  for(const [before,expected]of [[9,'352'],[10,'345']]) {
    const entry=source(166);entry.enemies[0].hp=3;entry.enemies[0].defenseClass=0;entry.enemies[1].out=true;
    const fight=startFight(car({gunnery:10}),entry);fight.round=before;
    assert.equal(fightRound(fight,{target:0,weapons:[0]},()=>3).section,expected);
  }
});

test('Morningstar uses its gunner and gunner-only computer, while Ransom drives and the player shoots',()=>{
  const entry=source(262),hero=car({gunnerSeat:true,gunnerHp:3,gunnerGunnery:5,gunnery:1});
  entry.enemies[0].defenseClass=100;
  const next=fightRound(startFight(hero,entry),{weapons:[0]},()=>3);
  assert.match(next.events[0],/→ 11 vs DC 100/,'the player uses gunner Gunnery5');
  assert.ok(next.events.some(e=>e.startsWith('Morningstar:')&&e.includes('→ 11 vs DC 100')),
    'Gunnery2 + laser1 + gunner computer2 + dice6');
});

test('remaining allies can continue after the player car is disabled; enemy returns their fire',()=>{
  const entry=custom([car({key:'enemy'})],{allowFriendlyContinuation:true,enemiesOnlyReturnFire:true,
    allies:[car({key:'ally'})]});
  const fight=startFight(car(),entry);fight.hero.hp=0;
  const next=fightRound(fight,{weapons:[]},()=>3);
  assert.equal(next.status,'fighting');
  assert.ok(next.events.some(e=>e.includes('against Car')),'the enemy responds to allied fire');
  assert.equal(next.enemies[0].lastTargetedRound,1);
});

test('advanced mutual ammunition exhaustion keeps guns empty while allowing the source continuation rule',()=>{
  const hero=car({defenseClass:100}),foe=car({key:'foe',hp:50,defenseClass:0});
  hero.weapons[0].ammo=0;foe.weapons[0].ammo=0;
  const next=fightRound(startFight(hero,custom([foe]),{advancedAmmo:true}),{weapons:[0]},()=>3);
  assert.equal(next.virtualAmmo,true);assert.equal(next.enemies[0].hp,47);
  assert.equal(next.hero.weapons[0].ammo,0);assert.equal(next.enemies[0].weapons[0].ammo,0);
});

test('sustained fire bonuses increase only on consecutive turns at the same target and apply to both sides',()=>{
  let fight=startFight(car(),custom([car({key:'foe'})]),{sustainedFire:true});
  for(let round=1;round<=3;round++) {
    fight=fightRound(fight,{weapons:[0]},()=>3);
    const bonus=Math.min(round-1,2);
    assert.ok(fight.events.filter(e=>e.includes('against')).every(e=>e.includes('→ '+(9+bonus)+' vs')));
  }
  fight=fightRound(fight,{weapons:[]},()=>3);
  fight=fightRound(fight,{weapons:[0]},()=>3);
  assert.match(fight.events[0],/→ 9 vs/,'holding fire breaks the player bonus');
});

test('simplified arena elimination changes after the first three turns, not before',()=>{
  const entry=source(377);entry.enemies.forEach(e=>e.defenseClass=100);
  let fight=startFight(car(),entry,{simplifiedArena:true});
  let at=0;const roll=()=>++at%2?1:2;
  for(let i=0;i<3;i++)fight=fightRound(fight,{weapons:[]},roll);
  assert.ok(fight.enemies.slice(0,4).every(e=>!combatantOut(e)),'2d6 total3 survives threshold2');
  fight=fightRound(fight,{weapons:[]},roll);
  assert.ok(fight.enemies.slice(0,4).every(combatantOut),'total3 is eliminated at turn4');
  assert.equal(combatantOut(fight.enemies[4]),false,'the named rival is not randomly eliminated');
});

test('twenty-turn pursuit branches only while the robot-carrying car is still active, then resumes the first car',()=>{
  const entry=source(228);entry.enemies.forEach(e=>e.defenseClass=100);
  entry.rules.allies.forEach(e=>e.defenseClass=100);
  let fight=startFight(car(),entry);
  for(let i=0;i<19;i++)fight=fightRound(fight,{weapons:[]},()=>3);
  assert.equal(fight.status,'fighting');
  fight=fightRound(fight,{weapons:[]},()=>3);
  assert.equal(fight.section,'264');assert.equal(fight.round,20);
  fight.enemies[0].hp=21;
  const resumed=resumeFight(fight,source(264));
  assert.equal(resumed.enemies[0].hp,21);assert.equal(resumed.enemies[1].escaped,true);
  assert.equal(resumed.rules.roundLimit,null);assert.equal(resumed.round,20);
});

test('changing tactics cannot refresh damage, ammunition or a once-only maneuver',()=>{
  const fight=startFight(car(),source(265),{advancedAmmo:true});fight.enemies[0].hp=19;
  const branch=tactic(fight,'maneuver');assert.equal(branch.section,'161');
  const resumed=resumeFight(branch,source(179));
  assert.equal(resumed.enemies[0].hp,19);
  assert.throws(()=>tactic(resumed,'maneuver'),/already been used/);
});

test('human driver replacements pause for an explicit Driving value without resetting wounds',()=>{
  const foe=car({key:'foe',gunnerSeat:true,gunnerHp:2,gunnerArmour:1,gunnerGunnery:3});
  const fight=startFight(car(),custom([foe]));fight.enemies[0].driverHp=1;
  fight.enemies[0].needsReplacementDriver=true;
  const paused=fightRound(fight);assert.equal(paused.status,'awaitingDriver');
  assert.equal(paused.pendingDriverKey,'foe');
  const resumed=replaceDriver(paused,2);
  assert.equal(resumed.enemies[0].driverHp,2);assert.equal(resumed.enemies[0].driverArmour,1);
  assert.equal(resumed.enemies[0].driving,2);assert.equal(resumed.enemies[0].gunnerHp,0);
});

test('switching from the free-shot context into weapon search preserves earlier opponent wounds',()=>{
  let fight=startFight(person(),source(200));fight.enemies[0].hp=2;fight.enemies[0].armour=1;
  fight=fightRound(fight,{target:0},()=>3);
  assert.equal(fight.openingShots,0);
  fight=resumeFight(fight,source(288));
  assert.equal(fight.enemies[0].hp,2);assert.equal(fight.enemies[0].armour,1);
  assert.equal(fight.searching,true);assert.equal(fight.hero.weapon.name,'Heavy wrench');
});
