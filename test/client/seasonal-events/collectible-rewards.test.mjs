import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

test('collection snapshots suppress duplicate generic reward floaters',()=>{
 const noop=()=>{},floaters=[];
 const context=vm.createContext({getUsername:()=> 'player',getToken:()=> 'token',
  updateCoinsDisplay:noop,updateHeartbeatCoinsDisplay:noop,renderBooksXpSummary:noop,saveRewardCache:noop,
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
 context._resetRewardSnapshotState();
 context._processRewardSnapshot({...base,rubiesEarned:1,rubiesCollectibleEarned:1});
 assert.equal(floaters.length,1);
});

test('mint gains produce coin feedback even when the purchase reduces the balance',()=>{
 const noop=()=>{},gains=[];
 const context=vm.createContext({getUsername:()=> 'player',getToken:()=> 'token',
  updateCoinsDisplay:noop,updateHeartbeatCoinsDisplay:noop,renderBooksXpSummary:noop,saveRewardCache:noop,
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
