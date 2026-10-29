const fs=require('fs'),path=require('path');
const checkBrowser=require('./browser-harness.cjs');
const {getRosterRows}=require('../../helpers/roster-db.cjs');
const root=process.env.TMPDIR,repo=process.cwd();
const receiptName=process.env.SIMULATOR_RECEIPT;
if(receiptName&&!/^[a-zA-Z0-9-]+\.json$/.test(receiptName))throw Error('Invalid receipt name');
if(!root?.startsWith('/media/koldKat/MediaDrive/.tmp/'))throw Error('Use MediaDrive scratch');
const ids=process.argv.includes('--all')?fs.readdirSync('public/js/battlesim/books').map(Number).sort((a,b)=>a-b):process.argv.slice(2).map(Number);if(!ids.length)throw Error('Supply book IDs');
// Full-catalog audits can exercise older API-backed simulators with the actual
// installed enemy response, without opening a writable database connection.
const installedRosters=Object.fromEntries(ids.map(id=>[id,getRosterRows(id)]));
const scratch=fs.mkdtempSync(path.join(root,'sim-architecture-'));
const scenario=process.env.SIMULATOR_SCENARIO;
if(scenario&&!/^[a-z-]+$/.test(scenario))throw Error('Invalid simulator scenario');
(async()=>{try{
  const results=[];
  const languages = scenario ? ['en','bg'] : (process.env.SIMULATOR_LANGUAGES?.split(',') ?? ['en']);
  if (!languages.length || !languages.every(language => ['en','bg'].includes(language))) throw Error('Invalid simulator languages');
  for(const language of languages){
  for(const mode of ['desktop','mobile']){
    const rosterSeeds=installedRosters;
    const fixture=fs.readFileSync(__dirname+'/'+(scenario?scenario+'-integration':'architecture-browser')+'.fixture','utf8').replaceAll('REPO','file://'+repo).replaceAll('MODE',mode).replaceAll('LANGUAGE',language).replaceAll('AUDIT_LEGACY_ROSTERS', String(process.env.SIMULATOR_LIVE_ROSTERS === '1')).replace('BOOK_IDS',JSON.stringify(ids)).replace('ROSTER_SEEDS',JSON.stringify(rosterSeeds));
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
      ...ids.flatMap(id=>['en','bg'].map(lang=>'public/js/i18n/'+lang+'/battlesim/battlesim'+id+'.js').filter(file=>fs.existsSync(file))),
      __filename,__dirname+'/'+scenario+'-integration.fixture']);
    const hash=bytes=>require('node:crypto').createHash('sha256').update(bytes).digest('hex');
    receipt={results,hashes:Object.fromEntries(require('./browser-sources.cjs')(files).map(file=>[file,hash(fs.readFileSync(file))]))};
  }
  fs.writeFileSync(path.join(root,receiptName||(scenario?scenario+'-browser.json':'simulator-architecture-browser.json')),JSON.stringify(receipt,null,2));
}finally{fs.rmSync(scratch,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});
