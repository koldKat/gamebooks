import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync,readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';
import { readFileSync as readSimulatorSource } from './simulator-source.mjs';
import browserSources from './browser-sources.cjs';

const directory=new URL('../../../public/js/battlesim/',import.meta.url);
const context={exports:{},module:{}};
vm.runInNewContext(process.binding('natives')['internal/deps/acorn/acorn/dist/acorn'],context);
const canonical=source=>{
  const ast=context.exports.parse(source,{ecmaVersion:'latest',sourceType:'module'});
  const clean=node=>JSON.parse(JSON.stringify(node,(key,value)=>['start','end','raw'].includes(key)?undefined:value));
  return ast.body.filter(n=>n.type!=='ImportDeclaration').map(n=>JSON.stringify(clean(n))).sort();
};
const entries=readdirSync(directory).filter(file=>/^battlesim\d+\.js$/.test(file));
for(const [id,name,transform] of [[535,'rollCharacter',false],[536,'replaceCharacter',false],[536,'replaceCharacter',true]]){
  for(const change of ['none','book','run','fight']){
    test(`${id} ${name}(${transform}) rechecks live state after confirmation: ${change}`,()=>{
      const book=new URL('books/'+id+'/',directory);
      const panel=readFileSync(new URL('panel.js',book),'utf8');
      const ast=context.exports.parse(panel,{ecmaVersion:'latest',sourceType:'module'});
      const declaration=ast.body.find(node=>node.type==='FunctionDeclaration'&&node.id.name===name);
      assert.ok(declaration,'Delayed UI actions must retain live panel bindings');
      assert.doesNotMatch(readFileSync(new URL('combat.js',book),'utf8'),new RegExp('function '+name+'\\('));
      const state={player:{lifePoints:10},fight:null,magic:{section:1}};
      const before=JSON.stringify(state);
      let run={},accept,stored=0;
      const scope={currentBookId:id,currentPlaythrough:()=>run,data:()=>state,
        active:d=>Boolean(d.fight&&!d.fight.outcome),character:d=>d.player,
        tk:key=>key,showConfirm:(_message,callback)=>{accept=callback;},
        store:()=>stored++,rollCryptsCharacter:()=>({lifePoints:20}),
        rollDemondoomCharacter:()=>({lifePoints:20}),transformedDemondoomCharacter:()=>({lifePoints:30})};
      vm.createContext(scope);
      vm.runInContext(panel.slice(declaration.start,declaration.end)+`;${name}(${transform});`,scope);
      assert.equal(typeof accept,'function');
      if(change==='book')scope.currentBookId=9999;
      if(change==='run')run={};
      if(change==='fight')state.fight={outcome:null};
      const pending=JSON.stringify(state);
      accept();
      assert.equal(stored,change==='none'?1:0);
      if(change==='none'){
        assert.notEqual(JSON.stringify(state),before);
        assert.equal(state.player.lifePoints,transform?30:20);
        assert.equal(state.fight,null);
      }else assert.equal(JSON.stringify(state),pending,'Stale confirmation must not mutate saved state');
    });
  }
}
test('browser receipt fingerprints include every extracted book implementation',()=>{
  for(const file of entries){
    const id=file.match(/\d+/)[0],entry='public/js/battlesim/'+file;
    const sources=browserSources([entry]);
    for(const module of readdirSync(new URL('books/'+id+'/',directory)).filter(name=>name.endsWith('.js')))
      assert.ok(sources.includes('public/js/battlesim/books/'+id+'/'+module),id+'/'+module);
    assert.equal(new Set(sources).size,sources.length);
  }
});
test('extracted simulators preserve every original executable declaration',{skip:!process.env.SIMULATOR_BASE_REF},()=>{
  let migrated=0;
  for(const file of entries){
    const url=new URL(file,directory),entry=readFileSync(url,'utf8');
    if(!entry.includes("export * from './books/"))continue;
    const before=execFileSync('nice',['-n','10','git','show',process.env.SIMULATOR_BASE_REF+':public/js/battlesim/'+file],{encoding:'utf8'});
    if(before.includes("export * from './books/"))continue;
    assert.deepEqual(canonical(readSimulatorSource(url,'utf8')),canonical(before),file);migrated++;
  }
  assert.ok(migrated>0,'No migrated declarations checked');
});
test('book modules expose a consistent identity and lifecycle without DOM in extracted rules',async()=>{
  for(const file of entries){
    const entry=readFileSync(new URL(file,directory),'utf8'),match=entry.match(/books\/(\d+)\/panel\.js/);
    assert.ok(match,file+' must use books/<id>/panel.js');
    const book=new URL('books/'+match[1]+'/',directory);
    const {definition}=await import(new URL('definition.js',book));
    assert.equal(definition.id,Number(match[1]));assert.ok(definition.title&&definition.family&&definition.stateKey);
    const panel=readFileSync(new URL('panel.js',book),'utf8');
    assert.match(panel,/export \{ \w+ as init, \w+ as render, \w+ as setVisible \}/);
    for(const name of readdirSync(book).filter(name=>/^(state|combat|effects)\.js$/.test(name))){
      const source=readFileSync(new URL(name,book),'utf8');
      assert.doesNotMatch(source,/\b(?:document|window|HTMLElement)\b/,match[1]+'/'+name);
      assert.doesNotMatch(source,/<\/?(?:div|span|input|button|label|select|option|svg|p|table|tr|td)\b/i,
        match[1]+'/'+name+' must not build HTML');
    }
  }
});
