import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';

function setup() {
  const nodes=new Map(),requests=[],snapshots=[],confirmations=[]; let token='owner',sequence=0,direction='sell';
  const get=id=>{
    if(!nodes.has(id)){const classes=new Set(),attrs=new Map();nodes.set(id,{value:'',disabled:false,innerHTML:'',textContent:'',dataset:{},handlers:{},attrs,
      classList:{add:k=>classes.add(k),remove:k=>classes.delete(k),contains:k=>classes.has(k),toggle:(k,on)=>on?classes.add(k):classes.delete(k)},
      setAttribute:(k,v)=>attrs.set(k,v),addEventListener(k,fn){this.handlers[k]=fn;},focus(){}});}
    return nodes.get(id);
  };
  const context=createContext({document:{getElementById:get,addEventListener(){}},getToken:()=>token,
    COIN_SVG:'<svg class="coin-icon"></svg>',DIAMOND_SVG:'<svg class="diamond-icon"></svg>',RUBY_SVG:'<svg class="ruby-icon"></svg>',
    crypto:{randomUUID:()=>`exchange-request-${++sequence}`},
    showConfirm(message,confirm,options){const dialog={message,confirm,options,closed:false};confirmations.push(dialog);return()=>{dialog.closed=true;};},
    apiFetch(url,options){return new Promise((resolve,reject)=>requests.push({url,options,resolve,reject}));},
  });
  runInContext(readFileSync(new URL('../../../public/js/progression/exchange-shop.js',import.meta.url),'utf8').replace(/^import .*;$/gm,'').replace(/^export /gm,''),context);
  context.initBlackMarket({onRewardSnapshot:data=>snapshots.push(data)});
  return{context,requests,snapshots,confirmations,use(side){direction=side;},get:name=>get('exchange-shop-'+(name==='panel'?'form':['amount','max','dec','inc','submit','rate','receive','form'].includes(name)?direction+'-'+name:name)),getNode:get,switchAccount(){token='other';}};
}
const profile={diamondsBalance:5,diamondsExchanged:2,diamondsBought:1,coinsBalance:60,diamondExchangeRate:13,diamondBuyRate:20,diamondPurchaseStock:5};
async function open(h,data=profile){const p=h.context.openDiamondExchangeShop();h.requests.shift().resolve({ok:true,json:async()=>data});await p;}
const submit=h=>{
  const event={preventDefault(){}};
  const count=h.confirmations.length;
  h.get('form').handlers.submit(event);
  if(h.confirmations.length>count)return h.confirmations.at(-1).confirm();
};

test('exchange dialog shows current rate, both balances, total history, quantity previews and Max for each direction',async()=>{
  const h=setup();await open(h);
  assert.equal(h.get('total').textContent,'3 exchanged');assert.equal(h.get('total').dataset.tooltip,'2 sold · 1 bought');
  assert.match(h.get('rate').innerHTML,/13/);assert.match(h.get('receive').innerHTML,/13/);
  h.get('max').handlers.click();assert.equal(h.get('amount').value,'5');assert.match(h.get('receive').innerHTML,/65/);
  h.use('buy');assert.equal(h.get('submit').textContent,'Buy');
  assert.equal(h.get('amount').max,'3');h.get('max').handlers.click();
  assert.equal(h.get('amount').value,'3');assert.match(h.get('receive').innerHTML,/60/);
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
  assert.match(h.get('message').textContent,/Sold 2 rubies for 26 GC/);
});

test('buy direction uses the maximum possible level rate and refreshes the received rubies and lifetime total',async()=>{
  const h=setup();await open(h);h.use('buy');h.get('amount').value='2';h.get('amount').handlers.input();
  const pending=submit(h),request=h.requests.shift();
  assert.equal(JSON.parse(request.options.body).expectedRate,20);assert.equal(JSON.parse(request.options.body).direction,'buy');
  request.resolve({ok:true,json:async()=>({...profile,diamondsBalance:7,diamondsBought:3,coinsBalance:20,direction:'buy',exchanged:2,goldSpent:40})});
  await pending;assert.equal(h.get('total').textContent,'5 exchanged');assert.equal(h.get('amount').max,'1');
  assert.match(h.get('message').textContent,/Bought 2 rubies for 40 GC/);
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
  assert.equal(h.requests.length,0);assert.equal(h.confirmations.at(-1).closed,false);
  assert.equal(h.confirmations.at(-1).message,'Sell 2 rubies for 26 GC?');
  h.get('inc').handlers.click();assert.equal(h.confirmations.at(-1).closed,true);
  h.get('max').handlers.click();assert.equal(h.get('inc').disabled,true);
  h.get('inc').handlers.click();assert.equal(h.get('amount').value,'5');
  h.use('buy');h.get('max').handlers.click();
  assert.equal(h.get('amount').value,'3');assert.equal(h.get('inc').disabled,true);
  h.get('dec').handlers.click();assert.equal(h.get('amount').value,'2');
});

