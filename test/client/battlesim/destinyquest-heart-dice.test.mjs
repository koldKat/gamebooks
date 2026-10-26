import test from 'node:test';
import assert from 'node:assert/strict';
import {HEART_ABILITIES as catalog} from '../../../public/js/battlesim/engines/destinyquest/heart-abilities.js';
import {createDestinyFight,startDestinyRound,rollDestinySpeed,resolveDestinySpeed,rollDestinyDamage,resolveDestinyDamage,endDestinyRound} from '../../../public/js/battlesim/engines/destinyquest/core.js';
import {configureDestinyAbilities,useDestinyAbility as use} from '../../../public/js/battlesim/engines/destinyquest/abilities.js';
import {resolveDestinyAbilityRoll} from '../../../public/js/battlesim/engines/destinyquest/ability-rolls.js';
import {destinyStat,destinyDamageScore} from '../../../public/js/battlesim/engines/destinyquest/effects.js';
const rolls=(...values)=>()=>{assert.ok(values.length,'Unexpected die roll');return values.shift();};
const resume=f=>JSON.parse(JSON.stringify(f));
const foe={name:'Opponent',speed:0,brawn:3,armour:2,health:100};
function start(abilities={},options={}){
  return startDestinyRound(configureDestinyAbilities(createDestinyFight({speed:20,brawn:4,magic:2,armour:0,health:10,maxHealth:30,...options.hero},options.foes||[foe]),abilities,{},
    {catalog,bookRules:{deathMoves:false,deathPenalties:false}}),0);
}
const win=f=>resolveDestinySpeed(rollDestinySpeed(f,rolls(6,5,1,2)));
const lose=f=>resolveDestinySpeed(rollDestinySpeed(f,rolls(1,2,6,5)));
const finish=f=>endDestinyRound(resolveDestinyDamage(rollDestinyDamage(win(f),rolls(2))));

test('High Five changes one hero face without rolling again or retriggering doubles healing',()=>{
  let f=rollDestinySpeed(start({'high-five':1,faith:1}),rolls(2,5,1,2));
  f=use(f,'high-five',{die:0},rolls());assert.deepEqual(f.turn.heroSpeedDice,[5,5]);assert.equal(f.hero.health,10);
  const enemy=rollDestinyDamage(lose(start({'high-five':1},{hero:{speed:0},foes:[{...foe,speed:20}]})),rolls(6));
  assert.throws(()=>use(enemy,'high-five',{die:0}),/hero die/);
});

test('High Five modifies real deferred damage groups and other hero test rolls',()=>{
  let f=use(win(start({cleave:1,'high-five':1})),'cleave',{deferDamage:true},rolls(2));
  f=use(f,'high-five',{die:0,group:0});f=resolveDestinyAbilityRoll(resume(f),rolls());assert.equal(f.opponents[0].health,95);
  f=start({'high-five':1});f.phase='ability-rolled';f.turn.pendingAbility={type:'test',name:'test',dice:[2]};
  f=use(f,'high-five',{die:0});assert.deepEqual(f.turn.pendingAbility.dice,[5]);
});

test('Shadow Speed and Sure Grip change the selected matching faces once without modifying saved dice',()=>{
  for(const [name,value]of [['shadow-speed',3],['sure-grip',6]]){
    let f=rollDestinySpeed(start({[name]:1,faith:1}),rolls(1,3,1,2));
    f=use(f,name);assert.deepEqual(f.turn.heroSpeedDice,[value,3]);assert.equal(f.hero.health,10);
    assert.throws(()=>use(f,name),/no uses left/);
    f=rollDestinySpeed(start({[name]:1}),rolls(1,1,1,2));f.turn.lockedHeroDice=[0];
    assert.throws(()=>use(f,name),/unlocked matching/);f=use(f,name,{dice:[1]});assert.deepEqual(f.turn.heroSpeedDice,[1,value]);
  }
});

test('Magic Tap returns on actual Speed and damage doubles, including an extra damage die',()=>{
  let f=use(start({'magic-tap':1,'deep-wound':1}),'magic-tap');assert.equal(f.used['magic-tap'],1);
  f=rollDestinySpeed(f,rolls(3,3,1,2));assert.equal(f.used['magic-tap'],0);
  f=use(f,'magic-tap');assert.equal(destinyStat(f,'hero','magic'),6);
  f=rollDestinyDamage(resolveDestinySpeed(f),rolls(2));assert.equal(f.used['magic-tap'],1);
  f=use(f,'deep-wound',{},rolls(2));assert.equal(f.used['magic-tap'],0);
});

test('Surefooted rerolls all Speed dice even without per-die options, then accepts its result',()=>{
  let f=rollDestinySpeed(start({surefooted:1}),rolls(1,2,1,2));
  f=use(f,'surefooted',{},rolls(3,4));assert.deepEqual(f.turn.heroSpeedDice,[3,4]);assert.throws(()=>use(f,'surefooted'),/no uses left/);
});

test('Suppress changes the Speed result, so it still works when opponent Speed is already zero',()=>{
  let f=rollDestinySpeed(start({suppress:1},{hero:{speed:0}}),rolls(1,1,1,2));
  f=use(f,'suppress');assert.equal(destinyStat(f,0,'speed'),0);
  f=resolveDestinySpeed(f);assert.equal(f.turn.winner,'hero');assert.equal(f.history.find(e=>e.type==='speed').opponent,1);
});

