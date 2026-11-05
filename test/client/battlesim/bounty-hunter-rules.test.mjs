import test from 'node:test';
import assert from 'node:assert/strict';
import {startFight,currentTurn,beginAttack,confirmAttack,spendTurn,beginTargetRoll,confirmTarget} from '../../../public/js/battlesim/engines/lost-jedi/core.js';
import {continueFight,beginWeaponGrab,confirmWeaponGrab,joinFight} from '../../../public/js/battlesim/engines/lost-jedi/combat-phases.js';
import {attackProfile} from '../../../public/js/battlesim/engines/lost-jedi/targeting.js';
import {weaponAttack} from '../../../public/js/battlesim/engines/lost-jedi/math.js';

const player={blaster:3,lightsabre:3,technical:2,jediPoints:10,maxJediPoints:10,weapon:'blaster',ready:true};
const guard=(count=1,extra={})=>({name:'Guard',count,rangedSkill:1,closeSkill:1,target:7,...extra});
const start=(rules={},actors=[guard()],options={})=>startFight({encounter:{section:'test',name:'Test fight',rules:{range:'range',...rules},actors},player,...options});
const hit=(f,id,die=1,adjustment=0)=>confirmAttack(beginAttack(f,id,die),adjustment);
const enemy=f=>f.actors.find(a=>a.team!=='rebels'&&!a.defeated);
function missRound(f){const round=f.round;while(f.round===round&&!f.outcome){const a=currentTurn(f).actor,target=currentTurn(f).targets[0];f=hit(f,target.id);}return f;}

test('E-Web acquisition costs an exposed turn and then permits three separate shots',()=>{
  let f=start({ewebAvailable:true},[guard(4)]);
  f=spendTurn(f,'eweb');assert.equal(f.player.weapon,'eweb');assert.notEqual(currentTurn(f).actor.id,'havet');
  while(currentTurn(f).actor.id!=='havet')f=hit(f,'havet');
  f=hit(f,enemy(f).id,4);assert.equal(currentTurn(f).actor.id,'havet');
  f=hit(f,enemy(f).id,4);assert.equal(currentTurn(f).actor.id,'havet');
  f=hit(f,enemy(f).id,4);assert.notEqual(currentTurn(f).actor.id,'havet');
  assert.equal(f.actors.filter(a=>a.defeated).length,3);
});

test('prisoners seize a blaster without killing its guard and both groups join immediately',()=>{
  let f=start({range:'close',forcedPlayerWeapon:'unarmed',captureWeaponsOnUnarmedHit:true,
    prisonerJoinOnPlayerCapture:{enemies:[guard(3)],allies:[guard(8,{name:'Prisoner',weapon:'unarmed',armedSkill:2})]}},[guard(3)]);
  const originalGuard=enemy(f).id;f=hit(f,originalGuard,6);
  assert.equal(f.player.weapon,'blaster');assert.equal(f.actors.find(a=>a.id===originalGuard).defeated,false);
  assert.equal(f.actors.find(a=>a.id===originalGuard).weapon,'unarmed');
  assert.equal(f.actors.length,15);assert.equal(f.queue.length,14);
  assert.equal(f.prisonersJoined,true);assert.equal(f.outcome,null);
});

test('a crewman hit dislodges Havet from the gun rack and arms every surviving crewman',()=>{
  let f=start({blockGunRackAvailable:true},[guard(3,{tag:'gun-crew',rangedSkill:2,closeSkill:2})]);
  f=spendTurn(f,'blockGunRack');assert.equal(f.range,'close');
  assert.ok(f.actors.filter(a=>a.tag==='gun-crew').every(a=>a.closeSkill===1));
  f=hit(f,'havet',6);
  assert.equal(f.outcome,null);assert.equal(f.actors[0].defeated,false);
  assert.ok(f.actors.filter(a=>a.tag==='gun-crew').every(a=>a.closeSkill===2&&a.weapon==='blaster'));
});

test('bunker partial scores end the phase without inventing a defeated Fett',()=>{
  let f=start({playerScorePhase:{scores:[7,8],readerSection:295}},[guard(1,{name:'Fett',target:9})]);
  f=hit(f,enemy(f).id,4);
  assert.equal(f.outcome,'phase');assert.equal(f.readerSection,295);assert.equal(enemy(f).defeated,false);
});

test('reinforcements arrive after rounds two and four and retain earlier survivors',()=>{
  const rules={reinforcementWaves:[{afterRound:2,actors:[guard(3)]},{afterRound:4,actors:[guard(3)]}]};
  let f=start(rules,[guard(4)]);
  f=missRound(f);assert.equal(f.actors.length,5);
  f=missRound(f);assert.equal(f.actors.length,8);
  f=missRound(f);assert.equal(f.actors.length,8);
  f=missRound(f);assert.equal(f.actors.length,11);
  f=missRound(f);assert.equal(f.actors.length,11);assert.deepEqual(f.completedWaves,[0,1]);
});

test('desert heat, lightsabre fear and cover retain their distinct printed effects',()=>{
  let f=start({range:'close',desertWeaponModifiers:true},[guard(1,{rangedSkill:2,closeSkill:2})]);
  assert.equal(attackProfile(f,f.actors[0],enemy(f)).skill,0);
  f.player.weapon='lightsabre';assert.equal(attackProfile(f,enemy(f),f.actors[0]).skill,1);
  assert.equal(attackProfile(f,f.actors[0],enemy(f)).skill,3);
  assert.equal(weaponAttack({...player,weapon:'rifle',range:'range',target:8,armoured:false}).target,8);
  assert.equal(weaponAttack({...player,weapon:'rifle',range:'range',target:9}).target,8);
});