test('buying and selling require a separate confirmation and cancel never sends a transaction',async()=>{
  const h=setup();await open(h);const event={preventDefault(){}};
  h.get('form').handlers.submit(event);assert.equal(h.requests.length,0);
  assert.equal(h.get('submit').textContent,'Sell');assert.equal(h.confirmations.at(-1).options.confirmLabel,'Confirm Sell');
  assert.equal(h.confirmations.at(-1).message,'Sell 1 ruby for 13 GC?');
  h.confirmations.at(-1).closed=true;assert.equal(h.requests.length,0);
  h.use('buy');h.get('amount').value='2';h.get('amount').handlers.input();
  h.get('form').handlers.submit(event);assert.equal(h.requests.length,0);
  assert.equal(h.confirmations.at(-1).message,'Spend 40 GC to buy 2 rubies?');
  assert.equal(h.confirmations.at(-1).options.confirmLabel,'Confirm Buy');
  const pending=h.confirmations.at(-1).confirm();assert.equal(h.requests.length,1);
  h.requests.shift().resolve({ok:true,json:async()=>({...profile,direction:'buy',exchanged:2,goldSpent:40})});
  await pending;
});

test('buying displays shared stock and limits Max by both stock and available gold',async()=>{
 const h=setup();await open(h,{...profile,diamondPurchaseStock:2});h.use('buy');
 assert.equal(h.get('stock').innerHTML,'(Rubies available for purchase: <span class="exchange-shop-stock-value">2</span>)');
 h.get('max').handlers.click();assert.equal(h.get('amount').value,'2');
 await open(h,{...profile,diamondPurchaseStock:0});h.use('buy');assert.equal(h.get('submit').disabled,true);
 await submit(h);assert.equal(h.requests.length,0);h.use('sell');assert.match(h.get('stock').innerHTML,/available for purchase/);
});

