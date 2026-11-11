// Exercise the real reading gate and purchase dialog without production accounts or coins.
const fs = require('node:fs');
const path = require('node:path');
const browser = require('../battlesim/browser-harness.cjs');
const root = process.argv[2];
if (!root) throw Error('Provide a scratch directory');
const publicRoot = path.resolve('public');
const file = path.join(root, 'reading-unlock-check.html');
const coverFile = path.join(root, 'reading-unlock-cover.svg');
fs.writeFileSync(coverFile, '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="360"><rect width="240" height="360" fill="#253247"/><rect x="20" y="20" width="200" height="320" fill="none" stroke="#ab956f"/></svg>');
fs.writeFileSync(file, `<!doctype html><meta charset="utf-8">
<style>body{background:#111827;color:#ddd;font:14px Georgia,serif}${fs.readFileSync(path.join(publicRoot,'css/reading-access.css'),'utf8')}</style>
<div id="reader"></div><script type="module">
import {showReadingGate} from 'file://${publicRoot}/js/reading/access.js';
import {setToken} from 'file://${publicRoot}/js/core/state.js';
const check=(value,message)=>{if(!value)throw Error(message)};
const wait=async predicate=>{for(let i=0;i<100;i++){if(predicate())return;await new Promise(r=>setTimeout(r,10));}throw Error('Timed out');};
try {
 setToken('reading-test');
 let locked=false,balance=0,posts=0,opened=0,agreed;
 const mount=document.getElementById('reader');
 const options={isCurrent:()=>true,onUnlock:()=>{opened++;mount.textContent='Reader opened';}};
 globalThis.fetch=async(url,options={})=>{
  if(options.method==='POST'){posts++;agreed=JSON.parse(options.body).expectedCost;locked=false;balance--;return new Response(JSON.stringify({ok:true,cost:1,newBalance:balance}));}
  return new Response(JSON.stringify({bookId:344,name:'Rune War',authors:'Joe Dever',cost:locked?1:0,locked,balance,canAfford:balance>=1,
   coverUrl:'file://${coverFile}',description:'A dangerous mission leads deep into enemy territory. Your courage and Kai skills stand between the Free Nations and a gathering darkness.',introText:'<p>Introduction</p>',rulesText:'<p>Rules</p>'}));
 };
 check(await showReadingGate(mount,344,options)===false,'free reading bypasses prompt');
 check(!document.querySelector('dialog'),'no free-book dialog');
 locked=true;await showReadingGate(mount,344,options);
 let dialog=document.querySelector('dialog'),button=dialog.querySelector('.reading-unlock-button');
 check(dialog.open,'paid dialog opens immediately');check(button.disabled,'insufficient funds disable unlock');
 check(button.firstElementChild.textContent==='Unlock book (1'&&button.lastElementChild.textContent===')'&&button.querySelector('svg.coin-icon'),'price uses the gold coin icon');
 check(!button.textContent.includes('GC'),'no currency abbreviation in the button');
 check(mount.textContent==='','reader prose is not mounted before purchase');
 check(dialog.querySelector('h2').textContent==='Rune War','book title');
 check(dialog.textContent.includes('dangerous mission'),'blurb');
 const cover=dialog.querySelector('img');await wait(()=>cover.complete);check(cover.naturalWidth>0,'cover loads');
 check(getComputedStyle(dialog.querySelector('.reading-unlock-preview > div > p:last-child')).textAlign==='justify','justified blurb');
 if(innerWidth>768){
  const originalMatchMedia=window.matchMedia.bind(window);window.matchMedia=query=>query==='(hover: hover)'?{matches:true}:originalMatchMedia(query);
  cover.dispatchEvent(new MouseEvent('mouseenter'));
  const enlarged=dialog.querySelector('.reading-unlock-cover-hover');check(enlarged,'hover preview mounted');await wait(()=>enlarged.complete);
  check(enlarged.getBoundingClientRect().width>cover.getBoundingClientRect().width,'hover enlarges the cover');
  cover.dispatchEvent(new MouseEvent('mouseleave'));check(!dialog.querySelector('.reading-unlock-cover-hover'),'hover preview unloaded');
 }
 const rect=dialog.getBoundingClientRect();check(rect.left>=0&&rect.right<=innerWidth+1,'dialog fits screen');
 check(Math.abs(rect.left+rect.width/2-innerWidth/2)<2,'dialog centered');
 balance=2;window.dispatchEvent(new CustomEvent('coins-balance-changed',{detail:{token:'reading-test',balance}}));
 check(!button.disabled,'earned coins enable purchase without reopening');
 dialog.querySelector('.reading-confirm-cancel').click();await wait(()=>!document.querySelector('dialog'));check(posts===0,'cancel spends nothing');
 await showReadingGate(mount,344,options);dialog=document.querySelector('dialog');button=dialog.querySelector('.reading-unlock-button');
 button.click();button.click();await wait(()=>opened===1);
 check(posts===1&&agreed===1,'one confirmed charge at agreed price');
 check(!document.querySelector('dialog'),'purchase unloads dialog and cover');
 check(await showReadingGate(mount,344,options)===false,'permanent unlock skips prompt');
 locked=true;await showReadingGate(mount,344,options);
 document.body.dataset.test=JSON.stringify({width:innerWidth,freeBypass:true,coverAndBlurb:true,insufficientDisabled:true,liveBalanceUpdates:true,cancelNoCharge:true,singleCharge:true,permanentUnlock:true,productionWrites:0});
}catch(error){document.body.dataset.failure=error.stack;}
</script>`);
(async()=>{
 const results=[];
 for(const width of [1400,390])results.push(await browser({file,root,profile:path.join(root,'reading-unlock-profile'),width,chromium:process.env.CHROMIUM,screenshotPath:path.join(root,'reading-unlock-'+width+'.jpg')}));
 fs.writeFileSync(path.join(root,'reading-unlock-browser-verification.json'),JSON.stringify(results,null,2));
 console.log(JSON.stringify(results));
})().catch(error=>{console.error(error);process.exitCode=1;});
