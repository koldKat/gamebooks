import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateCombatant,startFight,fightRound,controlCheck,tactic,resumeFight,repairVehicle,replaceDriver} from '../../../public/js/battlesim/engines/car-wars/core.js';
import {loadRoster,getRoster,getVehicles} from '../../../public/js/battlesim/books/1442/definition.js';
const data=JSON.parse(readFileSync(new URL('../../../data/simulator-rosters/1442.json',import.meta.url)));
await loadRoster(async()=>({ok:true,json:async()=>data.enemies}));
const source=section=>structuredClone(getRoster().find(e=>e.section===String(section)));
const sequence=(...values)=>{let at=0;return()=>{assert.ok(at<values.length,'Unexpected die '+at);return values[at++];};};
const heroVehicle=(patch={})=>({...structuredClone(getVehicles()[0]),kind:'vehicle',name:'Player',key:'player',driving:3,gunnery:3,driverHp:3,driverArmour:0,...patch});
const person=(patch={})=>({kind:'person',name:'Player',key:'player',hp:3,defenseClass:9,gunnery:3,armour:0,weapon:{name:'Pistol',flatDamage:2,bonus:0},...patch});
const custom=(enemies,rules={})=>({section:null,label:'Custom',enemies,rules:{kind:'vehicle',playerFacing:['front','rear','left','right','turret'],enemyFacing:['front'],...rules}});
const car=(patch={})=>({kind:'vehicle',name:'Foe',key:'foe',hp:30,defenseClass:10,gunnery:0,controlRoll:3,handling:2,driverHp:3,powerPlant:{boxes:5},weapons:[{name:'MG',direction:'front',damageDice:1,bonus:0,boxes:3}],...patch});

