import test from 'node:test';
import assert from 'node:assert/strict';
import { chartColumn, chartResult, startFight, attack, resolveK, chooseZeroColumn, switchWeapon,
  useNet, retreat, cancelFight } from '../../../public/js/battlesim/engines/shinte/core.js';
import { encounterRules, missileDamage, turtleRecovery } from '../../../public/js/battlesim/books/1566/effects.js';
import { createState } from '../../../public/js/battlesim/books/1566/state.js';

// Synthetic constant damage isolates the algorithm; printed cell values remain in the database.
const chart = () => ({columnLabels:['<=-10','-9/-8','-7/-6','-5/-4','-3/-2','-1/+1','+2/+3','+4/+5','+6/+7','+8/+9','>=+10'],
  rowLabels:['2','3','4','5','6-8','9','10','11','12'], values:Array.from({length:9},() => Array(11).fill(2))});
const hero = () => ({cs:20,ds:20,pp:20,maxPP:25,sp:10,maxSP:15,agility:8,guile:8});
const config = () => ({player:hero(),enemies:[{name:'Synthetic opponent',cs:22,ds:18,pp:10}],first:'player'});

test('Shinté chart respects every printed ratio band and the grouped 6-8 row', () => {
  const c = chart();
  for (const [difference,index] of [[-20,0],[-10,0],[-9,1],[-8,1],[-7,2],[-6,2],[-5,3],[-4,3],[-3,4],[-2,4],[-1,5],[1,5],[2,6],[3,6],[4,7],[5,7],[6,8],[7,8],[8,9],[9,9],[10,10],[50,10]]) {
    assert.equal(chartColumn(c,difference),index);
  }
  assert.throws(() => chartColumn(c,0));
  assert.equal(chartColumn(c,0,5),5);
  for (const total of [6,7,8]) assert.equal(chartResult(c,2,total).row,4);
  assert.equal(chartResult(c,2,12).row,8);
  assert.throws(() => chartResult(c,2,13));
});

test('Shinté attacks alternate and stop immediately on defeat without mutating the input', () => {
  const original = startFight(config()), snapshot = structuredClone(original);
  const first = attack(original,chart(),{total:7});
  assert.deepEqual(original,snapshot);
  assert.equal(first.enemies[0].pp,8); assert.equal(first.next,'enemy');
  const second = attack(first,chart(),{total:7});
  assert.equal(second.playerPP,18); assert.equal(second.next,'player');
  const dying = {...first,playerPP:1};
  assert.equal(attack(dying,chart(),{total:7}).outcome,'loss');
  const winning = startFight({...config(),enemies:[{name:'One hit',cs:20,ds:18,pp:1}]});
  const won = attack(winning,chart(),{total:7}); assert.equal(won.outcome,'win');
  assert.throws(() => attack(won,chart()));
});

test('Shinté never guesses K or consumes dice while a column choice is missing', () => {
  const c = chart(); c.values[0][6] = 'K';
  const f = startFight(config()), pending = attack(f,c,{total:2});
  assert.equal(pending.pending.kind,'K'); assert.equal(pending.playerPP,20); assert.equal(pending.enemies[0].pp,10);
  assert.throws(() => attack(pending,c)); assert.throws(() => switchWeapon(pending,{cs:30,ds:30}));
  assert.throws(() => resolveK(pending,{playerPP:26,enemyPP:10}));
  const resolved = resolveK(pending,{playerPP:18,enemyPP:0});
  assert.equal(resolved.outcome,'win'); assert.equal(pending.enemies[0].pp,10);
  const zero = startFight({...config(),enemies:[{name:'Equal',cs:20,ds:20,pp:10}]});
  let calls = 0;
  assert.throws(() => attack(zero,c,{roll:() => { calls++; return 3; }})); assert.equal(calls,0);
  const chosen = chooseZeroColumn(zero,5,c);
  assert.equal(attack(chosen,c,{total:7}).enemies[0].pp,8);
  assert.equal(zero.zeroColumn,null);
});

test('Shinté custom opponents are separate duels, while plural presets keep one PP pool', () => {
  const f = startFight({...config(),enemies:[{name:'A',cs:20,ds:18,pp:1},{name:'B',cs:20,ds:18,pp:3}]});
  const next = attack(f,chart(),{total:7});
  assert.equal(next.enemyIndex,1); assert.equal(next.next,'player'); assert.equal(next.enemies[1].pp,3);
  const group = startFight({...config(),enemies:[{name:'Three enemies, one printed pool',cs:20,ds:18,pp:27}]});
  assert.equal(group.enemies.length,1); assert.equal(group.enemies[0].pp,27);
});

test('Shinté fixed initiative, weapon switching and retreat obey the current turn', () => {
  const f = startFight(config()), switched = switchWeapon(f,{cs:25,ds:24});
  assert.equal(switched.next,'enemy'); assert.deepEqual(switched.player,{cs:25,ds:24});
  assert.throws(() => switchWeapon(switched,{cs:20,ds:20}));
  assert.throws(() => retreat(f));
  const permitted = startFight({...config(),retreatAllowed:true});
  assert.equal(retreat(permitted).outcome,'retreated');
  assert.throws(() => retreat({...permitted,next:'enemy'}));
  assert.equal(cancelFight(permitted).outcome,'cancelled');
});

