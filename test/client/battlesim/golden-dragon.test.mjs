import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeDragonEncounter,customDragonEncounter,startDragonFight,dragonAction,canDragonFlee,validateDragonFight}
  from '../../../public/js/battlesim/engines/golden-dragon/core.js';
import {createQuestState} from '../../../public/js/battlesim/engines/super-endless-quest/state.js';

const player = extra => ({name:'Player',hp:30,maxHp:30,psi:6,agility:6,rollModifier:0,...extra});
const chart = extra => ({name:'Skeleton',profiles:[{name:'Skeleton',hp:9}],canFlee:false,
  rows:[{min:2,max:6,playerDamage:3},{min:7,max:12,enemyDamage:3}],...extra});
const start = (encounter=chart(),hero=player()) => startDragonFight(hero,encounter);
const act = (fight,kind,extra={}) => dragonAction(fight,{kind,expectedRevision:fight.revision,...extra});
const roll = (fight,dice,target=0) => act(fight,'roll',{dice,target});

test('Undine wounds require a separate saved PSI roll and equality succeeds',()=>{
  const undine=chart({psiSaveOnWound:true,canFlee:true});
  const wounded=roll(start(undine),[1,2]);
  assert.equal(wounded.player.hp,27);assert.equal(wounded.player.psi,6);
  assert.equal(wounded.pendingPsiSave.round,1);assert.equal(wounded.round,1);
  const restored=JSON.parse(JSON.stringify(wounded));validateDragonFight(restored);
  assert.throws(()=>roll(restored,[6,6]),/PSI save/);assert.equal(canDragonFlee(restored),false);
  const safe=act(restored,'psiSave',{dice:[3,3]});assert.equal(safe.player.psi,6);assert.equal(safe.round,1);
  assert.equal(safe.pendingPsiSave,null);assert.equal(safe.events.at(-1).psiDamage,0);
  const failed=act(restored,'psiSave',{dice:[6,6]});assert.equal(failed.player.psi,5);
  assert.equal(failed.player.hp,27);assert.equal(failed.round,1);assert.equal(failed.status,'fighting');
  const fatal=act(roll(start(undine,player({psi:1})),[1,2]),'psiSave',{dice:[1,1]});
  assert.equal(fatal.player.psi,0);assert.equal(fatal.status,'loss');
  assert.throws(()=>act(safe,'psiSave',{dice:[3,3]}),/No pending/);
  assert.throws(()=>start(undine,player({psi:0})),/PSI/);
  assert.equal(roll(start(undine,player({hp:2})),[1,2]).pendingPsiSave,undefined);
  assert.equal(act(wounded,'cancel').pendingPsiSave,null);
  const bad=structuredClone(failed);bad.events.at(-1).psiDamage=0;assert.throws(()=>validateDragonFight(bad));
});
test('Chonchons fight in order, preserve fallen profiles on continuation and pause after seven rounds',()=>{
  const chonchons=chart({sequential:true,stopAfterRounds:7,profiles:[{name:'First',hp:6},{name:'Second',hp:6},{name:'Third',hp:6}]});
  let fight=start(chonchons);assert.throws(()=>roll(fight,[6,6],1),/in order/);
  fight=roll(roll(fight,[6,6]),[6,6]);assert.equal(fight.enemies[0].hp,0);
  assert.throws(()=>roll(fight,[6,6],2),/in order/);
  for(let i=0;i<5;i++)fight=roll(fight,[1,1],1);
  assert.equal(fight.status,'paused');assert.equal(fight.round,7);
  const continuation={...chonchons,stopAfterRounds:0,allowDefeatedOpponents:true,
    profiles:[{name:'First',hp:0},{name:'Second',hp:3},{name:'Third',hp:3}]};
  let later=start(continuation);later=roll(later,[6,6],1);later=roll(later,[6,6],2);
  assert.equal(later.status,'win');assert.equal(later.round,2);
  assert.throws(()=>start({...continuation,profiles:continuation.profiles.map(p=>({...p,hp:0}))}),/No surviving/);
  assert.throws(()=>start({...continuation,allowDefeatedOpponents:false}));
});
test('printed failed escape damage is distinct from combat-roll modifiers',()=>{
  for(const damage of [3,9,12]){
    const encounter=chart({canFlee:true,fleeDamage:damage});
    const fight=start(encounter,player({rollModifier:-2}));
    assert.equal(act(fight,'flee',{dice:[3,3]}).player.hp,30);
    const failed=act(fight,'flee',{dice:[4,3]});assert.equal(failed.player.hp,30-damage);
    assert.equal(failed.status,'fled');validateDragonFight(JSON.parse(JSON.stringify(failed)));
  }
  const legacy=start(chart({canFlee:true}));delete legacy.opponent.fleeDamage;
  assert.equal(act(legacy,'flee',{dice:[6,6]}).player.hp,27);
});
test('net, first-round and progressive modifiers apply to their printed rounds without clamping',()=>{
  let surprise=start(chart(),player({firstRoundModifier:-2}));
  surprise=roll(surprise,[4,4]);assert.equal(surprise.events.at(-1).total,6);
  surprise=roll(surprise,[4,4]);assert.equal(surprise.events.at(-1).total,8);
  let automaton=start(chart({profiles:[{name:'Automaton',hp:30}],stopAfterRounds:6}),player({progressiveRollBonus:true}));
  automaton=roll(automaton,[3,3]);assert.equal(automaton.events.at(-1).total,6);
  automaton=roll(automaton,[3,3]);assert.equal(automaton.events.at(-1).total,7);
  automaton=roll(automaton,[6,6]);assert.equal(automaton.unresolved.total,14);assert.equal(automaton.round,2);
  validateDragonFight(JSON.parse(JSON.stringify(automaton)));
  automaton=act(automaton,'adjudicate',{printedTotal:12});assert.equal(automaton.round,3);
  assert.equal(automaton.events.at(-1).manualRuling,true);
  for(let i=0;i<3;i++)automaton=roll(automaton,[1,1]);
  assert.equal(automaton.status,'paused');assert.equal(automaton.round,6);
});
test('chosen wound damage replaces the ordinary wound without altering incoming damage or stacking',()=>{
  for(const damage of [2,3,4]){
    let fight=start(chart(),player({woundDamage:damage}));
    fight=roll(fight,[4,4]);assert.equal(fight.enemies[0].hp,9-damage);
    fight=roll(fight,[1,1]);assert.equal(fight.player.hp,27);assert.equal(fight.events.at(-1).enemyDamage,0);
    validateDragonFight(JSON.parse(JSON.stringify(fight)));
  }
  assert.throws(()=>start(chart(),player({woundDamage:5})));
});

