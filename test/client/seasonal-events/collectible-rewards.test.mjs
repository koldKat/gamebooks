import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

test('survival floaties isolate heartbeat XP from simultaneous awards and stop outside Friday the 13th',()=>{
 const chips=[],timers=[];let theme='survival';
 const noop=()=>{};
 const context=vm.createContext({Math:Object.assign(Object.create(Math),{random:()=>0}),window:{addEventListener:noop},floatiesEnabled:()=>true,
  activeSeasonalEvents:()=>theme?[{heartbeatFloater:theme}]:[],waitForCameraIdle:()=>false,getUsername:()=> 'player',
  updateShopSnapshot:noop,updateCoinsDisplay:noop,updateHeartbeatCoinsDisplay:noop,renderBooksXpSummary:noop,
  saveRewardCache:noop,_broadcastLiveEvent:noop,_scheduleLiveUiRefresh:noop,
  enqueueRewardFloater:(...args)=>chips.push(args),setTimeout:fn=>{timers.push(fn);return timers.length;},
  clearTimeout:noop});
 vm.runInContext(fs.readFileSync('public/js/progression/rewards.js','utf8').replace(/^import .*;\n/gm,'').replace(/^export /gm,''),context);
 const base={xp:100,coinsBalance:1,level:1,heartbeatXpEarned:20};
 context._processRewardSnapshot(base);
 context._processRewardSnapshot({...base,xp:155,heartbeatXpEarned:25});timers.shift()();
 assert.deepEqual(chips.map(c=>[c[1],c[2]]),[['xp','<span>+50 XP</span>'],['survival','<span>+5 XP · Surviving</span>']]);
 context._processRewardSnapshot({...base,xp:155,heartbeatXpEarned:25});assert.equal(timers.length,0,'duplicate snapshot');
 theme=null;
 context._processRewardSnapshot({...base,xp:160,heartbeatXpEarned:30});timers.shift()();
 assert.equal(chips.at(-1)[1],'xp');
 theme='survival-green';
 context._processRewardSnapshot({...base,xp:165,heartbeatXpEarned:35});timers.shift()();
 assert.equal(chips.at(-1)[1],'survival-green','Halloween uses its own heartbeat color');
});

test('disabled personal floaties skip preparation and geometry while reward balances keep updating',()=>{
 let coins=0,summary=0;
 const forbidden=()=>{throw Error('Disabled floatie preparation ran');};
 const noop=()=>{};
 const context=vm.createContext({window:{addEventListener:noop},floatiesEnabled:()=>false,activeSeasonalEvents:forbidden,
  document:{getElementById:forbidden},waitForCameraIdle:()=>false,getUsername:()=> 'player',
  updateShopSnapshot:noop,updateCoinsDisplay:value=>{coins=value;},updateHeartbeatCoinsDisplay:noop,renderBooksXpSummary:()=>summary++,
  saveRewardCache:noop,_broadcastLiveEvent:noop,_scheduleLiveUiRefresh:noop});
 vm.runInContext(fs.readFileSync('public/js/progression/rewards.js','utf8').replace(/^import .*;\n/gm,'').replace(/^export /gm,''),context);
 context._spawnRewardFloater=forbidden;context._queueRewardFloater=forbidden;
 context._positionRewardLayer();
 context._processRewardSnapshot({xp:100,coinsBalance:1,level:1,rubiesEarned:0,diamondsEarned:0});
 const delta=context._processRewardSnapshot({xp:200,coinsBalance:2,level:100000,rubiesEarned:5,diamondsEarned:5,
  heartbeatXpEarned:50,title:{toString:forbidden}});
 assert.equal(delta.xpDelta,100);assert.equal(coins,2);assert.equal(summary,2);
});

