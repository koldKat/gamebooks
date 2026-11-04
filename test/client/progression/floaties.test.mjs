import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

test('floatie setting persists, removes active chips and follows changes from other tabs',()=>{
  const storage=new Map(),listeners=new Map(),patches=[];
  const checkbox={checked:false,addEventListener:(name,fn)=>listeners.set('checkbox:'+name,fn)};
  let removed=0,disabled=false,changes=0;
  const context=vm.createContext({Event,localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)},
    document:{body:{classList:{toggle:(name,value)=>{disabled=value;}}},getElementById:()=>checkbox,
      querySelectorAll:()=>[{remove:()=>removed++}]},
    window:{addEventListener:(name,fn)=>listeners.set(name,fn),dispatchEvent:()=>changes++}});
  vm.runInContext(fs.readFileSync('public/js/progression/floaties.js','utf8').replace(/^export /gm,''),context);
  assert.equal(context.floatiesEnabled(),true);
  context.initFloatiesSettings(patch=>patches.push(patch));
  listeners.get('checkbox:change')({target:{checked:true}});
  assert.equal(context.floatiesEnabled(),false);
  assert.equal(storage.get('disable-floaties'),'1');
  assert.equal(patches[0].disableFloaties,'1');
  assert.equal(disabled,true);assert.ok(removed>0);
  storage.set('disable-floaties','0');listeners.get('storage')({key:'disable-floaties'});
  assert.equal(context.floatiesEnabled(),true);assert.equal(checkbox.checked,false);
  assert.equal(disabled,false);assert.ok(changes>=3);
});
