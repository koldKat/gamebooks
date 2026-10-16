import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {DEFAULT_CHARACTER, DUEL_CHOICES, RITUAL_CHOICES, SPELL_COSTS} from '../../../public/js/battlesim/books/757/definition.js';
import {startFight, advanceRitual, advanceAttackers, advanceDuel, spendSpell} from '../../../public/js/battlesim/books/757/combat.js';
import {createState} from '../../../public/js/battlesim/books/757/state.js';
import en from '../../../public/js/i18n/en/battlesim/battlesim757.js';
import bg from '../../../public/js/i18n/bg/battlesim/battlesim757.js';

const enemies = [{defence: 0, stamina: 0}, {defence: 2, stamina: 10}, {defence: 3, stamina: 10}];
const ritual = options => startFight('ritual', DEFAULT_CHARACTER, options);
const duel = options => startFight('duel', DEFAULT_CHARACTER, options);
const follow = (fight, path) => path.reduce(advanceDuel, fight);

test('757: ritual uses its two distinct comparisons and exact loss threshold', () => {
  let fight = advanceRitual(ritual(), 20);
  assert.equal(fight.enemyLost, 5);
  const tied = advanceRitual(fight, 45, {player: 1, enemy: 0});
  assert.equal(tied.section, 52);
  assert.equal(advanceRitual(tied, 34).outcome, 'win');
  const hit = advanceRitual(fight, 45, {player: 0, enemy: 0});
  assert.equal(hit.lost, 10); assert.equal(hit.section, 47);
  const draw = advanceRitual(hit, 78);
  assert.equal(draw.character.stamina, 105); assert.equal(draw.section, 61); assert.equal(draw.outcome, 'draw');
  fight = advanceRitual(ritual(), 48, {player: 0, enemy: 0});
  assert.equal(fight.lost, 5); assert.equal(fight.section, 42);
  fight = advanceRitual(fight, 20);
  fight = advanceRitual(fight, 45, {player: 0, enemy: 0});
  assert.equal(fight.lost, 15); assert.equal(fight.outcome, 'loss'); assert.equal(fight.section, 97);
  assert.equal(advanceRitual(ritual(), 48, {player: 2, enemy: 0}).section, 63);
  assert.throws(() => advanceRitual(ritual(), 34));
  assert.throws(() => advanceRitual(ritual(), 48, {player: NaN, enemy: 0}));
});

test('757: lizard, enemy threshold and knockdown outcomes do not invent damage', () => {
  const setup = options => advanceRitual(advanceRitual(ritual(options), 20), 45, {player: 10, enemy: 0});
  assert.equal(advanceRitual(setup({lizard: true}), 83).section, 21);
  assert.equal(advanceRitual(setup({}), 83).section, 58);
  let fight = ritual();
  for (let i = 0; i < 3; i++) {
    fight = advanceRitual(fight, 20);
    if (!fight.outcome) fight = advanceRitual(fight, 37);
  }
  assert.equal(fight.outcome, 'win'); assert.equal(fight.enemy.stamina, 105);
});

test('757: all three attackers go first; only a successful defence permits a counter', () => {
  assert.throws(() => startFight('attackers', DEFAULT_CHARACTER), /three/);
  assert.throws(() => startFight('attackers', DEFAULT_CHARACTER, {enemies: [{}, {}, {}]}));
  const fight = startFight('attackers', {...DEFAULT_CHARACTER, defence: 999, armour: 1, shield: 2}, {enemies});
  assert.equal(fight.character.defence, 3, '235 excludes introductory base defence');
  const before = JSON.stringify(fight);
  let next = advanceAttackers(fight, {enemyAttack: 10, playerDefence: 0});
  assert.equal(next.character.stamina, 111); assert.equal(next.enemies[0].stamina, 0);
  assert.equal(next.enemyIndex, 1); assert.equal(next.lastComparison.counter, undefined);
  assert.equal(JSON.stringify(fight), before);
  next = advanceAttackers(fight, {enemyAttack: 1, playerDefence: 0, playerAttack: 0, enemyDefence: 2});
  assert.equal(next.lastComparison.attack, next.lastComparison.defence);
  assert.equal(next.enemies[0].stamina, 0, 'tied counterattack causes no damage; zero is still alive');
  next = advanceAttackers(fight, {enemyAttack: 0, playerDefence: 10, playerAttack: 10, enemyDefence: 0});
  assert.equal(next.enemies[0].stamina, -12); assert.equal(next.enemyIndex, 1);
});

