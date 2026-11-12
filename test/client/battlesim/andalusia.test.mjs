import test from 'node:test';
import assert from 'node:assert/strict';
import { createCombat } from '../../../public/js/battlesim/books/8/combat.js';
import { createState } from '../../../public/js/battlesim/books/8/state.js';
import { createEffects } from '../../../public/js/battlesim/books/8/effects.js';
import { getRosterRows } from '../../helpers/roster-db.cjs';

function fixture(saved) {
  const pt = saved || {}, rolls = [];
  const context = {currentPlaythrough:()=>pt, AXE_DICE_BONUS:1, POTION_HEAL_BONUS:6,
    saveState(){}, _renderInputs(){}, _renderLog(){}, _renderHistory(){},
    t:(key, data={})=>key+JSON.stringify(data), escapeHtml:String, _dieHtml:String, _dmgHtml:String};
  Object.assign(context, createState(()=>context), createCombat(()=>context), createEffects(()=>context));
  context._rollDice = n => { const dice = rolls.shift(); assert.equal(dice?.length,n,'requested dice'); return dice; };
  return {pt, d:context._data(), c:context, rolls};
}
const enemy = (name, skill, lifeMax) => ({displayName:name,skill,lifeMax});

test('printed example, chosen order, later initiative and one complete group result',()=>{
  const {d,c,rolls} = fixture();
  d.player={skill:4,life:12,lifeMax:12};
  c._startEncounter([enemy('Soldier',3,6),enemy('Captain',4,4)],{name:'Example'});
  c._chooseOpponent(0);
  assert.equal(d.enemy.name,'Captain');
  rolls.push([1,4,4,6]);c._runRound();
  assert.equal(d.player.life,12);assert.equal(d.history.length,0);assert.equal(d.awaitingOpponent,true);
  assert.equal(c._startEncounter([enemy('Replacement',2,1)]),false);
  c._chooseOpponent(0);assert.equal(d.enemy.foeFirst,true);
  rolls.push([3,2,4],[3,4,4,5]);c._runRound();
  assert.equal(d.player.life,11);assert.equal(d.enemy.life,3);
  rolls.push([1,4,6],[2,4,6,6]);c._runRound();
  assert.equal(d.player.life,8);assert.equal(d.enemy.life,0);
  assert.equal(d.history.length,1);assert.equal(d.history[0].outcome,'win');assert.equal(d.history[0].enemy,'Example');
  c._runRound();assert.equal(d.history.length,1);assert.equal(rolls.length,0);
});
test('later enemy can kill the player before any player dice are rolled',()=>{
  const {d,c,rolls}=fixture();
  d.player={skill:2,life:1,lifeMax:18};
  c._startEncounter([enemy('A',2,1),enemy('B',2,3)]);
  rolls.push([6,1]);c._runRound();c._chooseOpponent(0);
  rolls.push([6,6]);c._runRound();
  assert.equal(d.player.life,0);assert.equal(d.enemy.life,3);assert.equal(d.history.length,1);assert.equal(d.history[0].outcome,'loss');
});
test('chainmail offers a choice, resolves before death and is spent once per opponent',()=>{
  const {d,c,rolls}=fixture();
  d.player={skill:2,life:3,lifeMax:18};d.items.chainmail=true;
  c._startEncounter([enemy('A',3,20),enemy('B',2,2)]);
  rolls.push([1,1],[4,5,6]);c._runRound();
  assert.equal(d.player.life,3);assert.equal(d.history.length,0);assert.deepEqual(d.pendingAttack.dice,[4,5,6]);
  rolls.push([1]);c._resolveEnemyAttack(2);
  assert.equal(d.player.life,1);assert.equal(d.chainmailUsed,true);assert.equal(d.pendingAttack,undefined);
  rolls.push([1,1],[4,1,1]);c._runRound();
  assert.equal(d.pendingAttack,undefined);assert.equal(d.player.life,0);assert.equal(d.history[0].outcome,'loss');
});
test('declining chainmail keeps it available, pending strike survives save/reload',()=>{
  let {d,c,rolls}=fixture();d.items.chainmail=true;
  rolls.push([1,1],[4,1,1]);c._runRound();
  const restored=fixture(JSON.parse(JSON.stringify({sim8:d})));({d,c,rolls}=restored);
  c._resolveEnemyAttack();assert.equal(d.player.life,17);assert.equal(d.chainmailUsed,undefined);
  rolls.push([1,1],[6,1,1]);c._runRound();assert.ok(d.pendingAttack);
  rolls.push([1]);c._resolveEnemyAttack(0);assert.equal(d.player.life,17);
});
test('bow restrictions, precombat shot and no premature group reward',()=>{
  const {d,c,rolls}=fixture();d.items.bow=true;d.items.arrows=3;
  c._startEncounter([enemy('A',2,1),enemy('B',2,1)],{bowForbidden:true});
  c._fireBow();assert.equal(d.items.arrows,3);
  c._resetBattle();c._startEncounter([enemy('A',2,1),enemy('B',2,1)]);
  rolls.push([6]);c._fireBow();assert.equal(d.items.arrows,2);assert.equal(d.history.length,0);
  c._chooseOpponent(0);c._fireBow();assert.equal(d.items.arrows,2);
  assert.equal(d.enemy.foeFirst,true);
});
test('first arrow prepares the selected group and a defeated soldier cannot be restored by prepare',()=>{
  const {d,c,rolls}=fixture();d.items.bow=true;d.items.arrows=3;
  d.enemy={name:'Previous opponent',skill:2,life:1,lifeMax:1,foeFirst:false};
  let pending=true;
  c._prepareEncounter=()=>{
    if(!pending)return true;
    const prepared=c._startEncounter([enemy('First soldier',2,1),enemy('Second soldier',2,4),enemy('Third soldier',3,4)]);
    if(prepared)pending=false;
    return prepared;
  };
  rolls.push([6]);c._fireBow();
  assert.equal(d.enemy.name,'First soldier');assert.equal(d.enemy.life,0);
  assert.equal(d.group.remaining.length,2);assert.equal(d.items.arrows,2);assert.equal(d.history.length,0);
  assert.equal(c._startEncounter([enemy('First soldier',2,1),enemy('Second soldier',2,4),enemy('Third soldier',3,4)]),false);
  assert.equal(d.enemy.life,0);assert.equal(d.group.remaining.length,2);
});
test('no potion between opponents, reset restores entire group and retains history',()=>{
  const {d,c,rolls}=fixture();d.items.potion=true;d.player.life=10;
  c._startEncounter([enemy('A',2,1),enemy('B',2,1)]);
  rolls.push([6,1]);c._runRound();const before=d.player.life;
  c._usePotion();assert.equal(d.player.life,before);assert.equal(d.items.potion,true);
  c._chooseOpponent(0);rolls.push([1,1],[6,1]);c._runRound();assert.equal(d.history.length,1);
  c._resetBattle();assert.equal(d.group.remaining.length,1);assert.equal(d.enemy.life,1);assert.equal(d.enemy.foeFirst,false);assert.equal(d.history.length,1);
});
test('legacy saved combat and unusual manually entered player max HP remain byte-identical on access',()=>{
  const legacy={player:{skill:3,life:9,lifeMax:23},enemy:{name:'Captain',skill:5,life:2,lifeMax:5,foeFirst:true},round:20,log:['old'],history:[{outcome:'win',ts:1}],items:{bow:false,arrows:0},bowFired:false,sixWins:false};
  const saved={sim8:structuredClone(legacy)}, before=JSON.stringify(saved);
  const {c,d}=fixture(saved);c._data();assert.equal(JSON.stringify(saved),before);assert.equal(d.group,undefined);
  assert.equal(c._startEncounter([enemy('new',2,1)]),false);
});
test('invalid custom groups cannot replace an existing setup',()=>{
  const {c,d}=fixture(),before=JSON.stringify(d);
  for(const opponents of [[],[enemy('bad',1,4)],[enemy('bad',3,0)],[enemy('bad',3.5,4)]])assert.equal(c._startEncounter(opponents),false);
  assert.equal(JSON.stringify(d),before);
});
test('installed roster covers all reviewed episodes with fixed encounter and remaining-soldier variants',()=>{
  const rows=getRosterRows(8),presets=rows.filter(e=>e.stats?.encounter);
  assert.equal(presets.length,36);
  assert.equal(new Set(presets.map(e=>e.stats.encounter.section)).size,35);
  const at=section=>presets.filter(e=>e.stats.encounter.section===section).map(e=>e.stats.encounter);
  assert.deepEqual(at('38')[0].opponents,[{displayName:'Кастилец',skill:3,lifeMax:3}]);
  assert.equal(at('147')[0].opponents.length,5);assert.equal(at('238')[0].opponents.length,4);
  assert.equal(at('36')[0].opponents.length,6);
  assert.deepEqual(at('164').map(e=>e.opponents.length).sort(),[1,2]);
  assert.equal(at('218').length,1);
  assert.deepEqual(at('218')[0].repeatCount,{min:2,max:8,initial:8});
  assert.deepEqual(at('218')[0].opponents,[{displayName:'Войник',skill:3,lifeMax:3}]);
  for(const section of ['25','35','85','100','180','190','218','220','222a','225','230','235'])assert.ok(at(section).every(e=>e.bowForbidden),section);
  assert.equal(rows.filter(e=>!e.stats?.encounter).length,0,'unsupported generic roster removed');
});