test('surrender ends combat after two wounding hits while preserving remaining enemy health',()=>{
  for (const hp of [8,9]) {
    let fight=start(chart({profiles:[{name:'Assailant',hp}],winAfterWoundingHits:2}));
    fight=roll(fight,[4,4]);assert.equal(fight.status,'fighting');
    fight=roll(fight,[1,2]);assert.equal(fight.hitsDealt,1);
    fight=roll(fight,[4,4]);assert.equal(fight.status,'win');
    assert.equal(fight.enemies[0].hp,hp-6);assert.equal(fight.hitsDealt,2);
  }
});
test('a first defeated foe can end a group encounter without killing the survivor',()=>{
  const encounter=chart({profiles:[{name:'Leon',hp:6},{name:'Pickpocket',hp:6}],winAfterDefeated:1,loseBelowHp:6});
  let fight=roll(start(encounter),[4,4],1);
  fight=roll(fight,[4,4],1);assert.equal(fight.status,'win');assert.equal(fight.enemies[0].hp,6);
  const overpowered=roll(start(encounter,player({hp:8})),[1,2]);
  assert.equal(overpowered.player.hp,5);assert.equal(overpowered.status,'loss');
  assert.equal(roll(start(encounter,player({hp:9})),[1,2]).status,'fighting');
});
test('the first jaguar or tomb robber pauses at defeat rather than awarding a whole encounter victory',()=>{
  for (const hp of [8,9]) {
    let fight=start(chart({profiles:[{name:'First opponent',hp}],stopAfterDefeated:1}));
    while (fight.status==='fighting') fight=roll(fight,[4,4]);
    assert.equal(fight.status,'paused');assert.ok(fight.enemies[0].hp<=0);
  }
});
test('a worm stage transition pauses without invented damage, preserving both health values',()=>{
  const fight=roll(start(chart({rows:[{min:2,max:2,loss:true},{min:3,max:5,pause:true},{min:6,max:12,enemyDamage:3}]})),[1,2]);
  assert.equal(fight.status,'paused');assert.equal(fight.player.hp,30);assert.equal(fight.enemies[0].hp,9);
});
test('immobilizing a crocodile or stopping a machine wins without inventing wounds',()=>{
  const encounter=chart({rows:[{min:2,max:6,playerDamage:3},{min:7,max:10,enemyDamage:3},{min:11,max:12,win:true}]});
  const fight=roll(start(encounter),[6,6]);assert.equal(fight.status,'win');assert.equal(fight.enemies[0].hp,9);
  const lethal=chart({...encounter,rows:[{min:2,max:10,enemyDamage:3},{min:11,max:12,win:true,playerDamage:30}]});
  assert.equal(roll(start(lethal),[6,6]).status,'loss');
});
test('new combat outcomes reject invalid or conflicting rules and keep old saved fights valid',()=>{
  assert.throws(()=>normalizeDragonEncounter(chart({winAfterWoundingHits:-1})),/Invalid/);
  assert.throws(()=>normalizeDragonEncounter(chart({rows:[{min:2,max:12,win:true,pause:true}]})),/Conflicting/);
  assert.throws(()=>normalizeDragonEncounter(chart({rows:[{min:2,max:12,pause:1}]})),/Invalid/);
  const legacy=start();delete legacy.hitsDealt;
  for (const key of ['winAfterDefeated','winAfterWoundingHits','loseBelowHp']) delete legacy.opponent[key];
  assert.equal(validateDragonFight(legacy),legacy);assert.equal(roll(legacy,[4,4]).hitsDealt,1);
});

