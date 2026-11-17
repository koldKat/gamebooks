// Exercise the real market route and shop UI against a disposable account ledger.
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), vm = require('node:vm');
const Database = require('better-sqlite3');
const checkBrowser = require('../battlesim/browser-harness.cjs');
const { initializeCollectibles } = require('../../../server/db/collectibles');
const { initializeCompanionMarket, createCompanionMarket } = require('../../../server/db/companion-market');
const root = fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', 'companion-market-'));
const project = process.cwd(), db = new Database(':memory:');
db.pragma('foreign_keys=ON');
db.exec(`CREATE TABLE users(id INTEGER PRIMARY KEY,is_admin INTEGER,xp INTEGER,bonus_coins INTEGER DEFAULT 100,coins_spent INTEGER DEFAULT 0);
  INSERT INTO users(id,is_admin,xp) VALUES(1,1,40),(2,1,23),(3,1,0),(4,0,23);
  CREATE TABLE sale_rewards(user_id INTEGER,event TEXT,ref TEXT,amount INTEGER,UNIQUE(event,ref));`);
initializeCollectibles(db); initializeCompanionMarket(db);
db.prepare('INSERT INTO user_collectibles(user_id,item_id,seen_at,quantity) VALUES(?,?,?,?)').run(1, 'pumpkin', 123, 3);
const options = { computeLevel: xp => xp, coinBalance: row => row.bonus_coins - row.coins_spent,
  awardCoins(id, event, ref, amount) { db.prepare('INSERT INTO sale_rewards VALUES(?,?,?,?)').run(id, event, ref, amount); db.prepare('UPDATE users SET bonus_coins=bonus_coins+? WHERE id=?').run(amount, id); return true; } };
