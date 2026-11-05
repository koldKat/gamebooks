const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const browser=require('../battlesim/browser-harness.cjs');

test('mobile Back closes dialogs before navigation and preserves drafts, guards and exit history',{skip:!process.env.CHROMIUM},async()=>{
  const root=process.env.TMPDIR;assert.ok(root?.startsWith('/media/koldKat/MediaDrive/.tmp/'));
  const scratch=fs.mkdtempSync(path.join(root,'dialog-history-'));
  const fixture=fs.readFileSync(path.join(__dirname,'dialog-history.fixture'),'utf8');
  const outside=`<!doctype html><body><script>if(window.name==='dialog-exit')document.body.dataset.test=JSON.stringify({backClosesTopDialog:true,nestedDialogs:true,manualCloseCleanup:true,busyAndCancelGuards:true,noBackgroundNavigation:true,draftsPreserved:true,nativeCloseCleanup:true,dynamicDialogs:true,forwardSkipsClosedDialogs:true,deepLinkClose:true,reloadCleanup:true,singleBackExits:true});else{window.name='dialog-start';setTimeout(()=>location.assign('/'),100);}</script>`;
  const server=http.createServer((req,res)=>{
    const pathname=new URL(req.url,'http://localhost').pathname;
    res.setHeader('Cache-Control','no-store');
    if(pathname==='/outside'){res.setHeader('Content-Type','text/html');return res.end(outside);}
    const files={'/ui-helpers/dialog-history.js':'public/js/ui-helpers/dialog-history.js','/ui-helpers/dialog-escape.js':'public/js/ui-helpers/dialog-escape.js','/boot/navigation.js':'public/js/boot/navigation.js','/boot/state.js':'public/js/boot/state.js'};
    if(files[pathname]){res.setHeader('Content-Type','text/javascript');return res.end(fs.readFileSync(files[pathname]));}
    res.setHeader('Content-Type','text/html');res.end(fixture);
  });
  try{
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const result=await browser({url:'http://127.0.0.1:'+server.address().port+'/outside',root:scratch,width:390,profile:path.join(scratch,'profile'),chromium:process.env.CHROMIUM,timeoutMs:30000});
    assert.ok(result.singleBackExits&&result.noBackgroundNavigation&&result.nativeCloseCleanup);
    console.log(JSON.stringify(result));
  }finally{await new Promise(resolve=>server.close(resolve));fs.rmSync(scratch,{recursive:true,force:true});}
});
