import test from 'node:test';
import assert from 'node:assert/strict';
import {loadFixtureRoster} from './roster-fixtures.mjs';
import {RIVAL_RULES, RIVALS, SPECIAL2} from '../../../public/js/battlesim/books/869/definition.js';
import {createCombat} from '../../../public/js/battlesim/books/869/combat.js';
import {tigerResolve} from '../../../public/js/battlesim/engines/tiger-eye.js';

await loadFixtureRoster(869);
function legacy() {
  const context = {t:(key,values)=>key+JSON.stringify(values),gt:(key,values)=>key+JSON.stringify(values)};
  Object.assign(context,createCombat(()=>context));
  context._d6=()=>2;
  return context;
}
const entity = (values={})=>({s:10,e:20,m:4,b:10,sword:4,shield:'none',startE:20,startB:10,lostE:0,skillLossExtra:0,...values});

test('rival profiles and special-phase ordering retain the original public shape',()=>{
  assert.equal(RIVALS.length,7);
  assert.deepEqual(SPECIAL2,['tejbrun','matual']);
  assert(RIVALS.every(row=>!('support' in row)));
  assert(RIVALS.every(row=>RIVAL_RULES[row.id].source&&RIVAL_RULES[row.id].legacy));
});

test('legacy settings are independent from the newer rules and retain old rounding',()=>{
  const rules=RIVAL_RULES.dalgren, before=structuredClone(rules);
  try {
    rules.legacy.deceptiveDamage=2;rules.source.deceptiveDamage=7;
    const core=legacy(),p=entity({b:11,startB:11}),o=entity();
    core._dalgrenR1(p,o)[2].run();
    assert.equal(o.e,18);assert.equal(p.e,20);
    const d={rivalId:'dalgren',phase:1,turn:'opp',started:true,over:false,player:entity({b:11,startB:11}),opp:entity(),options:{}};
    tigerResolve(d,2,()=>{throw Error('Unexpected roll');});
    assert.equal(d.opp.e,13);
    const p2=entity({e:10,startE:10,b:10,startB:10}),o2=entity();
    core._dalgrenR1(p2,o2)[3].run();
    assert.equal(p2.lostE,4);
  } finally { Object.assign(rules,before); }
});

test('saved legacy Tindalin keeps its one-point later counter while source rules roll damage',()=>{
  const core=legacy(),p=entity({e:30,startE:30}),o=entity();
  core._tindalinR2Real(p,o)[1].run();
  assert.equal(p.e,26);assert.equal(o.e,19);
  const d={rivalId:'tindalin',phase:2,turn:'opp',started:true,over:false,player:entity({e:30,startE:30}),opp:entity(),options:{},extension:{kept:true}};
  tigerResolve(d,1,()=>2);
  assert.equal(d.player.e,26);assert.equal(d.opp.e,18);
  assert.deepEqual(d.extension,{kept:true});
});
