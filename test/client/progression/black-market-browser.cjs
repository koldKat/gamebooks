'use strict';
// Real dialog markup/styles with isolated wallet responses; no live trades.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const checkBrowser = require('../battlesim/browser-harness.cjs');
const repo = path.resolve(__dirname, '../../..'), root = process.env.TMPDIR;
if (!root || !root.startsWith('/media/koldKat/MediaDrive/.tmp')) throw Error('Set TMPDIR to the approved scratch directory.');
const scratch = fs.mkdtempSync(path.join(root, 'black-market-'));
const index = fs.readFileSync(path.join(repo, 'public/index.html'), 'utf8');
const styles = [...index.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*>/g)].map(match => match[0].replace(/href="(\/[^"?]+)(?:\?[^" ]*)?"/, (_, p) => `href="file://${repo}/public${p}"`)).join('\n');
const start = index.indexOf('  <div id="exchange-shop-modal-overlay"'), end = index.indexOf('  <!-- ── Profile modal', start);
assert(start > 0 && end > start);
const source = ['diamonds.js', 'rubies.js', 'exchange-shop.js'].map(name => fs.readFileSync(path.join(repo, 'public/js/progression', name), 'utf8').replace(/^import .*;$/gm, '').replace(/^export /gm, '')).join('\n');
const coin = fs.readFileSync(path.join(repo, 'public/js/ui-helpers/coin-icon.js'), 'utf8').replace(/^export /gm, '');
const script = String.raw`
const check = (ok, message) => { if (!ok) throw Error(message); };
const wallet = {diamondsBalance: 12, diamondsExchanged: 2, diamondsBought: 1, diamondExchangeRate: 13, diamondBuyRate: 20, diamondPurchaseStock: 3,
  rubiesBalance: 4, rubiesExchanged: 5, rubiesBought: 1, rubyExchangeRate: 92, rubyBuyRate: 92, rubyPurchaseStock: 2, coinsBalance: 200};
const calls=[], confirmations=[];
const getToken=()=> 'isolated-test';
const apiFetch=async(url,options)=>{ calls.push({url,options}); if(options) throw Error('No live trades allowed'); return {ok:true,json:async()=>({...wallet})}; };
const showConfirm=(message,confirm)=>{const dialog={message,confirm};confirmations.push(dialog);return()=>{dialog.closed=true;};};
` + coin + '\n' + source + String.raw`
try {
  initBlackMarket();
  const get = name => document.getElementById('exchange-shop-'+name);
  const settle = async () => { await new Promise(resolve=>setTimeout(resolve,20)); await document.fonts.ready; };
  for (const currency of ['diamond','ruby']) {
    document.getElementById(currency==='diamond'?'diamonds-display':'rubies-display').click();await settle();
    check(get('title').textContent==='Black Market','shared title');
    check(document.querySelectorAll('[role="dialog"]').length===1,'one exchange dialog');
    check(get(currency+'-tab').getAttribute('aria-selected')==='true','My Books opens matching tab');
    check(get('form').getAttribute('aria-labelledby')===get(currency+'-tab').id,'panel label');
    get('buy').click();get('max').click();
    check(get('amount').value===(currency==='diamond'?'3':'2'),'currency-specific stock/funds');
    check(get('stock').hidden===false,'buy stock visible');
    const rect=get('modal').getBoundingClientRect();
    check(rect.left>=0 && rect.right<=innerWidth+1,'dialog within viewport');
    check(get('modal').scrollWidth<=get('modal').clientWidth+1,'no dialog overflow');
    const form=get('form');check(form.scrollWidth<=form.clientWidth+1,'no form overflow');
    const quote=get('rate'), range=document.createRange();range.selectNodeContents(quote);
    check(range.getBoundingClientRect().height<=quote.getBoundingClientRect().height+1,'rate stays on one line');
    for(const id of ['dec','inc','amount','max','submit'])check(Math.abs(get(id).getBoundingClientRect().height-28)<1,'aligned controls '+id);
    const other=currency==='diamond'?'ruby':'diamond', count=calls.length;
    get(other+'-tab').click();check(calls.length===count,'tab switch reuses loaded wallet');
    check(get(other+'-tab').getAttribute('aria-selected')==='true','tab switched');
    get(other+'-tab').dispatchEvent(new KeyboardEvent('keydown',{key:'Home',bubbles:true}));
    check(get('diamond-tab').getAttribute('aria-selected')==='true','keyboard tab selection');
    get('form').requestSubmit();check(confirmations.length>0,'separate confirmation');
    check(!calls.some(c=>c.options),'confirmation sends no trade');
    get('ruby-tab').click();check(confirmations.at(-1).closed,'tab switch cancels confirmation');
    get('close').click();check(!get('modal-overlay').classList.contains('active'),'close works');
  }
  document.body.dataset.test=JSON.stringify({ok:true,width:innerWidth,checks:'correct entry tabs, shared dialog, keyboard, stock/rates, confirmation, no trades, control sizes and overflow'});
} catch(error) {document.body.dataset.test=JSON.stringify({ok:false,error:error.stack});}
`;
const file = path.join(scratch, 'dialog.html');
fs.writeFileSync(file, `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${styles}</head><body><button id="diamonds-display">Diamonds</button><button id="rubies-display">Rubies</button>${index.slice(start,end)}<script type="module">${script}</script></body></html>`);
(async()=>{try{for(const width of [320,390,1100]){const result=await checkBrowser({file,profile:path.join(scratch,'profile-'+width),root:scratch,width,chromium:process.env.BROWSER_PATH||'/home/koldKat/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome'});assert.equal(result.ok,true,JSON.stringify(result));console.log(JSON.stringify(result));}}finally{fs.rmSync(scratch,{recursive:true,force:true});}})().catch(error=>{console.error(error);process.exitCode=1;});
