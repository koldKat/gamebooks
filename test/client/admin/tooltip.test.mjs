import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

test('admin tooltip keeps a readable width and stays inside the right and bottom edges on first hover',()=>{
  const handlers={},tip={style:{},offsetWidth:320,offsetHeight:70};
  const source=readFileSync('admin/js/boot.js','utf8');
  runInNewContext(source.slice(source.indexOf('(function () {'),source.indexOf('// ── Tabs')),
    {document:{getElementById:()=>tip,addEventListener:(event,fn)=>{handlers[event]=fn;}},window:{innerWidth:1000,innerHeight:700}});
  const target={closest:()=>({dataset:{tooltip:'Lifetime diamonds added to shared stock by app mining, not the current stock.'}})};
  handlers.mouseover({target,clientX:995,clientY:695});
  assert.equal(tip.style.left,'668px');assert.equal(tip.style.top,'618px');assert.equal(tip.style.display,'block');
  handlers.mousemove({clientX:10,clientY:10});assert.equal(tip.style.left,'24px');
  handlers.mouseleave();assert.equal(tip.style.display,'none');
  const css=readFileSync('public/css/admin.css','utf8');
  assert.match(css,/#admin-tooltip\s*\{[^}]*width: max-content;[^}]*max-width: min\(360px, calc\(100vw - 24px\)\)/);
});

test('user hover shows escaped normal and Job progression with independent progress bars', () => {
  const core=readFileSync('admin/js/core.js','utf8');
  const helper=runInNewContext(core.slice(core.indexOf('export function userProgressTooltipHtml'),core.indexOf('const _countryNames')).replace('export ','')+'\nuserProgressTooltipHtml', {
    esc: value=>String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'),
  });
  const user={username:'<Reader>',level:3,title:'<Ranger>',xp:8000,levelXp:6000,nextLevelXp:10000,
    jobLevel:1,jobTitle:'Digger',jobXp:1500,jobLevelCap:8,xpBoostPct:12.5,
    xpBoostPurchased:4,bonusHeartbeatXp:7,bonusGcChancePurchased:3,bonusGcMintPurchased:5,
    diamondDigPurchased:2,bonusUndos:1,bonusFastTravels:2,
    bronzeBalance:42,silverBalance:8,coinsBalance:123,diamondsBalance:13,rubiesBalance:17};
  const html=helper(user);
  assert.match(html,/&lt;Reader&gt;/);assert.match(html,/&lt;Ranger&gt;/);assert.ok(!html.includes('<Reader>'));
  assert.match(html,/Level 3/);assert.match(html,/Job Level 1/);assert.match(html,/Digger/);
  assert.match(html,/width:50%/);assert.match(html,/width:25%/);
  assert.match(html,/8,000 \/ 10,000 XP/);assert.match(html,/1,500 \/ 3,000 EV/);
  assert.match(html,/XP boost: 12.5%/);assert.ok(!html.includes('Job cap'));
  for (const label of ['XP Boost','Heartbeat XP','Lucky Coin Chance','Coin Mint','Ruby Digging','Extra Undo','Extra Fast Travel']) assert.ok(html.includes(label), label);
  assert.match(html,/Heartbeat XP<\/th><td>7<\/td><td>\+0.7 XP\/min/);
  assert.match(html,/Ruby Digging<\/th><td>2<\/td><td>\+0.2%/);
  assert.match(html,/Lucky Coin Chance<\/th><td>3<\/td><td>\+0.03%/);
  assert.match(html,/Bronze coins<\/dt><dd class="val-bronze">42/);
  assert.match(html,/Silver coins<\/dt><dd class="val-silver">8/);
  assert.match(html,/GC balance<\/dt><dd class="val-amber">123/);
  assert.match(html,/Rubies<\/dt><dd class="val-gem-red">13/);
  assert.match(html,/Diamonds<\/dt><dd class="val-ruby">17/);
  assert.ok(!helper({}).includes('NaN'));
  const handlers={},tip={style:{},offsetWidth:300,offsetHeight:180};
  const source=readFileSync('admin/js/boot.js','utf8');
  runInNewContext(source.slice(source.indexOf('(function () {'),source.indexOf('// ── Tabs')),
    {userProgressTooltipHtml:helper,document:{getElementById:()=>tip,addEventListener:(event,fn)=>{handlers[event]=fn;}},window:{innerWidth:390,innerHeight:700}});
  handlers.mouseover({target:{closest:()=>({dataset:{tooltip:user.username},_adminProgress:user})},clientX:380,clientY:690});
  assert.equal(tip.innerHTML,html);assert.equal(tip.style.left,'78px');assert.equal(tip.style.top,'508px');
  handlers.mouseleave();assert.equal(tip.style.display,'none');
});
