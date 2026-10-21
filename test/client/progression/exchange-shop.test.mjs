import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';

function setup() {
  const nodes=new Map(),requests=[],snapshots=[]; let token='owner',sequence=0;
  const get=id=>{
    if(!nodes.has(id)){const classes=new Set(),attrs=new Map();nodes.set(id,{value:'',disabled:false,innerHTML:'',textContent:'',dataset:{},handlers:{},attrs,
      classList:{add:k=>classes.add(k),remove:k=>classes.delete(k),contains:k=>classes.has(k),toggle:(k,on)=>on?classes.add(k):classes.delete(k)},
      setAttribute:(k,v)=>attrs.set(k,v),addEventListener(k,fn){this.handlers[k]=fn;},focus(){}});}
    return nodes.get(id);
  };
  const context=createContext({document:{getElementById:get,addEventListener(){}},getToken:()=>token,
    COIN_SVG:'<svg class="coin-icon"></svg>',DIAMOND_SVG:'<svg class="diamond-icon"></svg>',
    crypto:{randomUUID:()=>`exchange-request-${++sequence}`},
    apiFetch(url,options){return new Promise((resolve,reject)=>requests.push({url,options,resolve,reject}));},
  });
  runInContext(readFileSync(new URL('../../../public/js/progression/exchange-shop.js',import.meta.url),'utf8').replace(/^import .*;$/gm,'').replace(/^export /gm,''),context);
  context.initDiamondExchangeShop({onRewardSnapshot:data=>snapshots.push(data)});
  return{context,requests,snapshots,get:name=>get('exchange-shop-'+name),switchAccount(){token='other';}};
}
const profile={diamondsBalance:5,diamondsExchanged:2,diamondsBought:1,coinsBalance:60,diamondExchangeRate:13,diamondBuyRate:20};
async function open(h,data=profile){const p=h.context.openDiamondExchangeShop();h.requests.shift().resolve({ok:true,json:async()=>data});await p;}
const submit=h=>{
  const event={preventDefault(){}};
  h.get('form').handlers.submit(event);
  if(!h.get('confirmation').hidden)return h.get('confirm').handlers.click(event);
};

test('exchange dialog shows current rate, both balances, total history, quantity previews and Max for each direction',async()=>{
  const h=setup();await open(h);
  assert.equal(h.get('total').textContent,'3 exchanged');assert.equal(h.get('total').dataset.tooltip,'2 sold · 1 bought');
  assert.match(h.get('rate').innerHTML,/13/);assert.match(h.get('receive').innerHTML,/13/);
  h.get('max').handlers.click();assert.equal(h.get('amount').value,'5');assert.match(h.get('receive').innerHTML,/65/);
  h.get('buy').handlers.click();assert.equal(h.get('amount-label').textContent,'Diamonds to buy');
  assert.equal(h.get('amount').max,'3');h.get('max').handlers.click();
  assert.equal(h.get('amount').value,'3');assert.match(h.get('receive').innerHTML,/3.*60/);
  assert.equal(h.get('submit').disabled,false);
});

test('successful sell updates balance and history once while duplicate clicks cannot submit twice',async()=>{
  const h=setup();await open(h);h.get('amount').value='2';h.get('amount').handlers.input();
  const pending=submit(h);await submit(h);assert.equal(h.requests.length,1);
  const request=h.requests.shift();assert.equal(request.url,'/api/shop/exchange-diamonds');
  assert.deepEqual(JSON.parse(request.options.body),{amount:2,expectedRate:13,requestId:'exchange-request-1',direction:'sell'});
  const data={...profile,diamondsBalance:3,diamondsExchanged:4,coinsBalance:86,direction:'sell',exchanged:2,goldReceived:26};
  request.resolve({ok:true,json:async()=>data});await pending;
  assert.equal(h.get('total').textContent,'5 exchanged');assert.equal(h.snapshots.at(-1),data);
  assert.match(h.get('message').textContent,/Sold 2 diamonds for 26 GC/);
});