test('disabled collection feedback creates no layer or timer and disabling clears existing feedback',()=>{
 const listeners=new Map();let enabled=false,created=0,timers=0,cleared=0;
 const element=()=>({setAttribute(){},append(){},remove(){}});
 const context=vm.createContext({floatiesEnabled:()=>enabled,RUBY_SVG:'gem',
  window:{addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)},
  document:{createElement:()=>{created++;return element();}},
  setTimeout:()=>++timers,clearTimeout:()=>cleared++});
 vm.runInContext(fs.readFileSync('public/js/seasonal-events/collectible-feedback.js','utf8').replace(/^import .*;\n/gm,'').replace(/^export /gm,''),context);
 const feedback=context.createCollectibleFeedback(element());feedback.show();
 assert.equal(created,0);assert.equal(timers,0);
 enabled=true;feedback.show();assert.equal(created,2);assert.equal(timers,1);
 enabled=false;listeners.get('floaties-change')();assert.equal(cleared,1);
 feedback.dispose();assert.equal(listeners.size,0);
 enabled=true;feedback.show();assert.equal(created,2,'disposed feedback cannot recreate DOM');
});

test('collection snapshots suppress duplicate generic reward floaters',()=>{
 const noop=()=>{},floaters=[];
 const context=vm.createContext({window:{addEventListener:noop},waitForCameraIdle:()=>false,floatiesEnabled:()=>true,getUsername:()=> 'player',getToken:()=> 'token',
  updateShopSnapshot:noop,updateCoinsDisplay:noop,updateHeartbeatCoinsDisplay:noop,renderBooksXpSummary:noop,saveRewardCache:noop,
  _broadcastLiveEvent:noop,_scheduleLiveUiRefresh:noop,RUBY_SVG:'diamond',DIAMOND_SVG:'ruby',
  clearRewardCache:noop,closeBlackMarket:noop,updateRubiesDisplay:noop,updateDiamondsDisplay:noop});
 vm.runInContext(fs.readFileSync('public/js/progression/rewards.js','utf8').replace(/^import .*;\n/gm,'').replace(/^export /gm,''),context);
 context._spawnRewardFloater=(kind,html)=>floaters.push({kind,html});
 const base={xp:100,coinsBalance:10,level:1,rubiesEarned:2,rubiesCollectibleEarned:0,diamondsEarned:0};
 context._processRewardSnapshot(base);
 context._processRewardSnapshot({...base,rubiesEarned:3,rubiesCollectibleEarned:1});
 assert.equal(floaters.length,0);
 context._processRewardSnapshot({...base,rubiesEarned:5,rubiesCollectibleEarned:2});
 assert.equal(floaters.length,1);assert.match(floaters[0].html,/\+1/);
 context._processRewardSnapshot({...base,rubiesEarned:5,rubiesCollectibleEarned:2});
 assert.equal(floaters.length,1);
 context.clearRewardFloaters=()=>{};
 context._resetRewardSnapshotState();
 context._processRewardSnapshot({...base,rubiesEarned:1,rubiesCollectibleEarned:1});
 assert.equal(floaters.length,1);
});

test('mint gains produce coin feedback even when the purchase reduces the balance',()=>{
 const noop=()=>{},gains=[];
 const context=vm.createContext({window:{addEventListener:noop},waitForCameraIdle:()=>false,floatiesEnabled:()=>true,getUsername:()=> 'player',getToken:()=> 'token',
  updateShopSnapshot:noop,updateCoinsDisplay:noop,updateHeartbeatCoinsDisplay:noop,renderBooksXpSummary:noop,saveRewardCache:noop,
  _broadcastLiveEvent:noop,_scheduleLiveUiRefresh:noop,RUBY_SVG:'diamond',DIAMOND_SVG:'ruby'});
 vm.runInContext(fs.readFileSync('public/js/progression/rewards.js','utf8').replace(/^import .*;\n/gm,'').replace(/^export /gm,''),context);
 context._queueRewardFloater=(xp,coins)=>gains.push({xp,coins});
 const base={xp:100000,coinsBalance:100,coinsEarned:150,level:10};
 context._processRewardSnapshot(base);
 context._processRewardSnapshot({...base,coinsBalance:91,coinsEarned:151});
 assert.deepEqual(gains,[{xp:0,coins:1}]);
 context._processRewardSnapshot({...base,coinsBalance:81,coinsEarned:151});
 assert.equal(gains.length,1);
 context._processRewardSnapshot({...base,coinsBalance:82,coinsEarned:152,heartbeatGoldEarned:1});
 assert.equal(gains.length,1);
});
