import {loadFixtureRoster} from './roster-fixtures.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as combat from '../../../public/js/battlesim/books/856/combat.js';
import { ENCOUNTERS, PRESETS, encounterPreset, GALANSIA_RULES } from '../../../public/js/battlesim/books/856/definition.js';
import { createState } from '../../../public/js/battlesim/books/856/state.js';
import bg from '../../../public/js/i18n/bg/battlesim/battlesim856.js';
import en from '../../../public/js/i18n/en/battlesim/battlesim856.js';

await loadFixtureRoster(856);

test('both dictionaries contain matching keys and event placeholders', () => {
  assert.deepEqual(Object.keys(bg).sort(), Object.keys(en).sort());
  const placeholders = value => [...value.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();
  for (const key of Object.keys(bg)) assert.deepEqual(placeholders(bg[key]), placeholders(en[key]), key);
  const check = combat.checkAttribute(combat.newCharacter(), 'strength', 1);
  for (const key of placeholders(bg['battlesim856.event.check'])) {
    assert.ok(key === 'result' || key in check, key);
  }
});

const player = changes => ({...combat.newCharacter(), ...changes});
const opponent = changes => ({displayName: 'Custom', strength: 5, damage: 1, hp: 10, ...changes});
const start = (id, changes = {}) => {
  const preset = encounterPreset(id);
  return combat.startFight(player(changes), [preset], {encounter: preset});
};
const round = (fight, playerDie, enemyDie, shieldDie) => combat.playRound(fight, {playerDie, enemyDie, shieldDie});

test('three printed characters spend sixteen points and leave racial powers optional', () => {
  assert.deepEqual(PRESETS.map(p => [p.strength,p.agility,p.life,p.damage,p.bags,p.boulder]),
    [[5,2,6,2,2,false],[4,3,5,3,1,true],[6,4,4,1,1,true]]);
  for (const preset of PRESETS) {
    const character = combat.newCharacter(preset.id);
    assert.equal(combat.creationCost(character), 16);
    assert.equal(character.optionalRaces, false);
    character.life = 0;
    assert.notEqual(combat.newCharacter(preset.id).life, 0);
  }
});
test('all nineteen printed enemy stat blocks are retained', () => {
  assert.deepEqual(ENCOUNTERS.map(p => [p.id,p.strength,p.damage,p.hp]), [
    ['3',1,1,1],['4',2,1,8],['5',3,2,4],['9',2,2,2],['14',3,2,4],['15',5,3,4],['20',4,2,4],
    ['26',2,1,6],['28',2,1,8],['35',4,2,5],['38',2,1,5],['39',3,1,3],['40',2,4,3],
    ['41',4,4,4],['43',2,1,4],['45a',3,1,2],['45b',2,1,3],['45c',3,2,5],['49',4,2,4],
  ]);
});
test('opposed single dice, weapon damage and harmless ties do not mutate the previous fight', () => {
  const original = combat.startFight(player(), [opponent()]);
  assert.equal(round(original,3,3).character.life, 6);
  assert.equal(round(original,3,3).enemies[0].hp, 10);
  assert.equal(round(original,4,3).enemies[0].hp, 8);
  assert.equal(round(original,2,3).character.life, 5);
  assert.equal(original.rounds, 0);
  assert.throws(() => round(original,7,1));
});
test('a boulder uses strict agility, one damage and one pre-fight attempt', () => {
  const original = start('4',{boulder:true});
  const miss = combat.throwBoulder(original,{value:2});
  assert.equal(miss.enemies[0].hp,8);
  assert.equal(miss.character.boulder,false);
  assert.throws(() => combat.throwBoulder(miss,{value:1}));
  assert.equal(combat.throwBoulder(original,{value:1}).enemies[0].hp,7);
  assert.throws(() => combat.throwBoulder(round(original,1,1),{value:1}));
  const win = combat.throwBoulder(start('3',{boulder:true}),{value:1});
  assert.equal(win.outcome,'win');
  assert.equal(win.character.boulder,true);
  assert.throws(() => round(win,1,1));
  assert.equal(combat.flee(miss).character.boulder,false);
  assert.equal(combat.flee(original).character.boulder,true);
});
test('shields prevent wounds and soul draining; unblocked drains are not capped', () => {
  const blocked = round(start('20',{shield:true}),1,6,1);
  assert.equal(blocked.character.life,6);
  assert.equal(blocked.enemies[0].hp,4);
  const hit = round(start('20',{shield:true}),1,6,2);
  assert.equal(hit.character.life,4);
  assert.equal(hit.enemies[0].hp,6);
  const loss = round(start('20',{life:1}),1,6);
  assert.equal(loss.outcome,'loss');
  assert.equal(loss.enemies[0].hp,6);
});
test('the alchemist fight stops on the first wound, including a boulder', () => {
  const wound = round(start('40'),6,1);
  assert.equal(wound.outcome,'win');
  assert.equal(wound.enemies[0].hp,1);
  assert.equal(wound.destination,'29');
  const rock = combat.throwBoulder(start('40',{boulder:true}),{value:1});
  assert.equal(rock.outcome,'win');
  assert.equal(rock.enemies[0].hp,2);
});
test('the sword of Gof adds strength against the demon only', () => {
  const base = start('49'), sword = start('49',{godSword:true});
  assert.equal(round(base,1,2).enemies[0].hp,4);
  assert.equal(round(sword,1,2).enemies[0].hp,2);
  assert.equal(sword.character.strength,5);
  assert.equal(round(start('15',{godSword:true}),1,1).enemies[0].hp,4);
});
test('optional troll recovery is limited to gnomes and initial endurance', () => {
  const troll = round(start('3',{life:3,optionalRaces:true}),6,1);
  assert.equal(troll.character.life,4);
  assert.equal(round(start('3',{optionalRaces:true}),6,1).character.life,6);
  assert.equal(round(start('5',{life:3,optionalRaces:true,damage:4}),6,1).character.life,3);
});
test('optional ogre fire resistance and giant attribute bonus follow strict checks', () => {
  const ogre = player({race:'ogre',optionalRaces:true,shield:true});
  assert.equal(combat.takeDamage(ogre,1,{fire:true},() => {throw Error('No shield roll needed');}).damage,0);
  assert.equal(combat.takeDamage(ogre,4,{fire:true,shieldDie:2}).damage,3);
  assert.equal(combat.takeDamage(ogre,4,{shieldDie:2}).damage,4);
  const giant = player({race:'giant',strength:6,optionalRaces:true});
  assert.equal(combat.checkAttribute(giant,'strength',6).success,true);
  assert.equal(combat.checkAttribute(giant,'strength',6,1).success,false);
  assert.equal(combat.checkAttribute({...giant,optionalRaces:false},'strength',6).success,false);
});
test('minotaur charge, cyclops boulder and ape cry affect only their printed rounds', () => {
  let fight = combat.startFight(player({race:'minotaur',optionalRaces:true}),[opponent()]);
  fight = round(fight,6,1);
  assert.equal(fight.enemies[0].hp,7);
  assert.equal(round(fight,6,1).enemies[0].hp,5);
  const cyclops = combat.throwBoulder(start('4',{race:'cyclops',optionalRaces:true,boulder:true}),{value:2});
  assert.equal(cyclops.enemies[0].hp,7);
  let ape = combat.startFight(player({race:'ape',optionalRaces:true}),[opponent()]);
  ape = round(ape,3,3);
  assert.equal(ape.enemies[0].hp,8);
  assert.equal(round(ape,3,3).enemies[0].hp,8);
});
test('custom opponents, free escape and recovery preserve current values without revival', () => {
  let fight = combat.startFight(player(),[opponent({hp:1}),opponent({hp:1})]);
  fight = round(fight,6,1);
  assert.equal(fight.outcome,null);
  fight = combat.playRound(fight,{target:1,playerDie:6,enemyDie:1});
  assert.equal(fight.outcome,'win');
  const original = start('41');
  assert.equal(combat.flee(original).character.life,original.character.life);
  assert.equal(combat.flee(original).destination,'27');
  assert.equal(combat.heal(player({life:5}),10).life,6);
  assert.throws(() => combat.heal(player({life:0}),10));
  assert.throws(() => combat.startFight(player({life:0}),[opponent()]));
});
test('saved outcomes are recorded once and stale run updates cannot overwrite another run', () => {
  let run = {}, saves = 0;
  const context = () => ({currentBookId:856,currentPlaythrough:() => run,saveState:() => saves++});
  const store = createState(context);
  store.change(data => {data.fight = round(start('3'),6,1);});
  store.change(() => {});
  assert.equal(store.read().history.length,1);
  assert.equal(saves,2);
  const previous = run;
  assert.equal(store.change(data => {data.character.life = 1; run = {};}),false);
  assert.equal(previous.sim856.character.life,6);
  assert.equal(run.sim856,undefined);
});

test('loaded death route applies to saved drain fights without resetting progress or equipment', () => {
  const destination = GALANSIA_RULES.deathDestination;
  try {
    GALANSIA_RULES.deathDestination = '99';
    const f = start('20', {life:1, shield:true});
    f.rounds = 4; f.enemies[0].rounds = 3; f.enemies[0].hp = 7;
    f.boulderSpent = true; f.extension = {kept:true};
    const saved = JSON.stringify(f), g = round(f, 1, 6, 2);
    assert.equal(g.outcome, 'loss'); assert.equal(g.destination, '99');
    assert.equal(g.rounds, 5); assert.equal(g.enemies[0].rounds, 4);
    assert.equal(g.enemies[0].hp, 9); assert.equal(g.boulderSpent, true);
    assert.equal(g.character.life, 0); assert.equal(g.character.shield, true);
    assert.deepEqual(g.extension, {kept:true}); assert.equal(JSON.stringify(f), saved);
    assert.equal(combat.flee(f).destination, '22');
    assert.equal(round(start('3'), 6, 1).destination, '22');
  } finally { GALANSIA_RULES.deathDestination = destination; }
});
