import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {character,beginFight,round,missileRound,approach,openingAction,resolveOutcome,step,applyLuck,luckAvailable,modifiers} from '../../../../public/js/battlesim/engines/tolkien-quest/core.js';
import {definition,loadRoster,getRoster} from '../../../../public/js/battlesim/books/1439/definition.js';

const catalog=JSON.parse(readFileSync('data/simulator-rosters/1439.json','utf8'));
await loadRoster(async url=>{assert.equal(url,'/api/books/1439/enemies');return {ok:true,json:async()=>structuredClone(catalog.enemies)};});
const entry=id=>getRoster().find(e=>e.section===id);
const hero=extra=>character({endurance:100,...extra});
const foe=extra=>({name:'Custom foe',ob:0,db:0,endurance:1000,kind:'normal',...extra});
const numbers=(...values)=>()=>{assert.ok(values.length,'unexpected picked number');return values.shift();};
const custom=(h={},rules={},enemies=[foe()])=>beginFight(hero(h),enemies,{mode:'advanced',rules:{...definition.combatRules,...rules}});
const start=(section,h={},options={})=>{const e=entry(section);return beginFight(hero(h),e.enemies,{...options,rules:{...definition.combatRules,...e.rules}});};

test('Isengard DB roster covers 37 printed combats and four choices of one Orc',()=>{
  assert.equal(catalog.enemies.length,64);assert.equal(getRoster().length,41);
  assert.equal(new Set(catalog.enemies.map(e=>e.key)).size,64);
  assert.equal(new Set(catalog.enemies.map(e=>e.stats.entry.section)).size,37);
  for(const [section,win]of [['213','412'],['230','336'],['244','250'],['447','409']]){
    for(const id of [section,section+'-choice2']){
      assert.equal(entry(id).enemies.length,1);
      const f=resolveOutcome(round(start(id,{ob:100}),'attack',numbers(12)));
      assert.equal(f.status,'win');assert.equal(f.destination,win);
    }
    assert.deepEqual(entry(section).enemies.map(e=>[e.ob,e.db,e.endurance]),[[1,0,13]]);
    assert.deepEqual(entry(section+'-choice2').enemies.map(e=>[e.ob,e.db,e.endurance]),[[0,1,12]]);
  }
  assert.equal(entry('269').enemies.length,4);
  assert.deepEqual(entry('269').enemies.map(e=>e.endurance),[12,10,15,13]);
  assert.deepEqual(entry('139').enemies.map(e=>e.endurance),[19,12]);
  assert.deepEqual(entry('414').enemies.map(e=>e.endurance),[19,17]);
  assert.equal(entry('327').enemies[0].endurance,13);
  assert.equal(entry('440').enemies[0].endurance,10);
  assert.equal(entry('390').rules.surprised,true);
});

test('captivity presets force bare-handed combat without altering the saved hero',()=>{
  for(const id of ['317','327','437','440']){
    const f=start(id,{weapon:'sword',missile:'bow',itemBonuses:{meleeOb:2}},{mode:'advanced'});
    assert.equal(f.hero.weapon,'sword');assert.equal(f.rules.sourceWeapon,'unarmed');
    assert.equal(f.missileAvailable,false);
    assert.equal(modifiers(f).ob,-2);
    assert.throws(()=>missileRound(f,'shoot',numbers()),/No missile/);
  }
});

test('the two-guard loss in 440 kills without inventing passage 347',()=>{
  const f=resolveOutcome(round(start('440',{endurance:1}),'attack',numbers(2,10)));
  assert.equal(f.status,'loss');assert.equal(f.hero.condition,'killed');assert.equal(f.destination,undefined);
  assert.equal(entry('327').rules.defeat,'347');
  for(const id of ['139','233','252','281','287','318','327','344','414','438','440'])assert.equal(entry(id).rules.cannotEscape,true);
});

test('opening escape needs eight; combat escape needs nine; advanced past actions subtract two',()=>{
  assert.equal(openingAction(hero(),'escape',{rules:definition.combatRules},numbers(8)).success,true);
  const basic=start('181');assert.equal(round(basic,'escape',numbers(2,8)).status,'active');
  assert.equal(round(basic,'escape',numbers(2,9)).status,'escaped');
  assert.throws(()=>openingAction(hero(),'runPast',{rules:definition.combatRules},numbers()),/Advanced/);
  assert.equal(openingAction(hero(),'runPast',{mode:'advanced',rules:definition.combatRules,enemyUnaware:false},numbers(9)).success,false);
  assert.equal(openingAction(hero(),'runPast',{mode:'advanced',rules:definition.combatRules,enemyUnaware:false},numbers(10)).success,true);
  assert.equal(openingAction(hero({trickery:2}),'sneakPast',{mode:'advanced',rules:definition.combatRules,enemyUnaware:true},numbers(8)).success,true);
  assert.throws(()=>openingAction(hero(),'sneakPast',{mode:'advanced',rules:definition.combatRules,enemyUnaware:false},numbers()),/unaware/);
});

