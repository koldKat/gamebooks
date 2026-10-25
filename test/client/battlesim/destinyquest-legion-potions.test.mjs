import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {decodeDestinyRoster} from '../../../public/js/battlesim/engines/destinyquest/winters-fury-roster.js';
import {createLegionFight} from '../../../public/js/battlesim/engines/destinyquest/legion.js';
import {startDestinyRound} from '../../../public/js/battlesim/engines/destinyquest/core.js';
import {useDestinyPotionModifier} from '../../../public/js/battlesim/engines/destinyquest/abilities.js';
import {destinyStat} from '../../../public/js/battlesim/engines/destinyquest/effects.js';
import {beginDestinySession,applyDestinySessionAction} from '../../../public/js/battlesim/engines/destinyquest/session.js';
const roster=decodeDestinyRoster(JSON.parse(fs.readFileSync(new URL('../../../data/simulator-rosters/1286.json',import.meta.url),'utf8')).enemies);
const hero={speed:20,brawn:0,magic:1,armour:4,health:10,maxHealth:30};
const modifiers={health:{amount:4,uses:2,duration:1},magic:{amount:2,uses:1,duration:2}};
const make=(options={})=>startDestinyRound(createLegionFight(hero,'18',{roster,character:{notes:'keep',potionModifiers:modifiers},...options}),0);

test('potion modifiers consume a use and share the one-potion-per-round limit without an inventory',()=>{
  const original=make(),f=useDestinyPotionModifier(original,'health');
  assert.equal(f.hero.health,14);assert.equal(f.character.potionModifiers.health.uses,1);
  assert.equal(original.hero.health,10);assert.equal(original.character.potionModifiers.health.uses,2);
  assert.equal(Object.hasOwn(f.character,'backpack'),false);assert.equal(f.character.notes,'keep');
  assert.throws(()=>useDestinyPotionModifier(f,'magic'),/unavailable/);
});

test('Good Taste adds a die to a Magic potion while retaining its declared duration',()=>{
  const f=useDestinyPotionModifier(make({abilities:{'good-taste':1}}),'magic',()=>3);
  assert.equal(destinyStat(f,'hero','magic'),6);assert.equal(f.character.potionModifiers.magic.uses,0);
  assert.ok(f.effects.some(effect=>effect.attribute==='magic'&&effect.amount===5&&effect.until===2));
});

test('invalid or unavailable effects do not spend a use or change the saved fight',()=>{
  let f=make();const before=JSON.stringify(f);
  assert.throws(()=>useDestinyPotionModifier(f,'other'),/Choose/);
  assert.throws(()=>useDestinyPotionModifier(f,'armour'),/No uses/);
  assert.equal(JSON.stringify(f),before);
  f.encounter.disableBackpack=true;assert.throws(()=>useDestinyPotionModifier(f,'health'),/unavailable/);
});

test('used potion counters remain spent after defeat and repeated outcome recording',()=>{
  let s=beginDestinySession({character:{potionModifiers:modifiers}},{hero,section:'18'}, {roster,outcomeId:'potion-test',createFight:createLegionFight});
  s=applyDestinySessionAction(s,'start-round',{target:0});s=applyDestinySessionAction(s,'potion-modifier',{attribute:'health'});
  assert.equal(s.character.potionModifiers.health.uses,1);s=applyDestinySessionAction(s,'concede');
  s=applyDestinySessionAction(s,'record-outcome',{}, {timestamp:1});s=applyDestinySessionAction(s,'record-outcome',{}, {timestamp:2});
  assert.equal(s.character.potionModifiers.health.uses,1);assert.equal(s.history.length,1);
});
