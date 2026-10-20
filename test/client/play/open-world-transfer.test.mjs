import { test } from 'node:test';
import assert from 'node:assert/strict';
import { captureTraveler, applyTraveler } from '../../../public/js/play/traveler.js';
import { captureSimulatorCharacter, addSimulatorTraveler, applyPendingSimulatorCharacter } from '../../../public/js/battlesim/travel-character.js';
import { createState as create198 } from '../../../public/js/battlesim/books/198/state.js';
import { createState as create199 } from '../../../public/js/battlesim/books/199/state.js';
import { createState as create200 } from '../../../public/js/battlesim/books/200/state.js';

const clone = value => structuredClone(value);
const run = name => ({ path: [1], charSheet: { fields: [{ name: 'Health', value: 3 }] },
  inventory: [{ itemId: 1, qty: 2, label: name, note: 'Custom note', visible: true }],
  equipment: { hand: { itemId: 2, qty: 1, label: 'Named sword', note: 'Damaged' } },
  equipmentVisible: { hand: true }, simLocal: { fight: { enemy: name }, history: [name] } });

test('possessions travel through three private/custom books, including removals and empty equipment', () => {
  const books = [run('One'), run('Two'), run('Three')], originals = clone(books);
  for (const [from, to] of [[1, 0], [0, 2], [2, 1], [1, 2], [2, 0]]) {
    const payload = captureTraveler(books[from]);
    applyTraveler(books[to], payload);
    assert.deepEqual(books[to].inventory, books[from].inventory);
    assert.deepEqual(books[to].equipment, books[from].equipment);
    assert.deepEqual(books[to].simLocal, originals[to].simLocal);
    assert.deepEqual(books[to].path, originals[to].path);
    assert.notEqual(books[to].inventory, books[from].inventory);
    books[to].inventory[0].qty--;
    assert.equal(books[from].inventory[0].qty, books[to].inventory[0].qty + 1);
    books[to] = JSON.parse(JSON.stringify(books[to])); // A reload retains carried data and recovery copies.
  }
  assert.deepEqual(books[0].openWorldLocalLoadout.inventory, originals[0].inventory);
  assert.deepEqual(books[2].openWorldLocalLoadout.inventory, originals[2].inventory);
  books[0].inventory = []; books[0].equipment = {}; books[0].equipmentVisible = {};
  applyTraveler(books[2], captureTraveler(books[0]));
  assert.deepEqual(books[2].inventory, []);
  assert.deepEqual(books[2].equipment, {});
  assert.deepEqual(books[2].equipmentVisible, {});
  assert.deepEqual(books[2].openWorldLocalLoadout.inventory, originals[2].inventory);
  const differentRun = run('Separate run');
  assert.equal(differentRun.openWorldCharacters, undefined);
  assert.equal(differentRun.inventory[0].qty, 2);
});

test('real Fighting Fantasy states carry reduced stats through three books while fights remain local', async () => {
  const books = { 198: run('One'), 199: run('Two'), 200: run('Three') };
  const contexts = id => ({ currentPlaythrough: () => books[id], SPELLS: [], MAX_PROVISIONS: 10 });
  create198(() => contexts(198))._data();
  create199(() => contexts(199))._data();
  create200(() => contexts(200))._data();
  for (const [id, pt] of Object.entries(books)) {
    pt['sim' + id].history.push({ enemy: id, outcome: 'win' });
    pt['sim' + id].enemy.name = 'Local ' + id;
  }
  Object.assign(books[199].sim199.player, { skill: 5, skillInitial: 10, stamina: 3, staminaInitial: 20, luck: 2, luckInitial: 8 });
  books[199].sim199.rolled = true;
  const histories = Object.fromEntries(Object.entries(books).map(([id, pt]) => [id, clone(pt['sim' + id].history)]));
  const travel = async (from, to) => {
    const payload = await addSimulatorTraveler(captureTraveler(books[from]), books[from], from, to, () => true);
    applyTraveler(books[to], payload);
    assert.equal(applyPendingSimulatorCharacter(books[to], to), true);
    assert.equal(applyPendingSimulatorCharacter(books[to], to), false, 'apply once, so renders cannot heal later damage');
    assert.deepEqual(books[to]['sim' + to].history, histories[to]);
    assert.equal(books[to]['sim' + to].enemy.name, 'Local ' + to);
    return books[to]['sim' + to].player;
  };
  let hero = await travel(199, 198);
  assert.equal(hero.skill, 5); assert.equal(hero.stamina, 3); assert.equal(hero.luck, 2);
  hero.stamina = 1;
  hero = await travel(198, 200);
  assert.equal(hero.stamina, 1);
  assert.equal(hero.woundsTakenThisFight, 0);
  hero.skill = 4;
  hero = await travel(200, 199);
  assert.equal(hero.skill, 4); assert.equal(hero.stamina, 1);
  assert.equal(hero.magic, 0, 'fields unique to this book retain their own compatible values');
});

