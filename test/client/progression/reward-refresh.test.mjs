import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

test('background reward refresh waits for camera idle even when floaties are disabled',()=>{
  const timers=[],waiting=new Set();let moving=true,refreshes=0,token='player';
  const context={getToken:()=>token,refreshCoinsDisplay:()=>refreshes++,
    setTimeout:fn=>{timers.push(fn);return fn;},clearTimeout(){},
    waitForCameraIdle:fn=>{if(!moving)return false;waiting.add(fn);return true;}};
  const source=readFileSync(new URL('../../../public/js/progression/rewards.js',import.meta.url),'utf8');
  runInNewContext('let _rewardProfileTimer=null;\n'+source.slice(source.indexOf('export function _scheduleRewardProfileRefresh')).replace(/^export /gm,''),context);
  context._scheduleRewardProfileRefresh();timers.shift()();
  context._scheduleRewardProfileRefresh();timers.shift()();
  assert.equal(refreshes,0);assert.equal(waiting.size,1,'repeated saves share one deferred refresh');
  moving=false;for(const callback of waiting)callback();assert.equal(refreshes,1);
  moving=true;waiting.clear();context._scheduleRewardProfileRefresh();timers.shift()();token=null;
  moving=false;for(const callback of waiting)callback();assert.equal(refreshes,1,'logout drops queued refresh');
});