const wholeWallet = {...profile, rubiesBalance: 3, rubiesExchanged: 4, rubiesBought: 2, rubyExchangeRate: 70, rubyBuyRate: 70, rubyPurchaseStock: 2};
test('My Books currency buttons open the matching Black Market tab and switching reuses one wallet', async () => {
  const h=setup();
  let pending=h.getNode('rubies-display').handlers.click();
  h.requests.shift().resolve({ok:true,json:async()=>wholeWallet});await pending;
  assert.equal(h.get('ruby-tab').attrs.get('aria-selected'),'true');
  assert.equal(h.get('panel').attrs.get('aria-labelledby'),'exchange-shop-ruby-tab');
  assert.equal(h.get('total').textContent,'6 exchanged');assert.match(h.get('rate').innerHTML,/70/);
  h.get('diamond-tab').handlers.click();assert.equal(h.requests.length,0);
  assert.equal(h.get('diamond-tab').attrs.get('aria-selected'),'true');assert.equal(h.get('total').textContent,'3 exchanged');
  assert.equal(h.get('submit').textContent,'Sell');
  pending=h.getNode('diamonds-display').handlers.click();
  h.requests.shift().resolve({ok:true,json:async()=>wholeWallet});await pending;
  assert.equal(h.get('modal-overlay').classList.contains('active'),true);
  assert.equal(h.get('diamond-tab').attrs.get('aria-selected'),'true');
});
test('tab changes cancel confirmations and cannot redirect an in-flight trade', async () => {
  const h=setup();await open(h,wholeWallet);
  h.get('form').handlers.submit({preventDefault(){}});const stale=h.confirmations.at(-1);
  h.get('ruby-tab').handlers.click();assert.equal(stale.closed,true);await stale.confirm();assert.equal(h.requests.length,0);
  h.get('diamond-tab').handlers.click();await stale.confirm();assert.equal(h.requests.length,0);
  const pending=submit(h), request=h.requests.shift();assert.equal(h.get('ruby-tab').disabled,true);
  h.get('ruby-tab').handlers.click();assert.equal(h.get('diamond-tab').attrs.get('aria-selected'),'true');
  request.resolve({ok:true,json:async()=>({...wholeWallet,coinsBalance:73,diamondsBalance:4,direction:'sell',exchanged:1,goldReceived:13})});await pending;
  h.get('ruby-tab').handlers.click();h.use('buy');assert.equal(h.get('amount').max,'1','other tab sees the updated gold balance');
  const buying=submit(h), ruby=h.requests.shift();assert.equal(ruby.url,'/api/shop/exchange-rubies');
  assert.equal(JSON.parse(ruby.options.body).expectedRate,70);
  ruby.resolve({ok:true,json:async()=>({...wholeWallet,coinsBalance:3,direction:'buy',exchanged:1,goldSpent:70})});await buying;
});
test('an interrupted trade keeps its idempotency key across tab visits', async () => {
  const h=setup();await open(h,wholeWallet);let pending=submit(h), request=h.requests.shift();const body=request.options.body;
  request.reject(Error('network'));await pending;
  h.get('ruby-tab').handlers.click();h.get('diamond-tab').handlers.click();
  pending=submit(h);request=h.requests.shift();assert.equal(request.options.body,body);
  request.resolve({ok:true,json:async()=>({...wholeWallet,direction:'sell',exchanged:1,goldReceived:13})});await pending;
});
test('late currency loads cannot overwrite the selected tab and closing cancels confirmations', async () => {
  const h=setup();const first=h.context.openDiamondExchangeShop(), older=h.requests.shift();
  const second=h.context.openRubyExchangeShop(), newer=h.requests.shift();
  newer.resolve({ok:true,json:async()=>wholeWallet});await second;
  older.resolve({ok:true,json:async()=>({...wholeWallet,coinsBalance:999})});await first;
  assert.equal(h.snapshots.length,1);assert.equal(h.get('ruby-tab').attrs.get('aria-selected'),'true');
  h.get('form').handlers.submit({preventDefault(){}});const stale=h.confirmations.at(-1);
  h.context.closeBlackMarket();assert.equal(stale.closed,true);await stale.confirm();assert.equal(h.requests.length,0);
});

test('buy and sell amounts stay independent and editing either cancels a pending confirmation', async () => {
  const h=setup();await open(h,wholeWallet);
  h.get('buy-max').handlers.click();
  assert.equal(h.get('buy-amount').value,'3');assert.equal(h.get('sell-amount').value,'1');
  h.get('sell-inc').handlers.click();assert.equal(h.get('sell-amount').value,'2');
  h.get('buy-form').handlers.submit({preventDefault(){}});const old=h.confirmations.at(-1);
  assert.equal(old.message,'Spend 60 GC to buy 3 rubies?');
  h.get('sell-inc').handlers.click();assert.equal(old.closed,true);await old.confirm();assert.equal(h.requests.length,0);
  h.get('sell-form').handlers.submit({preventDefault(){}});const pending=h.confirmations.at(-1).confirm();
  assert.equal(h.requests.length,1);assert.equal(h.get('buy-submit').disabled,true);assert.equal(h.get('sell-submit').disabled,true);
  const request=h.requests.shift();assert.equal(JSON.parse(request.options.body).amount,3);assert.equal(JSON.parse(request.options.body).direction,'sell');
  request.resolve({ok:true,json:async()=>({...wholeWallet,diamondsBalance:2,coinsBalance:99,direction:'sell',exchanged:3,goldReceived:39})});await pending;
  assert.equal(h.get('buy-amount').value,'3');assert.equal(h.get('buy-amount').max,'4');assert.equal(h.get('sell-amount').max,'2');
});

test('empty stock disables only buying, and owning none still allows an affordable purchase', async () => {
  const h=setup();await open(h,{...wholeWallet,diamondPurchaseStock:0});
  assert.equal(h.get('buy-submit').disabled,true);assert.equal(h.get('sell-submit').disabled,false);
  await open(h,{...wholeWallet,diamondsBalance:0});
  assert.equal(h.get('buy-submit').disabled,false);assert.equal(h.get('sell-submit').disabled,true);
  assert.equal(h.get('buy-amount').max,'3');assert.equal(h.get('sell-amount').max,'0');
});
