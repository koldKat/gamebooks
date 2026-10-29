import { readRosterDocument } from '../../../helpers/roster-db.cjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { startWarhammerFight, warhammerRound, woundThreshold, continueWarhammerFight } from '../../../../public/js/battlesim/engines/warhammer/core.js';
import { resumeTerminatorFight, terminatorStats } from '../../../../public/js/battlesim/engines/warhammer/terminator.js';
import { loadRosterDataset } from '../../../../public/js/battlesim/roster-data.js';

const catalog = readRosterDocument(1456);
const entries = [...new Map(catalog.enemies.map(row => [row.stats.entryIndex,row.stats.entry])).values()];
const encounter = section => structuredClone(entries.find(entry => entry.section === String(section)));
const defaults = entries[0].playerDefaults;
const hero = (overrides = {}) => ({...structuredClone(defaults.basic),w:100,maxW:100,...overrides});
const enemy = (overrides = {}) => ({name:'Test opponent',ws:1,s:3,t:3,w:100,maxW:100,aRanged:1,aClose:1,
  armour:0,cover:0,ranged:null,melee:{name:'Test weapon',damage:1},...overrides});
const custom = (overrides = {}) => ({rulesVariant:'terminator',statMaximum:100,initiative:'you',win:'2',loss:'3',enemies:[enemy()],...overrides});
const dice = values => { let i=0; return () => values[i++] ?? 1; };

test('all source encounters load from DB-shaped metadata and start with their distinct profiles',async () => {
  const loaded = await loadRosterDataset(1456,'CATALOG',async () => ({ok:true,json:async () => catalog.enemies}));
  assert.equal(loaded.length,73); assert.equal(catalog.enemies.length,176);
  for (const config of loaded) for (const mode of ['basic','advanced']) {
    const original = JSON.stringify(config);
    const fight = startWarhammerFight(hero(),config,mode);
    assert.equal(fight.opponents.length,config.enemies.length);
    assert.equal(JSON.stringify(config),original);
  }
  assert.equal(encounter(297).enemies[0].s,9);
  assert.equal(encounter(377).enemies[0].t,7);
  assert.equal(encounter(360).enemies[0].w,6);
});

test('higher stats explicitly extend the diagonal pattern without changing the old chart contract',() => {
  assert.throws(() => woundThreshold(9,4));
  assert.equal(woundThreshold(9,4,100),0);
  assert.equal(woundThreshold(4,7,100),Infinity);
  assert.equal(woundThreshold(7,7,100),4);
});

test('no ranged weapon skips attacks until melee, which may be chosen before round one',() => {
  const initial = startWarhammerFight(hero({ranged:null}),custom({closeAfterRanged:2}),'advanced');
  assert.equal(initial.phase,'ranged');
  const waiting = warhammerRound(initial,{},dice([1]));
  assert.equal(waiting.character.w,100); assert.equal(waiting.opponents[0].w,100);
  const close = warhammerRound(initial,{close:true},dice([6,6,1]));
  assert.equal(close.phase,'close'); assert.equal(close.opponents[0].w,95);
  assert.equal(close.character.s,4,'equipped Power Fist must not overwrite base Strength');
});

test('shield and learned weakness are derived without stacking or changing base stats',() => {
  const fight = startWarhammerFight(hero({armour:3,stormShield:true,tyranidWeakness:true}),custom({enemies:[enemy({armour:5,tyranid:true})]}),'advanced');
  assert.equal(terminatorStats(fight,fight.character).t,5);
  assert.equal(terminatorStats(fight,fight.character).armour,2);
  assert.equal(terminatorStats(fight,fight.opponents[0],false).armour,6);
  assert.equal(fight.character.t,4); assert.equal(fight.character.armour,3);
  assert.equal(fight.opponents[0].armour,5);
});

test('capture interrupts a damaging attack and leaves the player alive',() => {
  const initial = startWarhammerFight(hero({w:5}),encounter(116));
  const result = warhammerRound(initial,{},dice([1,6]));
  assert.equal(result.status,'capture'); assert.equal(result.section,'217');
  assert.ok(result.character.w>0); assert.equal(result.history[0].attacks.length,2);
});

test('the Servitor fight stops at the second kill and carries the survivor into the priest encounter',() => {
  const character = hero({aRanged:3,ranged:{...defaults.basic.ranged,damage:5}});
  const config = encounter(324); config.enemies[2].w=3; config.enemies[2].maxW=5;
  const fight = warhammerRound(startWarhammerFight(character,config),{targets:[0,1,2]},dice([6,1,6,1]));
  assert.equal(fight.status,'interrupted'); assert.equal(fight.section,'262');
  assert.deepEqual(fight.opponents.map(unit => unit.w),[0,0,3]);
  assert.equal(fight.character.ranged.ammo,18,'third attack must not fire after the interruption');
  const continued = startWarhammerFight(fight.character,encounter(262),'basic',fight);
  assert.equal(continued.opponents[0].w,3);
  const turn = warhammerRound(continued,{},dice([1,1,1]));
  assert.deepEqual(turn.history[0].attacks.map(entry => entry.attacker),['Dead Tech-Priest','You','You','You','Servitor']);
});

