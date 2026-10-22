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
