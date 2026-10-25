// Panel-only integration while the unreleased simulator awaits its final rules.
// Real desktop/mobile lazy-loader checks remain a separate release requirement.
const fs=require('fs'),path=require('path');
const checkBrowser=require('./browser-harness.cjs');
const root=process.env.TMPDIR;
if(!root?.startsWith('/media/koldKat/MediaDrive/.tmp/'))throw Error('Use MediaDrive scratch');
const mode=process.argv.includes('--mobile')?'mobile':'desktop';
const bookRules=process.argv.includes('--book-rules');
const legionAbilities=process.argv.includes('--legion-abilities');
const legionBook=process.argv.includes('--legion-book');
const width=Number(process.argv.find(value=>value.startsWith('--width='))?.split('=')[1]||390);
if(!Number.isInteger(width)||width<300||width>2000)throw Error('Invalid viewport');
const repo=process.cwd(),scratch=fs.mkdtempSync(path.join(root,'destinyquest-panel-'));
(async()=>{try{
  const source=fs.readFileSync(__dirname+(legionBook?'/destinyquest-legion-book-panel.fixture':legionAbilities?'/destinyquest-legion-abilities-panel.fixture':bookRules?'/destinyquest-book-rules-panel.fixture':'/destinyquest-panel.fixture'),'utf8').replaceAll('REPO','file://'+repo)
    .replace('SWEEP_PRESETS',String(process.argv.includes('--presets')))
    .replace('ROSTER_SEED',JSON.stringify(JSON.parse(fs.readFileSync('data/simulator-rosters/1285.json','utf8')).enemies))
    .replace('LEGION_ENEMIES',legionAbilities||legionBook?JSON.stringify(JSON.parse(fs.readFileSync('data/simulator-rosters/1286.json','utf8')).enemies):'[]');
  const css=['style','charsheet','equipment','battlesim','confirm','play'].map(name=>`<link rel="stylesheet" href="file://${repo}/public/css/${name}.css">`).join('')
    +(mode==='mobile'?`<link rel="stylesheet" href="file://${repo}/public/mobile/css/style.css">`:'');
  const file=path.join(scratch,'test.html');
  fs.writeFileSync(file,`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${css}<div id="${mode==='mobile'?'m-sim-btn-row':'main-screen'}"></div><script>addEventListener('error',e=>document.body.dataset.failure=e.error?.stack||e.message);addEventListener('unhandledrejection',e=>document.body.dataset.failure=e.reason?.stack||String(e.reason));</script><script type="module">${source}</script>`);
  const result=await checkBrowser({file,profile:path.join(scratch,'profile'),root,width,chromium:process.env.CHROMIUM,timeoutMs:30000,
    screenshotPath:process.argv.includes('--screenshot')?path.join(root,'1285-panel-preview.jpg'):undefined});
  const receipt={...result,mode,panelOnly:true,...(bookRules?{bookOptions:true}: {}),...(legionAbilities?{legionAbilities:true}: {}),...(legionBook?{legionBook:true}: {})};
  fs.writeFileSync(path.join(root,`${legionBook?'1286-legion-book-panel':legionAbilities?'1286-legion-abilities-panel':bookRules?'1286-book-rules-panel':'1285-panel'}-browser-${mode}-${width}.json`),JSON.stringify(receipt,null,2)+'\n');console.log(receipt);
}finally{fs.rmSync(scratch,{recursive:true,force:true});}})().catch(error=>{console.error(error);process.exitCode=1;});
