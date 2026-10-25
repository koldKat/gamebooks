import {loadFixtureRoster} from './roster-fixtures.mjs';
await loadFixtureRoster(689);
import test from 'node:test';
import assert from 'node:assert/strict';
import {VALLEY_SETTINGS} from '../../../public/js/battlesim/engines/legendary-kingdoms/valley-roster.js';
import {newValleyCharacter} from '../../../public/js/battlesim/engines/legendary-kingdoms/character.js';
import {startValleyFight,startValleyArmy} from '../../../public/js/battlesim/engines/legendary-kingdoms/valley.js';
import {planLegendaryEnemy} from '../../../public/js/battlesim/engines/legendary-kingdoms/enemy-actions.js';
import {applyLegendaryEndRound} from '../../../public/js/battlesim/engines/legendary-kingdoms/effects.js';
import {legendaryArmyStep} from '../../../public/js/battlesim/engines/legendary-kingdoms/army.js';
import {legendaryTommulRewardAvailable} from '../../../public/js/battlesim/engines/legendary-kingdoms/combat.js';
const party=()=>['jessica','tiquon','tasha','akihiro'].map(newValleyCharacter);
const withSettings=fn=>{const old=structuredClone(VALLEY_SETTINGS);try{fn();}finally{Object.assign(VALLEY_SETTINGS,old);}};

test('Valley conditional opponents, enlightenment and arrival timing use metadata',()=>withSettings(()=>{
  VALLEY_SETTINGS.codes.bronzeguard='TEST';
  const king=startValleyFight(party(),214,{codes:['TEST']});
  assert.ok(!king.enemies.some(e=>/Bronzeguard/i.test(e.name)));
  VALLEY_SETTINGS.enlightened={threshold:6,defence:2};
  const monk=startValleyFight(party(),500,{enlightened:true});
  assert.deepEqual([monk.enemies[0].threshold,monk.enemies[0].defence],[6,2]);
  VALLEY_SETTINGS.arrivalRound=5;
  assert.equal(startValleyFight(party(),117).enemies[1].arrivalRound,5);
}));

test('enemy spell tables preserve source attack shapes while reading metadata',()=>withSettings(()=>{
  VALLEY_SETTINGS.monkeys.attacks[0]={count:2,threshold:5};
  const monkeys=startValleyFight(party(),564);
  assert.deepEqual(planLegendaryEnemy(monkeys,1,()=>1),[{enemyIndex:1,count:2,threshold:5}]);
  VALLEY_SETTINGS.imopposh.firstCount=7;
  assert.deepEqual(planLegendaryEnemy(startValleyFight(party(),563),0,()=>1).map(a=>a.count),[7,7]);
  VALLEY_SETTINGS.fastilon.firstHits=9;
  assert.equal(planLegendaryEnemy(startValleyFight(party(),702),0,()=>1)[0].hits,9);
}));

test('Skallos healing and party injury use loaded settings without resetting saved extensions',()=>withSettings(()=>{
  VALLEY_SETTINGS.skallos.healing=2;VALLEY_SETTINGS.skallos.partyDamage=2;
  const fight=JSON.parse(JSON.stringify(startValleyFight(party(),16)));
  fight.enemies[0].health=10;fight.extension={keep:true};fight.round=4;
  applyLegendaryEndRound(fight,()=>1);
  assert.equal(fight.enemies[0].health,12);
  assert.equal(fight.party[0].health,6);
  assert.equal(fight.round,4);assert.deepEqual(fight.extension,{keep:true});
}));

test('Descantos spell targets and reductions come from metadata',()=>withSettings(()=>{
  VALLEY_SETTINGS.descantos.targets[0]=0;VALLEY_SETTINGS.descantos.amount=2;
  const formation=[0,1,2].map(i=>[{name:'Unit '+i,strength:5,morale:6}]);
  const fight=startValleyArmy(formation,162);
  const next=legendaryArmyStep(fight,()=>1);
  assert.equal(next.player[0][0].strength,3);
  assert.equal(next.player[1][0].strength,5);
  assert.equal(fight.player[0][0].strength,5);
}));

test('Tommul reward availability uses loaded identity and deadline',()=>withSettings(()=>{
  const fight=startValleyFight(party(),239,{participants:[0]});
  fight.enemies[0].health=0;fight.round=4;
  assert.equal(legendaryTommulRewardAvailable(fight),false);
  VALLEY_SETTINGS.tommul.lastRound=4;
  assert.equal(legendaryTommulRewardAvailable(fight),true);
  VALLEY_SETTINGS.tommul.section=888;
  assert.equal(legendaryTommulRewardAvailable(fight),false);
}));