test('portable simulator characters survive non-simulator books without being converted to unrelated rules', async () => {
  const source = run('Source');
  source.sim674 = { character: { stamina: 2, maxStamina: 12, abilities: { combat: 3 } },
    fight: { enemies: ['Must stay'], round: 4 }, history: ['Local'], log: ['Local'] };
  const supports = id => [674, 675, 829].includes(Number(id));
  const plain = run('Private test book');
  applyTraveler(plain, await addSimulatorTraveler(captureTraveler(source), source, 674, 99000, supports));
  assert.equal(plain.sim674, undefined);
  assert.equal(plain.openWorldPendingCharacter, null);
  const unrelated = run('Unrelated'); unrelated.sim829 = { player: { hp: 7, hpMax: 12 }, enemy: { hp: 4 } };
  applyTraveler(unrelated, await addSimulatorTraveler(captureTraveler(plain), plain, 99000, 829, supports));
  assert.equal(applyPendingSimulatorCharacter(unrelated, 829), false);
  assert.equal(unrelated.sim829.player.hp, 7);
  const next = run('Next Fabled Lands'); next.sim675 = { character: null, fight: null, history: ['Existing'], log: ['Existing'] };
  applyTraveler(next, await addSimulatorTraveler(captureTraveler(unrelated), unrelated, 829, 675, supports));
  assert.equal(applyPendingSimulatorCharacter(next, 675), true);
  assert.equal(next.sim675.character.stamina, 2);
  assert.deepEqual(next.sim675.history, ['Existing']);
  assert.equal(next.sim675.fight, null);
});

test('stat capture excludes battle settings and pending actions; root stats and local fight player stay consistent', () => {
  const sim = { combatSkill: 3, combatSkillInitial: 8, endurance: 2, enduranceInitial: 20, rolled: true,
    enemy: { skill: 4 }, ratio: -1, roundsThisBattle: 4, history: ['Old'], log: ['Old'] };
  const data = captureSimulatorCharacter(sim);
  assert.equal(data.endurance, 2);
  assert.equal(data.enemy, undefined); assert.equal(data.ratio, undefined); assert.equal(data.roundsThisBattle, undefined);
  const pt = { sim: { player: { stamina: 9, attackModifier: -2, enemyWoundDamage: 4 },
    fight: { player: { stamina: 9 }, enemies: ['Local'], round: 6 }, history: ['Local'] },
  openWorldCharacters: { compatible: { player: { stamina: 1, attackModifier: 9, enemyWoundDamage: 100 } } },
  openWorldPendingCharacter: { bookId: 4, stateKey: 'sim', family: 'compatible' } };
  assert.equal(applyPendingSimulatorCharacter(pt, 99), false);
  assert.equal(applyPendingSimulatorCharacter(pt, 4), true);
  assert.equal(pt.sim.player.stamina, 1);
  assert.equal(pt.sim.player.attackModifier, -2);
  assert.equal(pt.sim.player.enemyWoundDamage, 4);
  assert.equal(pt.sim.fight.player.stamina, 1);
  assert.equal(pt.sim.fight.round, 6);
  assert.deepEqual(pt.sim.fight.enemies, ['Local']);
  assert.deepEqual(pt.openWorldLocalCharacters.sim.player, { stamina: 9 });
});