test('Fett uses the flame projector during the exposed move and wrist lasers thereafter',()=>{
  let f=start({fettHeavyWeapons:{rangedTarget:5,movingCloseTarget:4,closeTarget:7}},[guard(1,{tag:'fett',rangedSkill:3,closeSkill:3})]);
  assert.equal(attackProfile(f,enemy(f),f.actors[0]).target,5);
  f=spendTurn(f,'move',{range:'close',weapon:'lightsabre',ready:true});
  assert.equal(attackProfile(f,enemy(f),f.actors[0]).target,4);
  f=hit(f,'havet',1,-1);assert.equal(f.round,2);
  assert.equal(attackProfile(f,enemy(f),f.actors[0]).target,7);
  assert.equal(weaponAttack({...player,weapon:'force-pike',range:'close',target:7}).skill,1);
});

test('drawing the officer weapon costs a turn even Up Close',()=>{
  let f=start({range:'close',enemyFirst:true},[guard(1,{skipFirstTurn:true})]);
  assert.throws(()=>beginAttack(f,'havet',6),/spend this turn/);
  f=spendTurn(f,'wait');assert.equal(currentTurn(f).actor.id,'havet');
});

test('the jail counterattack retains casualties, current Jedi Points and surviving Rebels',()=>{
  let f=start({roundLimit:1,allies:[guard(1,{name:'Rebel'})]},[guard(2)]);
  f.section='524';f=hit(f,enemy(f).id,4);f=hit(f,'havet');
  f=hit(f,enemy(f).id,1);
  assert.equal(f.outcome,'phase');
  const next={section:'534',name:'Counterattack',actors:[guard(6,{rangedSkill:2,closeSkill:2})],
    rules:{range:'range',continuationOf:'524',survivingEnemyProfile:{rangedSkill:2,closeSkill:2,target:7}}};
  const continued=continueFight(f,next);
  assert.equal(continued.round,2);assert.equal(continued.actors.length,10);
  assert.equal(continued.actors.find(a=>a.id==='enemy-0-0').defeated,true);
  assert.equal(continued.actors.find(a=>a.id==='enemy-0-1').rangedSkill,2);
  assert.equal(continued.jediPoints,f.jediPoints);assert.equal(continued.outcome,null);
  assert.equal(continued.rules.roundLimit,undefined);
});

test('directly entering the jail counterattack requires explicit survivor counts',()=>{
  const rules={continuationOf:'524',continuationSurvivors:{guards:{...guard(),maxCount:6},rebels:{...guard(),maxCount:3}}};
  assert.throws(()=>start(rules,[guard(6)]),/Surviving guards/);
  const f=start(rules,[guard(6)],{survivingGuards:2,survivingRebels:1});
  assert.equal(f.actors.length,10);assert.equal(f.actors.filter(a=>a.team==='rebels').length,2);
});

test('seizing the launcher spends only confirmed points and uses the exact comparison',()=>{
  const rules={weaponGrabTest:true,weaponGrabDestinations:{equal:181,greater:199,less:210}};
  const f=start(rules);
  const pending=beginWeaponGrab(f,3,3);assert.equal(pending.jediPoints,10);
  const equal=confirmWeaponGrab(pending);assert.equal(equal.readerSection,181);assert.equal(equal.jediPoints,7);
  assert.equal(equal.player.weapon,'dart-launcher');assert.equal(equal.outcome,'phase');
  assert.equal(confirmWeaponGrab(beginWeaponGrab(f,4,3)).readerSection,199);
  assert.equal(confirmWeaponGrab(beginWeaponGrab(f,2,3)).readerSection,210);
  const adjusted=confirmWeaponGrab(beginWeaponGrab(f,3,4),-1);
  assert.equal(adjusted.readerSection,181);assert.equal(adjusted.jediPoints,6);
  assert.equal(f.jediPoints,10);
});

test('observers influence NPC rolls, then explicitly join a side and draw their weapon',()=>{
  let f=start({chooseParticipation:true,joinMustDraw:true,randomEnemyTargets:true,order:['pilliask','vain','havet']},
    [guard(1,{name:'Pilliask',tag:'pilliask',team:'pilliask'}),guard(1,{name:'Vain',tag:'vain',team:'vain'})]);
  assert.equal(f.rules.thirdPartyOnly,true);assert.ok(!f.queue.includes('havet'));
  assert.ok(currentTurn(f).targets.every(a=>a.id!=='havet'));
  f=joinFight(f,'vain');assert.equal(f.rules.thirdPartyOnly,false);assert.equal(f.player.ready,false);
  assert.ok(f.queue.includes('havet'));assert.equal(f.actors.find(a=>a.tag==='vain').team,'rebels');
  assert.equal(currentTurn(f).requiresTargetRoll,true);
  f=beginTargetRoll(f,1);const target=currentTurn(f).targets[0].id;
  f=confirmTarget(f,0,target);assert.equal(f.selectedTargetId,target);
  f=hit(f,target,1);assert.equal(f.outcome,null);
});
