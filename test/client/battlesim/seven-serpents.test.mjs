import { loadFixtureRoster } from './roster-fixtures.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { ENCOUNTERS, SPELL_ENCOUNTERS, SERPENT_RULES, encounterFor } from '../../../public/js/battlesim/books/723/definition.js';
import * as rules from '../../../public/js/battlesim/books/723/combat.js';
import * as effects from '../../../public/js/battlesim/books/723/effects.js';
import { createState } from '../../../public/js/battlesim/books/723/state.js';
import en from '../../../public/js/i18n/en/battlesim/battlesim723.js';
import bg from '../../../public/js/i18n/bg/battlesim/battlesim723.js';

await loadFixtureRoster(723);

const rolls = (...values) => () => { assert.ok(values.length, 'Unexpected die'); return values.shift(); };
const hero = changes => ({ ...rules.newCharacter('wizard', () => 6), ...changes });

test('723: extra arrow, acid and Earth Serpent effects read metadata and preserve saved wounds', () => {
  const original=structuredClone(SERPENT_RULES);
  try {
    SERPENT_RULES.extraArrow={hitMaximum:4,damage:5};
    const arrows=rules.startFight(445,hero(),{},rolls(4,6,6,6));
    assert.equal(arrows.player.stamina,17);
    SERPENT_RULES.acid.damageByRoll[1]=7;SERPENT_RULES.acid.skillLoss=2;
    const fight=rules.startFight(286,hero(),{applyEntry:false});
    fight.acidStarted=true;fight.rounds=4;fight.enemies[0].stamina=7;
    fight.pending=[{kind:'player-hit',enemy:0,damage:2}];fight.extension={keep:true};
    const saved=JSON.parse(JSON.stringify(fight)),snapshot=structuredClone(saved);
    const resolved=rules.resolveLuck(saved,false,rolls(2));
    assert.equal(resolved.player.stamina,17);assert.equal(resolved.player.skill,8);
    assert.equal(resolved.enemies[0].stamina,5);assert.equal(resolved.rounds,4);
    assert.deepEqual(resolved.extension,{keep:true});assert.deepEqual(saved,snapshot);
    SERPENT_RULES.earthLift={damage:7,destination:999};
    assert.equal(effects.liftEarthSerpent(hero({luck:1}),false,rolls(6,6)).character.stamina,17);
    assert.equal(effects.liftEarthSerpent(hero(),false,rolls(1,1,1,1)).destination,999);
  } finally { Object.assign(SERPENT_RULES,original); }
});

test('723: fire-fox route, elemental eligibility and air-serpent damage read metadata', () => {
  const original=structuredClone(SERPENT_RULES);
  try {
    SERPENT_RULES.fireFoxNotice=999;
    let fight=rules.startFight(256,hero(),{applyEntry:false});
    fight.pending=[{kind:'player-hit',enemy:0,damage:2}];
    assert.equal(rules.resolveLuck(fight,false).noticeDestination,999);
    SERPENT_RULES.elementalStaff={enemies:['wildBear'],penalty:4};
    fight=rules.startFight(139,hero({elementalStaff:true}),{applyEntry:false});
    assert.equal(rules.round(fight,0,()=>1).events[0].enemyAS,6);
    fight=rules.startFight(261,hero({skill:0}),{applyEntry:false});
    fight.config.enemyStreakDamage=[2,6,18,54];fight.enemyStreak=4;
    assert.equal(rules.round(fight,0,()=>1).pending[0].damage,162);
  } finally { Object.assign(SERPENT_RULES,original); }
});

test('723: backend rewards each fresh combat outcome once, never cancelled or redirected fights', () => {
  const events=[],db={exec(){},transaction:fn=>()=>fn(),prepare:()=>({run(){},all:()=>[],get:()=>({id:723,total_sections:498,is_container:0})})};
  const scope={module:{exports:{}},events,require(name){
    if(name==='./connection')return{db};
    if(name==='./diamonds')return{diamondInfoForUser:()=>({})};
    if(name==='./rubies')return{rubyInfoForUser:()=>({}),createRubyCompletionChecker:()=>()=>0};
    if(name==='./heartbeat-coins')return{advanceHeartbeatCoins:()=>0};
    if(name==='./job-xp')return{getJobTitle:()=>''};
    if(name==='./auth')return{generateToken:()=> 'test-only'};
    if(name==='../impersonation-context')return{isImpersonatingContext:()=>false};
    if(name==='../clean-run')return{isCleanRun:()=>false};
    throw Error(name);
  }};
  runInNewContext(readFileSync(new URL('../../../server/db/xp.js',import.meta.url),'utf8')+'\nawardXp=(...args)=>events.push(args);',scope);
  assert.equal(scope.module.exports.SIM_HISTORY_KEYS.filter(key=>key==='sim723').length,1);
  const state=history=>({graph:{},playthroughs:[{startedAt:123,path:[1],sim723:{history}}]});
  const after=state(['win','loss','cancelled','continue'].map((outcome,index)=>({outcome,ts:index+10})));
  scope.module.exports.processStateXp(1,723,state([]),after);
  assert.deepEqual(events.filter(row=>row[1].startsWith('battlesim_')).map(row=>[...row]),[[1,'battlesim_win','sim723:10'],[1,'battlesim_loss','sim723:11']]);
  events.length=0;scope.module.exports.processStateXp(1,723,after,after);
  assert.ok(events.every(row=>!row[1].startsWith('battlesim_')));
});