test('cached combat ratios and defence follow reduced character skills without replacing local fight settings', () => {
  const wolf = {sim118:{combatSkill:10,endurance:12,ratio:7,attackModifier:2,enemy:{skill:5},history:[]},
    openWorldCharacters:{'lone-wolf':{combatSkill:4,endurance:2}},
    openWorldPendingCharacter:{bookId:118,stateKey:'sim118',family:'lone-wolf'}};
  applyPendingSimulatorCharacter(wolf,118);
  assert.equal(wolf.sim118.ratio,1);
  assert.equal(wolf.sim118.attackModifier,2);
  assert.equal(wolf.sim118.enemy.skill,5);
  const oldCharacter={combat:6,rank:1,armour:1,stamina:9};
  const fabled={sim674:{character:clone(oldCharacter),fight:{character:clone(oldCharacter),
    defence:10,staminaBefore:9,enemies:['Local'],rounds:4,config:{nonfatal:true}},history:['Existing']},
    openWorldCharacters:{'fabled-lands':{character:{combat:3,rank:1,armour:1,stamina:2}}},
    openWorldPendingCharacter:{bookId:674,stateKey:'sim674',family:'fabled-lands'}};
  applyPendingSimulatorCharacter(fabled,674);
  assert.equal(fabled.sim674.fight.defence,7,'preserve the local +2 override over current character defence');
  assert.equal(fabled.sim674.fight.staminaBefore,2,'nonfatal encounters cannot restore stale health from another book visit');
  assert.equal(fabled.sim674.fight.character.stamina,2);
  assert.deepEqual(fabled.sim674.fight.enemies,['Local']);
  assert.equal(fabled.sim674.fight.rounds,4);
  assert.deepEqual(fabled.sim674.history,['Existing']);
});

test('party-based simulators match existing heroes by identity and retain local encounter assignments', () => {
  const run = {sim689:{party:[{profileId:'jessica',name:'Jessica',health:8,skills:{fighting:5},invulnerable:true},
    {profileId:'tasha',name:'Tasha',health:8,skills:{fighting:3},invulnerable:false}],
    fight:{party:[{profileId:'jessica',name:'Jessica',health:8,skills:{fighting:5},invulnerable:true},
      {profileId:'tasha',name:'Tasha',health:8,skills:{fighting:3},invulnerable:false}],
      participants:[1],enemies:[{name:'Local',health:7}],round:4},history:['Existing']},
    openWorldCharacters:{'legendary-kingdoms':{party:[
      {profileId:'tasha',name:'Tasha',health:2,skills:{fighting:1},invulnerable:true},
      {profileId:'jessica',name:'Jessica',health:1,skills:{fighting:2},invulnerable:false}]}},
    openWorldPendingCharacter:{bookId:689,stateKey:'sim689',family:'legendary-kingdoms'}};
  applyPendingSimulatorCharacter(run,689);
  assert.equal(run.sim689.party[0].profileId,'jessica');
  assert.equal(run.sim689.party[0].health,1);
  assert.equal(run.sim689.party[1].health,2);
  assert.equal(run.sim689.fight.party[1].health,2);
  assert.equal(run.sim689.fight.party[0].invulnerable,true,'fight-local effects are not copied from another book');
  assert.deepEqual(run.sim689.fight.participants,[1]);
  assert.deepEqual(run.sim689.fight.enemies,[{name:'Local',health:7}]);
  assert.equal(run.sim689.fight.round,4);
  assert.deepEqual(run.sim689.history,['Existing']);
});

test('passing through an unopened simulator never replaces carried stats with its older character', async () => {
  const source={};create198(()=>({currentPlaythrough:()=>source,MAX_PROVISIONS:10}))._data();
  Object.assign(source.sim198.player,{skill:4,stamina:2,luck:1});source.sim198.rolled=true;
  const first=await addSimulatorTraveler(captureTraveler(source),source,198,199,()=>true);
  const middle={};create199(()=>({currentPlaythrough:()=>middle,SPELLS:[],MAX_PROVISIONS:10}))._data();
  middle.sim199.rolled=true;middle.sim199.player.stamina=20;
  applyTraveler(middle,first);
  assert.ok(middle.openWorldPendingCharacter);
  const next=await addSimulatorTraveler(captureTraveler(middle),middle,199,200,()=>true);
  const last={};create200(()=>({currentPlaythrough:()=>last,MAX_PROVISIONS:10}))._data();
  applyTraveler(last,next);applyPendingSimulatorCharacter(last,200);
  assert.equal(last.sim200.player.stamina,2);
  assert.equal(last.sim200.player.skill,4);
  assert.equal(middle.sim199.player.stamina,20,'unopened local state is preserved');
});
