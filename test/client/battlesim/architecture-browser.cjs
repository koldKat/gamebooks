const fs=require('fs'),path=require('path');
const checkBrowser=require('./browser-harness.cjs');
const root=process.env.TMPDIR,repo=process.cwd();
if(!root?.startsWith('/media/koldKat/MediaDrive/.tmp/'))throw Error('Use MediaDrive scratch');
const ids=process.argv.includes('--all')?fs.readdirSync('public/js/battlesim/books').map(Number).sort((a,b)=>a-b):process.argv.slice(2).map(Number);if(!ids.length)throw Error('Supply book IDs');
const scratch=fs.mkdtempSync(path.join(root,'sim-architecture-'));
(async()=>{try{
  const results=[];
  for(const mode of ['desktop','mobile']){
    const fixture=fs.readFileSync(__dirname+'/architecture-browser.fixture','utf8').replaceAll('REPO','file://'+repo).replaceAll('MODE',mode).replace('BOOK_IDS',JSON.stringify(ids));
    const css=['style','charsheet','equipment','battlesim','confirm'].map(n=>`<link rel="stylesheet" href="file://${repo}/public/css/${n}.css">`).join('');
    const file=path.join(scratch,mode+'.html');
    fs.writeFileSync(file,`<!doctype html><meta charset="utf-8">${css}<div id="main-screen"></div><div id="m-sim-btn-row"></div><div id="inv-overlay"></div><script>addEventListener('error',e=>document.body.dataset.failure=e.message);addEventListener('unhandledrejection',e=>document.body.dataset.failure=String(e.reason));</script><script type="module">${fixture}</script>`);
    for(const width of [320,390,1100]){
      const result=await checkBrowser({file,profile:path.join(scratch,mode+'-'+width),root,width,chromium:process.env.CHROMIUM,timeoutMs:120000});
      results.push(result);console.log(JSON.stringify({...result,books:result.books.length}));
    }
  }
  fs.writeFileSync(path.join(root,'simulator-architecture-browser.json'),JSON.stringify(results,null,2));
}finally{fs.rmSync(scratch,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});
