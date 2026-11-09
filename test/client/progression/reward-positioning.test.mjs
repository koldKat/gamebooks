import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

test('admin floats follow cover-panel reveal and transitions without measuring during spawn',()=>{
  const events=new Map(),documentEvents=new Map(),observed=[],chips=[],variables=new Map(),timers=[];
  let mutation,resize,enabled=true,forbidGeometry=false;
  let covers={width:0,right:0},feed={width:800,left:650,right:1450};
  const elements=new Map();
  for(const id of ['reward-float-layer','app-reward-float-layer','books-screen','landing-wrapper','main-screen','covers-panel','feed-panel','landing-right']) {
    elements.set(id,{id,style:{display:id==='main-screen'?'none':''},appendChild:chip=>chips.push(chip),
      getBoundingClientRect(){assert.equal(forbidGeometry,false,'spawning must not measure layout');return id==='covers-panel'?covers:id==='feed-panel'?feed:{width:200,left:1650,right:1850};}});
  }
  const context={Event,floatiesEnabled:()=>enabled,waitForCameraIdle:()=>false,
    window:{addEventListener:(name,fn)=>{const list=events.get(name)||[];list.push(fn);events.set(name,list);},
      dispatchEvent:event=>{for(const fn of events.get(event.type)||[])fn(event);}},
    document:{body:{classList:{contains:()=>false}},documentElement:{style:{getPropertyValue:name=>variables.get(name)||'',setProperty:(name,value)=>variables.set(name,value),removeProperty:name=>variables.delete(name)}},getElementById:id=>elements.get(id),
      addEventListener:(name,fn)=>documentEvents.set(name,fn),removeEventListener:name=>documentEvents.delete(name),
      createElement:()=>({remove(){}})},
    ResizeObserver:class{constructor(fn){resize=fn;}observe(node){observed.push(node.id);}disconnect(){}},
    MutationObserver:class{constructor(fn){mutation=fn;}observe(){}disconnect(){}},
    setTimeout:fn=>{timers.push(fn);return timers.length;},clearTimeout(){}};
  const rewards=readFileSync(new URL('../../../public/js/progression/rewards.js',import.meta.url),'utf8');
  const app=readFileSync(new URL('../../../public/js/progression/app-xp.js',import.meta.url),'utf8');
  const queue=readFileSync(new URL('../../../public/js/progression/floater-queue.js',import.meta.url),'utf8');
  runInNewContext(queue.replace(/^import .*;\n/gm,'').replace(/^export /gm,'')+'\n'+
    rewards.replace(/^import .*;\n/gm,'').replace(/^export /gm,'')+'\n'+
    app.slice(app.indexOf('// ── "Someone else')).replace(/^export /gm,''),context);
  context._positionRewardLayer();
  assert.equal(variables.get('--personal-reward-left'),'1550px','dialog rewards inherit the personal feed/books gap');
  assert.equal(elements.get('app-reward-float-layer').style.left,'50%');
  covers={width:300,right:350};mutation();
  assert.equal(elements.get('app-reward-float-layer').style.left,'500px');
  assert.ok(observed.includes('covers-panel'),'cover geometry is observed');
  covers={width:300,right:400};documentEvents.get('transitionend')({target:elements.get('covers-panel')});
  assert.equal(elements.get('app-reward-float-layer').style.left,'525px');
  feed={...feed,left:700};resize();
  assert.equal(elements.get('app-reward-float-layer').style.left,'550px');
  forbidGeometry=true;context._spawnAppRewardFloater('xp','reward');assert.equal(chips.length,1);
  timers.shift()();
  for(const type of ['xp','coins','rubies','diamonds','level']) {
    context._spawnRewardFloater(type,'reward');
    assert.equal(elements.get('reward-float-layer').style.left,'1550px');
    assert.equal(chips.at(-1).className,`reward-float reward-float--${type}`);
    timers.shift()();
  }
  for(const type of ['xp','coins','rubies','diamonds']) {
    context._spawnAppRewardFloater(type,'reward');
    assert.equal(elements.get('app-reward-float-layer').style.left,'550px');
    assert.equal(chips.at(-1).className,`app-reward-float app-reward-float--${type}`);
    timers.shift()();
  }
  enabled=false;context.window.dispatchEvent(new Event('floaties-change'));
  assert.equal(documentEvents.has('transitionend'),false,'disabled feedback removes layout listeners');
});
