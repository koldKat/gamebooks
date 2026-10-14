const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const checkBrowser=require('./browser-harness.cjs');
const root=process.env.TMPDIR,chromium=process.env.CHROMIUM;
if(!root||!root.startsWith('/media/koldKat/MediaDrive/.tmp/')||!fs.existsSync(root)||!chromium)
  throw Error('Use the MediaDrive audit scratch directory and a headless Chromium binary');
const repo=process.cwd(),scratch=fs.mkdtempSync(path.join(root,'689-panel-'));
const integrated=process.argv.includes('--integration');
const crownEntry=process.argv.includes('--crown-entry');
const crown=crownEntry||process.argv.includes('--crown');
const evidencePrefix=process.env.BROWSER_EVIDENCE_PREFIX||'689';
if(!/^[a-zA-Z0-9-]+$/.test(evidencePrefix))throw Error('Invalid evidence filename prefix');
const fixturePath='test/client/battlesim/legendary-kingdoms-'+(crownEntry?'crown-entry':integrated?'integration':crown?'crown':'panel')+'.fixture';
const files=[fixturePath,__filename,
  'public/js/battlesim/battlesim'+(crown?'690':'689')+'.js','public/js/battlesim/loader.js',
  'public/mobile/js/battlesim-dispatch.js','public/js/core/state.js','public/js/core/util.js','public/js/i18n/battlesim.js',
  ...fs.readdirSync('public/js/battlesim/engines/legendary-kingdoms').filter(name=>name.endsWith('.js'))
    .map(name=>'public/js/battlesim/engines/legendary-kingdoms/'+name),
  ...['en','bg'].map(language=>'public/js/i18n/'+language+'/battlesim/battlesim'+(crown?'690':'689')+'.js'),
  ...['style','charsheet','equipment','battlesim','confirm'].map(name=>'public/css/'+name+'.css')];
const hashFiles=()=>Object.fromEntries(require('./browser-sources.cjs')(files).map(file=>[file,crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')]));
const hashes=hashFiles();
(async()=>{
  try {
    const results=[];
    for(const language of integrated||crownEntry?['desktop','mobile']:['en','bg']) {
      let fixture=fs.readFileSync(fixturePath,'utf8')
        .replaceAll('REPO','file://'+repo).replaceAll('LANG',language).replaceAll('MODE',language);
      if(crown&&integrated)fixture=fixture.replaceAll('689','690').replace('length===75','length===85')
        .replace("value='16'","value='5'");
      const css=['style','charsheet','equipment','battlesim','confirm'].map(name=>
        `<link rel="stylesheet" href="file://${repo}/public/css/${name}.css">`).join('');
      const file=path.join(scratch,language+'.html');
      const mount=integrated||crownEntry?(language==='mobile'?'m-sim-btn-row':'main-screen'):'buttons';
      fs.writeFileSync(file,`<!doctype html><meta charset="utf-8">${css}<div id="${mount}"></div><div id="inv-overlay"></div><script>addEventListener('error',e=>document.body.setAttribute('data-failure',e.message));addEventListener('unhandledrejection',e=>document.body.setAttribute('data-failure',String(e.reason)));</script><script type="module">${fixture}</script>`);
      for(const width of [320,390,1100]) {
        const result=await checkBrowser({file,profile:path.join(scratch,language+'-'+width),root,width,chromium});
        results.push(result);console.log(JSON.stringify(result));
      }
    }
    if(JSON.stringify(hashFiles())!==JSON.stringify(hashes))throw Error('Source changed during browser verification');
    fs.writeFileSync(path.join(root,evidencePrefix+(crownEntry?'-entry-verification.json':integrated?'-integrated-browser-verification.json':'-panel-verification.json')),JSON.stringify({bookId:crown?690:689,
      status:crownEntry?'BOOK-FACADE-PASSED-NOT-SUPPORTED-REGISTRIES-OR-LIVE-API':integrated?'REAL-LOADERS-PASSED-API-INTERCEPTED-NOT-LIVE':'PRIVATE-DIRECT-PANEL-PASSED-NOT-REGISTRATION-OR-LIVE',hashes,results,productionWrites:0},null,2));
  } finally {fs.rmSync(scratch,{recursive:true,force:true,maxRetries:10,retryDelay:100});}
})().catch(error=>{console.error(error);process.exitCode=1;});
