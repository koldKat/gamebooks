import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
test('heartbeat gold is silent while other coin and XP gains still float',()=>{
 const source=fs.readFileSync('public/js/progression/rewards.js','utf8'),queued=[];
 const context=vm.createContext({getUsername:()=> 'Player',getToken:()=> 'token',saveRewardCache(){},updateCoinsDisplay(){},updateHeartbeatCoinsDisplay(){},renderBooksXpSummary(){},_broadcastLiveEvent(){},_queueRewardFloater:(...args)=>queued.push(args),_scheduleLiveUiRefresh(){}});
 vm.runInContext(source.slice(source.indexOf('let _lastRewardXp'),source.indexOf('// ── Floater queue'))+source.slice(source.indexOf('export function _processRewardSnapshot'),source.indexOf('export function _scheduleRewardProfileRefresh')).replace(/^export /gm,''),context);
 const base={xp:100,level:1,coinsBalance:10,heartbeatGoldEarned:0};context._processRewardSnapshot(base);context._processRewardSnapshot({...base,coinsBalance:11,heartbeatGoldEarned:1});assert.equal(queued.length,0);
 context._processRewardSnapshot({...base,xp:103,coinsBalance:13,heartbeatGoldEarned:1});assert.deepEqual(queued,[[3,2]]);
});
test('bronze and silver render quietly and clear on logout, in the requested header order',()=>{
 const nodes=new Map(['bronze','silver'].map(name=>[name+'-display',{setAttribute(){}}]));
 const context=vm.createContext({document:{getElementById:id=>nodes.get(id)},BRONZE_COIN_SVG:'B',SILVER_COIN_SVG:'S'});
 vm.runInContext(fs.readFileSync('public/js/progression/heartbeat-coins.js','utf8').replace(/^import .*;$/gm,'').replace(/^export /gm,''),context);
 context.updateHeartbeatCoinsDisplay({bronzeBalance:99,silverBalance:3});assert.equal(nodes.get('bronze-display').innerHTML,'B 99');assert.equal(nodes.get('silver-display').innerHTML,'S 3');context.updateHeartbeatCoinsDisplay(null);assert.equal(nodes.get('bronze-display').hidden,true);
 const html=fs.readFileSync('public/index.html','utf8');const ids=['bronze-display','silver-display','shop-btn','diamonds-display'].map(id=>html.indexOf('id="'+id+'"'));assert(ids.every((n,i)=>n>=0&&(!i||n>ids[i-1])));
});
