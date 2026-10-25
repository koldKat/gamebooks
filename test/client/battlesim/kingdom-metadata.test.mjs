import { loadFixtureRoster } from './roster-fixtures.mjs';
await loadFixtureRoster(530);
import test from 'node:test';
import assert from 'node:assert/strict';
import { KINGDOM_RULES, KINGDOM_FRED } from '../../../public/js/battlesim/engines/grailquest/kingdom-of-horror-roster.js';
import * as combat from '../../../public/js/battlesim/engines/grailquest/kingdom-of-horror.js';
import * as magic from '../../../public/js/battlesim/engines/grailquest/kingdom-of-horror-magic.js';
import * as travel from '../../../public/js/battlesim/engines/grailquest/kingdom-of-horror-travel.js';

const low = () => 0;
const player = extra => ({ ...combat.createKingdomCharacter(), life:100, maxLife:100, ...extra });
const fight = (id, extra = {}) => {
  const f = combat.startKingdomFight(player(extra),id,{},low);
  f.first = 'player';
  return f;
};

test('Deathbell reads the Fred profile and allegiance rule without altering captured summons', () => {
  const original = structuredClone(KINGDOM_FRED), rules = structuredClone(KINGDOM_RULES);
  try {
    Object.assign(KINGDOM_FRED,{name:'Source Fred',life:40,hit:8,bonus:2,armour:3});
    KINGDOM_RULES.deathbell.enemyMax=6;
    const hostile=fight(16,{magic:{deathbell:1}});
    magic.kingdomCast(hostile,'deathbell',0,{},low);
    const foe=hostile.foes.at(-1);
    assert.deepEqual([foe.name,foe.life,foe.maxLife,foe.hit,foe.bonus,foe.armour],['Source Fred',40,40,8,2,3]);
    KINGDOM_RULES.deathbell.enemyMax=0;
    const friendly=fight(16,{magic:{deathbell:1}});
    magic.kingdomCast(friendly,'deathbell',0,{},low);
    assert.equal(friendly.ally.life,40); assert.equal(friendly.ally.expiresAfterFight,true);
    friendly.ally.life=17; friendly.ally.extension={keep:true};
    const saved=JSON.parse(JSON.stringify(friendly));
    Object.assign(KINGDOM_FRED,{life:99,hit:2,bonus:30});
    saved.allyPending=true; combat.kingdomAllyAttack(saved,low);
    assert.equal(saved.ally.life,17); assert.equal(saved.ally.hit,8); assert.equal(saved.ally.bonus,2);
    assert.deepEqual(saved.ally.extension,{keep:true});
  } finally { Object.assign(KINGDOM_FRED,original); Object.assign(KINGDOM_RULES,rules); }
});

test('metadata controls packs, opening guards, trial duration and bear grip', () => {
  const original=structuredClone(KINGDOM_RULES);
  try {
    KINGDOM_RULES.packOffset=1; assert.equal(fight(47).foes.length,2);
    KINGDOM_RULES.guardsOpeningCount=2;
    const guards=fight(119);guards.first='enemy';combat.kingdomEnemyAttack(guards,low);
    assert.equal(guards.enemyQueue.length,2);
    KINGDOM_RULES.trial={rounds:2,minLife:1};
    const trial=fight(131);
    combat.rollKingdomRound(trial,0,low);combat.rollKingdomRound(trial,0,low);
    assert.equal(trial.trialPassed,true); assert.equal(trial.rounds,2);
    KINGDOM_RULES.bearGrip={releaseAt:3,damage:2};
    const bear=fight(82);combat.kingdomBreakBearGrip(bear,low);
    assert.equal(bear.player.life,98); assert.equal(bear.bearGripped,true);
    combat.kingdomBreakBearGrip(bear,()=>.2);assert.equal(bear.bearGripped,false);
  } finally { Object.assign(KINGDOM_RULES,original); }
});

test('metadata controls witch spells and strict one-time loot eligibility', () => {
  const original=structuredClone(KINGDOM_RULES);
  try {
    KINGDOM_RULES.witchMagic={hit:2,dragonfire:9,psionicDragonfire:4,kangling:3};
    const fire=fight(78);fire.first='enemy';fire.foes[0].life=fire.foes[1].life=0;
    fire.foes[2].psionicThroughRound=99;combat.kingdomEnemyAttack(fire,low);
    assert.equal(fire.player.life,96);assert.equal(fire.foes[2].pills,5);
    const gel=fight(78);gel.first='enemy';gel.foes[0].life=gel.foes[2].life=0;
    combat.kingdomEnemyAttack(gel,low);assert.equal(gel.gelDamage,3);
    assert.equal(gel.foes[1].spellsUsed,1);
    KINGDOM_RULES.witchLoot={encounterId:900,rewards:[{item:'kangling',charges:7}]};
    const loot=fight(16);loot.status='win';loot.spec.id='900';
    assert.equal(combat.kingdomCollectWitchLoot(loot),false);
    loot.spec.id=900;assert.equal(combat.kingdomCollectWitchLoot(loot),true);
    assert.equal(loot.player.magic.kangling,7);assert.equal(combat.kingdomCollectWitchLoot(loot),false);
  } finally { Object.assign(KINGDOM_RULES,original); }
});

test('metadata controls city patrols and court thresholds', () => {
  const original=structuredClone(KINGDOM_RULES);
  try {
    KINGDOM_RULES.patrol={clearAt:7,countDice:2,fine:30};
    const p=player({gold:40}),before=structuredClone(p);
    const patrol=travel.kingdomCityPatrol(p,()=>.999);
    assert.equal(patrol.count,12);assert.equal(patrol.fine,30);assert.deepEqual(p,before);
    assert.equal(travel.kingdomPayFine(patrol.player,KINGDOM_RULES.patrol.fine),true);
    assert.equal(patrol.player.gold,10);
    KINGDOM_RULES.court={releasedAt:8,penaltyAt:4};
    assert.equal(combat.kingdomCourt(()=>.5).result,'released');
    assert.equal(combat.kingdomCourt(()=>.2).result,'penalty');
    assert.equal(combat.kingdomCourt(low).result,'hanged');
  } finally { Object.assign(KINGDOM_RULES,original); }
});
