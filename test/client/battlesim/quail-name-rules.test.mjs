import test from 'node:test';
import assert from 'node:assert/strict';
import {loadFixtureRoster} from './roster-fixtures.mjs';
import {quailEnemyRules} from '../../../public/js/battlesim/books/829/definition.js';

await loadFixtureRoster(829);

test('installed presets retain exact names, prefix matching and default resets', () => {
  for (const [name,rule] of [
    ['Огнен бръмбар','plus3six'],['Огнен бръмбар II','plus3six'],
    ['Огромен плъх','sum2'],['Скелет магьосник','sum2'],
    ['Върховен жрец на огъня','max2'],['Върховен жрец на водата','water'],
    ['Скална усойница','extra6'],['Демон-пъдпъдък','explode56'],
    ['Огнен гущер','explode12'],['Дървеница','bedbug'],['Инсумо','extra12'],
  ]) assert.equal(quailEnemyRules(name).rule,rule,name);
  for (const name of ['Изгубена душа I','Планински призрак II']) {
    assert.deepEqual(quailEnemyRules(name),{rule:'standard',aura:1,lowRoll:false});
  }
  for (const name of ['Боен тритон','Гигантски плъх']) assert.equal(quailEnemyRules(name).lowRoll,true);
  for (const name of ['Огромен плъх II','Инсумо II','огнен бръмбар','xОгнен бръмбар','Боен тритон II','Unknown','']) {
    assert.deepEqual(quailEnemyRules(name),{rule:'standard',aura:0,lowRoll:false},name);
  }
  const manual=quailEnemyRules('Инсумо');manual.rule='standard';
  assert.equal(quailEnemyRules('Инсумо').rule,'extra12');
});

test('metadata controls mode priority, independent override and non-NPC-specific names', async () => {
  const {loadRoster,quailEnemyRules:resolve}=await import('../../../public/js/battlesim/books/829/definition.js?custom-rules');
  const entries=[
    {kind:'mode',value:'sum2',namePattern:'^Custom',flags:''},
    {kind:'mode',value:'water',namePattern:'^Custom',flags:''},
    {kind:'modeOverride',value:'extra12',namePattern:'^Custom boss$',flags:''},
    {kind:'aura',value:2,namePattern:'boss$',flags:''},
    {kind:'lowRoll',value:true,namePattern:'boss$',flags:''},
  ];
  await loadRoster(async()=>({ok:true,json:async()=>entries.map((entry,entryIndex)=>({stats:{schemaVersion:1,dataset:'NPC_NAME_RULES',entryIndex,slot:0,partCount:1,entry}}))}));
  assert.equal(resolve('Custom foe').rule,'sum2');
  assert.deepEqual(resolve('Custom boss'),{rule:'extra12',aura:2,lowRoll:true});
  assert.deepEqual(resolve('Инсумо'),{rule:'standard',aura:0,lowRoll:false});
});