test('723: printed defaults, recovery, poison deadline and separate lifting checks', () => {
  const character = hero(), snapshot = structuredClone(character);
  assert.equal(character.skill, 10); assert.equal(character.stamina, 24); assert.equal(character.luck, 12);
  assert.equal(character.provisions, 2); assert.equal(character.gold, 20);
  assert.equal(rules.newCharacter('warrior', () => 6).skill, 12);
  assert.equal(effects.eat({...character, stamina: 10}).stamina, 12);
  assert.equal(effects.eat({...character, stamina: 10, mealsToday: 1}).stamina, 11);
  assert.equal(effects.nextDay({...character, stamina: 10}).stamina, 10);
  assert.equal(effects.nextDay({...character, stamina: 10, mealsToday: 1}).stamina, 13);
  assert.equal(effects.nextDay({...character, poisoned: true}).dead, true);
  const cured = effects.antidote({...character, poisoned: true, antidote: true, afflictions: ['snake-poison','curse']});
  assert.equal(cured.poisoned, false); assert.equal(cured.antidote, false); assert.deepEqual(cured.afflictions, ['curse']);
  assert.equal(effects.liftEarthSerpent(character, false, rolls(1,1,1,1)).destination, 127);
  assert.equal(effects.liftEarthSerpent({...character,luck:1}, false, rolls(6,6)).character.stamina, 21);
  assert.equal(effects.liftEarthSerpent({...character,luck:1}, true, rolls(6,6)).character.stamina, 24);
  assert.equal(effects.liftEarthSerpent({...character,skill:2}, false, rolls(1,1,1,1)).success, false);
  assert.deepEqual(character, snapshot);
});

test('723: spell components, entry Luck, temporary effects and wizard guards', () => {
  const character = hero({skill:20,skillInitial:20});
  assert.equal(rules.startFight(340,character).enemies[0].skill,6);
  assert.equal(rules.startFight(372,character,{hasComponent:true}).config.playerDamage,4);
  assert.equal(rules.startFight(372,character,{hasComponent:false}).player.skill,19);
  assert.equal(rules.startFight(373,character,{hasComponent:true,count:2}).enemies[0].skill,7);
  assert.equal(rules.startFight(376,character,{hasComponent:true},rolls(1,1)).enemies.length,3);
  assert.equal(rules.startFight(431,character,{hasComponent:true},rolls(1,1)).enemies.length,1);
  assert.equal(rules.startFight(431,{...character,luck:1},{hasComponent:true},rolls(6,6)).enemies.length,3);
  const avoided = rules.startFight(451,character,{hasComponent:true,testLuck:true},rolls(1,1,1));
  assert.equal(avoided.enemies.length,0); assert.equal(avoided.destination,160);
  assert.equal(rules.startFight(398,character,{hasComponent:true},rolls(1)).destination,271);
  const doubled = rules.round(rules.startFight(440,character),0,rolls(1,1,6,6));
  assert.equal(doubled.events[0].playerAS,42); assert.equal(doubled.player.skill,20);
  let enraged = rules.round(rules.startFight(488,character),0,rolls(1,1,1,1));
  assert.equal(enraged.events[0].enemyAS,13);
  enraged = rules.round(rules.resolveLuck(enraged),0,rolls(1,1,1,1));
  assert.equal(enraged.events[0].enemyAS,9);
  const protectedHero = rules.startFight(474,character,{hasComponent:true});
  assert.equal(protectedHero.player.stamina,23); assert.equal(protectedHero.player.skill,20);
  assert.equal(protectedHero.playerSkillModifier,2);
  assert.throws(()=>rules.startFight(376,character),/availability/);
  assert.throws(()=>rules.startFight(340,{...character,role:'warrior'}),/wizard/);
  assert.throws(()=>rules.startFight(431,character,{hasComponent:true,applyEntry:false}),/previously/);
});

