import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
test('initial app XP skips the debounce and a late response cannot paint another login',async()=>{
 const code=fs.readFileSync('public/js/progression/app-xp.js','utf8'),timers=new Map(),requests=[],painted=[];let token='old',sequence=0;
 const c=vm.createContext({document:{getElementById:()=>({hidden:false})},getToken:()=>token,_hooks:{getCanSeeAppXp:()=>true},_render:data=>painted.push(data),_renderAvgLevel(){},setTimeout:(fn,delay)=>{const id=++sequence;timers.set(id,{fn,delay});return id;},clearTimeout:id=>timers.delete(id),apiFetch:()=>new Promise(resolve=>requests.push(resolve))});
 vm.runInContext(code.slice(code.indexOf('let _appXpFetchPromise'),code.indexOf('// ── "Someone else')).replaceAll('export ',''),c);
 const first=c.refreshAppXp({immediate:true});assert.equal([...timers.values()][0].delay,0);const job=[...timers.values()][0];timers.clear();job.fn();token='new';requests.shift()({ok:true,json:async()=>({xp:10})});await first;assert.equal(painted.length,0);
 assert.equal([...timers.values()][0].delay,0);const second=[...timers.values()][0];timers.clear();second.fn();requests.shift()({ok:true,json:async()=>({xp:20})});await new Promise(resolve=>setImmediate(resolve));assert.equal(painted.length,1);assert.equal(painted[0].xp,20);
});
