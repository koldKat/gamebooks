import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../../../admin/js/users-books.js',import.meta.url),'utf8');
const block=source.slice(source.indexOf('    const purchases = user.shopPurchases'),source.indexOf('    // Lock status in meta bar'));
function render(purchases){
 const requests=[],confirmations=[],reloads=[];let statsRefreshes=0;
 const el=(tag,className,text='')=>({tag,className,text,children:[],appendChild(child){this.children.push(child);},querySelector(){return this.tbody??=el('tbody','');}});
 const metaBar=el('div','');
 vm.runInNewContext(block,{user:{id:42,username:'Player',shopPurchases:purchases},metaBar,el,
  appendCell(row,text){row.appendChild(el('td','',text));},mkBtn:(text,className,click)=>({text,className,click}),
  showConfirm:(text,confirm,options)=>confirmations.push({text,confirm,options}),
  api:async(method,url,body)=>requests.push({method,url,body:JSON.parse(JSON.stringify(body))}),
  loadUserDetail:id=>reloads.push(id),loadStats:()=>statsRefreshes++,
 });
 const rows=metaBar.children[0]?.children[1].children[0].tbody.children??[];
 return{metaBar,rows,requests,confirmations,reloads,statsRefreshes:()=>statsRefreshes};
}

test('refund table displays latest and cumulative prices and waits for confirmation',async()=>{
 const f=render([{id:'gc_mint',count:5,refundOne:5,refundAll:15}]);
 assert.equal(f.rows[0].children[0].text,'Coin Mint');assert.equal(f.rows[0].children[1].text,'5');
 const buttons=f.rows[0].children[3].children[0].children;
 assert.equal(buttons[0].text,'Refund 1 (5 GC)');assert.equal(buttons[1].text,'Refund all (15 GC)');
 buttons[0].click();assert.equal(f.requests.length,0);assert.match(f.confirmations[0].text,/bonus on past XP/);
 await f.confirmations[0].confirm();assert.deepEqual(f.requests[0].body,{item:'gc_mint'});
 buttons[1].click();await f.confirmations[1].confirm();assert.deepEqual(f.requests[1].body,{item:'gc_mint',all:true});
 assert.deepEqual(f.reloads,[42,42]);assert.equal(f.statsRefreshes(),2);
});

test('diamond purchases have separate refund rows and the correct API keys',async()=>{
 const f=render([{id:'diamond_dig',count:1,refundOne:1,refundAll:1},{id:'diamond_exchange',count:3,refundOne:3,refundAll:6}]);
 assert.equal(f.rows.length,2);assert.equal(f.rows[0].children[0].text,'Diamond Digging');
 assert.equal(f.rows[0].children[3].children[0].children.length,1);
 f.rows[1].children[3].children[0].children[1].click();await f.confirmations[0].confirm();
 assert.deepEqual(f.requests[0],{method:'POST',url:'/api/admin/users/42/refund',body:{item:'diamond_exchange',all:true}});
 assert.equal(render([]).metaBar.children.length,0);
});
