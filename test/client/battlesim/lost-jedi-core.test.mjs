import test from 'node:test';
import assert from 'node:assert/strict';
import {startFight,currentTurn,beginAttack,confirmAttack,spendTurn,beginTargetRoll,confirmTarget} from '../../../public/js/battlesim/engines/lost-jedi/core.js';

const player=()=>({blaster:3,lightsabre:3,technical:3,jediPoints:5,maxJediPoints:6,weapon:'blaster',ready:true});
const group=(extra={})=>({name:'Test opponent',rangedSkill:1,closeSkill:1,target:7,...extra});
const encounter=(rules={},actors=[group()])=>({section:'test',name:'Test encounter',rules:{range:'range',...rules},actors});
const start=(rules={},actors,options={})=>startFight({encounter:encounter(rules,actors),player:player(),...options});
const attack=(fight,target,die,adjustment=0,catalog=[])=>confirmAttack(beginAttack(fight,target,die),adjustment,catalog);
const turn=fight=>currentTurn(fight).actor;
const enemy=fight=>fight.actors.find(actor=>actor.team!=='rebels');

test('a pending strike cannot damage anyone or spend points before explicit confirmation',()=>{
  const original=start(),pending=beginAttack(original,enemy(original).id,3);
  assert.equal(original.pending,null);
  assert.equal(pending.jediPoints,5);
  assert.equal(enemy(pending).defeated,false);
  assert.throws(()=>beginAttack(pending,enemy(pending).id,6));
  assert.throws(()=>confirmAttack(pending,6));
  const finished=confirmAttack(pending,1);
  assert.equal(finished.outcome,'win');assert.equal(finished.jediPoints,4);
  assert.equal(finished.events.at(-1).target,enemy(finished).id);
  assert.equal(finished.events.at(-1).threshold,7,'report retains the target identity separately from its hit threshold');
  assert.equal(pending.pending.die,3,'saved pending roll survives failed or repeated previews');
  assert.throws(()=>confirmAttack(finished,0));
});

test('each living enemy takes a turn; a one-hit casualty never attacks',()=>{
  let f=start({},[group({count:3})]);
  f=attack(f,enemy(f).id,4);
  assert.equal(f.outcome,null);
  assert.equal(turn(f).id,'enemy-0-1');
  f=attack(f,'havet',6,-1);
  assert.equal(turn(f).id,'enemy-0-2');
  f=attack(f,'havet',1);
  assert.equal(f.round,2);assert.equal(turn(f).id,'havet');assert.equal(f.jediPoints,4);
  f=attack(f,'enemy-0-1',1);
  f=attack(f,'havet',6);
  assert.equal(f.outcome,'loss');
});

test('drawing a bagged weapon costs an exposed turn and range changes cannot also attack',()=>{
  let f=start({},undefined,{player:{...player(),ready:false}});
  assert.throws(()=>beginAttack(f,enemy(f).id,6));
  f=spendTurn(f,'draw');assert.equal(turn(f).team,'imperial');assert.equal(f.player.ready,true);
  f=attack(f,'havet',1);
  f=spendTurn(f,'move',{range:'close',weapon:'lightsabre',ready:true});
  assert.equal(f.range,'close');assert.equal(turn(f).team,'imperial');
  f=attack(f,'havet',1);
  f=attack(f,enemy(f).id,3);
  assert.equal(f.outcome,'win','lightsabre adds one to its roll');
  assert.throws(()=>spendTurn(start({rangeLocked:true}),'move',{range:'close'}));
});

test('round limits yield a phase result and do not fabricate wins',()=>{
  let f=start({roundLimit:1});
  f=attack(f,enemy(f).id,1);f=attack(f,'havet',1);
  assert.equal(f.outcome,'phase');assert.equal(f.phaseReason,'round-limit');
  assert.equal(f.round,1);assert.equal(enemy(f).defeated,false);
});

