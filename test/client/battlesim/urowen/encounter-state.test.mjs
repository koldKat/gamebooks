import {UROWEN_SOURCE} from '../../../../public/js/battlesim/engines/urowen/roster.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createUrowenCharacter} from '../../../../public/js/battlesim/engines/urowen/core.js';
import * as state from '../../../../public/js/battlesim/engines/urowen/state.js';
const source=UROWEN_SOURCE;
const encounters=state.compileUrowenEncounters(source);
const spec=section=>encounters.find(row=>row.section===section);
test('all 82 source encounters compile with every stat and independent armor array',()=>{
  assert.equal(encounters.length,82);
  assert.equal(encounters.reduce((n,row)=>n+row.enemies.length,0),100);
  for(const row of encounters) {
    const original=source.encounters.find(s=>s.section===row.section);
    row.enemies.forEach((enemy,index)=>{
      const sourceEnemy=original.rows[row.section===224?0:index];
      for(const key of ['attribute','attributeValue','life','damageDice','damageBonus','power'])assert.equal(enemy[key],sourceEnemy[key]);
      assert.deepEqual(enemy.armorByLocation,sourceEnemy.armorByLocation);
      assert.notEqual(enemy.armorByLocation,sourceEnemy.armorByLocation);
      assert.equal(enemy.maxLife,sourceEnemy.life);
    });
  }
});
test('all five sisteliums have separate health and armor',()=>{
  const enemies=structuredClone(spec(224).enemies);
  assert.equal(enemies.length,5);
  enemies[0].life=0;enemies[0].armorByLocation[0]=0;
  for(const enemy of enemies.slice(1)){assert.equal(enemy.life,7);assert.equal(enemy.armorByLocation[0],2);}
});
test('a prepared encounter cannot silently discard an active encounter',()=>{
  const first=state.prepareUrowenEncounter(state.createUrowenSimState(),spec(8));
  assert.throws(()=>state.prepareUrowenEncounter(first,spec(9)),/Finish or reset/);
  assert.equal(first.fight.section,8);
});
test('per-index guard, dog, elite and winged-beast abilities match source',()=>{
  assert.equal(spec(267).enemies[2].rules.dodgeOn[0],6);
  assert.equal(spec(267).enemies[3].rules.rawDamage6Bleed,2);
  assert.equal(spec(281).enemies[3].rules.rawDamage1Venom,2);
  assert.deepEqual(spec(315).enemies[2].rules.rerollAll,[1,2]);
  assert.equal(spec(325).enemies[3].rules.rawDamage6Bleed,2);
  assert.ok(spec(325).enemies.every(e=>e.rules.wonRawAttack6NextPenalty===1));
});
test('second-stage fights preserve temporary power instead of granting the bonus again',()=>{
  const saved=state.createUrowenSimState(createUrowenCharacter());
  const first=state.prepareUrowenEncounter(saved,spec(178));
  first.temporary.player.power=1;first.fight.status='win';
  const second=state.prepareUrowenEncounter(first,spec(163));
  assert.equal(second.fight.player.power,1);
  assert.deepEqual(second.character,saved.character);
  assert.equal(saved.temporary,null);
});
test('normal second lion does not receive an invented third-stage transformation',()=>{
  const saved=state.createUrowenSimState(createUrowenCharacter());
  const next=state.prepareUrowenEncounter(saved,spec(255));
  assert.equal(next.temporary,null);assert.deepEqual(next.fight.player.attributes,saved.character.attributes);
  const transformed=state.prepareUrowenEncounter(saved,spec(235));
  assert.equal(transformed.temporary.stage,3);assert.equal(transformed.fight.player.maxLife,30);
});
test('mission encounters carry remaining life instead of resetting to 100',()=>{
  const saved=state.createUrowenSimState(createUrowenCharacter());
  const first=state.prepareUrowenEncounter(saved,spec(267));
  first.temporary.player.life=23;first.fight.status='win';
  const next=state.prepareUrowenEncounter(first,spec(281));
  assert.equal(next.fight.player.life,23);assert.equal(next.fight.player.maxLife,100);
  assert.deepEqual(next.character,saved.character);
});
test('temporary state updates never mutate the original character',()=>{
  const saved=state.createUrowenSimState(createUrowenCharacter());
  const first=state.prepareUrowenEncounter(saved,spec(178));
  const changed=structuredClone(first.temporary.player);changed.life=2;
  const next=state.recordUrowenTemporaryPlayer(first,changed);
  assert.equal(next.temporary.player.life,2);assert.equal(first.temporary.player.life,28);
  assert.deepEqual(next.character,saved.character);
});
test('fight restrictions use clones, never strip the saved armor or weapon',()=>{
  const saved=state.createUrowenSimState(createUrowenCharacter());saved.character.armor=[2,4,4,4,2,3];
  const naked=state.prepareUrowenEncounter(saved,spec(46));
  assert.deepEqual(naked.fight.player.armor,[0,0,0,0,0,0]);assert.deepEqual(saved.character.armor,[2,4,4,4,2,3]);
  const brawl=state.prepareUrowenEncounter(saved,spec(79),{unarmedAttribute:'MAG'});
  assert.equal(brawl.fight.player.weapon.attribute,'MAG');assert.equal(brawl.fight.player.weapon.bonus,-1);
  assert.equal(saved.character.weapon.bonus,-3);
});
