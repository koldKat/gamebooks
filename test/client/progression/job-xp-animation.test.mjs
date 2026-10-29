import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function setup() {
  const source=fs.readFileSync('public/js/account/profile.js','utf8');
  const elements=new Map(),frames=new Map();let now=0,id=0,token='first';
  for(const prefix of ['books','play','profile'])for(const suffix of ['','-bar','-fill','-level','-title','-label','-next-ruby','-ruby-cost'])elements.set(`${prefix}-job-xp${suffix}`,{style:{},setAttribute(name,value){this[name]=value;},removeAttribute(name){delete this[name];}});
  for(const prefix of ['books','play'])for(const suffix of ['','-fill'])elements.set(`${prefix}-xp-mini-job${suffix}`,{style:{}});
  const context=vm.createContext({document:{getElementById:id=>elements.get(id)},getToken:()=>token,
    t:key=>key,XP_ANIM_MS_PER_LEVEL:100,performance:{now:()=>now},
    requestAnimationFrame:fn=>{frames.set(++id,fn);return id;},cancelAnimationFrame:id=>frames.delete(id)});
  vm.runInContext(source.slice(source.indexOf('function _xpLevelBounds'),source.indexOf('function _xpLabelParts'))+
    source.slice(source.indexOf('// Separate progression:'),source.indexOf('function renderXpBlock')).replaceAll('export ',''),context);
  return {render:(xp,data={})=>context.renderJobXpSummary({jobXp:xp,jobLevelCap:9,level:90,...data}),elements,frames,
    token:value=>{token=value;},step:ms=>{now+=ms;const pending=[...frames.values()];frames.clear();for(const fn of pending)fn(now);}};
}

test('Job XP loads immediately and animates later gains using job level rather than normal level',()=>{
  const s=setup();s.render(1000);assert.equal(s.frames.size,0);
  s.render(1100);s.step(50);
  for(const prefix of ['books','play','profile'])assert.match(s.elements.get(`${prefix}-job-xp-label`).innerHTML,/1,050 EV/);
  s.step(50);assert.match(s.elements.get('play-job-xp-label').innerHTML,/1,100 EV/);assert.equal(s.frames.size,0);
});

test('single-event awards move full and mini Job fills before the whole EV label changes',()=>{
  const s=setup();s.render(1000);s.render(1001);
  for(const ms of [25,25,25]){
    s.step(ms);
    for(const prefix of ['books','play']){
      const width=s.elements.get(`${prefix}-job-xp-fill`).style.width;
      assert.ok(parseFloat(width)>0&&parseFloat(width)<0.05, width);
      assert.equal(s.elements.get(`${prefix}-xp-mini-job-fill`).style.width,width);
      assert.match(s.elements.get(`${prefix}-job-xp-label`).innerHTML,/1,000 EV/);
    }
  }
  s.step(25);
  assert.equal(s.elements.get('books-xp-mini-job-fill').style.width,'0.05%');
  assert.match(s.elements.get('books-job-xp-label').innerHTML,/1,001 EV/);
  assert.equal(s.frames.size,0);
});

test('Job bars animate the themed ruby countdown alongside the displayed event count',()=>{
  const s=setup();s.render(1000,{diamondEventsUntilNext:432,diamondEventsPerDiamond:982.3});
  for(const prefix of ['books','play','profile']){
    const el=s.elements.get(`${prefix}-job-xp`);
    assert.equal(el.title,'');assert.equal(el['data-tooltip'],undefined);
    assert.equal(s.elements.get(`${prefix}-job-xp-bar`)['data-tooltip'],'432 XP events until next ruby');
    assert.equal(s.elements.get(`${prefix}-job-xp-next-ruby`).textContent,'432 EV to next ruby');
    assert.equal(s.elements.get(`${prefix}-job-xp-next-ruby`).hidden,false);
    assert.equal(s.elements.get(`${prefix}-job-xp-ruby-cost`).textContent,'983 EV / ruby');
    assert.equal(s.elements.get(`${prefix}-job-xp-ruby-cost`).hidden,false);
    for(const suffix of ['-level','-title','-label'])assert.equal(s.elements.get(`${prefix}-job-xp${suffix}`)['data-tooltip'],undefined);
  }
  s.render(1100,{diamondEventsUntilNext:1});
  assert.equal(s.elements.get('play-job-xp-next-ruby').textContent,'432 EV to next ruby');
  s.step(50);
  assert.equal(s.elements.get('play-job-xp-next-ruby').textContent,'217 EV to next ruby');
  assert.equal(s.elements.get('play-job-xp-bar')['data-tooltip'],'217 XP events until next ruby');
  s.step(50);
  assert.equal(s.elements.get('play-job-xp-bar')['data-tooltip'],'1 XP event until next ruby');
  assert.equal(s.elements.get('play-job-xp-next-ruby').textContent,'1 EV to next ruby');
  s.token(null);s.render(1100);
  assert.equal(s.elements.get('play-job-xp-bar')['data-tooltip'],undefined);
  assert.equal(s.elements.get('play-job-xp-next-ruby').hidden,true);
  assert.equal(s.elements.get('play-job-xp-ruby-cost').hidden,true);
});

test('ruby countdown changes share one animation frame and coalesce repeated SSE snapshots',()=>{
  const s=setup();s.render(1000,{diamondEventsUntilNext:500});
  s.render(1100,{diamondEventsUntilNext:400});s.step(50);
  for(const prefix of ['books','play'])assert.equal(s.elements.get(`${prefix}-job-xp-next-ruby`).textContent,'450 EV to next ruby');
  s.render(1200,{diamondEventsUntilNext:300});s.render(1300,{diamondEventsUntilNext:200});
  assert.equal(s.frames.size,1);assert.equal(s.elements.get('play-job-xp-next-ruby').textContent,'450 EV to next ruby');
  s.step(50);assert.equal(s.elements.get('play-job-xp-next-ruby').textContent,'400 EV to next ruby');
  s.step(50);assert.equal(s.elements.get('play-job-xp-next-ruby').textContent,'300 EV to next ruby');
  s.step(50);assert.equal(s.elements.get('play-job-xp-next-ruby').textContent,'200 EV to next ruby');assert.equal(s.frames.size,0);
});

test('a digging-rate change animates the countdown even when Job XP stays the same',()=>{
  const s=setup();s.render(1000,{diamondEventsUntilNext:500});s.render(1000,{diamondEventsUntilNext:450});
  s.step(50);assert.equal(s.elements.get('play-job-xp-next-ruby').textContent,'475 EV to next ruby');
  assert.match(s.elements.get('play-job-xp-label').innerHTML,/1,000 EV/);
  s.step(50);assert.equal(s.elements.get('play-job-xp-next-ruby').textContent,'450 EV to next ruby');assert.equal(s.frames.size,0);
});

test('missing ruby data and logout do not retain a countdown animation',()=>{
  const s=setup();s.render(1000,{diamondEventsUntilNext:500});s.render(1100,{diamondEventsUntilNext:400});
  s.step(50);s.render(1100);s.step(50);assert.equal(s.frames.size,0);
  assert.equal(s.elements.get('play-job-xp-next-ruby').hidden,true);
  s.render(1200,{diamondEventsUntilNext:300});s.token(null);s.step(50);
  assert.equal(s.frames.size,0);assert.equal(s.elements.get('play-job-xp-next-ruby').hidden,true);
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