test('surviving guards are retained and reinforcements enter after the stated round',()=>{
  const reinforcements={section:'reinforcement',actors:[group({name:'New soldier',rangedSkill:2})],rules:{reinforcements:true}};
  let f=start({reinforcementAfterRound:1,reinforcementSection:'reinforcement'},[group({count:2})]);
  f=attack(f,'enemy-0-0',4);
  f=attack(f,'havet',1,0,[reinforcements]);
  assert.equal(f.round,2);assert.equal(f.actors.length,4);
  assert.equal(f.actors.find(actor=>actor.id==='enemy-0-0').defeated,true);
  assert.equal(f.actors.find(actor=>actor.id==='enemy-0-1').defeated,false);
  assert.equal(f.actors.at(-1).name,'New soldier');
  assert.equal(f.actors.at(-1).turns,0);
});

test('Research Lab technicians arrive on round three, with no fabricated prior attacks',()=>{
  let f=start({reinforcementsAtRound:3,reinforcements:[group({name:'Technician',count:3})]});
  for(let i=0;i<2;i++){f=attack(f,enemy(f).id,1);f=attack(f,'havet',1);}
  assert.equal(f.round,3);assert.equal(f.actors.filter(actor=>actor.name==='Technician').length,3);
  assert.ok(f.actors.filter(actor=>actor.name==='Technician').every(actor=>actor.turns===0));
});

test('the Blue Zone officer spends his first ranged turn drawing his weapon',()=>{
  let f=start({},[group({skipFirstRangedTurn:true})]);
  f=attack(f,enemy(f).id,1);
  assert.throws(()=>beginAttack(f,'havet',6));
  f=spendTurn(f,'wait');assert.equal(f.round,2);
  f=attack(f,enemy(f).id,1);f=attack(f,'havet',6);
  assert.equal(f.outcome,'loss');
});

test('a surviving scout mounts rather than firing, retaining the mounted range restriction',()=>{
  let f=start({mixedRanges:true},[group({range:'close',mountAfterRound:1,
    mountedProfile:{range:'range',rangedSkill:3,closeSkill:3,target:10,rangeLocked:true}})]);
  f=attack(f,enemy(f).id,1);
  assert.throws(()=>beginAttack(f,'havet',1));
  f=spendTurn(f,'mount');
  assert.equal(enemy(f).range,'range');assert.equal(enemy(f).target,10);assert.equal(f.round,2);
  assert.throws(()=>spendTurn(f,'move',{range:'close'}));
});

test('Wookiee fights after Fett, draws his fire and needs a die roll of six',()=>{
  let f=start({range:'close',order:['havet','enemy','ally'],enemyTargetOrder:['ally','havet'],
    allies:[{name:'Wookiee',rangedSkill:0,closeSkill:4,target:7}]},
  [group({tag:'fett',closeSkill:3,target:10})]);
  f=attack(f,enemy(f).id,1);
  assert.throws(()=>beginAttack(f,'havet',1));
  const ally=f.actors.find(actor=>actor.team==='rebels' && actor.id!=='havet');
  f=attack(f,ally.id,1);assert.equal(turn(f).id,ally.id);
  f=attack(f,enemy(f).id,5);assert.equal(enemy(f).defeated,false);
  f=attack(f,enemy(f).id,1);f=attack(f,ally.id,1);f=attack(f,enemy(f).id,6);
  assert.equal(f.outcome,'win');
});

test('Fett’s second opening shot ends its phase immediately; player shots stop before enemy second shot',()=>{
  let f=start({enemyFirst:true,enemyShotLimit:2});
  f=attack(f,'havet',1);f=attack(f,enemy(f).id,1);f=attack(f,'havet',1);
  assert.equal(f.outcome,'phase');assert.equal(f.actors.find(actor=>actor.id==='havet').shots,1);
  f=start({playerShotLimit:2,enemyShotLimit:1,phaseEndsBeforeEnemySecondShot:true});
  f=attack(f,enemy(f).id,1);f=attack(f,'havet',1);f=attack(f,enemy(f).id,1);
  assert.equal(f.outcome,'phase');assert.equal(enemy(f).shots,1);
});