test('every physical two-dice result follows the printed inclusive chart without a second attack roll',()=>{
  for(let a=1;a<=6;a++)for(let b=1;b<=6;b++){
    const original=start(),before=structuredClone(original),fight=roll(original,[a,b]);
    assert.equal(fight.player.hp,a+b<=6?27:30);
    assert.equal(fight.enemies[0].hp,a+b<=6?9:6);
    assert.equal(fight.round,1);assert.equal(fight.events.length,1);
    assert.deepEqual(original,before);
  }
  let calls=0;const fight=dragonAction(start(),{kind:'roll',expectedRevision:0},()=>{calls++;return .99;});
  assert.equal(calls,2);assert.equal(fight.enemies[0].hp,6);
});
test('ordinary custom fights work without a roster, including more than one opponent',()=>{
  const encounter=customDragonEncounter([{name:'First',hp:3},{name:'Second',hp:6}],{playerHitThrough:5,enemyDamage:3});
  let fight=roll(start(encounter),[3,3],1);assert.equal(fight.enemies[1].hp,3);
  fight=roll(fight,[3,3],0);assert.equal(fight.status,'fighting');
  assert.throws(()=>roll(fight,[3,3],0),/defeated/);
  fight=roll(fight,[3,3],1);assert.equal(fight.status,'win');
  assert.throws(()=>roll(fight,[1,1]),/Stale/);
});
test('simultaneous Bronze Warrior damage and Wyrd PSI loss preserve the distinct printed effects',()=>{
  const bronze=chart({rows:[{min:2,max:6,playerDamage:4},{min:7,max:9,playerDamage:1,enemyDamage:3},{min:10,max:12,enemyDamage:3}]});
  const hit=roll(start(bronze),[4,4]);assert.equal(hit.player.hp,29);assert.equal(hit.enemies[0].hp,6);
  const wyrd=chart({rows:[{min:2,max:3,playerDamage:4,psiDamage:1},{min:4,max:7,playerDamage:3},{min:8,max:12,enemyDamage:3}]});
  const drained=roll(start(wyrd,player({psi:0})),[1,1]);assert.equal(drained.player.hp,26);
  assert.equal(drained.player.psi,-1);assert.equal(drained.status,'fighting');
});
test('Basilisk petrification and its second venom bite end the encounter even with VIGOUR left',()=>{
  const basilisk=chart({profiles:[{name:'Basilisk',hp:12}],venomLimit:2,
    rows:[{min:2,max:2,loss:true},{min:3,max:6,playerDamage:3},{min:7,max:7,enemyDamage:3,venomBites:1},{min:8,max:12,enemyDamage:3}]});
  const stone=roll(start(basilisk),[1,1]);assert.equal(stone.status,'loss');assert.equal(stone.player.hp,30);
  let fight=roll(start(basilisk),[3,4]);assert.equal(fight.venomBites,1);assert.equal(fight.status,'fighting');
  fight=roll(fight,[3,4]);assert.equal(fight.status,'loss');assert.equal(fight.venomBites,2);assert.equal(fight.enemies[0].hp,6);
});
test('the gatekeeper paralyzes on the fourth hit and spider poison is an immediate defeat',()=>{
  const ghoul=chart({paralysisLimit:4,rows:[{min:2,max:6,playerDamage:3,paralysisHits:1},{min:7,max:12,enemyDamage:3}]});
  let fight=start(ghoul);for(let i=0;i<4;i++)fight=roll(fight,[1,1]);
  assert.equal(fight.player.hp,18);assert.equal(fight.status,'loss');assert.equal(fight.paralysisHits,4);
  const spider=chart({rows:[{min:2,max:2,loss:true},{min:3,max:5,playerDamage:3},{min:6,max:12,enemyDamage:3}]});
  assert.equal(roll(start(spider),[1,1]).status,'loss');
});
test('rat wounds are counted within this encounter for the reader poison check, not inferred from starting VIGOUR',()=>{
  const rat=chart({profiles:[{name:'Giant Rat',hp:12}],rows:[{min:2,max:5,playerDamage:3},{min:6,max:12,enemyDamage:3}]});
  let clean=start(rat,player({hp:15})),bitten=roll(start(rat),[1,1]);
  for(let i=0;i<4;i++){clean=roll(clean,[6,6]);bitten=roll(bitten,[6,6]);}
  assert.equal(clean.status,'win');assert.equal(clean.hitsTaken,0);
  assert.equal(bitten.status,'win');assert.equal(bitten.hitsTaken,1);
});
test('Ruffian and Troll stages pause after one chosen opponent falls, retaining every survivor HP',()=>{
  const group=chart({profiles:[{name:'First Ruffian',hp:6},{name:'Second Ruffian',hp:9},{name:'Third Ruffian',hp:9}],stopAfterDefeated:1,
    rows:[{min:2,max:3,playerDamage:9},{min:4,max:5,playerDamage:6},{min:6,max:7,playerDamage:3},{min:8,max:12,enemyDamage:3}]});
  let fight=roll(start(group),[4,4],1);fight=roll(fight,[4,4],0);fight=roll(fight,[4,4],0);
  assert.equal(fight.status,'paused');assert.deepEqual(fight.enemies.map(e=>e.hp),[0,6,9]);
  assert.throws(()=>roll(fight,[4,4],2),/Stale/);
});
test('Darkrobe stages stop after two rounds, without reading sections or awarding a full victory',()=>{
  const darkrobe=chart({profiles:[{name:'Arkayn Darkrobe',hp:18}],stopAfterRounds:2});
  let fight=roll(start(darkrobe),[6,6]);fight=roll(fight,[6,6]);
  assert.equal(fight.status,'paused');assert.equal(fight.enemies[0].hp,12);assert.equal(fight.round,2);
  assert.equal(Object.hasOwn(fight,'currentSection'),false);
});
test('four crushing branches count severed branches instead of invented enemy VIGOUR',()=>{
  const branches=chart({profiles:[{name:'Crushing branches',hp:4,unit:'branches'}],rows:[{min:2,max:4,playerDamage:6},
    {min:5,max:7,playerDamage:3},{min:8,max:10,enemyDamage:1},{min:11,max:12,enemyDamage:2}]});
  let fight=roll(start(branches),[6,6]);assert.equal(fight.enemies[0].hp,2);
  fight=roll(fight,[6,6]);assert.equal(fight.status,'win');assert.equal(fight.opponent.profiles[0].unit,'branches');
});
test('escaping checks AGILITY with equality safe, three VIGOUR on failure, and the Werewolf delay',()=>{
  const wolf=chart({canFlee:true,fleeAfterRounds:3});let fight=start(wolf);
  for(let i=0;i<3;i++){assert.equal(canDragonFlee(fight),false);fight=roll(fight,[1,1]);}
  assert.equal(canDragonFlee(fight),true);
  const safe=act(fight,'flee',{dice:[3,3]});assert.equal(safe.status,'fled');assert.equal(safe.player.hp,21);
  const hurt=act(fight,'flee',{dice:[4,3]});assert.equal(hurt.player.hp,18);assert.equal(hurt.status,'fled');
  assert.throws(()=>act(start(),'flee',{dice:[1,1]}),/Cannot flee/);
  const dead=act(start(chart({canFlee:true}),player({hp:2})),'flee',{dice:[6,6]});assert.equal(dead.status,'loss');
});
test('Gauntlet totals outside the original chart need a recorded explicit ruling, never a silent clamp',()=>{
  let fight=roll(start(chart(),player({rollModifier:-1})),[1,1]);
  assert.equal(fight.unresolved.total,1);assert.equal(fight.round,0);assert.equal(fight.player.hp,30);
  assert.throws(()=>roll(fight,[6,6]),/pending ruling/);
  assert.throws(()=>act(fight,'flee',{dice:[1,1]}),/Cannot flee/);
  assert.throws(()=>act(fight,'adjudicate',{printedTotal:1}));
  fight=act(fight,'adjudicate',{printedTotal:2});assert.equal(fight.player.hp,27);
  assert.equal(fight.events.at(-1).manualRuling,true);assert.equal(fight.unresolved,null);
});
test('bad charts, dice, saved state and stale actions are rejected without changing the fight',()=>{
  assert.throws(()=>normalizeDragonEncounter(chart({rows:[{min:3,max:12,enemyDamage:3}]})));
  assert.throws(()=>normalizeDragonEncounter(chart({rows:[{min:2,max:5},{min:5,max:12}]})));
  assert.throws(()=>start(chart(),player({hp:0})));assert.throws(()=>start(chart(),player({hp:31})));
  for(const dice of [[],[1],[1,2,3],[0,2],[7,2],['1',2],[1.5,2]])assert.throws(()=>roll(start(),dice));
  for(const value of [-.1,1,NaN,Infinity])assert.throws(()=>dragonAction(start(),{kind:'roll',expectedRevision:0},()=>value));
  const fight=roll(start(),[6,6]);assert.throws(()=>dragonAction(fight,{kind:'roll',expectedRevision:0,dice:[6,6]}));
  const broken=structuredClone(fight);broken.events[0].enemyDamage=999;assert.throws(()=>validateDragonFight(broken));
});
test('canceling does not roll dice, and long fights retain a bounded journal',()=>{
  const cancelled=dragonAction(start(),{kind:'cancel',expectedRevision:0},()=>{throw Error('Unexpected dice');});
  assert.equal(cancelled.status,'cancelled');
  let fight=start(chart({profiles:[{name:'Opponent',hp:10000}]}));
  for(let i=0;i<250;i++)fight=roll(fight,[6,6]);
  assert.equal(fight.events.length,100);assert.equal(fight.round,250);assert.equal(fight.revision,250);
});
test('run storage records paused stages once, protects unrelated state, and rejects replaced-run callbacks',()=>{
  const run={path:[1],inventory:[{name:'Kept'}],sim349:{kept:true}};let current=run,bookId=388,saves=0;
  const store=createQuestState(()=>({run:current,bookId,definition:{id:388,stateKey:'sim388'},saveState:()=>saves++}),{validateFight:validateDragonFight});
  store.update(state=>{state.fight=start(chart({stopAfterRounds:1}));return state;});
  const token=store.snapshot();store.update(state=>{state.fight=roll(state.fight,[6,6]);return state;},token);
  assert.equal(run.sim388.history.length,1);assert.equal(run.sim388.history[0].outcome,'paused');
  store.update(state=>state);assert.equal(run.sim388.history.length,1);assert.equal(saves,3);
  assert.equal(store.update(state=>state,token),false);const fresh=store.snapshot();current={path:[1]};
  assert.equal(store.update(state=>state,fresh),false);current=run;bookId=389;assert.equal(store.update(state=>state,fresh),false);
  assert.deepEqual(run.path,[1]);assert.deepEqual(run.inventory,[{name:'Kept'}]);assert.deepEqual(run.sim349,{kept:true});
});
