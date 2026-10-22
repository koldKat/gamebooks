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
    COIN_SVG:'<svg class="coin-icon"></svg>',RUBY_SVG:'<svg class="ruby-icon"></svg>',DIAMOND_SVG:'<svg class="diamond-icon"></svg>',
    crypto:{randomUUID:()=>`exchange-request-${++sequence}`},
    showConfirm(message,confirm,options){const dialog={message,confirm,options,closed:false};confirmations.push(dialog);return()=>{dialog.closed=true;};},
    apiFetch(url,options){return new Promise((resolve,reject)=>requests.push({url,options,resolve,reject}));},
  });
  runInContext(readFileSync(new URL('../../../public/js/progression/exchange-shop.js',import.meta.url),'utf8').replace(/^import .*;$/gm,'').replace(/^export /gm,''),context);
  context.initBlackMarket({onRewardSnapshot:data=>snapshots.push(data)});
  return{context,requests,snapshots,confirmations,use(side){direction=side;},get:name=>get('exchange-shop-'+(name==='panel'?'form':['amount','max','dec','inc','submit','rate','receive','form'].includes(name)?direction+'-'+name:name)),switchAccount(){token='other';}};
}
const profile={rubiesBalance:5,rubiesExchanged:2,rubiesBought:1,coinsBalance:150,rubyExchangeRate:70,rubyBuyRate:70,rubyPurchaseStock:5};
async function open(h,data=profile){const p=h.context.openRubyExchangeShop();h.requests.shift().resolve({ok:true,json:async()=>data});await p;}

test('ruby shop uses equal current rates, separate pills and limits buying by gold and shared stock',async()=>{
  const h=setup();await open(h);
  assert.match(h.get('balance').innerHTML,/exchange-shop-rubies/);
  assert.equal((h.get('balance').innerHTML.match(/class="shop-modal-balance/g)||[]).length,2);
  assert.equal(h.get('amount').max,'5');assert.match(h.get('rate').innerHTML,/70/);
  h.use('buy');assert.equal(h.get('amount').max,'2');assert.match(h.get('rate').innerHTML,/70/);
  h.get('max').handlers.click();assert.match(h.get('receive').innerHTML,/140/);
  await open(h,{...profile,rubyPurchaseStock:1});h.use('buy');assert.equal(h.get('amount').max,'1');
  await open(h,{...profile,rubyPurchaseStock:0});h.use('buy');assert.equal(h.get('submit').disabled,true);
});

test('trades need confirmation, cannot double submit and apply the authoritative wallet snapshot',async()=>{
  const h=setup();await open(h);h.get('amount').value='2';h.get('amount').handlers.input();
  h.get('form').handlers.submit({preventDefault(){}});
  assert.equal(h.requests.length,0);assert.equal(h.confirmations.at(-1).message,'Sell 2 rubies for 140 GC?');
  const pending=h.confirmations.at(-1).confirm();h.confirmations.at(-1).confirm();
  assert.equal(h.requests.length,1);const request=h.requests.shift();
  assert.equal(request.url,'/api/shop/exchange-rubies');
  assert.deepEqual(JSON.parse(request.options.body),{amount:2,expectedRate:70,requestId:'exchange-request-1',direction:'sell'});
  const updated={...profile,rubiesBalance:3,rubiesExchanged:4,coinsBalance:290,direction:'sell',exchanged:2,goldReceived:140};
  request.resolve({ok:true,json:async()=>updated});await pending;
  assert.equal(h.snapshots.at(-1),updated);assert.equal(h.get('total').textContent,'5 exchanged');
  assert.equal(h.get('message').textContent,'Sold 2 rubies for 140 GC.');
});

test('retry preserves request ID, a changed rate requires reconfirmation, and logout discards late results',async()=>{
  const h=setup();await open(h);
  const confirm=()=>{h.get('form').handlers.submit({preventDefault(){}});return h.confirmations.at(-1).confirm();};
  let pending=confirm(),request=h.requests.shift();const body=request.options.body;
  request.reject(Error('network'));await pending;
  pending=confirm();request=h.requests.shift();assert.equal(request.options.body,body);
  request.resolve({ok:false,json:async()=>({error:'Rate changed',profile:{...profile,rubyExchangeRate:71,rubyBuyRate:71}})});await pending;
  pending=confirm();request=h.requests.shift();assert.notEqual(request.options.body,body);assert.equal(JSON.parse(request.options.body).expectedRate,71);
  h.switchAccount();request.resolve({ok:true,json:async()=>({...profile,exchanged:1,goldReceived:71,direction:'sell'})});await pending;
  assert.equal(h.snapshots.length,2,'late response never paints a different account');
});

test('accounts without access close the ruby dialog and cannot submit',async()=>{
  const h=setup();await open(h,{coinsBalance:100});
  assert.equal(h.get('modal-overlay').classList.contains('active'),false);
  h.get('form').handlers.submit({preventDefault(){}});assert.equal(h.requests.length,0);
});