test('three-way target dice and Jedi adjustments apply before the first-hit phase ends',()=>{
  let f=start({rangeLocked:true,order:['diamond','fett','havet'],firstHitEndsPhase:true,
    diamondTarget:'fett',fettTargetDie:{havet:[1,2,3],diamond:[4,5,6]}},
  [group({name:'Fett',tag:'fett',team:'fett',rangedSkill:4,target:10}),
    group({name:'Diamond',tag:'diamond',team:'diamond',rangedSkill:4,target:8})]);
  f=attack(f,'enemy-0-0',1);
  assert.equal(currentTurn(f).requiresTargetRoll,true);
  assert.throws(()=>beginAttack(f,'havet',1));
  f=confirmTarget(beginTargetRoll(f,3),1,'enemy-1-0');
  assert.equal(f.jediPoints,4);assert.throws(()=>beginAttack(f,'havet',1));
  f=attack(f,'enemy-1-0',4);
  assert.equal(f.outcome,'phase');assert.equal(f.phaseReason,'first-hit');
  assert.equal(f.actors.find(actor=>actor.id==='havet').defeated,false);
});

test('Diamond’s second third-party turn is a range move, not another shot',()=>{
  let f=start({thirdPartyOnly:true,order:['diamond','fett'],diamondMovesCloseOnSecondTurnIfFirstMiss:true},
  [group({tag:'fett',team:'fett',rangedSkill:4,closeSkill:3,target:10}),
    group({tag:'diamond',team:'diamond',rangedSkill:4,closeSkill:6,target:8})]);
  assert.equal(turn(f).tag,'diamond');
  f=attack(f,'enemy-0-0',1);f=attack(f,'enemy-1-0',1);
  assert.throws(()=>beginAttack(f,'enemy-0-0',1));
  f=spendTurn(f,'move');assert.equal(f.range,'close');assert.equal(turn(f).tag,'fett');
});

test('first-action phases allow moving but end before an enemy can attack',()=>{
  const f=spendTurn(start({playerOnly:true,actionLimit:1}),'move',{range:'close'});
  assert.equal(f.outcome,'phase');assert.equal(f.actions,1);assert.equal(enemy(f).turns,0);
});

test('Redemptor ammo is spent only on confirmed shots and cannot be reset by previewing',()=>{
  let f=start({},undefined,{player:{...player(),weapon:'redemptor',ammo:1}});
  const pending=beginAttack(f,enemy(f).id,1);assert.equal(pending.player.ammo,1);
  f=confirmAttack(pending);assert.equal(f.player.ammo,0);f=attack(f,'havet',1);
  assert.throws(()=>beginAttack(f,enemy(f).id,1));
});

test('wounded opponent modifiers come from the catalog and keep armour and timing intact',()=>{
  const args={encounter:encounter({optionalWoundedProfile:'profile',roundLimit:2},[group({tag:'fett',target:10})]),
    player:player(),woundedFett:true};
  assert.throws(()=>startFight(args));
  const f=startFight({...args,woundedProfile:{rangedSkill:3,closeSkill:2}});
  assert.equal(enemy(f).rangedSkill,3);assert.equal(enemy(f).closeSkill,2);
  assert.equal(enemy(f).target,10);assert.equal(f.rules.roundLimit,2);
});

test('indoor escape exposes Havet for two rounds, prevents shooting and awards no win',()=>{
  let f=spendTurn(start({escapeIndoors:{exposedRounds:2,playerMayAttack:false}}),'escape');
  f=attack(f,'havet',1);
  assert.equal(f.outcome,null);assert.throws(()=>beginAttack(f,enemy(f).id,1));
  f=spendTurn(f,'wait');f=attack(f,'havet',1);
  assert.equal(f.outcome,'phase');assert.equal(f.phaseReason,'escape-exposure-complete');
  assert.equal(enemy(f).defeated,false);
});
