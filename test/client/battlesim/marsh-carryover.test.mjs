import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadFixtureRoster } from './roster-fixtures.mjs';
import { MARSH_ENCOUNTERS } from '../../../public/js/battlesim/engines/skyfall/monsters-of-the-marsh.js';
import { createMarshFight } from '../../../public/js/battlesim/engines/skyfall/marsh-combat.js';
import { createCombat } from '../../../public/js/battlesim/books/521/combat.js';
await loadFixtureRoster(521);

function fixture(section, from, count = 6) {
  const player = {expertise:12,vitality:18,fortune:8,weaponDamage:2};
  const previous = from === null ? null : {player:{...player},encounter:{section:from,expertiseModifier:-4,foes:[{vitality:3}]}};
  const d = {player,fight:previous,log:[],history:[]};
  const e = MARSH_ENCOUNTERS.find(e => e.section === section);
  let writes = 0;
  const ctx = {data:()=>d,selectedEncounter:()=>e,character:()=>d.fight?.player??d.player,
    element:key=>({value:key==='companions'?'':'',checked:true}),number:()=>count,
    createMarshFight,showAlert:()=>assert.fail('unexpected invalid setup'),tk:key=>key,
    saveAndRender:()=>writes++};
  const combat = createCombat(()=>ctx);
  return {d,e,previous,start:()=>combat.start(),writes:()=>writes};
}

test('both source fights carry injured vitality and the captured expertise modifier', () => {
  for (const from of [342,363]) {
    const f=fixture(359,from), before=structuredClone(f.previous);
    f.start();
    assert.equal(f.d.fight.encounter.foes[0].vitality,3);
    assert.equal(f.d.fight.encounter.expertiseModifier,-4);
    assert.deepEqual(f.previous,before);
    assert.equal(f.writes(),1);
  }
  const f=fixture(359,342);delete f.previous.encounter.expertiseModifier;f.start();
  assert.equal(f.d.fight.encounter.expertiseModifier,0);
});

test('the six-foe continuation carries only the first opponent health', () => {
  const f=fixture(376,274);f.start();
  assert.equal(f.d.fight.encounter.foes.length,6);
  assert.equal(f.d.fight.encounter.foes[0].vitality,3);
  assert.ok(f.d.fight.encounter.foes.slice(1).every(foe=>foe.vitality===7));
  assert.equal(f.d.fight.encounter.expertiseModifier,undefined);
});

test('five-foe and unrelated previous fights retain fresh profiles', () => {
  for (const [section,from,count] of [[376,274,5],[376,342,6],[359,274,6],[359,null,6]]) {
    const f=fixture(section,from,count);f.start();
    assert.equal(f.d.fight.encounter.foes[0].vitality,7);
  }
});

test('pending saved rolls block new setup without changing either fight', () => {
  const f=fixture(359,342);f.previous.pending={selection:{defensePoints:2}};
  const before=structuredClone(f.d);f.start();assert.deepEqual(f.d,before);assert.equal(f.writes(),0);
});

test('carryover follows renamed source metadata rather than source section constants', () => {
  const f=fixture(376,900);f.e=structuredClone(f.e);
  const entry={section:901,foes:[],carryFrom:[{sections:[900],foeCount:2,expertiseModifier:true}]};
  const ctx={data:()=>f.d,character:()=>f.d.player,selectedEncounter:()=>entry,
    element:()=>({value:'',checked:true}),number:()=>2,
    createMarshFight:()=>({player:{...f.d.player},encounter:{foes:[{vitality:7},{vitality:7}]}}),
    saveAndRender(){},showAlert:()=>assert.fail('unexpected setup failure'),tk:key=>key};
  createCombat(()=>ctx).start();
  assert.equal(f.d.fight.encounter.foes[0].vitality,3);
  assert.equal(f.d.fight.encounter.expertiseModifier,-4);
});
