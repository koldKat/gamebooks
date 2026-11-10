// Exercise the real desktop and mobile readers with an isolated same-account transport.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const repo = process.cwd(), root = process.env.TMPDIR;
assert.ok(root && fs.statSync(root).isDirectory(), 'Set TMPDIR to the designated scratch directory');
const browser = require('../battlesim/browser-harness.cjs');
const file = path.join(root, 'book-device-sync.html'), base = 'file://' + repo + '/public';
const shell = fs.readFileSync('public/index.html', 'utf8').replace(/<script\b[\s\S]*?<\/script>/gi, '').replace(/(src|href)="\//g, '$1="' + base + '/');
const child = `
window.addEventListener('error', e => parent.fail(e.message));
window.addEventListener('unhandledrejection', e => parent.fail(String(e.reason)));
const id = Number(document.body.dataset.client), client = parent.clients[id];
localStorage.setItem('gamebook_auth_token','same-account');
window.fetch = async (url, options={}) => {
 if(url.endsWith('/party')) return new Response(JSON.stringify({party:null}));
 if(url.endsWith('/reading-access')) return new Response(JSON.stringify({locked:false,startSection:1}));
 if(url === '/api/profile') return new Response(JSON.stringify({xp:0,level:1}));
 if(url.includes('/sections/')) {
   const sec=Number(url.split('/').at(-1)), choices=parent.saved.graph[sec]?.choices||[];
   return new Response(JSON.stringify({html:'<p>Section '+sec+'</p>'+choices.map(c=>'<a href="#section-'+c+'">Go '+c+'</a>').join(' '),choices}));
 }
 if(url.endsWith('/state') && ['PUT','PATCH'].includes(options.method)) {
   const incoming=JSON.parse(options.body);
   if(options.method==='PATCH') parent.saved.positions={...parent.saved.positions,...incoming.positions};
   else parent.saved={...incoming,positions:{...incoming.positions,...parent.saved.positions}};
   parent.saves++;
   const payload=options.method==='PATCH'?{type:'positions_updated',bookId:1,positions:incoming.positions}:{type:'state_updated',bookId:1};
   for(const other of parent.clients) if(other.stream && other.stream.clientId!==options.headers['X-Book-Client']) other.stream.onmessage?.({data:JSON.stringify(payload)});
   return new Response('{}');
 }
 if(url.endsWith('/state')) return new Response(JSON.stringify(parent.saved));
 return new Response('{}');
};
window.EventSource=class {
 constructor(url){ this.clientId=new URL(url,'http://fixture').searchParams.get('client'); client.stream=this;setTimeout(()=>this.onopen?.(),0); }
 close(){this.closed=true;}
};
const data=await import('${base}/js/core/state.js');
Object.assign(client,{data});
if(id===0){
 const graph=await import('${base}/js/graph.js'),play=await import('${base}/js/play.js'),party=await import('${base}/js/play/party.js');
 const { _focusNodeAfterLoad }=await import('${base}/js/play/open-world.js');
 await data.loadState(1);
 document.getElementById('login-screen').style.display='none';document.getElementById('books-screen').style.display='none';document.getElementById('main-screen').style.display='flex';
 graph.initGraph();play.render();await party.connectPartySSE(1);
 Object.assign(client,{graph,play,party,focusAfterLoad:_focusNodeAfterLoad});
}else{
 document.body.innerHTML='<div id="screen"></div>';
 const reader=await import('${base}/mobile/js/reader.js'),mobileGraph=await import('${base}/mobile/js/graph-view.js');
 await reader.renderReader(document.getElementById('screen'),{id:1,name:'Device fixture'},()=>{});
 Object.assign(client,{reader,mobileGraph,document});
}
client.ready=true;
`;
const html = `<!doctype html><body><script>
window.clients=[{},{}];window.saves=0;window.fail=e=>document.body.dataset.failure=e;
window.saved={bookName:'Device fixture',totalSections:20,startSection:1,positions:{1:{x:0,y:0},2:{x:400,y:200},3:{x:-200,y:200},4:{x:700,y:400},5:{x:400,y:400},6:{x:600,y:600},7:{x:800,y:600}},graph:{1:{choices:[2,3]},2:{choices:[4,5]},3:{choices:[]},4:{choices:[6,7]},5:{choices:[]},6:{choices:[]},7:{choices:[]}},playthroughs:[{startedAt:123,path:[1],mVisited:[1],completed:false,charSheet:{fields:[]}}],activePtIndex:0};
const shell=${JSON.stringify(shell)},child=${JSON.stringify(child)};
for(let id=0;id<2;id++){
 const frame=document.createElement('iframe');frame.width=id===0?800:390;frame.height=750;
 frame.srcdoc=shell.replace('<body','<body data-client="'+id+'"')+'<script src="${base}/vendor/vis-network/vis-network.min.js"><'+'/script><script type="module">'+child+'<'+'/script>';
 document.body.append(frame);
}
(async()=>{
 const wait=ms=>new Promise(r=>setTimeout(r,ms)),check=(ok,label)=>{if(!ok)throw Error(label)};
 for(let i=0;i<150&&!clients.every(c=>c.ready);i++)await wait(50);
 check(clients.every(c=>c.ready),'Readers ready');await wait(150);
 const [desktop,mobile]=clients;
 check(desktop.stream.clientId!==mobile.stream.clientId,'Each page has its own origin ID despite shared authentication');
 desktop.play.navigate(2);await wait(250);
 check(mobile.data.currentSection()===2,'Desktop move reaches mobile');
 check(mobile.document.getElementById('m-top').textContent.includes('Section 2'),'Mobile prose follows remote move');
 const saves=window.saves;await wait(500);check(window.saves===saves,'Receiving mobile reader does not echo a save');
 mobile.document.querySelector('#m-top a[href="#section-4"]').click();await wait(300);
 check(desktop.data.currentSection()===4,'Mobile move reaches desktop');
 check(desktop.graph.visEdges.get('2>4').width===2.5,'Desktop chart highlights mobile path');
 check(desktop.graph.visNodes.get(4).color.background!==desktop.graph.visNodes.get(2).color.background,'Desktop current node updates');
 desktop.graph.network.moveNode(2,520,320);await desktop.data.savePositions({2:{x:520,y:320}});await wait(100);
 check(mobile.data.state.positions[2].x===520,'Desktop drag reaches mobile');
 await mobile.data.savePositions({2:{x:640,y:360}});await wait(100);
 check(desktop.graph.network.getPositions([2])[2].x===640,'Mobile coordinate patch reaches desktop');
 desktop.party.disconnectPartySSE();desktop.graph.destroyNetwork();desktop.data.setCurrentBookId(null);
 mobile.document.querySelector('#m-top a[href="#section-6"]').click();await wait(200);
 await desktop.data.loadState(1);desktop.graph.initGraph();desktop.play.render();
 desktop.focusAfterLoad(1);
 await desktop.party.connectPartySSE(1);await wait(100);
 check(desktop.data.currentSection()===6,'Home/reopen catches current mobile position');
 // Same-frame replacements previously leaked vis-network redraw callbacks.
 desktop.graph.network.focus(1,{animation:{duration:250},scale:1.2});
 // vis-network's initial layout fit bypasses the public Network methods.
 desktop.graph.network.view.moveTo({position:{x:0,y:0},animation:{duration:250},scale:1.2});
 desktop.graph.network.focus(6,{animation:{duration:250},scale:1.2});
 // Offscreen iframe canvases are throttled by headless Chrome. Drive the same
 // redraw event used by vis-network so animation coverage is deterministic.
 for(let i=0;i<40;i++){desktop.graph.network.body.emitter.emit('initRedraw');await wait(5);}
 await wait(100);
 const center=desktop.graph.network.getViewPosition(),target=desktop.graph.network.getPositions([6])[6];
 check(Math.hypot(center.x-target.x,center.y-target.y)<10,'Camera settles on the current node: '+JSON.stringify({center,target,easingTime:desktop.graph.network.view.easingTime}));
 check(desktop.graph.network.renderer.renderRequests===0,'Replacing animations releases their render requests');
 for(let i=0;i<20;i++){
  desktop.graph.network.body.container.dispatchEvent(new MouseEvent('mousemove',{bubbles:true,clientX:200+i,clientY:200}));
  desktop.graph.network.redraw();await wait(20);
  desktop.graph.network.body.emitter.emit('initRedraw');
  const p=desktop.graph.network.getViewPosition();check(Math.hypot(p.x-center.x,p.y-center.y)<.01,'Mouse redraw cannot replay an old camera animation');
 }
 const before=saves;await wait(150);const stableSaves=window.saves;await wait(300);check(window.saves===stableSaves,'No update loop');
 desktop.party.disconnectPartySSE();desktop.graph.destroyNetwork();
 mobile.data.state.playthroughs[0].completed=true;mobile.data.setCurrentBookId(null);
 document.body.dataset.test=JSON.stringify({soloAccount:true,actualDesktopAndMobile:true,bidirectionalProgress:true,readerProse:true,chartPathAndCurrentNode:true,coordinatePatches:true,noSaveEcho:true,reopenLatestProgress:true,overlappingCameraAnimations:true,mouseRedrawStable:true,productionWrites:0});
})().catch(e=>fail(e.stack));
</script>`;
(async()=>{fs.writeFileSync(file,html);try{
 const result=await browser({file,root,profile:path.join(root,'book-device-sync-browser'),width:1400,chromium:process.env.CHROMIUM,timeoutMs:20000});
 fs.writeFileSync(path.join(root,'book-device-sync-browser-verification.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{fs.rmSync(file,{force:true})}})().catch(e=>{console.error(e);process.exitCode=1});
