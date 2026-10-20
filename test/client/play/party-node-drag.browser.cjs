// Real canvases and production drag handlers; isolated shared-state transport, no player DB writes.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const repo = process.cwd(), root = process.env.TMPDIR;
assert.ok(root && fs.statSync(root).isDirectory(), 'Set TMPDIR to the designated scratch directory');
const browser = require(path.join(repo, 'test/client/battlesim/browser-harness.cjs'));
const file = path.join(root, 'party-node-drag-race.html');
const base = 'file://' + repo + '/public';
const shell = fs.readFileSync('public/index.html', 'utf8').replace(/<script\b[\s\S]*?<\/script>/gi, '').replace(/(src|href)="\//g, '$1="' + base + '/');
const childScript = `
window.addEventListener('error', e => parent.fail(e.message));
window.addEventListener('unhandledrejection', e => parent.fail(String(e.reason)));
const id = Number(document.body.dataset.client);
localStorage.setItem('gamebook_auth_token', 'isolated-fixture');
window.fetch = async (url, options = {}) => {
 if (url.endsWith('/party')) return new Response(JSON.stringify({party:{members:[]}}));
 if (url.endsWith('/state') && options.method === 'PATCH') {
   const {positions} = JSON.parse(options.body);
   parent.saved.positions = {...parent.saved.positions,...positions};
   for (const c of parent.clients) if (c && c.id !== id) c.stream?.onmessage?.({data:JSON.stringify({type:'positions_updated',bookId:1,positions})});
   return new Response('{}');
 }
 if (url.endsWith('/state') && options.method === 'PUT') {
   const incoming = JSON.parse(options.body); parent.saved = {...incoming,positions:{...incoming.positions,...parent.saved.positions}};
   for (const c of parent.clients) if (c && c.id !== id) c.stream?.onmessage?.({data:JSON.stringify({type:'state_updated',bookId:1})});
   return new Response('{}');
 }
 if (url.endsWith('/state') && parent.clients[id].failLoad) return new Response('{}',{status:500});
 if (url.endsWith('/state')) return new Response(JSON.stringify(parent.saved));
 return new Response('{}');
};
window.EventSource = class {
 constructor() { parent.clients[id].stream = this; setTimeout(() => this.onopen?.(), 0); }
 close() { this.closed = true; }
};
const data = await import('${base}/js/core/state.js');
const graph = await import('${base}/js/graph.js');
const play = await import('${base}/js/play.js');
const party = await import('${base}/js/play/party.js');
await data.loadState(1);
document.getElementById('login-screen').style.display = 'none';
document.getElementById('books-screen').style.display = 'none';
document.getElementById('main-screen').style.display = 'flex';
graph.initGraph(); play.render();
Object.assign(parent.clients[id], {data, graph, play, party});
await party.connectPartySSE(1);
parent.clients[id].ready = true;
`;
const html = `<!doctype html><body><script>
window.clients = [{id:0},{id:1}];
window.fail = error => document.body.dataset.failure = error;
window.saved = {bookName:'Party fixture',totalSections:10,startSection:1,positions:{1:{x:0,y:0},2:{x:100,y:100},3:{x:200,y:100},4:{x:100,y:200},5:{x:200,y:200}},graph:{1:{choices:[2,3]},2:{choices:[4,5]},3:{choices:[]},4:{choices:[]},5:{choices:[]}},playthroughs:[{startedAt:123,path:[1],completed:false,charSheet:{fields:[]}}],activePtIndex:0};
const shell = ${JSON.stringify(shell)}, child = ${JSON.stringify(childScript)};
for (let id = 0; id < 2; id++) {
 const frame = document.createElement('iframe'); frame.width = 650; frame.height = 700;
 frame.srcdoc = shell.replace('<body', '<body data-client="'+id+'"') + '<script src="${base}/vendor/vis-network/vis-network.min.js"><'+'/script><script type="module">'+child+'<'+'/script>';
 document.body.append(frame);
}
(async()=>{
 const wait = ms => new Promise(r=>setTimeout(r,ms));
 for(let i=0;i<100 && !clients.every(c=>c.ready);i++) await wait(50);
 if(!clients.every(c=>c.ready)) throw Error('Clients not ready');
 await wait(100);
 const [a,b] = clients;
 const check = (condition, label) => {if(!condition) throw Error(label)};
 const drag = async (client, ids, x, y) => {
   client.graph.network.body.emitter.emit('dragStart',{nodes:ids});
   await wait(50);
   for (const node of ids) client.graph.network.moveNode(node,x,y);
   client.graph.network.body.emitter.emit('dragEnd',{nodes:ids});
   const other = client === a ? b : a;
   await wait(100);
   other.data.state.viewport = {scale:0.95}; await other.data.saveState();
   await wait(1300);
 };
 await drag(a,[2],400,300);
 check(b.graph.network.getPositions([2])[2].x === 400 && b.graph.network.getPositions([2])[2].y === 300,'A drag reflected on B actual canvas: '+JSON.stringify({saved:parent.saved.positions[2],a:a.graph.network.getPositions([2]),b:b.graph.network.getPositions([2]),bstate:b.data.state.positions[2]}));
 await drag(b,[2],600,500);
 check(a.graph.network.getPositions([2])[2].x === 600 && a.graph.network.getPositions([2])[2].y === 500,'B drag reflected on A actual canvas');
 a.data.state.snapToGrid = true; await a.data.saveState(); await wait(150);
 await drag(a,[2,3],513,389);
 for (const node of [2,3]) check(b.graph.network.getPositions([node])[node].x === 520 && b.graph.network.getPositions([node])[node].y === 400,'Snapped multi-node positions reach partner');
 a.data.state.snapToGrid = false;
 a.data.state.graph['12-L'] = {choices:[]}; a.data.state.positions['12-L'] = {x:700,y:700};
 a.play.render(); await a.data.saveState(); await wait(150);
 await drag(b,['12-L'],-250,450);
 check(a.graph.network.getPositions(['12-L'])['12-L'].x === -250,'Alphanumeric node position reaches partner');
 b.failLoad = true;
 a.play.navigate(2); await wait(150);
 check(b.data.currentSection() === 1, 'Failed state GET preserves previous progress');
 b.failLoad = false;
 await wait(1100);
 check(b.data.currentSection() === 2, 'Remote active section');
 check(b.graph.network.body.container.ownerDocument.querySelector('#playthrough-panel .section-display').textContent.trim() === '2', 'Section panel recovers without another move');
 check(b.graph.visNodes.get(2).color.background === a.graph.visNodes.get(2).color.background, 'Remote current-node canvas color');
 check(b.graph.visEdges.get('1>2').width === 2.5, 'Remote path highlighted');
 b.play.navigate(4); await wait(150);
 check(a.data.currentSection() === 4, 'Reverse move');
 a.play.endPlaythrough('success'); await wait(150);
 check(b.data.viewingPt?.completed && b.data.viewingPt.path.at(-1) === 4, 'Completed path stays visible');
 check(b.graph.visEdges.get('2>4').width === 2.5, 'Finished canvas path highlighted');
 b.failLoad = true; try { await b.data.loadState(1); } catch (_) {} b.failLoad = false;
 b.play.render(); await b.data.saveState(); await wait(150);
 check(a.data.state.playthroughs.length === 1 && b.data.state.playthroughs.length === 1, 'Failed default load cannot erase either party run');
 b.stream.onerror();
 a.graph.network.moveNode(2,900,650); await a.data.savePositions({2:{x:900,y:650}});
 a.data.state.graph[4].note = 'Changed while disconnected'; await a.data.saveState();
 await wait(1400);
 check(b.data.state.graph[4].note === 'Changed while disconnected', 'Reconnect catches missed save');
 check(b.graph.network.getPositions([2])[2].x === 900,'Reconnect restores missed coordinate patch');
 for (const c of clients) {c.party.disconnectPartySSE();c.graph.destroyNetwork()}
 document.body.dataset.test = JSON.stringify({failedProgressRefreshRecovery:true,sectionPanelRecovery:true,snappedGroupDragging:true,alphanumericDragging:true,reconnectPositions:true,bidirectionalNodeDragging:true,failedLoadPreservesBothPlayers:true,twoRealCanvases:true,bidirectionalMoves:true,currentNodeColor:true,pathHighlight:true,completion:true,reconnect:true,productionWrites:0});
})().catch(e=>fail(e.stack));
</script>`;
(async()=>{fs.writeFileSync(file,html); try {
 const result = await browser({file,root,profile:path.join(root,'party-node-drag-race-browser'),width:1400,chromium:process.env.CHROMIUM,timeoutMs:20000});
 fs.writeFileSync(path.join(root,'party-node-drag-race-verification.json'),JSON.stringify(result,null,2)); console.log(JSON.stringify(result));
} finally {fs.rmSync(file,{force:true})}})().catch(e=>{console.error(e);process.exitCode=1});