test('buy direction uses the maximum possible level rate and refreshes the received diamonds and lifetime total',async()=>{
  const h=setup();await open(h);h.get('buy').handlers.click();h.get('amount').value='2';h.get('amount').handlers.input();
  const pending=submit(h),request=h.requests.shift();
  assert.equal(JSON.parse(request.options.body).expectedRate,20);assert.equal(JSON.parse(request.options.body).direction,'buy');
  request.resolve({ok:true,json:async()=>({...profile,diamondsBalance:7,diamondsBought:3,coinsBalance:20,direction:'buy',exchanged:2,goldSpent:40})});
  await pending;assert.equal(h.get('total').textContent,'5 exchanged');assert.equal(h.get('amount').max,'1');
  assert.match(h.get('message').textContent,/Bought 2 diamonds for 40 GC/);
});

test('invalid amounts, zero balance and late account responses cannot exchange currencies',async()=>{
  const h=setup();await open(h);
  for(const value of ['', '0','-1','1.5','6','1e2']){h.get('amount').value=value;h.get('amount').handlers.input();assert.equal(h.get('submit').disabled,true);await submit(h);}
  assert.equal(h.requests.length,0);
  await open(h,{...profile,diamondsBalance:0,coinsBalance:0});assert.equal(h.get('submit').disabled,true);
  const pending=h.context.openDiamondExchangeShop();h.switchAccount();h.requests.shift().resolve({ok:true,json:async()=>profile});await pending;
  assert.equal(h.snapshots.length,2,'a stale account response cannot apply its private balances');
});

test('network retries reuse one request ID and refreshed quotes require a new deliberate submission',async()=>{
  const h=setup();await open(h);let pending=submit(h),request=h.requests.shift(),body=request.options.body;
  request.reject(Error('network'));await pending;
  pending=submit(h);request=h.requests.shift();assert.equal(request.options.body,body);
  request.resolve({ok:false,json:async()=>({error:'Your exchange rate changed.',profile:{...profile,diamondExchangeRate:14}})});await pending;
  assert.match(h.get('rate').innerHTML,/14/);assert.equal(h.requests.length,0);
  pending=submit(h);request=h.requests.shift();assert.notEqual(JSON.parse(request.options.body).requestId,JSON.parse(body).requestId);
  assert.equal(JSON.parse(request.options.body).expectedRate,14);
  request.resolve({ok:true,json:async()=>({...profile,diamondExchangeRate:14,diamondsBalance:4,diamondsExchanged:3,direction:'sell',exchanged:1,goldReceived:14})});await pending;
});

test('quantity buttons respect each direction’s available balance and cancel any pending confirmation',async()=>{
  const h=setup();await open(h);
  assert.equal(h.get('dec').disabled,true);
  h.get('inc').handlers.click();assert.equal(h.get('amount').value,'2');
  h.get('form').handlers.submit({preventDefault(){}});
  assert.equal(h.requests.length,0);assert.equal(h.get('confirmation').hidden,false);
  assert.equal(h.get('confirm-details').textContent,'Sell 2 diamonds for 26 GC?');
  h.get('inc').handlers.click();assert.equal(h.get('confirmation').hidden,true);
  h.get('max').handlers.click();assert.equal(h.get('inc').disabled,true);
  h.get('inc').handlers.click();assert.equal(h.get('amount').value,'5');
  h.get('buy').handlers.click();h.get('max').handlers.click();
  assert.equal(h.get('amount').value,'3');assert.equal(h.get('inc').disabled,true);
  h.get('dec').handlers.click();assert.equal(h.get('amount').value,'2');
});

test('buying and selling require a separate confirmation and cancel never sends a transaction',async()=>{
  const h=setup();await open(h);const event={preventDefault(){}};
  h.get('form').handlers.submit(event);assert.equal(h.requests.length,0);
  assert.equal(h.get('submit').hidden,true);assert.equal(h.get('confirm').textContent,'Confirm Sell');
  h.get('cancel').handlers.click();assert.equal(h.get('confirmation').hidden,true);assert.equal(h.requests.length,0);
  h.get('buy').handlers.click();h.get('amount').value='2';h.get('amount').handlers.input();
  h.get('form').handlers.submit(event);assert.equal(h.requests.length,0);
  assert.equal(h.get('confirm-details').textContent,'Spend 40 GC to buy 2 diamonds?');
  assert.equal(h.get('confirm').textContent,'Confirm Buy');
  const pending=h.get('confirm').handlers.click(event);assert.equal(h.requests.length,1);
  h.requests.shift().resolve({ok:true,json:async()=>({...profile,direction:'buy',exchanged:2,goldSpent:40})});
  await pending;
});