test('Carnil’s cloak improves only Sneak Away and Sneak Past',()=>{
  const h=hero({itemBonuses:{sneakAway:1}}),opts={mode:'advanced',rules:definition.combatRules,enemyUnaware:true};
  assert.equal(openingAction(h,'sneakAway',opts,numbers(7)).success,true);
  assert.equal(openingAction(h,'sneakPast',opts,numbers(9)).success,true);
  assert.equal(openingAction(h,'sneakAttack',opts,numbers(7)).success,false);
  assert.equal(openingAction(h,'steal',opts,numbers(8)).success,false);
});

test('the Fire Ring pays for one Fire Bolt, never another spell',()=>{
  let f=missileRound(custom({deviceCharges:1}),'firebolt',numbers(7,3));
  assert.equal(f.hero.deviceCharges,0);assert.equal(f.hero.damage,0);assert.equal(f.enemies[0].damage,3);
  f=approach(f,true,numbers(10));
  assert.throws(()=>missileRound(f,'firebolt',numbers()),/not learned/);
  f=missileRound(custom({deviceCharges:1,spells:['shield']}),'shield',numbers(7));
  assert.equal(f.hero.deviceCharges,1);assert.equal(f.hero.damage,4);
});

test('the Luck amulet supplies three independent free casts and preserves input state',()=>{
  let f=custom({luckCharges:3,missile:'bow',spells:['luck']});
  const original=JSON.stringify(f);
  for(let n=2;n>=0;n--){
    f=step(f,'shoot',numbers(7));assert.equal(luckAvailable(f),true);
    f=applyLuck(f,0,numbers(7,8));assert.equal(f.hero.luckCharges,n);assert.equal(f.hero.damage,0);
    f=approach(f,true,numbers(10));
  }
  f=applyLuck(step(f,'shoot',numbers(7)),0,numbers(7,8));
  assert.equal(f.hero.damage,5);assert.equal(f.hero.luckCharges,0);
  const h=custom({luckCharges:1,missile:'bow'}),pending=step(h,'shoot',numbers(7));
  const failed=applyLuck(pending,0,numbers(6));assert.equal(failed.hero.luckCharges,1);
  assert.equal(JSON.parse(original).hero.luckCharges,3);
});

test('Calm requires a printed escape and Charm Animal handles one animal in a group',()=>{
  assert.throws(()=>missileRound(custom({spells:['calm']}),'calm',numbers()),/printed Run Away/);
  const calm=missileRound(custom({spells:['calm']},{escape:'415'}),'calm',numbers(7,8));
  assert.equal(calm.status,'calmed');assert.equal(calm.destination,'415');
  const mapExit=missileRound(custom({spells:['calm']},{sourceRunAwayChoice:true}),'calm',numbers(7,8));
  assert.equal(mapExit.status,'calmed');assert.equal(mapExit.destination,undefined,'printed move-on escape needs no invented numeric destination');
  assert.throws(()=>missileRound(custom({spells:['calm']},{sourceRunAwayChoice:true,cannotEscape:true}),'calm',numbers()),/Cannot escape/);
  assert.throws(()=>missileRound(start('442',{spells:['calm']},{mode:'advanced'}),'calm',numbers()),/normal being/);
  let f=custom({spells:['charm']},{victory:'288'},[foe({kind:'animal'}),foe({kind:'animal'})]);
  f=missileRound(f,'charm',numbers(7));assert.equal(f.status,'active');assert.equal(f.index,1);assert.equal(f.hero.damage,6);
  f=resolveOutcome(missileRound(f,'charm',numbers(7)));assert.equal(f.status,'charmed');assert.equal(f.destination,'288');
  assert.equal(f.hero.charmedAnimal.condition,undefined);
});

test('mithril adds three DB without ordinary armour penalties',()=>{
  const item=definition.itemModifiers.find(e=>e.key==='mithril');assert.equal(item.armour,'none');
  const f=custom({armour:item.armour,itemBonuses:item.bonuses});
  assert.deepEqual([modifiers(f).db,modifiers(f).running,modifiers(f).trickery,modifiers(f).magic],[3,0,0,0]);
  const bow=definition.itemModifiers.find(e=>e.key==='carnilBow');assert.equal(bow.missile,'bow');assert.equal(bow.bonuses.missileOb,1);
});
