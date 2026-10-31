const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const browser = require('../battlesim/browser-harness.cjs');
const root = process.env.TMPDIR;
if (!root?.startsWith('/media/koldKat/MediaDrive/.tmp/')) throw Error('Use MediaDrive scratch');
const scratch = fs.mkdtempSync(path.join(root, 'navigation-'));
const failure = `<script>addEventListener('error',e=>document.body.dataset.failure=e.message);addEventListener('unhandledrejection',e=>document.body.dataset.failure=String(e.reason));</script>`;
const check = `const check=(v,label)=>{if(!v)throw Error(label);};`;
const main = `<!doctype html><body>${failure}<script type="module">
import {_pushNav,_openMobilePanel,_syncMobilePanelHistory} from '/boot/navigation.js';
${check}
const progress=()=>document.body.dataset.progress=JSON.stringify({name:window.name,url:location.href,state:history.state,length:history.length});progress();
addEventListener('popstate',e=>_syncMobilePanelHistory(e.state));
let finished=false;
const finish=()=>{
 if(window.name!=='reader-return'||finished)return;finished=true;
 check(history.state?.view==='books'&&location.hash==='#home','reader returned to the existing main entry');
 check(!document.body.classList.contains('mobile-books-open')&&!document.body.classList.contains('mobile-addbook-open'),'no hidden panel remains');
 window.name='exit-check';progress();history.back();
};
addEventListener('pageshow',finish);
if(window.name==='reader-return')finish();
else {
 const launchLength=history.length;
 _pushNav('home',{view:'books'});
 check(history.length===launchLength,'startup adds no invisible Back entry');
 const back=()=>new Promise(resolve=>{addEventListener('popstate',()=>resolve(),{once:true});history.back();});
 for(let i=0;i<3;i++){
  _openMobilePanel('books');_openMobilePanel('addbook');_openMobilePanel('books');
  check(history.length<=launchLength+1,'switching panels does not accumulate entries');
  history.pushState({...history.state,dialogOpen:true},'');
  await back();check(history.state.mobilePanel==='books','Back dismisses dialog before panel');
  await back();check(!document.body.classList.contains('mobile-books-open'),'Back closes the visible panel');
 }
 window.name='enter-reader';progress();location.assign('/mobile?book=1');
}
</script>`;
const reader = `<!doctype html><body>${failure}<script type="module">
import {initMainAppReturn,returnToMainApp} from '/mobile/navigation.js';
${check}
document.body.dataset.progress=JSON.stringify({name:window.name,url:location.href,state:history.state,length:history.length});
initMainAppReturn();check(history.state?.mainAppReturn,'reader knows the previous main entry');
if(window.name==='enter-reader'){window.name='reader-reload';location.reload();}
else{check(window.name==='reader-reload','reader reload retained stage');window.name='reader-return';returnToMainApp();}
</script>`;
const outside = `<!doctype html><body>${failure}<script>
document.body.dataset.progress=JSON.stringify({name:window.name,url:location.href,state:history.state,length:history.length});
if(window.name==='exit-check')document.body.dataset.test=JSON.stringify({singleBackExits:true,panelsDoNotAccumulate:true,readerReturnDoesNotPush:true,readerReloadSafe:true});
else{window.name='start';setTimeout(()=>location.assign('/'),100);}
</script>`;
const server = http.createServer((req,res)=>{
 res.setHeader('Cache-Control','no-store');
 const pathname=new URL(req.url,'http://localhost').pathname;
 const pages={'/':main,'/mobile':reader,'/outside':outside};
 if(pages[pathname]){res.setHeader('Content-Type','text/html');return res.end(pages[pathname]);}
 const files={'/boot/navigation.js':'public/js/boot/navigation.js','/boot/state.js':'public/js/boot/state.js','/mobile/navigation.js':'public/mobile/js/navigation.js'};
 if(files[pathname]){res.setHeader('Content-Type','text/javascript');return res.end(fs.readFileSync(files[pathname]));}
 res.writeHead(404);res.end();
});
(async()=>{
 try{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  for(const width of [390,1100])console.log(JSON.stringify(await browser({url:'http://127.0.0.1:'+server.address().port+'/outside',root,width,profile:path.join(scratch,'profile-'+width),chromium:process.env.CHROMIUM})));
 }finally{await new Promise(resolve=>server.close(resolve));fs.rmSync(scratch,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
