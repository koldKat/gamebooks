import test from 'node:test';
import assert from 'node:assert/strict';
import { readRosterDocument, getRosterRows } from '../../helpers/roster-db.cjs';
import { loadRoster } from '../../../public/js/battlesim/books/1566/definition.js';
import { startFight, chartResult, attack } from '../../../public/js/battlesim/engines/shinte/core.js';
import { encounterRules, missileDamage } from '../../../public/js/battlesim/books/1566/effects.js';

const document = readRosterDocument(1566);
const encounters = document.enemies.filter(row => row.stats.dataset === 'ENCOUNTERS').map(row => row.stats.entry);
const rules = document.enemies.find(row => row.stats.dataset === 'RULES').stats.entry;

test('installed Shinté data preserves 26 printed pools and the complete original chart', async () => {
  assert.equal(encounters.length,26); assert.equal(new Set(encounters.map(row => row.section)).size,26);
  assert.equal(document.enemies.length,27);
  assert.equal(rules.chart.values.length,9); assert.equal(rules.chart.columnLabels.length,11);
  assert.equal(rules.chart.values.flat().length,99);
  assert.equal(rules.chart.columnLabels[5],'-1/+1');
  assert.equal(rules.chart.values[1][4],2); assert.equal(rules.chart.values[1][5],1);
  assert.equal(rules.chart.values[4][0],1);
  assert.equal(rules.chart.values[0][0],'K'); assert.equal(rules.chart.values[8][10],'K');
  const rows = getRosterRows(1566);
  await loadRoster(async url => {
    assert.equal(url,'/api/books/1566/enemies');
    return {ok:true,json:async () => rows};
  });
});

test('every printed Shinté chart cell resolves through its original labels', () => {
  const c = rules.chart;
  for (const [row,label] of c.rowLabels.entries()) {
    const total = Number(label.split('-')[0]);
    for (const [column,columnLabel] of c.columnLabels.entries()) {
      const difference = Number(columnLabel.replace(/^[<>]=/,'').split('/')[0]);
      assert.equal(chartResult(c,difference,total).result,c.values[row][column]);
    }
  }
  assert.equal(chartResult(c,0,7,5).result,c.values[4][5]);
  assert.throws(() => chartResult(c,0,7));
});

test('all printed Shinté presets initialize one pool without changing source data', () => {
  const before = JSON.stringify(encounters);
  const hero = {cs:25,ds:25,pp:30,maxPP:40,sp:10,maxSP:20,agility:9,guile:9};
  for (const encounter of encounters) {
    assert.equal(encounter.printedBlockCount,1);
    const options = encounterRules(encounter,hero,{first:'enemy',styles:{},openingDamage:0});
    const fight = startFight({player:hero,enemies:[encounter],zeroColumn:5,...options});
    assert.equal(fight.enemies.length,1);
    assert.equal(fight.enemies[0].cs,encounter.cs); assert.equal(fight.enemies[0].ds,encounter.ds);
    assert.equal(fight.enemies[0].pp,encounter.pp-(encounter.section === '408' ? hero.guile : 0));
    if (!encounter.firstRule) assert.throws(() => encounterRules(encounter,hero,{first:'',styles:{}}));
  }
  assert.equal(JSON.stringify(encounters),before);
  assert.equal(hero.pp,30);
});

test('installed opening missile rules retain the two passages’ distinct limits and examples', () => {
  assert.equal(rules.missiles['264'].axes.maximum,3); assert.equal(rules.missiles['353'].axes.maximum,2);
  assert.equal(rules.missiles['264'].darts.recovery,'all'); assert.equal(rules.missiles['353'].darts.recovery,'one');
  assert.equal(missileDamage(rules.missiles['264'],'stars',5,{agility:9},{}),19);
  assert.equal(missileDamage(rules.missiles['353'],'daggers',3,{agility:8},{}),17);
  assert.equal(missileDamage(rules.missiles['353'],'bow',2,{agility:8},{eagle:true}),26);
});

test('a printed Shinté K remains an unresolved decision without automatic casualties', () => {
  const f = startFight({player:{cs:0,ds:20,pp:20,maxPP:20},enemies:[{name:'Manual test',cs:20,ds:20,pp:20}],first:'player'});
  const next = attack(f,rules.chart,{total:2});
  assert.equal(next.pending.kind,'K'); assert.equal(next.playerPP,20); assert.equal(next.enemies[0].pp,20);
  assert.equal(next.outcome,null);
});
