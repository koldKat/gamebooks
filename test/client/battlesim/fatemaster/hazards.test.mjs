import test from 'node:test';
import assert from 'node:assert/strict';
import {assignFatemasterDamage, attackFatemaster, resolveFatemasterFlameRound, resolveFatemasterHostileSave, startFatemasterFight, withdrawFatemaster} from '../../../../public/js/battlesim/engines/fatemaster/battle.js';
import {allocateFatemasterSpell, castFatemaster, resolveFatemasterSpell, resolveFatemasterSpellDice, resolveFatemasterSpellSave} from '../../../../public/js/battlesim/engines/fatemaster/spells.js';

const reload = f => JSON.parse(JSON.stringify(f));
const player = changes => ({name:'Player',strength:9,agility:9,power:8,damage:2,...changes});
const enemy = changes => ({name:'Opponent',strength:20,agility:20,power:5,damage:1,attackBonus:0,defenceBonus:3,...changes});
const rules = changes => ({response:'flame',flameDamage:1,flameOnFinal:'ask',...changes});
const start = (r = {}, p = {}, e = {}) => startFatemasterFight(player(p),[enemy(e)],rules(r));

test('repeat attacks share one physical round and only one flame damage at the round end',()=>{
  let fight=start();
  fight=attackFatemaster(reload(fight),'enemy-0',{total:12});
  assert.equal(fight.phase,'player');
  assert.equal(fight.round,1);
  assert.equal(fight.player.agility,9);
  fight=attackFatemaster(reload(fight),'enemy-0',{total:12});
  assert.equal(fight.phase,'player');
  fight=attackFatemaster(reload(fight),'enemy-0',{total:10});
  assert.equal(fight.pending.kind,'damage');
  assert.equal(fight.pending.source,'flame');
  assert.equal(fight.pending.amount,1);
  fight=assignFatemasterDamage(reload(fight),'agility');
  assert.equal(fight.player.agility,8);
  assert.equal(fight.round,2);
  assert.equal(fight.events.filter(e=>e.type==='enemy-attack').length,0);
  assert.equal(fight.events.filter(e=>e.source==='flame').length,1);
});

test('a missed round saves flame damage allocation before the separate paralysis defence',()=>{
  let fight=attackFatemaster(start({}, {power:4}),'enemy-0',{total:2});
  assert.equal(fight.pending.kind,'damage');
  fight=assignFatemasterDamage(reload(fight),'strength');
  assert.equal(fight.pending.kind,'hostile-save');
  assert.equal(fight.pending.effect,'paralysis');
  fight=resolveFatemasterHostileSave(reload(fight),{total:3});
  assert.equal(fight.player.power,3);
  assert.equal(fight.player.strength,8);
  assert.equal(fight.status,'fighting');
  assert.equal(fight.round,2);
});

test('failed hypnosis defence loses by paralysis without an invented damage roll or zeroed stats',()=>{
  let fight=attackFatemaster(start({}, {power:2}),'enemy-0',{total:2});
  fight=assignFatemasterDamage(fight,'agility');
  fight=resolveFatemasterHostileSave(reload(fight),{total:2});
  assert.equal(fight.status,'loss');
  assert.equal(fight.lossReason,'paralysis');
  assert.equal(fight.player.strength,9);
  assert.equal(fight.player.agility,8);
  assert.equal(fight.pending,null);
  assert.deepEqual(fight.queue,[]);
});

test('the final physical blow waits for an explicit saved flame-timing choice',()=>{
  const original=start({}, {damage:30}),before=JSON.stringify(original);
  let fight=attackFatemaster(original,'enemy-0',{total:12});
  assert.equal(fight.status,'fighting');
  assert.equal(fight.pending.kind,'flame-round');
  assert.throws(()=>resolveFatemasterFlameRound(fight,'yes'));
  fight=resolveFatemasterFlameRound(reload(fight),true);
  assert.equal(fight.pending.kind,'damage');
  fight=assignFatemasterDamage(reload(fight),'agility');
  assert.equal(fight.status,'win');
  assert.equal(fight.player.agility,8);
  assert.equal(JSON.stringify(original),before);
  assert.throws(()=>resolveFatemasterFlameRound(fight,true));
});

