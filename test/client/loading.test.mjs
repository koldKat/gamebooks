import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../../public/js/ui-helpers/loading.js',import.meta.url),'utf8');
const loadingHtml=vm.runInNewContext(source.replace('export function','function')+'\nloadingHtml');
test('loading indicator is accessible, animated without JS timers, and escapes supplied copy',()=>{
  const html=loadingHtml('<img onerror="bad">','x" onclick="bad');
  assert.match(html,/role="status"/);
  assert.match(html,/aria-hidden="true"/);
  assert.equal((html.match(/class="flg-node/g)||[]).length,4);
  assert.ok(html.includes('&lt;img onerror=&quot;bad&quot;&gt;'));
  assert.doesNotMatch(html,/<img|class="[^"]*" onclick=/);
});

test('book activity starts its rating request alongside activity and retains rating permissions',async()=>{
  const requests=[],nodes=new Map(),renders=[];
  const get=id=>{if(!nodes.has(id))nodes.set(id,{style:{},dataset:{}});return nodes.get(id);};
  const context=vm.createContext({document:{getElementById:get},getToken:()=> 'owner',
    openPublicModal(){},loadingHtml,t:x=>x,
    apiFetch:url=>new Promise(resolve=>requests.push({url,resolve})),
    coversState:{renderCoverActivity:(...args)=>renders.push(args)}});
  const code=readFileSync(new URL('../../public/js/covers/activity.js',import.meta.url),'utf8');
  vm.runInContext(code.replace(/^import .*;$/gm,'').replace(/^export /gm,''),context);
  const pending=context.openCoverActivity(42,'Example');
  assert.deepEqual(requests.map(r=>r.url),['/api/public/book/42/activity','/api/books/42/rating']);
  requests[1].resolve({ok:true,json:async()=>({rating:4,canRate:false})});
  requests[0].resolve({ok:true,json:async()=>({book:{name:'Example'},entries:[]})});
  await pending;
  assert.equal(renders.length,1);
  assert.equal(renders[0][3],4);
  assert.equal(renders[0][6],true);
  assert.equal(renders[0][7],false);
});

test('public run data and graph library start together',async()=>{
  const source=readFileSync(new URL('../../public/js/account/public-profile.js',import.meta.url),'utf8');
  const a=source.indexOf('export async function openPublicRun('),b=source.indexOf('export async function openPublicSeriesRun(',a);
  const nodes=new Map(),requests=[],renders=[];let graphStarted=false,resolveGraph;
  const context=vm.createContext({document:{getElementById(id){if(!nodes.has(id))nodes.set(id,{style:{},classList:{add(){},contains:()=>true}});return nodes.get(id);}},
    _destroyPubNetworks(){},loadingHtml,t:x=>x,
    _hooks:{publicFetch:url=>new Promise(resolve=>requests.push({url,resolve}))},
    ensureGraphLibrary(){graphStarted=true;return new Promise(resolve=>{resolveGraph=resolve;});},
    renderPublicRun:data=>renders.push(data)});
  vm.runInContext(source.slice(a,b).replace(/^export /gm,''),context);
  const pending=context.openPublicRun(42,1,0,null);
  assert.equal(graphStarted,true);
  assert.equal(requests.length,1);
  requests[0].resolve({ok:true,json:async()=>({graph:{}})});resolveGraph();
  await pending;assert.equal(renders.length,1);
});
