import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {ENCOUNTERS, RULES, loadRoster} from '../../../public/js/battlesim/books/1598/definition.js';
import {startProcedure, procedureAction, validateProcedureFight} from '../../../public/js/battlesim/engines/procedural-quest/core.js';
import {compileCustomProcedure} from '../../../public/js/battlesim/engines/procedural-quest/custom.js';
const {getRosterRows} = createRequire(import.meta.url)('../../helpers/roster-db.cjs');
const act=(f,a,r)=>procedureAction(f,{expectedEvent:f.events.length,...a},r);
const next=f=>{while(f.status==='fighting'&&['continue','effect'].includes(f.phase))f=act(f,f.phase==='continue'?{kind:'continue',destination:f.pending}:{kind:'effect'});return f;};
const start=(section,score=10)=>{const e=ENCOUNTERS.find(e=>e.section===String(section));return startProcedure(Object.fromEntries(e.variables.map(v=>[v.key,v.key==='hp'||v.key==='maxHp'?20:v.key==='experience'?5:score])),e);};
const roll=(f,dice,spent=0)=>next(act(next(f),{kind:'roll',dice,spent}));

test('the database roster loads all 33 independent combat entries without invented character defaults',async()=>{
 await loadRoster(async()=>({ok:true,json:async()=>getRosterRows(1598)}));
 assert.equal(ENCOUNTERS.length,33);assert.equal(RULES.storyProgressionAutomatic,false);
 for(const e of ENCOUNTERS){assert.ok(e.sourcePdfPages.length);assert.ok(e.variables.every(v=>v.default===undefined));assert.deepEqual(validateProcedureFight(start(e.section)),start(e.section));}
});
test('form and fury bonuses use the printed thresholds and preserve the orc wording quirk',()=>{
 let f=roll(start(2),[5,6]);assert.equal(f.lastRoll.total,23);assert.equal(f.phase,'finish');assert.equal(f.destination,'55');
 f=act(f,{kind:'finish'});assert.equal(f.status,'win');
 f=roll(start(35),[5,5]);assert.equal(f.lastRoll.total,23);assert.equal(f.destination,'80');assert.equal(act(f,{kind:'finish'}).status,'ended');
 f=roll(start(197),[5,5]);assert.equal(f.lastRoll.total,22);assert.equal(f.destination,'17');
});
test('at most one experience point can be spent and excess spending draws no dice',()=>{
 const f=next(start(2));let calls=0;assert.throws(()=>act(f,{kind:'roll',spent:2},()=>{calls++;return 0;}),RangeError);assert.equal(calls,0);assert.equal(f.player.experience,5);
 const a=roll(start(2),[5,5],1);assert.equal(a.lastRoll.total,23);assert.equal(a.player.experience,4);
});
test('direct combat continuations change the printed skill form and apply actual wounds',()=>{
 let f=roll(start(8),[6,6]);assert.equal(f.phase,'roll');assert.equal(f.player.hp,20);
 f=roll(f,[6,6]);assert.equal(f.lastRoll.total,22);assert.equal(f.destination,'87');assert.equal(act(f,{kind:'finish'}).status,'win');
 f=roll(start(8,0),[1,1]);assert.equal(f.player.hp,17);assert.equal(f.destination,'32');assert.equal(act(f,{kind:'finish'}).status,'loss');
 f=next(start(119,20));assert.equal(f.player.hp,17);f=roll(f,[6,6]);assert.equal(f.player.hp,16);assert.equal(f.destination,'169');
});
test('fatal printed outcomes exhaust HP and custom opponents retain the same spending cap',()=>{
 let f=roll(start(74,0),[1,1]);assert.equal(f.destination,'212');f=act(f,{kind:'finish'});assert.equal(f.status,'loss');assert.equal(f.player.hp,0);
 const e=compileCustomProcedure([{displayName:'Custom foe',target:23,damageDice:'1'}],RULES);f=startProcedure({hp:20,maxHp:20,experience:5,fighting:12},e);f=roll(f,[5,6]);assert.equal(act(f,{kind:'finish'}).status,'win');
});
