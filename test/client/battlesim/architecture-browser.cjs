const fs=require('fs'),path=require('path');
const checkBrowser=require('./browser-harness.cjs');
const root=process.env.TMPDIR,repo=process.cwd();
if(!root?.startsWith('/media/koldKat/MediaDrive/.tmp/'))throw Error('Use MediaDrive scratch');
const ids=process.argv.includes('--all')?fs.readdirSync('public/js/battlesim/books').map(Number).sort((a,b)=>a-b):process.argv.slice(2).map(Number);if(!ids.length)throw Error('Supply book IDs');
const scratch=fs.mkdtempSync(path.join(root,'sim-architecture-'));
const scenario=process.env.SIMULATOR_SCENARIO;
if(scenario&&!/^[a-z-]+$/.test(scenario))throw Error('Invalid simulator scenario');
(async()=>{try{
  const results=[];
  for(const language of scenario?['en','bg']:['en']){
  for(const mode of ['desktop','mobile']){
    const rosterSeeds=Object.fromEntries(ids.flatMap(id=>{const file=path.join(repo,'data/simulator-rosters',id+'.json');return fs.existsSync(file)?[[id,JSON.parse(fs.readFileSync(file,'utf8')).enemies]]:[];}));
    const fixture=fs.readFileSync(__dirname+'/'+(scenario?scenario+'-integration':'architecture-browser')+'.fixture','utf8').replaceAll('REPO','file://'+repo).replaceAll('MODE',mode).replaceAll('LANGUAGE',language).replace('BOOK_IDS',JSON.stringify(ids)).replace('ROSTER_SEEDS',JSON.stringify(rosterSeeds));
    const css=['style','charsheet','equipment','battlesim','confirm'].map(n=>`<link rel="stylesheet" href="file://${repo}/public/css/${n}.css">`).join('')
      + `<link rel="stylesheet" href="file://${repo}/public/${mode === 'mobile' ? 'mobile/css/style' : 'css/play'}.css">`;
    const file=path.join(scratch,mode+'.html');
    fs.writeFileSync(file,`<!doctype html><meta charset="utf-8">${css}<div id="${mode === 'mobile' ? 'm-sim-btn-row' : 'main-screen'}"></div><div id="inv-overlay"></div><script>addEventListener('error',e=>document.body.dataset.failure=e.error?.stack||e.message);addEventListener('unhandledrejection',e=>document.body.dataset.failure=e.reason?.stack||String(e.reason));</script><script type="module">${fixture}</script>`);
    for(const width of [320,390,1100]){
      const result=await checkBrowser({file,profile:path.join(scratch,mode+'-'+width),root,width,chromium:process.env.CHROMIUM,timeoutMs:120000});
      results.push(result);console.log(JSON.stringify({...result,books:result.books?.length}));
    }
  }
  }
  let receipt=results;
  if(scenario){
    const files=ids.map(id=>'public/js/battlesim/battlesim'+id+'.js').concat([
      'public/js/battlesim/loader.js','public/mobile/js/battlesim-dispatch.js',
      'public/js/core/state.js','public/js/core/util.js','public/css/battlesim.css',
      ...ids.flatMap(id=>['en','bg'].map(lang=>'public/js/i18n/'+lang+'/battlesim/battlesim'+id+'.js')),
      __filename,__dirname+'/'+scenario+'-integration.fixture']);
    const hash=bytes=>require('node:crypto').createHash('sha256').update(bytes).digest('hex');
    receipt={results,hashes:Object.fromEntries(require('./browser-sources.cjs')(files).map(file=>[file,hash(fs.readFileSync(file))]))};
  }
  fs.writeFileSync(path.join(root,scenario?scenario+'-browser.json':'simulator-architecture-browser.json'),JSON.stringify(receipt,null,2));
}finally{fs.rmSync(scratch,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});