test('Shinté Duchess health and the one-use net do not replace Tsai health', () => {
  const h = hero(), options = {first:'enemy',styles:{horse:true,monkey:true}};
  const rules = encounterRules({section:'84',modifierRule:'duchess'},h,options);
  assert.equal(rules.csModifier,6); assert.equal(rules.receiverPP,20); assert.equal(h.pp,20);
  const f = startFight({...config(),...rules}), hit = attack(f,chart(),{total:7});
  assert.equal(hit.receiver,'Duchess'); assert.equal(hit.playerPP,18); assert.equal(h.pp,20);
  const net = useNet(hit,() => 2);
  assert.equal(net.enemies[0].pp,5); assert.equal(net.next,hit.next);
  assert.equal(net.events[0].damage,5); assert.throws(() => useNet(net));
  assert.throws(() => useNet(startFight(config())));
});

test('Shinté encounter exceptions resolve only the printed conditions', () => {
  const h = hero();
  assert.throws(() => encounterRules({section:'143'},h,{first:'',styles:{}}));
  assert.equal(encounterRules({section:'33',firstRule:'33'},h,{styles:{tiger:true}}).first,'player');
  assert.equal(encounterRules({section:'33',firstRule:'33'},h,{styles:{}}).first,'enemy');
  const rats = encounterRules({section:'53',firstRule:'snakeElseEnemy',modifierRule:'rats'},h,{styles:{},shinGuards:true});
  assert.equal(rats.csModifier,-4); assert.equal(rats.dsModifier,2); assert.equal(rats.first,'enemy');
  assert.equal(encounterRules({section:'144',firstRule:'snakeElseEnemy',modifierRule:'rats'},h,{styles:{horse:true}}).csModifier,0);
  const allies = encounterRules({section:'272',modifierRule:'allies'},h,{first:'enemy'});
  assert.equal(allies.csModifier,50); assert.equal(allies.dsModifier,50);
  const stealth = encounterRules({section:'408',modifierRule:'stealth'},h,{styles:{tiger:true,wolf:true},indigo:true});
  assert.equal(stealth.csModifier,8); assert.equal(stealth.openingDamage,8);
  const fight = startFight({...config(),...stealth});
  assert.equal(fight.enemies[0].pp,2); assert.equal(fight.next,'enemy');
  assert.equal(attack(fight,chart(),{total:7}).next,'player');
  assert.equal(encounterRules({section:'356',firstRule:'poachers'},h,{styles:{},ambush:true}).first,'player');
  assert.equal(encounterRules({section:'356',firstRule:'poachers'},h,{styles:{}}).first,'enemy');
});

test('Shinté missile formulas honor passage limits and bonuses per thrown weapon', () => {
  const spec = {stars:{damage:2,maximum:6,thrown:true},bow:{damage:7,eagleDamage:9,maximum:3,thrown:false},axes:{damage:5,maximum:2,thrown:true}};
  assert.equal(missileDamage(spec,'stars',5,{agility:9},{}),19);
  assert.equal(missileDamage(spec,'stars',5,{agility:9},{monkey:true}),24);
  assert.equal(missileDamage(spec,'bow',2,{agility:8},{eagle:true,monkey:true}),26);
  assert.throws(() => missileDamage(spec,'axes',3,{agility:8},{}));
  assert.throws(() => missileDamage(spec,'stars',0,{agility:8},{}));
});

test('Shinté Turtle recovery is once per melee and respects maxima and the damage receiver', () => {
  const h = {...hero(),pp:24,sp:15};
  const f = attack(startFight({...config(),player:h,turtleEligible:true}),chart(),{total:7});
  const healed = turtleRecovery(h,f,true);
  assert.equal(healed.hero.pp,25); assert.equal(healed.hero.sp,15); assert.equal(healed.fight.playerPP,25);
  assert.throws(() => turtleRecovery(healed.hero,healed.fight,true));
  assert.throws(() => turtleRecovery(h,startFight({...config(),turtleEligible:true}),true));
  const mare = {...f,receiver:'Duchess',playerPP:9};
  assert.equal(turtleRecovery(h,mare,true).fight.playerPP,9);
});

test('Shinté saves one reward result and refuses stale cross-run changes', () => {
  let run = {}, id = 1566, saves = 0;
  const context = () => ({currentBookId:id,currentPlaythrough:() => run,saveState:() => saves++});
  const state = createState(context);
  state.change(data => { data.fight = {...startFight(config()),outcome:'win'}; });
  state.change(() => {});
  assert.equal(run.sim1566.history.length,1); assert.equal(saves,2);
  const previous = run;
  assert.equal(state.change(() => { run = {}; }),false); assert.equal(run.sim1566,undefined);
  assert.equal(previous.sim1566.history.length,1);
  id = 1; assert.equal(state.change(() => {}),false);
});