test('Underhand wins only with actual losing Speed doubles, including after JSON resume',()=>{
  let f=resolveDestinySpeed(rollDestinySpeed(start({underhand:1},{hero:{speed:0},foes:[{...foe,speed:10}]}),rolls(2,2,3,4)));
  f=use(resume(f),'underhand');assert.equal(f.turn.winner,'hero');assert.equal(f.phase,'damage');
  f=lose(start({underhand:1},{hero:{speed:0},foes:[{...foe,speed:10}]}));const before=resume(f);
  assert.throws(()=>use(f,'underhand'),/losing Speed doubles/);assert.deepEqual(f,before);
  f=rollDestinySpeed(start({underhand:1}),rolls(3,3,1,2));f.turn.forcedOpponentWin=true;f=resolveDestinySpeed(f);
  assert.throws(()=>use(f,'underhand'),/losing Speed doubles/);
});

test('Hypnotise rerolls only the opponent damage sixes once; new sixes are accepted and retain roll passives',()=>{
  let f=start({hypnotise:1,'fiery-temper':1},{hero:{speed:0},foes:[{...foe,speed:20}]});f.encounter={damageDiceByTarget:{0:3}};
  f=rollDestinyDamage(lose(f),rolls(6,2,6));assert.equal(f.opponentFaceCounts['fiery-temper'],2);
  f=use(f,'hypnotise',{},rolls(3,6));assert.deepEqual(f.turn.damageDice,[3,2,6]);assert.equal(f.opponentFaceCounts['fiery-temper'],3);
  assert.throws(()=>use(f,'hypnotise'),/no uses left/);
});

test('Siphon changes every enemy damage six to one without inventing new rolls',()=>{
  let f=start({siphon:1,'fiery-temper':1},{hero:{speed:0},foes:[{...foe,speed:20}]});f.encounter={damageDiceByTarget:{0:3}};
  f=rollDestinyDamage(lose(f),rolls(6,3,6));f=use(f,'siphon',{},rolls());
  assert.deepEqual(f.turn.damageDice,[1,3,1]);assert.equal(f.opponentFaceCounts['fiery-temper'],2);assert.equal(destinyDamageScore(f),8);
});

test('Slick uses the total Speed dice plus Brawn, locks copied faces, and leaves newly added dice editable',()=>{
  let f=win(start({slick:1,'high-five':1,penance:1},{hero:{magic:20}}));
  f=use(f,'slick');assert.deepEqual(f.turn.damageDice,[6,5]);assert.equal(destinyDamageScore(f),15);
  assert.throws(()=>use(f,'high-five',{die:0}),/Saved dice/);
  f=use(f,'penance',{},rolls(2));assert.deepEqual(f.turn.damageDice,[6,5,2]);
  f=use(f,'high-five',{die:2});assert.deepEqual(f.turn.damageDice,[6,5,5]);assert.equal(destinyDamageScore(f),20);
});

test('Meditation replaces the attack and heals at each round end, with Tranquillity increasing its healing',()=>{
  for(const amount of [1,2]){
    let f=use(win(start({meditation:1,...(amount===2?{tranquillity:1}:{})})),'meditation');
    assert.equal(f.opponents[0].health,100);f=endDestinyRound(f);assert.equal(f.hero.health,10+amount);
    f=finish(startDestinyRound(resume(f),0));assert.equal(f.hero.health,10+amount*2);
  }
});

test('Vortex starts on the subsequent round and its fixed roll damages the hero or every enemy',()=>{
  for(const [result,health,enemy]of [[1,8,100],[3,10,98]]){
    let f=use(win(start({vortex:1},{foes:[foe,foe]})),'vortex');f=endDestinyRound(f);
    assert.equal(f.hero.health,10);f=startDestinyRound(resume(f),0,rolls(result));
    assert.equal(f.hero.health,health);assert.deepEqual(f.opponents.map(o=>o.health),[enemy,enemy]);
    assert.equal(f.history.find(e=>e.type==='round-event').unmodifiable,true);
  }
});

test('Beguile restores one spent Speed ability without allowing a second Speed ability in the same round',()=>{
  let f=use(start({beguile:1,haste:1}),'haste');f=use(f,'beguile',{restore:'haste'});
  assert.throws(()=>use(f,'haste'),/category per round/);
  f=resolveDestinySpeed(rollDestinySpeed(f,rolls(6,5,4,1,2)));f=endDestinyRound(resolveDestinyDamage(rollDestinyDamage(f,rolls(2))));
  f=use(startDestinyRound(resume(f),0),'haste');assert.equal(f.turn.heroSpeedCount,3);
  assert.throws(()=>use(f,'beguile',{restore:'haste'}),/no uses left/);
});

test('Reaper heals from actual damage-score Health loss instead of overkill or damage dice abilities',()=>{
  let f=win(start({reaper:1},{hero:{brawn:20},foes:[{...foe,health:6},foe]}));
  f=resolveDestinyDamage(rollDestinyDamage(f,rolls(2)));assert.equal(f.turn.healthDamage,6);
  f=use(f,'reaper');assert.equal(f.hero.health,11);
});