test('723: allies shield only assigned opponents and leave surviving foes to the player', () => {
  const character = hero({goblinTeeth:8,giantTeeth:1});
  let fight = rules.startFight(459,character,{summonCount:2});
  assert.deepEqual(rules.targets(fight),[2,3]); assert.equal(fight.player.goblinTeeth,6);
  fight.player.attackModifier=-20;
  fight=rules.round(fight,2,rolls(6,6,1,1,6,6,1,1,1,1,6,6,6,6));
  assert.equal(fight.enemies[0].stamina,4); assert.equal(fight.enemies[1].stamina,3);
  assert.equal(fight.pending.length,2); assert.equal(fight.player.stamina,22);
  fight=rules.resolveLuck(rules.resolveLuck(fight)); assert.equal(fight.player.stamina,18);
  assert.deepEqual(rules.targets(rules.startFight(459,character,{summonCount:0})),[0]);
  fight=rules.startFight(459,character,{summonCount:4}); assert.deepEqual(rules.targets(fight),[]);
  assert.equal(rules.round(fight,undefined,()=>1).rounds,1);
  fight=rules.startFight(382,character,{hasComponent:true});
  assert.throws(()=>rules.attemptEscape(fight,rolls(1,1)),/demons round/);
  fight.allies[0].stamina=1; fight=rules.round(fight,undefined,rolls(1,1,6,6));
  assert.deepEqual(rules.targets(fight),[0]); assert.equal(fight.player.stamina,23);
  assert.equal(rules.startFight(475,character,{hasComponent:true}).player.giantTeeth,0);
  assert.equal(rules.startFight(343,character).player.goblinTeeth,6);
  assert.equal(rules.startFight(343,{...character,goblinTeeth:0}).player.stamina,21);
});

test('723: slow poison never doubles the original snake fight retroactively', () => {
  const character=hero(); let fight=rules.startFight(202,character);
  for(const enemy of [0,1]) {
    fight.pending=[{kind:'enemy-hit',enemy,damage:2}]; fight=rules.resolveLuck(fight);
    assert.equal(fight.player.poisoned,false);
  }
  assert.equal(fight.player.stamina,20); assert.equal(fight.snakeBitten,true);
  for(const enemy of fight.enemies) enemy.stamina=0;
  fight.enemies[6].stamina=1; fight.pending=[{kind:'player-hit',enemy:6,damage:2}];
  fight=rules.resolveLuck(fight);
  assert.equal(fight.destination,260); assert.equal(fight.player.poisoned,true);
  assert.equal(rules.loseStamina(fight.player,2).character.stamina,16);
});

test('723: state actions recheck the live run, preserve unrelated data and record outcomes once', () => {
  let run={other:{preserved:true}},book=723,saves=0;
  const store=createState(()=>({currentBookId:book,currentPlaythrough:()=>run,saveState:()=>saves++}));
  store.change(data=>{data.character=hero();});
  const previous=structuredClone(run), original=run;
  assert.equal(store.change(data=>{data.character.gold=999;run={};}),false);
  assert.deepEqual(original,previous); assert.equal(saves,1);
  run=original; book=724; assert.equal(store.change(()=>{}),false); book=723;
  store.change(data=>{data.fight={outcome:'win',recorded:false,name:'Test',player:hero()};});
  store.change(()=>{}); assert.equal(run.sim723.history.length,1);
  assert.deepEqual(run.other,{preserved:true});
  const before=structuredClone(run); assert.throws(()=>store.change(data=>{data.character.gold=500;throw Error('rollback');}));
  assert.deepEqual(run,before);
});

test('723: all encounter, actor and component labels have matching bilingual placeholders', () => {
  assert.deepEqual(Object.keys(en).sort(),Object.keys(bg).sort());
  for(const key in en) {
    const placeholders=value=>[...value.matchAll(/\{([^}]+)\}/g)].map(match=>match[1]).sort();
    assert.deepEqual(placeholders(en[key]),placeholders(bg[key]),key);
  }
  assert.equal(ENCOUNTERS.length,33); assert.equal(SPELL_ENCOUNTERS.length,44);
  assert.equal(ENCOUNTERS.flatMap(encounter=>encounter.enemies).length,51);
  for(const item of [...ENCOUNTERS,...SPELL_ENCOUNTERS]) {
    const encounter=encounterFor(item.section);
    for(const labels of [en,bg]) {
      assert.ok(labels['battlesim723.encounter.'+item.section]);
      assert.ok(labels['battlesim723.note.'+(encounter.mode??'standard')]);
      for(const enemy of encounter.enemies) assert.ok(labels['battlesim723.enemy.'+enemy.key]);
      if(encounter.component) assert.ok(labels['battlesim723.component.'+encounter.component]);
    }
  }
});
