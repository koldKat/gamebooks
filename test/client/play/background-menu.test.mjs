import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

for (const file of ['play-screen.js','graph-bindings.js']) test(`play-area display menu works before a run through ${file}`,()=>{
  const elements=new Map(), requests=[], nodeSubmenus=[{style:{}}], backgroundSubmenus=[{style:{}}];
  const element=id=>{
    if(!elements.has(id))elements.set(id,{style:{},classList:{toggle(){}},offsetWidth:100,offsetHeight:100});
    return elements.get(id);
  };
  const context={state:{playthroughs:[],graph:{1:{}},startSection:1},currentBookId:42,
    window:{innerWidth:1000,innerHeight:800},t:key=>key,
    document:{getElementById:element,querySelectorAll:selector=>selector.startsWith('#node-ctx-menu ')?nodeSubmenus:
      selector.includes('.ctx-submenu-wrap')?[...nodeSubmenus,...backgroundSubmenus]:[]},
    apiFetch:async(url,options)=>{requests.push([url,JSON.parse(options.body)]);},
    bootState:{_currentBook:{isOpenWorld:false}},network:{getNodeAt:()=>1,DOMtoCanvas:point=>({...point,canvas:true})},
    currentPlaythrough:()=>null,currentSection:()=>null,maxFastTravels:()=>0,isValidSecId:()=>true,
    canReach:()=>false,getOwCrossBookRoute:()=>null};
  const bg=readFileSync('public/js/play/bg.js','utf8').replace(/^import .*;\n/gm,'').replace(/^export /gm,'');
  runInNewContext(bg,context);
  context._updateColorSwatches=()=>{};
  const source=readFileSync('public/js/boot/'+file,'utf8');
  const match=source.match(/network\.on\('oncontext', params => \{([\s\S]*?)\n\s*\}\);/);
  assert.ok(match,'actual canvas context handler');
  runInNewContext('function onContext(params){'+match[1]+'}',context);
  const event={preventDefault(){},clientX:100,clientY:200},pointer={DOM:{x:10,y:20}};
  context.onContext({event,pointer});
  assert.equal(nodeSubmenus[0].style.display,'none','run-only node options stay hidden');
  assert.notEqual(backgroundSubmenus[0].style.display,'none','node menu does not hide background Grid');
  context.network.getNodeAt=()=>undefined;
  context.setCurrentBookCover('cover.png');
  context.onContext({event,pointer});
  assert.equal(element('bg-ctx-menu').style.display,'block');
  assert.equal(element('bg-ctx-toggle-btn').style.display,'');
  assert.equal(element('bg-ctx-move-btn').style.display,'');
  assert.equal(context.bootState.ctxCanvasPos.canvas,true);
  context._enterBgMoveMode();assert.equal(context.isBgInMove(),true);
  context.nudgeBgPosY(10);context._exitBgMoveMode();assert.equal(context.isBgInMove(),false);
  context.toggleBgHidden();assert.equal(element('main-screen').style.backgroundImage,'');
  assert.equal(requests.length,2,'display preferences save without creating a run');
  assert.equal(context.state.playthroughs.length,0);
  context.setCurrentBookCover(null);context._showBgCtxMenu(0,0);
  assert.equal(element('bg-ctx-toggle-btn').style.display,'none');
  assert.notEqual(backgroundSubmenus[0].style.display,'none','Grid remains available without a cover');
  context.network.getNodeAt=()=>1;context.onContext({event,pointer});
  assert.equal(element('bg-ctx-menu').style.display,'none','opening a node menu closes the background menu');
});
