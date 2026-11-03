// Check browser-history defaults without changing login credentials or custom suggestions.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const checkBrowser = require('../battlesim/browser-harness.cjs');
const root = process.env.TMPDIR;
if (!root?.startsWith('/media/koldKat/MediaDrive/.tmp/')) throw Error('Use external scratch');
const repo = process.cwd(), scratch = fs.mkdtempSync(path.join(root, 'browser-autocomplete-'));
const fields = ['public/index.html', 'admin/index.html'].flatMap(file =>
  fs.readFileSync(file, 'utf8').match(/<input\b[^>]*>/g) || []).join('\n');
const encode = value => JSON.stringify(value).replaceAll('<', '\\u003c');
const html = `<!doctype html><meta charset="utf-8"><div id="fields"></div><div id="dynamic"></div>
<script>addEventListener('error',e=>document.body.dataset.failure=e.error?.stack||e.message);addEventListener('unhandledrejection',e=>document.body.dataset.failure=e.reason?.stack||String(e.reason));</script>
<script type="module">
const check=(value,label)=>{if(!value)throw Error(label);};
document.getElementById('fields').innerHTML=${encode(fields)};
const initial=[...document.querySelectorAll('input')].map(node=>({node,value:node.value,type:node.type,checked:node.checked,disabled:node.disabled}));
await import('file://${repo}/public/js/ui-helpers/browser-autocomplete.js');
let checked=0;
for(const {node,value,type,checked:wasChecked,disabled}of initial){
 check(node.value===value&&node.type===type&&node.checked===wasChecked&&node.disabled===disabled,'field state changed '+node.id);
 if(['login-username','login-password'].includes(node.id))continue;
 check(['off','new-password'].includes(node.getAttribute('autocomplete')),'saved history enabled '+node.id);checked++;
}
check(document.getElementById('login-username').autocomplete==='username','desktop username autofill');
check(document.getElementById('login-password').autocomplete==='current-password','desktop password autofill');
document.getElementById('dynamic').innerHTML='<form id="metadata-form"><input id="section-count" inputmode="numeric"><input id="page-count" type="number"><input id="reachable" autocomplete="on"><textarea id="notes" autocomplete="on"></textarea></form><form id="m-login-form"><input id="m-login-user" autocomplete="username"><input id="m-login-pass" type="password" autocomplete="current-password"></form>';
await new Promise(resolve=>setTimeout(resolve,0));
for(const id of ['metadata-form','section-count','page-count','reachable','notes'])check(document.getElementById(id).autocomplete==='off','dynamic history '+id);
check(document.getElementById('m-login-user').autocomplete==='username'&&document.getElementById('m-login-pass').autocomplete==='current-password','mobile login autofill');
const {createOpponentEditor}=await import('file://${repo}/public/js/battlesim/opponents.js');
const editor=createOpponentEditor({document,id:'history-test',t:key=>key,fields:[{key:'level',label:'Level',min:0,max:6}],presets:[{name:'Custom moon beast',level:2}]});
document.body.append(editor.element);
await new Promise(resolve=>setTimeout(resolve,0));
const name=editor.element.querySelector('[role="combobox"]');name.value='moon';name.focus();name.dispatchEvent(new Event('input',{bubbles:true}));
const option=editor.element.querySelector('[role="option"]');check(option&&option.textContent.includes('Custom moon beast'),'custom suggestions remain');
option.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true}));
check(name.value==='Custom moon beast'&&editor.snapshot()[0].level==='2','custom selection works');
check(name.autocomplete==='off','native suggestions stay off for custom widget');
document.body.dataset.test=JSON.stringify({staticFieldsChecked:checked,desktopAndMobileLoginAutofillPreserved:true,dynamicInputsAndTextareasOff:true,customSuggestionsAndSelectionPreserved:true,fieldValuesAndTypesUnchanged:true,productionWrites:0});
</script>`;
(async () => {
  try {
    const file = path.join(scratch, 'check.html'); fs.writeFileSync(file, html);
    const result = await checkBrowser({file, profile:path.join(scratch, 'profile'), root, width:1100,
      chromium:process.env.CHROMIUM, timeoutMs:30000});
    assert.ok(result.staticFieldsChecked > 100);
    for (const file of ['public/js/main.js', 'public/mobile/js/app.js', 'admin/js/boot.js']) {
      assert.ok(fs.readFileSync(file, 'utf8').includes('browser-autocomplete.js'), file);
    }
    fs.writeFileSync(path.join(root, 'browser-autocomplete-verification.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
  } finally { fs.rmSync(scratch, {recursive:true, force:true}); }
})().catch(error => {console.error(error);process.exitCode=1;});
