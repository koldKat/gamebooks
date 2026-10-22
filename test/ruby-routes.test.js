'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function fixture(exchange) {
  const calls=[],sent=[],headers=new Map();let badges=0;
  const profile={rubiesBalance:2,rubyExchangeRate:88,coinsBalance:200};
  const context=vm.createContext({module:{exports:{}},require(name){
    if(name==='../db')return{getUserXpInfo:()=>profile};
    if(name==='../db/ruby-exchange')return{exchangeRubies:(...args)=>{calls.push(args);return exchange(...args);}};
    if(name==='../db/diamond-exchange')return{};
    if(name==='../sse')return{userBadgePush:()=>{badges++;}};
    if(name==='../request-helpers')return{
      authenticate:async()=>17,readBody:async()=>({amount:1,requestId:'ruby-request-0001',expectedRate:88,direction:'buy'}),
      send:(_res,status,body)=>sent.push({status,body}),
    };
    throw Error(name);
  }});
  vm.runInContext(fs.readFileSync(require.resolve('../server/routes/shop'),'utf8'),context);
  return {run:()=>context.module.exports.handleRubyExchange({}, {setHeader:(k,v)=>headers.set(k,v)}),calls,sent,headers,profile,badges:()=>badges};
}

test('ruby endpoint calls the exchange transaction and sends the updated account wallet',async()=>{
  const h=fixture(()=>({ok:true,direction:'buy',exchanged:1,goldSpent:88}));await h.run();
  assert.deepEqual(h.calls[0],[17,1,'ruby-request-0001',88,'buy']);
  assert.equal(h.sent[0].status,200);assert.equal(h.sent[0].body.rubiesBalance,2);assert.equal(h.badges(),1);
});
test('stale quotes return a refreshed profile and unavailable accounts receive no wallet data',async()=>{
  const stale=fixture(()=>({error:'rate_changed'}));await stale.run();assert.equal(stale.sent[0].status,400);assert.equal(stale.sent[0].body.profile,stale.profile);
  const hidden=fixture(()=>({error:'unavailable'}));await hidden.run();assert.equal(hidden.sent[0].status,403);assert.equal(hidden.sent[0].body.profile,undefined);assert.equal(hidden.badges(),0);
});
test('busy ruby exchanges are retryable and unrelated failures are not disguised',async()=>{
  const busy=fixture(()=>{throw Object.assign(Error('locked'),{code:'SQLITE_BUSY'});});await busy.run();assert.equal(busy.sent[0].status,503);assert.equal(busy.headers.get('Retry-After'),'2');
  const broken=fixture(()=>{throw Error('broken');});await assert.rejects(broken.run(),/broken/);
});
