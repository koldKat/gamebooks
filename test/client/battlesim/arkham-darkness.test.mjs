import test from 'node:test';
import assert from 'node:assert/strict';
import { ARKHAM_ENCOUNTERS, createArkhamCharacter, createArkhamFight, rollArkhamRound } from '../../../public/js/battlesim/engines/arkham-darkness.js';
const player = (values = {}) => ({ ...createArkhamCharacter('nathaniel', { willpower: 3, intellect: 2, combat: 5, health: 9, sanity: 6 }), ...values });
const rng = (...dice) => { let i = 0; return () => ((dice[i++] ?? 1) - .5) / 6; };

test('all twenty source encounters have their printed round targets and destinations', () => {
  assert.equal(ARKHAM_ENCOUNTERS.length, 20);
  assert.equal(new Set(ARKHAM_ENCOUNTERS.map(e => e.section)).size, 20);
  assert.deepEqual(ARKHAM_ENCOUNTERS.find(e => e.section === 258).thresholds, [18,19,20]);
  for (const e of ARKHAM_ENCOUNTERS) assert.ok(e.win > 0 && e.win <= 300 && e.loss > 0 && e.loss <= 300);
});
test('starting a fight copies state; reopening does not reroll or reset stats', () => {
  const p = player(), f = createArkhamFight(15,p); f.player.health--;
  assert.equal(p.health,9); assert.equal(f.player.health,8);
  assert.equal(createArkhamCharacter('rex',{willpower:3,intellect:4,combat:2,health:6,sanity:9}).clues,1);
});
test('resource bonus costs exactly one even in the duplicated third-round instruction', () => {
  const f = createArkhamFight(15, player({ resources:3 }));
  for(let i=0;i<3;i++) rollArkhamRound(f,{resource:true},rng(4,4));
  assert.equal(f.player.resources,0); assert.equal(f.rounds.length,3);
  const before=structuredClone(f); assert.equal(rollArkhamRound(f,{resource:true}),null); assert.deepEqual(f,before);
});
test('insufficient resources or used weapon do not consume dice or mutate state', () => {
  const f=createArkhamFight(15,player({weaponUsed:true})), before=structuredClone(f);
  assert.equal(rollArkhamRound(f,{resource:true},()=>{throw Error('rolled');}),null);
  assert.equal(rollArkhamRound(f,{weapon:true},()=>{throw Error('rolled');}),null); assert.deepEqual(f,before);
});
test('health and sanity below zero penalize skills but do not cause invented death', () => {
  const f=createArkhamFight(64,player({combat:5,willpower:3,health:-2,sanity:-1}));
  const r=rollArkhamRound(f,{},rng(2,3)); assert.equal(r.modifier,5); assert.equal(f.status,'fighting');
});
test('Boxer grants one point for each six, not one point per roll', () => {
  const f=createArkhamFight(15,player());assert.equal(rollArkhamRound(f,{},rng(6,6)).modifier,7);
});
test('Rex doubles become ones when combat also uses Intellect or Willpower', () => {
  const f=createArkhamFight(220,player({profile:'rex',clues:0}));
  const r=rollArkhamRound(f,{},rng(6,6));assert.deepEqual(r.dice,[1,1]);assert.equal(r.cursed,true);assert.equal(f.player.clues,0);
  const c=createArkhamFight(15,player({profile:'rex'}));assert.deepEqual(rollArkhamRound(c,{},rng(6,6)).dice,[6,6]);
});
test('Agnes substitutes Willpower for the fight once per adventure and gains resources on success', () => {
  const f=createArkhamFight(15,player({profile:'agnes',willpower:10,combat:0}),true);
  assert.equal(f.player.sorcererUsed,true); assert.equal(rollArkhamRound(f,{},rng(3,4)).success,true);
  assert.equal(f.player.resources,1);assert.throws(()=>createArkhamFight(15,f.player,true));
});
test('Nightgaunt street fight uses any two wins; observatory approach requires both', () => {
  const f=createArkhamFight(62,player({combat:10,willpower:10}));
  rollArkhamRound(f,{},rng(1,1));rollArkhamRound(f,{},rng(1,1));f.player.combat=-20;rollArkhamRound(f,{},rng(1,1));
  assert.equal(f.status,'win');assert.equal(f.destination,103);
  const g=createArkhamFight(239,player({combat:0,willpower:0}));rollArkhamRound(g,{},rng(1,1));g.player.combat=20;rollArkhamRound(g,{},rng(1,1));assert.equal(g.status,'loss');
});
test('Doom applies only to first round, and Secret Rites and Agile apply only where printed', () => {
  const f=createArkhamFight(157,player({profile:'rex',combat:5,doom:3,rites:true,agile:true,fear:true}));
  assert.equal(rollArkhamRound(f,{},rng(1,2)).modifier,2);
  assert.equal(rollArkhamRound(f,{},rng(1,2)).modifier,5);
});
test('294 uses first-round Agile only and plus/minus one momentum in the last round', () => {
  const f=createArkhamFight(294,player({profile:'rex',combat:0,agile:true}));
  assert.equal(rollArkhamRound(f,{},rng(1,2)).modifier,1);
  assert.equal(rollArkhamRound(f,{},rng(1,2)).modifier,0);
  assert.equal(rollArkhamRound(f,{},rng(1,2)).modifier,-1);assert.equal(f.player.health,8);
});
test('in-round wounds affect subsequent Combat without applying outcome-section effects twice', () => {
  const f=createArkhamFight(205,player({profile:'rex',combat:0,health:0}));rollArkhamRound(f,{},rng(1,2));
  assert.equal(f.player.health,-1);assert.equal(rollArkhamRound(f,{},rng(1,2)).modifier,-1);assert.equal(f.player.health,-1);
});
test('invalid random input leaves investigator and fight unchanged', () => {
  const f=createArkhamFight(15,player()), before=structuredClone(f);
  assert.throws(()=>rollArkhamRound(f,{},()=>1));assert.deepEqual(f,before);
  assert.throws(()=>createArkhamFight(500,player()));assert.throws(()=>createArkhamFight(15,player({resources:-1})));
});
