import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function setup() {
  const source=fs.readFileSync('public/js/account/profile.js','utf8');
  const elements=new Map(),frames=new Map();let now=0,id=0,token='first';
  for(const prefix of ['books','play'])for(const suffix of ['','-fill','-level','-title','-label'])elements.set(`${prefix}-job-xp${suffix}`,{style:{},setAttribute(name,value){this[name]=value;}});
  const context=vm.createContext({document:{getElementById:id=>elements.get(id)},getToken:()=>token,
    t:key=>key,XP_ANIM_MS_PER_LEVEL:100,performance:{now:()=>now},
    requestAnimationFrame:fn=>{frames.set(++id,fn);return id;},cancelAnimationFrame:id=>frames.delete(id)});
  vm.runInContext(source.slice(source.indexOf('function _xpLevelBounds'),source.indexOf('function _xpLabelParts'))+
    source.slice(source.indexOf('// Separate progression:'),source.indexOf('function renderXpBlock')).replaceAll('export ',''),context);
  return {render:xp=>context.renderJobXpSummary({jobXp:xp,jobLevelCap:9,level:90}),elements,frames,
    token:value=>{token=value;},step:ms=>{now+=ms;const pending=[...frames.values()];frames.clear();for(const fn of pending)fn(now);}};
}

test('Job XP loads immediately and animates later gains using job level rather than normal level',()=>{
  const s=setup();s.render(1000);assert.equal(s.frames.size,0);
  s.render(1100);s.step(50);
  for(const prefix of ['books','play'])assert.match(s.elements.get(`${prefix}-job-xp-label`).innerHTML,/1,050 EV/);
  s.step(50);assert.match(s.elements.get('play-job-xp-label').innerHTML,/1,100 EV/);assert.equal(s.frames.size,0);
});

test('repeated SSE snapshots preserve the tween and subsequent gains use one pending target',()=>{
  const s=setup();s.render(1000);s.render(1100);s.step(50);s.render(1100);s.render(1200);s.render(1300);
  assert.equal(s.frames.size,1);assert.match(s.elements.get('play-job-xp-label').innerHTML,/1,050 EV/);
  s.step(50);assert.match(s.elements.get('play-job-xp-label').innerHTML,/1,100 EV/);
  s.step(50);assert.match(s.elements.get('play-job-xp-label').innerHTML,/1,200 EV/);
  s.step(50);assert.match(s.elements.get('play-job-xp-label').innerHTML,/1,300 EV/);assert.equal(s.frames.size,0);
});

test('level crossings update title and fill together without fractional XP captions',()=>{
  const s=setup();s.render(2990);s.render(3010);s.step(100);
  assert.equal(s.elements.get('play-job-xp-level').textContent,'Job Lvl 2');
  assert.equal(s.elements.get('play-job-xp-title').textContent,'job.title.2');
  assert.equal(s.elements.get('play-job-xp-fill').style.width,'0%');
  assert.match(s.elements.get('play-job-xp-label').innerHTML,/3,000 EV/);s.step(100);assert.equal(s.frames.size,0);
});

test('account changes, logout and downward corrections cancel stale animation frames',()=>{
  const s=setup();s.render(1000);s.render(1100);s.step(25);s.render(900);
  assert.equal(s.frames.size,0);assert.match(s.elements.get('play-job-xp-label').innerHTML,/900 EV/);
  s.render(950);s.token('second');s.render(3000);assert.equal(s.frames.size,0);
  s.render(3100);s.token(null);s.step(50);
  assert.equal(s.elements.get('play-job-xp').hidden,true);assert.equal(s.frames.size,0);
});
