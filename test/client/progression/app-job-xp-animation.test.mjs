import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function setup() {
  const elements=new Map(),frames=new Map();let now=0,id=0;
  for(const key of ['app-xp-summary','app-xp-level','app-xp-title','app-xp-hb-rate','app-xp-bar-fill','app-xp-text','app-xp-boost',
    'app-job-xp-summary','app-job-xp-fill','app-job-xp-level','app-job-xp-title','app-job-xp-label'])elements.set(key,{style:{},hidden:true});
  const context=vm.createContext({document:{getElementById:id=>elements.get(id)},t:(key,p)=>p?.n==null?key:`${key} ${p.n}`,
    performance:{now:()=>now},requestAnimationFrame:fn=>{frames.set(++id,fn);return id;}});
  const source=fs.readFileSync('public/js/progression/app-xp.js','utf8');
  vm.runInContext(source.slice(source.indexOf('function _hbRateText'),source.indexOf('// Average levels')),context);
  return {elements,frames,render:context._render,pending:()=>vm.runInContext('_animQueue.length',context),
    step:ms=>{now+=ms;const pending=[...frames.values()];frames.clear();for(const fn of pending)fn(now);}};
}
const snapshot={users:2,xp:100000,level:9,jobXp:2000,jobLevel:1,xpFromBoost:0};
test('app job EV loads immediately and animates at its own level with the normal app bar',()=>{
  const s=setup();s.render(snapshot);assert.equal(s.frames.size,0);
  s.render({...snapshot,xp:100100,jobXp:2100});s.step(50);
  assert.match(s.elements.get('app-job-xp-label').innerHTML,/2,050 EV/);
  assert.match(s.elements.get('app-xp-text').innerHTML,/100,006 XP/);
  assert.equal(s.frames.size,1);s.step(50);assert.match(s.elements.get('app-job-xp-label').innerHTML,/2,100 EV/);
  s.step(800);assert.equal(s.frames.size,0);
});
test('job-only gains have one short animation and repeated snapshots keep one pending target',()=>{
  const s=setup();s.render(snapshot);s.render({...snapshot,jobXp:2100});s.step(50);
  for(let i=0;i<50;i++)s.render({...snapshot,jobXp:2200+i});
  assert.equal(s.frames.size,1);assert.equal(s.pending(),1);
  s.step(50);s.step(100);assert.equal(s.frames.size,0);
  assert.match(s.elements.get('app-job-xp-label').innerHTML,/2,249 EV/);
});
test('logout hides both bars and an old frame cannot overwrite a new login',()=>{
  const s=setup();s.render(snapshot);s.render({...snapshot,jobXp:2100});s.render(null);
  assert.equal(s.elements.get('app-job-xp-summary').hidden,true);
  s.render({...snapshot,jobXp:6000,jobLevel:2});s.step(1000);
  assert.match(s.elements.get('app-job-xp-label').innerHTML,/6,000 EV/);
  assert.equal(s.elements.get('app-job-xp-level').textContent,'appxp.job_level 2');
  assert.equal(s.frames.size,0);
});
