// Exercise shared simulator dropdowns using browser input, not select.value.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const browser = require('./browser-harness.cjs');
const {getRosterRows} = require('../../helpers/roster-db.cjs');
const root = process.env.TMPDIR, repo = process.cwd();
assert(root?.startsWith('/media/koldKat/MediaDrive/.tmp/'));
const ids = process.argv.slice(2).map(Number);
assert(ids.length && ids.every(Number.isInteger));
const scratch = fs.mkdtempSync(path.join(root, 'sim-pointer-'));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
(async () => { try {
  const results = [];
  for (const mode of process.env.SIMULATOR_MODE ? [process.env.SIMULATOR_MODE] : ['desktop', 'mobile']) {
    const width = Number(process.env.SIMULATOR_WIDTH) || (mode === 'desktop' ? 1100 : 390);
    const seeds = Object.fromEntries(ids.map(id => [id, getRosterRows(id)]));
    let prelude = fs.readFileSync(__dirname + '/architecture-browser.fixture', 'utf8').split('const results=[];')[0]
      .replaceAll('REPO', 'file://' + repo).replaceAll('LANGUAGE', 'bg').replace('ROSTER_SEEDS', JSON.stringify(seeds));
    const script = prelude + `
window.openProbe=async id=>{
  app.setCurrentBookId(id);app.state.playthroughs=[{startedAt:1,path:[1]}];app.state.activePtIndex=0;
  if('${mode}'==='mobile')await mobile.openSimForBook(id);else await desktop.showBattleSimForBook(id);
  const launcher=document.getElementById(id===829?'battlesim-btn':'sim'+id+'-btn');
  if('${mode}'==='desktop')launcher.click();
  await new Promise(r=>setTimeout(r,0));
  const overlay=document.getElementById(id===829?'bsim-overlay':id===8?'s8-overlay':'sim'+id+'-overlay');
  check(overlay?.classList.contains('active'),'open '+id);window.probeOverlay=overlay;
  window.probeModule=await import('file://${repo}/public/js/battlesim/battlesim'+id+'.js');
  const controls=[...overlay.querySelectorAll('select.themed-select-native')];
  controls.forEach((s,i)=>s.dataset.probe=i);
  const reference=document.getElementById('equipment-btn');
  for(const property of ['fontFamily','fontSize','textTransform','letterSpacing'])
    if('${mode}'==='desktop')check(getComputedStyle(launcher)[property]===getComputedStyle(reference)[property],'launcher '+property+' '+id);
  return controls.length;
};
window.finishProbe=()=>{window.probeOverlay.classList.remove('active');};
window.pointerReady=true;`;
    const css = ['style', 'charsheet', 'equipment', 'battlesim', 'confirm'].map(n => `<link rel="stylesheet" href="file://${repo}/public/css/${n}.css">`).join('')
      + `<link rel="stylesheet" href="file://${repo}/public/${mode === 'mobile' ? 'mobile/css/style' : 'css/play'}.css">`;
    const imports = process.env.SIMULATOR_SELECT_SOURCE ? `<script type="importmap">${JSON.stringify({imports:{['file://' + repo + '/public/js/ui-helpers/themed-select.js']:'file://' + process.env.SIMULATOR_SELECT_SOURCE}})}</script>` : '';
    const file = path.join(scratch, mode + '.html');
    const controls = '<button id="equipment-btn">Equipment</button><button id="inventory-btn">Inventory</button><button id="charsheet-btn">Character sheet</button>';
    fs.writeFileSync(file, `<!doctype html><meta charset="utf-8">${css}<style>body{font-family:'Segoe UI',system-ui,sans-serif}</style>${imports}<div id="${mode === 'mobile' ? 'm-sim-btn-row' : 'main-screen'}">${mode === 'desktop' ? '<div id="play-btn-row">'+controls+'</div>' : controls}</div><div id="inv-overlay"></div><script type="module">${script}</script>`);
    const result = await browser({file, root, profile:path.join(scratch, mode), width, chromium:process.env.CHROMIUM, timeoutMs:120000, screenshotPath:process.env.BROWSER_SCREENSHOT,
      interact: async send => {
        const evaluate = async expression => {
          const r = await send('Runtime.evaluate', {expression, awaitPromise:true, returnByValue:true});
          if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
          return r.result.value;
        };
        for (let i=0; !await evaluate('Boolean(window.pointerReady)'); i++) { assert(i<200,'loader readiness'); await delay(25); }
        const click = async point => {
          assert(point && point.x >= 0 && point.x < width && point.y >= 0 && point.y < 900, 'click inside viewport');
          await send('Input.dispatchMouseEvent', {type:'mouseMoved', ...point});
          await send('Input.dispatchMouseEvent', {type:'mousePressed', button:'left', clickCount:1, ...point});
          await send('Input.dispatchMouseEvent', {type:'mouseReleased', button:'left', clickCount:1, ...point});
        };
        let tested = 0;
        for (const id of ids) {
          const count = await evaluate(`openProbe(${id})`);
          for (let index=0; index<count; index++) {
            const item = await evaluate(`(()=>{const s=probeOverlay.querySelector('select[data-probe="${index}"]'),b=s?.previousElementSibling?.querySelector('[role=combobox]');if(!b||b.disabled)return null;for(let d=b.closest('details');d;d=d.parentElement?.closest('details'))d.open=true;if(!b.getClientRects().length)return null;const target=[...s.options].findIndex((o,i)=>!o.disabled&&i!==s.selectedIndex);if(target<0)return null;window.probeSelect=s;window.probeButton=b;window.probeChanges=[];s.addEventListener('change',()=>probeChanges.push(s.value),true);b.scrollIntoView({block:'center',behavior:'instant'});const r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,target,value:s.options[target].value};})()`);
            if (!item) continue;
            const hit = await evaluate(`(()=>{const e=document.elementFromPoint(${item.x},${item.y});return {target:e?.outerHTML,expected:probeButton.outerHTML};})()`);
            if (!await evaluate(`probeButton.contains(document.elementFromPoint(${item.x},${item.y}))`)) {
              const shot = await send('Page.captureScreenshot',{format:'jpeg',quality:75});
              fs.writeFileSync(path.join(root,'simulator-pointer-obstructed.jpg'),Buffer.from(shot.data,'base64'));
              throw Error(`obstructed control ${mode} ${id}:${index}: `+JSON.stringify(hit));
            }
            await click({x:item.x,y:item.y});
            const point = await evaluate(`(()=>{const m=document.getElementById(probeButton.getAttribute('aria-controls')),r=m.querySelector('[data-index="${item.target}"]');if(m.hidden||!r)throw Error('menu did not open: ${mode} book ${id} select ${index} '+probeSelect.id);m.scrollTop=r.offsetTop;const b=r.getBoundingClientRect();return {x:b.x+b.width/2,y:b.y+b.height/2};})()`);
            await click(point);
            const selected = await evaluate('({events:probeChanges.slice(),value:probeSelect.value,menuClosed:probeButton.getAttribute("aria-expanded")==="false"})');
            assert.deepEqual(selected.events, [item.value], `${mode} ${id} dropdown ${index}: real mouse selection`);
            assert(selected.menuClosed, 'selection closes menu');
            if (id===8 && await evaluate('probeSelect.id==="s8-encounter"')) {
              assert.equal(selected.value,item.value,'Andalusia encounter stays selected');
              const opponents = await evaluate('probeOverlay.querySelectorAll(".bsim-opponent-row").length');
              assert.equal(opponents,seeds[8].find(row=>String(row.id)===item.value).stats.encounter.opponents.length);
              await evaluate('probeModule.render()');
              assert.equal(await evaluate('probeSelect.value'),item.value,'Andalusia render preserves selected encounter');
            }
            // Some valid choices prompt for confirmation or reject a purchase
            // when the fresh test character has no resources. Dismiss that
            // dialog before attempting the next control underneath it.
            await evaluate(`(()=>{const overlay=document.getElementById('confirm-overlay');if(!overlay?.classList.contains('active'))return;const cancel=document.getElementById('confirm-cancel');(cancel&&getComputedStyle(cancel).display!=='none'?cancel:document.getElementById('confirm-ok'))?.click();})()`);
            tested++;
          }
          await evaluate('finishProbe()');
        }
        await evaluate(`document.body.dataset.test=JSON.stringify({mode:${JSON.stringify(mode)},books:${JSON.stringify(ids)},pointerSelections:${tested},launcherFontsMatch:true,productionWrites:0})`);
      }});
    results.push(result); console.log(JSON.stringify(result));
  }
  fs.writeFileSync(path.join(root, process.env.SIMULATOR_RECEIPT || 'simulator-pointer-browser.json'), JSON.stringify(results,null,2)+'\n');
} finally { fs.rmSync(scratch,{recursive:true,force:true}); } })().catch(error=>{console.error(error);process.exitCode=1;});
