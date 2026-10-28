import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function setup() {
  const elements=new Map(),frames=new Map();let now=0,id=0;
  for(const key of ['app-xp-summary','app-xp-level','app-xp-title','app-xp-hb-rate','app-xp-bar-fill','app-xp-text','app-xp-boost',
    'app-job-xp-summary','app-job-xp-fill','app-job-xp-level','app-job-xp-title','app-job-xp-label','app-job-xp-next-ruby','app-job-xp-ruby-cost','app-job-xp-bar',
    'books-app-xp-panel','books-app-mini-level-fill','books-app-mini-job','books-app-mini-job-fill'])elements.set(key,{style:{},hidden:true,attributes:{},setAttribute(k,v){this.attributes[k]=v;},removeAttribute(k){delete this.attributes[k];}});
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
  assert.equal(s.elements.get('books-app-mini-job-fill').style.width,s.elements.get('app-job-xp-fill').style.width);
  assert.equal(s.elements.get('books-app-mini-level-fill').style.width,s.elements.get('app-xp-bar-fill').style.width);
  assert.equal(s.elements.get('books-app-xp-panel').hidden,false);
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
  assert.equal(s.elements.get('books-app-xp-panel').hidden,true);
  s.render({...snapshot,jobXp:6000,jobLevel:2});s.step(1000);
  assert.match(s.elements.get('app-job-xp-label').innerHTML,/6,000 EV/);
  assert.equal(s.elements.get('app-job-xp-level').textContent,'appxp.job_level 2');
  assert.equal(s.frames.size,0);
});

test('pool countdown animates through a ruby boundary even when Job EV is capped',()=>{
  const s=setup();const start={...snapshot,jobRubyMiningEvents:9998,jobRubyMiningInterval:10000,jobAverageEventsPerRuby:9996.4};
  s.render(start);
  assert.equal(s.elements.get('app-job-xp-ruby-cost').textContent,'appxp.average_ruby_cost 9,997');
  s.render({...start,jobRubyMiningEvents:10002});s.step(25);
  assert.equal(s.elements.get('app-job-xp-next-ruby').textContent,'appxp.next_ruby 1');
  s.step(25);assert.equal(s.elements.get('app-job-xp-next-ruby').textContent,'appxp.next_ruby 10,000');
  s.step(50);assert.equal(s.elements.get('app-job-xp-next-ruby').textContent,'appxp.next_ruby 9,998');
  assert.equal(s.elements.get('app-job-xp-bar').attributes['data-tooltip'],'appxp.next_ruby 9,998');
  assert.equal(s.frames.size,0);
});