test('757: strict below-zero death and victory require all attackers defeated', () => {
  const zero = startFight('attackers', {...DEFAULT_CHARACTER, stamina: 1}, {enemies});
  let fight = advanceAttackers(zero, {enemyAttack: 0, playerDefence: 1});
  assert.equal(fight.character.stamina, 0); assert.equal(fight.outcome, null);
  fight = advanceAttackers(fight, {enemyAttack: 0, playerDefence: 0});
  assert.equal(fight.outcome, 'loss');
  fight = startFight('attackers', DEFAULT_CHARACTER, {enemies: enemies.map(enemy => ({...enemy, stamina: 0}))});
  for (let i = 0; i < 3; i++) fight = advanceAttackers(fight, {enemyAttack: 0, playerDefence: 100, playerAttack: 100, enemyDefence: 0});
  assert.equal(fight.outcome, 'win'); assert.equal(fight.section, 245);
  assert.throws(() => advanceAttackers(fight, {}));
});

test('757: every Erul defence path, cost, worm branch and fatal counterspell', () => {
  for (const [path, cost, end] of [
    [[232,260,234,262],0,262], [[257,251,260,234,262],0,262],
    [[241,254,246,262],4,262], [[241,252,246,262],5,262],
    [[239,253,246,262],3,262], [[239,242,260,234,262],0,262],
  ]) {
    const fight = follow(duel(), path);
    assert.equal(fight.outcome, 'win'); assert.equal(fight.section, end); assert.equal(fight.character.stamina, 120-cost);
  }
  for (const path of [[232,260,247,258],[241,254,246,250,258]]) assert.equal(follow(duel({wormAloft:true}),path).outcome,'win');
  const fatal = follow(duel(), [257,261]);
  assert.equal(fatal.outcome,'loss'); assert.equal(fatal.section,261);
  const dead = advanceDuel(advanceDuel(startFight('duel',{...DEFAULT_CHARACTER,stamina:3}),241),254);
  assert.equal(dead.outcome,'loss'); assert.equal(dead.character.stamina,-1);
  assert.throws(() => follow(duel(), [232,260,247]));
});

test('757: printed spell costs, immutable state and once-only outcomes', () => {
  for (const [spell, costs] of Object.entries(SPELL_COSTS)) {
    assert.equal(spendSpell(120,spell,false).cost,costs[0]);
    assert.equal(spendSpell(120,spell,true).cost,costs[1]);
  }
  assert.throws(() => spendSpell(120,'toString',true));
  let book=757,run={},saves=0;
  const store=createState(()=>({currentBookId:book,currentPlaythrough:()=>run,saveState:()=>saves++}));
  store.ensure();
  store.change(data=>{data.fight={name:'Bragurg',outcome:'draw'};});
  assert.equal(store.read().history.length,0);
  store.change(data=>{data.fight={name:'Erul',outcome:'win'};});
  store.change(()=>{}); assert.equal(store.read().history.length,1);
  const old=run,before=JSON.stringify(run);
  assert.equal(store.change(()=>{run={};}),false); assert.equal(JSON.stringify(old),before);
  book=1; assert.equal(store.change(()=>{}),false); assert.equal(saves,4);
});

test('757: bilingual labels cover every available action and spell', () => {
  assert.deepEqual(Object.keys(en).sort(),Object.keys(bg).sort());
  for (const section of new Set([...Object.values(DUEL_CHOICES).flat(),...Object.values(RITUAL_CHOICES).flat(),247,250,234,262])) assert.ok(en['battlesim757.action.'+section],section);
  for (const spell of Object.keys(SPELL_COSTS)) assert.ok(en['battlesim757.spell.'+spell]);
  for (const [key,value] of Object.entries(en)) assert.deepEqual(value.match(/\{\w+\}/g),bg[key].match(/\{\w+\}/g),key);
});

test('757: backend registers combat wins and losses once, not draws', () => {
  const events=[],db={exec(){},transaction:fn=>()=>fn(),prepare:()=>({run(){},all:()=>[],get:()=>({id:757,total_sections:263,is_container:0})})};
  const context={module:{exports:{}},require(name){
    if(name==='./connection')return{db};
    if(name==='./auth')return{generateToken:()=> 'test-only'};
    if(name==='../impersonation-context')return{isImpersonatingContext:()=>false};
    if(name==='../clean-run')return{isCleanRun:()=>false};
    throw Error(name);
  },events};
  runInNewContext(readFileSync(new URL('../../../server/db/xp.js',import.meta.url),'utf8')+'\nawardXp=(...args)=>events.push(args);',context);
  assert.equal(context.module.exports.SIM_HISTORY_KEYS.filter(key=>key==='sim757').length,1);
  const state=history=>({graph:{},playthroughs:[{startedAt:123,path:[1],sim757:{history}}]});
  const after=state(['win','loss','draw'].map((outcome,index)=>({outcome,ts:index+10})));
  context.module.exports.processStateXp(1,757,state([]),after);
  assert.deepEqual(events.filter(event=>event[1].startsWith('battlesim_')).map(event=>[...event]),[[1,'battlesim_win','sim757:10'],[1,'battlesim_loss','sim757:11']]);
  events.length=0;context.module.exports.processStateXp(1,757,after,after);
  assert.ok(events.every(event=>!event[1].startsWith('battlesim_')));
});