test('pair and single-opponent fights do not let waiting enemies attack',() => {
  const pairs = startWarhammerFight(hero(),encounter(149),'advanced');
  const first = warhammerRound(pairs,{},dice([]));
  assert.equal(first.history[0].attacks.length,3);
  const single = warhammerRound(startWarhammerFight(hero(),encounter(304)),{},dice([]));
  assert.equal(single.history[0].attacks.length,2);
  assert.throws(() => warhammerRound(startWarhammerFight(hero(),encounter(304)),{targets:[3]}),/engaged/);
});

test('timed routes interrupt before extra attacks and timed fatal routes are losses',() => {
  for (const [section,round,status,target] of [[313,4,'loss','368'],[149,8,'interrupted','173'],[67,3,'loss','13']]) {
    const initial = startWarhammerFight(hero(),encounter(section)); initial.round=round;
    const result = warhammerRound(initial,{},() => {throw Error('Timed interruption rolled an attack');});
    assert.equal(result.round,round); assert.equal(result.status,status); assert.equal(result.section,target);
  }
});

test('Talos checkpoint resumes the same state once, or resolves the recorded DAMNATUS route',() => {
  const initial = startWarhammerFight(hero(),encounter(377)); initial.round=6;
  const paused = warhammerRound(initial,{},dice([]));
  assert.equal(paused.status,'paused'); assert.equal(paused.section,'206');
  const resumed = resumeTerminatorFight(paused,false);
  assert.equal(resumed.status,'fighting'); assert.equal(resumed.round,7);
  assert.deepEqual(resumed.opponents,paused.opponents);
  assert.equal(warhammerRound(resumed,{},dice([])).status,'fighting');
  assert.equal(resumeTerminatorFight(paused,true).section,'66');
  const early = structuredClone(paused); early.round=3;
  assert.equal(resumeTerminatorFight(early,true).section,'200');
  const dead = startWarhammerFight(hero({w:5}),encounter(377));
  const fatal = warhammerRound(dead,{},dice([1,6]));
  assert.equal(fatal.status,'loss'); assert.equal(fatal.section,'143');
});

test('temporary first-round penalties can suppress attacks without changing permanent abilities',() => {
  const fight = warhammerRound(startWarhammerFight(hero(),encounter(215),'advanced'),{},dice([]));
  assert.equal(fight.history[0].attacks.filter(entry => entry.attacker==='You').length,0);
  assert.equal(fight.character.aRanged,1); assert.equal(fight.character.ws,4);
});

test('a mid-round checkpoint retains the unspent enemy attack instead of granting a fresh player turn',() => {
  const paused = warhammerRound(startWarhammerFight(hero({w:8}),encounter(377)),{},dice([1,6]));
  assert.equal(paused.status,'paused'); assert.equal(paused.character.w,3);
  assert.equal(paused.pendingAttacks.remaining,1);
  const continued = continueWarhammerFight(paused,false,dice([6]));
  assert.equal(continued.status,'loss'); assert.equal(continued.section,'143');
  assert.equal(continued.round,1); assert.equal(continued.character.ranged.ammo,19);
  assert.equal(paused.character.w,3,'saved input must remain unchanged');
  const resolved = continueWarhammerFight(paused,true,() => {throw Error('Resolved escape should not attack');});
  assert.equal(resolved.status,'win'); assert.equal(resolved.section,'200');
});

test('the interruptible basic variant still pools fractional damage correctly',() => {
  const result = warhammerRound(startWarhammerFight(hero({ranged:null,aRanged:2,melee:{name:'Test blade',damage:.5}}),custom()),{weapon:'melee'},dice([6,6,1]));
  assert.equal(result.opponents[0].w,99);
  assert.equal(result.history[0].damage[0].damage,1);
});

test('phase-dependent exits, leader routs and wound-driven attack growth use encounter metadata',() => {
  const character = hero({ranged:{...defaults.basic.ranged,damage:100},melee:{name:'Test blade',damage:100}});
  for (const [choice,target] of [['ranged','32'],['melee','53']]) {
    const fight = warhammerRound(startWarhammerFight(character,encounter(106)),{weapon:choice},dice([6,1]));
    assert.equal(fight.status,'win'); assert.equal(fight.section,target);
  }
  const leader = warhammerRound(startWarhammerFight(character,encounter(115)),{targets:[0]},dice([6,1]));
  assert.equal(leader.status,'win'); assert.equal(leader.section,'78');
  assert.equal(leader.opponents[1].w,5,'routed followers are not falsely killed');
  const fiend = startWarhammerFight(hero(),encounter(393),'advanced');
  fiend.opponents[0].w=4;
  assert.equal(terminatorStats(fiend,fiend.opponents[0],false).aClose,5);
  assert.equal(fiend.opponents[0].aClose,3,'growth must not compound into base attacks');
});

test('poison starts next round and persists into the next fight, with advanced stat drain separate',() => {
  const config = encounter(90); config.enemies[0].ws=6; config.enemies[0].armour=0;
  const first = warhammerRound(startWarhammerFight(hero(),config,'advanced'),{},dice([1,6,6,6,1]));
  assert.equal(first.character.poisoned,true);
  assert.equal(first.character.w,95,'first poisoned hit does not also tick immediately');
  assert.equal(first.character.s,3); assert.equal(first.character.t,3);
  const next = warhammerRound(startWarhammerFight(first.character,custom()),{},dice([]));
  assert.equal(next.character.w,94); assert.equal(next.character.poisoned,true);
});