test('explicitly skipping final flame damage preserves the original pools and cannot charge twice',()=>{
  let fight=attackFatemaster(start({}, {damage:30}),'enemy-0',{total:12});
  fight=resolveFatemasterFlameRound(reload(fight),false);
  assert.equal(fight.status,'win');
  assert.equal(fight.player.agility,9);
  assert.equal(fight.player.strength,9);
  assert.equal(fight.events.filter(e=>e.type==='flame-final-choice').length,1);
});

test('an explicitly chosen final flame policy can resolve mutual unconsciousness as a player loss',()=>{
  let fight=attackFatemaster(start({flameOnFinal:'apply'}, {damage:30,strength:1}),'enemy-0',{total:12});
  assert.equal(fight.pending.kind,'damage');
  fight=assignFatemasterDamage(fight,'strength');
  assert.equal(fight.status,'loss');
  const skipped=attackFatemaster(start({flameOnFinal:'skip'}, {damage:30,strength:1}),'enemy-0',{total:12});
  assert.equal(skipped.status,'win');
  assert.throws(()=>start({flameOnFinal:undefined}));
});

test('casting has neither ordinary enemy attacks nor physical flame damage',()=>{
  let fight=castFatemaster(start(),'healing',{pool:'strength'});
  assert.equal(fight.pending.kind,'spell-resolve');
  fight=resolveFatemasterSpell(reload(fight));
  assert.equal(fight.player.power,7);
  assert.equal(fight.player.agility,9);
  assert.equal(fight.phase,'player');
  assert.equal(fight.events.filter(e=>e.type==='enemy-attack'||e.source==='flame').length,0);
});

test('a resisted hostile spell queues paralysis defence and retains the opponent equality Power cost',()=>{
  let fight=castFatemaster(start(),'bolt',{power:1,targetId:'enemy-0'});
  fight=resolveFatemasterSpell(fight);
  fight=resolveFatemasterSpellDice(reload(fight),{total:6});
  fight=resolveFatemasterSpellSave(reload(fight),{total:4});
  assert.equal(fight.opponents[0].power,4);
  assert.equal(fight.opponents[0].strength,20);
  assert.equal(fight.pending.kind,'hostile-save');
  fight=resolveFatemasterHostileSave(reload(fight),{total:1});
  assert.equal(fight.phase,'player');
  assert.equal(fight.player.power,7);
  assert.equal(fight.player.agility,9);
});

test('insufficient Slumber allocation counts as a failed spell while actual magical damage avoids hypnosis',()=>{
  let fight=castFatemaster(start(),'slumber');
  fight=resolveFatemasterSpell(fight);
  fight=resolveFatemasterSpellDice(fight,{total:3});
  fight=allocateFatemasterSpell(reload(fight),[]);
  assert.equal(fight.pending.kind,'hostile-save');
  let bolt=castFatemaster(start(),'bolt',{power:1,targetId:'enemy-0'});
  bolt=resolveFatemasterSpell(bolt);
  bolt=resolveFatemasterSpellDice(bolt,{total:2});
  bolt=resolveFatemasterSpellSave(reload(bolt),{total:6});
  assert.equal(bolt.opponents[0].strength,18);
  assert.equal(bolt.phase,'player');
  assert.equal(bolt.pending,null);
});

test('magic-defended withdrawal can succeed or fail independently of attack initiative',()=>{
  let fight=withdrawFatemaster(start({escape:{mode:'magic-save'}},{power:4}));
  assert.equal(fight.pending.kind,'hostile-save');
  fight=resolveFatemasterHostileSave(reload(fight),{total:3});
  assert.equal(fight.status,'withdrawn');
  assert.equal(fight.player.power,3);
  assert.equal(fight.opponents[0].strength,20);
  let failed=withdrawFatemaster(start({escape:{mode:'magic-save'}},{power:2}));
  failed=resolveFatemasterHostileSave(reload(failed),{total:6});
  assert.equal(failed.status,'loss');
  assert.equal(failed.lossReason,'paralysis');
});