const market = createCompanionMarket(db, options), route = { exports: {} };
function send(res, code, data) { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); }
vm.runInNewContext(fs.readFileSync('server/routes/companion-market.js', 'utf8'), { module: route, require(name) {
  if (name === '../request-helpers') return {
    authenticate: async (req, res) => { const id = Number(req.headers.authorization?.replace('Bearer ', '')); if (![1,2,3,4].includes(id)) { send(res,401,{}); return null; } return id; },
    readBody: async req => { let text = ''; for await (const part of req) text += part; return JSON.parse(text); },
    send, isRequestImpersonating: () => false,
  };
  if (name === '../db/connection') return { db };
  if (name === '../db/xp') return options;
  if (name === '../db/companion-market') return { createCompanionMarket: () => market };
  if (name === '../sse') return { userBadgePush() {} };
  throw Error(name);
} });
const html = `<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/css/seasonal/events.css"><link rel="stylesheet" href="/css/components/shop.css"><link rel="stylesheet" href="/css/components/collectibles.css"><link rel="stylesheet" href="/css/components/companion-shop.css"><link rel="stylesheet" href="/css/components/tooltip.css"><style>body{background:#141d29;color:#ccc;font:14px sans-serif;margin:18px}</style>
<div class="books-currencies"><span id="coins-display"></span><button id="companions-shop-btn" class="rubies-display" hidden></button></div>
<script>addEventListener('error',e=>document.body.dataset.failure=e.error?.stack||e.message);addEventListener('unhandledrejection',e=>document.body.dataset.failure=e.reason?.stack||String(e.reason));</script>
<script type="module">
const check=(v,s)=>{if(!v)throw Error(s);},delay=ms=>new Promise(r=>setTimeout(r,ms));
const until=async fn=>{for(let i=0;i<120;i++){if(await fn())return;await delay(25);}throw Error('Timed out');};
const {setToken}=await import('/js/core/state.js');
const {updateCompanionShopButton}=await import('/js/progression/companion-shop.js');
const button=document.getElementById('companions-shop-btn');
const update=async()=>{const data=await fetch('/collection',{headers:{Authorization:'Bearer '+localStorage.getItem('gamebook_auth_token')}}).then(r=>r.json());updateCompanionShopButton(data);};
window.addEventListener('companions-changed',update);
setToken('1');await update();check(!button.hidden&&button.textContent.trim()==='2','admin shortcut shows spare copies');
button.click();await until(()=>document.querySelector('#companion-shop-dialog [role="tabpanel"]')?.textContent.includes('No new'));
check(getComputedStyle(document.querySelector('#companion-shop-dialog [data-dialog-close]')).cursor==='pointer','themed close button pointer');
document.getElementById('companion-shop-sell').click();
await until(()=>document.querySelector('.companion-shop-item .shop-buy-btn'));
await until(()=>document.querySelector('.season-cursor-preview > *'));
const preview=document.querySelector('.season-cursor-preview'),sprite=preview.firstElementChild;
check(sprite.getBoundingClientRect().top>=preview.getBoundingClientRect().top&&sprite.getBoundingClientRect().bottom<=preview.getBoundingClientRect().bottom,'companion stays inside shop preview');
document.querySelector('.companion-shop-item .shop-buy-btn').click();
await until(()=>document.querySelector('[role="status"]').textContent==='Companion listed.');
await until(()=>button.textContent.trim()==='1');
check([...document.querySelectorAll('.shop-buy-btn')].some(b=>b.textContent==='Remove listing'),'listing can be removed');
document.querySelector('#companion-shop-dialog [data-dialog-close]').click();
check(!document.querySelector('.season-cursor-preview > *'),'closing disposes animated previews');
setToken('3');await update();button.click();await until(()=>document.querySelector('.companion-shop-item .shop-buy-btn'));
check(document.querySelector('.companion-shop-item .shop-buy-btn').disabled,'level zero cannot buy');
check((await fetch('/api/companion-market/buy',{method:'POST',headers:{Authorization:'Bearer 3','Content-Type':'application/json'},body:JSON.stringify({listingId:1,expectedPrice:0})})).status===409,'level zero direct request blocked');
document.querySelector('#companion-shop-dialog [data-dialog-close]').click();
setToken('2');await update();button.click();await until(()=>document.querySelector('.companion-shop-item .shop-buy-btn'));
check(document.querySelector('.companion-shop-item .shop-buy-btn').textContent.includes('23'),'buyer sees own level price');
document.querySelector('.companion-shop-item .shop-buy-btn').click();await until(()=>document.querySelector('[role="status"]').textContent==='Companion purchased.');
check(document.querySelector('.companion-shop-empty')?.textContent==='No new companions are for sale.','owned companion removed from buy list');
check(document.getElementById('coins-display').textContent.trim()==='G 77','actual gold balance updates');
document.querySelector('#companion-shop-dialog [data-dialog-close]').click();
setToken('1');await update();button.click();await until(()=>document.querySelector('.companion-shop-empty'));document.getElementById('companion-shop-sell').click();
await until(()=>document.querySelector('.companion-shop-item .shop-buy-btn'));
check(document.querySelector('.companion-shop-balance').textContent.trim()==='G 123','seller receives buyer level price');
document.querySelector('.companion-shop-item .shop-buy-btn').click();await until(()=>document.querySelector('[role="status"]').textContent==='Companion listed.');
await until(()=>button.textContent.trim()==='0');
check(![...document.querySelectorAll('.shop-buy-btn')].some(b=>b.textContent.startsWith('Sell')),'last copy cannot be listed');
document.querySelector('.companion-shop-item .shop-buy-btn').click();await until(()=>document.querySelector('[role="status"]').textContent==='Companion returned.');
await until(()=>button.textContent.trim()==='1');
check(![...document.querySelectorAll('.shop-buy-btn')].some(b=>b.textContent==='Remove listing'),'withdrawal returns escrow');
check(document.querySelector('dialog').getBoundingClientRect().width<=innerWidth,'responsive dialog');
document.querySelector('#companion-shop-dialog [data-dialog-close]').click();
setToken('4');await update();check(button.hidden,'non-admin has no currency shortcut');
check((await fetch('/api/companion-market',{headers:{Authorization:'Bearer 4'}})).status===403,'non-admin cannot access shop');
check(!document.querySelector('.season-cursor-preview > *'),'previews disposed');
if (${Boolean(process.env.BROWSER_SCREENSHOT)}) {
  setToken('1');await update();button.click();await until(()=>document.querySelector('.companion-shop-empty'));
  document.getElementById('companion-shop-sell').click();await until(()=>document.querySelector('.season-cursor-preview > *'));
}
document.body.dataset.test=JSON.stringify({adminOnly:true,levelZeroBlocked:true,escrowAndWithdrawal:true,lastCopyProtected:true,buyerLevelPricing:true,sellerPaid:true,ownedHidden:true,buttonCount:true,cleanup:true,width:innerWidth});
</script>`;
const server = http.createServer(async (req,res) => {
  try {
    if (req.url === '/') return res.end(html);
    if (req.url === '/collection') {
      const id = Number(req.headers.authorization?.replace('Bearer ', ''));
      return send(res,200,{companionShopEnabled:db.prepare('SELECT is_admin FROM users WHERE id=?').get(id)?.is_admin===1,quantities:Object.fromEntries(db.prepare('SELECT item_id,quantity FROM user_collectibles WHERE user_id=?').all(id).map(r=>[r.item_id,r.quantity]))});
    }
    const match=req.url.match(/^\/api\/companion-market(?:\/(buy|sell|cancel))?$/);
    if (match) return await route.exports.handleCompanionMarket(req,res,match[1]);
    const file=path.join(project,'public',req.url.split('?')[0]);
    if (!file.startsWith(path.join(project,'public')+path.sep)) return send(res,404,{});
    res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.json')?'application/json':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file));
  } catch(error) { send(res,500,{error:error.message}); }
});
(async()=>{try {
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const result=await checkBrowser({url:'http://127.0.0.1:'+server.address().port,profile:path.join(root,'profile'),root,width:Number(process.env.BROWSER_WIDTH)||1100,chromium:process.env.CHROMIUM,timeoutMs:20000,screenshotPath:process.env.BROWSER_SCREENSHOT});
  console.log(JSON.stringify(result));
} finally { await new Promise(resolve=>server.close(resolve));db.close();fs.rmSync(root,{recursive:true,force:true}); }})().catch(error=>{console.error(error);process.exitCode=1;});
