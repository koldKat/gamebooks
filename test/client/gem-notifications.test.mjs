import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

test('notification dropdown renders earned gem counts, plurals and the correct coloured currency icons',()=>{
  const elements=new Map();
  for(const id of ['notif-dropdown','notif-list','notif-empty']) elements.set(id,{style:{},innerHTML:'',getBoundingClientRect:()=>({width:340})});
  const context=vm.createContext({document:{getElementById:id=>elements.get(id)},window:{innerWidth:1000},
    DIAMOND_SVG:'<svg class="diamond-test"></svg>',RUBY_SVG:'<svg class="ruby-test"></svg>',
    escapeHtml:s=>String(s).replaceAll('<','&lt;'),apiFetch:()=>Promise.resolve(),Date});
  const source=fs.readFileSync('public/js/community/notif.js','utf8').replace(/^import .*;\n/gm,'').replace(/^export /gm,'');
  vm.runInContext(source,context);
  const button={getBoundingClientRect:()=>({bottom:10,right:900}),classList:{remove(){}}};
  context._openNotifDropdown(button,{unseen:0,items:[
    {type:'diamond_gain',payload:{amount:1},createdAt:Date.now(),seen:true},
    {type:'diamond_gain',payload:{amount:2},createdAt:Date.now(),seen:true},
    {type:'ruby_gain',payload:{amount:1},createdAt:Date.now(),seen:true},
    {type:'ruby_gain',payload:{amount:3},createdAt:Date.now(),seen:true},
  ]});
  const html=elements.get('notif-list').innerHTML;
  for(const text of ['1 Ruby','2 Rubies','1 Diamond','3 Diamonds','icon-diamond','icon-ruby','diamond-test','ruby-test']) assert.ok(html.includes(text),text);
  for(const [viewport,buttonRight,width] of [[320,60,304],[390,380,340],[1000,200,340],[1000,995,340]]){
    context.window.innerWidth=viewport;
    elements.get('notif-dropdown').getBoundingClientRect=()=>({width});
    button.getBoundingClientRect=()=>({bottom:10,right:buttonRight});
    context._openNotifDropdown(button,{unseen:0,items:[]});
    const right=parseFloat(elements.get('notif-dropdown').style.right);
    assert.ok(right>=8&&viewport-right-width>=8,'dropdown stays inside both viewport edges');
  }
});