test('all encounters and vehicle profiles come from complete DB metadata; missing Gunnery stays manual',()=>{
  assert.equal(getRoster().length,21);assert.equal(getVehicles().length,8);
  for(const entry of getRoster()) {
    if(entry.section==='9'||entry.section==='315') assert.throws(()=>startFight(person(),entry),/whole number/);
    else assert.doesNotThrow(()=>startFight(entry.rules.kind==='vehicle'?heroVehicle():person(),entry,{},()=>3));
  }
  assert.equal(source(384).enemies[1].gunnery,5);
  assert.equal(source(286).enemies[0].weapons[1].name,'Flamethrower');
});
test('attack must strictly exceed DC; armour absorbs before personal HP; all surviving enemies attack',()=>{
  const entry=custom([person({name:'A',key:'a',gunnery:0,hp:8}),person({name:'B',key:'b',gunnery:0,hp:8})],{kind:'personal'});
  const initial=startFight(person({armour:3,gunnery:0}),entry);
  const tied=fightRound(initial,{target:0},sequence(4,5, 6,6, 6,6));
  assert.equal(tied.enemies[0].hp,8);assert.equal(tied.hero.armour,0);assert.equal(tied.hero.hp,2);
  assert.equal(initial.hero.armour,3,'input state preserved');
});
test('each rolled damage 1 applies special damage and an immediate control check',()=>{
  const entry=custom([car({defenseClass:30})]);
  const fight=startFight(heroVehicle({defenseClass:0}),entry);
  const next=fightRound(fight,{target:0,weapons:[]},sequence(6,6, 1, 3,4, 1));
  assert.equal(next.hero.hp,59);assert.equal(next.hero.defenseClass,0);
  assert.equal(next.events.filter(e=>e.startsWith('Special damage')).length,1);
  assert.ok(next.events.some(e=>e.startsWith('Control')));
});
test('multiple 1s cause separate specials; handling loss affects printed enemy Control targets',()=>{
  const entry=custom([car({defenseClass:0})]);
  const fight=startFight(heroVehicle(),entry);
  const next=fightRound(fight,{target:0,weapons:[0]},sequence(6,6,1,1, 4,5,1, 3,4,1, 1,1));
  assert.equal(next.enemies[0].handling,1);assert.equal(next.enemies[0].defenseClass,0);
  assert.equal(next.events.filter(e=>e.startsWith('Special damage')).length,2);
  assert.equal(controlCheck(next.enemies[0],()=>3).target,2);
});
test('Control target 6 still fails on two sixes; source strict-less check stays distinct',()=>{
  assert.equal(controlCheck({driving:3,handling:3},sequence(6,6)).passed,false);
  assert.equal(controlCheck({driving:3,handling:3},sequence(6,5)).passed,true);
  assert.equal(controlCheck({driving:2,handling:2},()=>4,0,true).passed,false);
});
test('two control failures in one volley miss the next turn once, rather than adding extra skipped turns',()=>{
  const fight=startFight(heroVehicle(),custom([car({defenseClass:0,controlRoll:0})]));
  const next=fightRound(fight,{target:0,weapons:[0]},sequence(6,6,1,1, 3,4,6, 3,4,6));
  assert.equal(next.enemies[0].skipTurn,0,'the next enemy turn was skipped in this round');
  assert.equal(next.events.filter(e=>e.includes('misses a turn')).length,1);
});
test('linked weapons roll separately; two independent weapons require an available firing station and gunner',()=>{
  const hero=heroVehicle(),entry=custom([car({defenseClass:40})]);
  const fight=startFight(hero,entry);
  assert.throws(()=>fightRound(fight,{target:0,weapons:[1,2]},()=>2),/crew member/);
  hero.gunnerSeat=true;hero.gunnerHp=3;hero.gunnerGunnery=1;
  assert.doesNotThrow(()=>fightRound(startFight(hero,entry),{target:0,weapons:[1,2]},()=>2));
  hero.weapons[1].linkedGroup='pair';hero.weapons[2].linkedGroup='pair';hero.gunnerHp=0;
  const next=fightRound(startFight(hero,entry),{target:0,weapons:[1,2]},()=>2);
  assert.equal(next.events.filter(e=>e.startsWith('Your')||e.startsWith('Player:')).length,2);
  assert.throws(()=>fightRound(fight,{target:0,weapons:[1,1]},()=>2),/only once/);
});
test('single-use rockets deplete in basic mode; advanced ammo and sustained fire are optional for both sides',()=>{
  const entry=source(224),fight=startFight(heroVehicle({defenseClass:40}),entry);
  let next=fight;
  for(let i=0;i<4;i++)next=fightRound(next,{target:0,weapons:[]},()=>2);
  assert.deepEqual(next.enemies[0].weapons.slice(0,3).map(w=>w.ammo),[0,0,0]);
  assert.match(next.events.find(e=>e.includes('vs DC')),/Machine-gun/);
  const oneAmmo=heroVehicle();oneAmmo.weapons[0].ammo=1;
  const advanced=fightRound(startFight(oneAmmo,custom([car({defenseClass:40})]),{advancedAmmo:true}),{target:0,weapons:[0]},()=>2);
  assert.throws(()=>fightRound(advanced,{target:0,weapons:[0]},()=>2),/unavailable/);
  let sustained=startFight(heroVehicle({defenseClass:40}),custom([car({defenseClass:40})]),{sustainedFire:true});
  for(let i=0;i<3;i++)sustained=fightRound(sustained,{target:0,weapons:[0]},()=>2);
  assert.equal(sustained.hero.sustained,2);assert.equal(sustained.enemies[0].sustained,2);
  sustained=fightRound(sustained,{target:0,weapons:[]},()=>2);
  sustained=fightRound(sustained,{target:0,weapons:[0]},()=>2);assert.equal(sustained.hero.sustained,0);
});
test('front Defense Class changes with pursuit direction and survives critical DC loss',()=>{
  const hero=heroVehicle();
  let fight=startFight(hero,source(49));
  fight.enemies[0].defenseClass--;
  const next=fightRound(fight,{target:0,weapons:[1]},()=>2);
  assert.match(next.events[0],/DC 12/);
  const reversed=fightRound(startFight(hero,source(256)),{target:0,weapons:[0]},()=>2);
  assert.match(reversed.events[0],/DC 11/);
  assert.throws(()=>fightRound(fight,{target:0,weapons:[0]},()=>2),/face the enemy/);
});
test('Desert Wolves pause at two losses, remove only the temporary penalty and resume without resetting damage',()=>{
  let fight=startFight(heroVehicle(),source(189));
  assert.equal(fight.hero.defenseClass,10);
  fight.hero.defenseClass--;fight.enemies[1].hp=0;fight.enemies[2].hp=0;
  fight=fightRound(fight,{target:0,weapons:[]},()=>2);
  assert.equal(fight.status,'paused');assert.equal(fight.section,'153');assert.equal(fight.hero.defenseClass,11);
  const continued=resumeFight(fight,source(325));
  assert.equal(continued.enemies[1].hp,0);assert.equal(continued.hero.defenseClass,11);assert.equal(continued.rules.fightToDeath,true);
  assert.equal(tactic(fight,'leave').section,'396');
  fight.enemies[0].hp=0;assert.throws(()=>tactic(fight,'leave'),/leader/);
});
test('resuming pursuit preserves component damage, ammunition and the printed weapon-loss branch',()=>{
  let fight=startFight(heroVehicle(),source(160));fight.enemies[0].hp=15;fight.enemies[0].weapons[1].boxes=0;
  const changed=resumeFight(fight,source(286));
  assert.equal(changed.enemies[0].hp,15);assert.equal(changed.enemies[0].weapons[1].name,'Flamethrower');assert.equal(changed.enemies[0].weapons[1].boxes,1);
  fight=fightRound(fight,{target:0,weapons:[]},()=>2);assert.equal(fight.status,'branch');assert.equal(fight.section,'84');
  assert.throws(()=>resumeFight(fight,source(325)),/matching/);
});
test('running laser/plant losses remove pursuers; fistfight counts punches without invented HP damage',()=>{
  const fight=startFight(heroVehicle(),source(384));fight.enemies.forEach(e=>e.weapons[0].boxes=0);
  const won=fightRound(fight,{target:0,weapons:[]},()=>2);
  assert.equal(won.status,'win');assert.equal(won.section,'314');
  const fists=fightRound(startFight(person(),source(268)),{},()=>1);
  assert.equal(fists.status,'win');assert.equal(fists.hero.hp,3);assert.equal(fists.enemies[0].hp,3);
});
test('smoke and foam use source-specific effects; grenade escape gives no free enemy shot',()=>{
  const hero=heroVehicle({gunnerHp:3,smokeCharges:2,grenades:2});
  const smoked=fightRound(startFight(hero,source(348)),{target:0,weapons:[],smoke:true},()=>2);
  assert.equal(smoked.hero.smokeCharges,1);assert.ok(smoked.events.some(e=>e.includes('DC 15')));
  const escape=tactic(startFight(hero,source(49)),'smokeEscape',{},()=>1);assert.equal(escape.status,'escaped');assert.equal(escape.section,'377');
  const grenade=tactic(startFight(hero,source(160)),'grenadeEscape',{},()=>2);assert.equal(grenade.hero.hp,60);assert.equal(grenade.hero.grenades,1);
  const foam=tactic(startFight(hero,source(348)),'foam');assert.equal(foam.foam,true);
});
test('repairs respect original maxima and cannot heal people or armour; replacement Driving is explicit',()=>{
  const hero=validateCombatant(heroVehicle());hero.hp=58;hero.driverArmour=1;
  const repair=repairVehicle(hero,'hp',3,()=>1,5);assert.equal(repair.unit.hp,60);assert.equal(repair.unit.driverArmour,1);
  assert.equal(repairVehicle(hero,'plant',0,()=>1).success,false);
  assert.throws(()=>repairVehicle(hero,'computer',3,()=>1),/whole number/);
  const fight=startFight(heroVehicle({gunnerHp:3,gunnerGunnery:1}),source(348));
  fight.hero.driverHp=1;fight.hero.needsReplacementDriver=true;fight.status='awaitingDriver';
  const replaced=replaceDriver(fight,2);assert.equal(replaced.hero.driving,2);assert.equal(replaced.hero.gunnery,1);assert.equal(replaced.hero.gunnerHp,0);
  assert.equal(fight.hero.driverHp,1);
});
test('printed profile exceptions retain Hammer repair capacity and the two-rocket limit',()=>{
  const hammer=validateCombatant({...heroVehicle(),...structuredClone(getVehicles().find(v=>v.key==='hammer'))});
  assert.equal(repairVehicle(hammer,'hp',6,()=>1,20).unit.hp,80);
  const bullseye={...heroVehicle(),...structuredClone(getVehicles().find(v=>v.key==='bullseye'))};
  assert.equal(validateCombatant(bullseye).ramplate,true);
  assert.throws(()=>fightRound(startFight(bullseye,custom([car({defenseClass:40})])),{target:0,weapons:[0,1,2]},()=>2),/Too many linked/);
});
test('a gunner’s hand grenade resolves before the opposing volley and consumes one charge',()=>{
  const hero=heroVehicle({gunnerHp:3,grenades:1});
  const fight=startFight(hero,source(384));
  const next=fightRound(fight,{target:0,weapons:[],grenade:true},sequence(1,1,2, 2,2, 2,2));
  assert.equal(next.hero.grenades,0);assert.equal(next.enemies[0].hp,18);
  assert.ok(next.events.findIndex(e=>e.includes('hand grenade'))<next.events.findIndex(e=>e.startsWith('Lightsabre')));
});
