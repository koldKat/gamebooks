// Check shared dialog headers against the actual desktop and mobile stylesheets.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const browser = require('../battlesim/browser-harness.cjs');
const root = process.env.TMPDIR;
assert.ok(root && fs.statSync(root).isDirectory(), 'Set TMPDIR to the designated scratch folder');
const base = 'file://' + process.cwd() + '/public';
const desktop = fs.readFileSync('public/index.html', 'utf8');
const mobile = fs.readFileSync('public/mobile/index.html', 'utf8');
const body = desktop.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)[1].replace(/<script\b[\s\S]*?<\/script>/gi, '');
const extra = `<dialog id="collectibles-dialog"><header><h2>Companions</h2><button data-dialog-close>×</button></header><div class="collectibles-body"></div></dialog>
<dialog id="companion-shop-dialog"><header><h2>Companions Shop</h2><button data-dialog-close>✕</button></header></dialog>
<dialog id="changelog-dialog"><header class="modal-title-row"><h2 class="modal-title">Changelog</h2><button class="modal-close-btn">✕</button></header></dialog>
<dialog class="reading-unlock-dialog"><h2>Unlock Book</h2></dialog>
<div class="inv-modal"><div class="inv-modal-hdr"><span class="inv-modal-title">Inventory</span><button class="inv-close-btn">✕</button></div></div>
<div class="cs-modal"><div class="cs-modal-hdr"><span>Character Sheet</span><button id="cs-modal-close">✕</button></div></div>
<div class="m-notebook-hdr"><span>Notebook</span><button>✕</button></div>
<div id="ft-dialog"><div class="ft-dialog-title">Fast Travel</div></div>`;
const script = `
const check=(value,label)=>{if(!value)throw Error(label)};
const titles=[...document.querySelectorAll('.modal-title,.shop-modal-title,.inv-modal-title,.ft-dialog-title,.cover-tooltip-settings-heading,#edit-modal-title,#portal-modal-title,#note-modal-title,#stats-modal-title,#notebook-modal-title,#pub-modal-title,#party-modal-title,#guide-modal-hdr>span,#forum-modal-hdr>span,#shortcuts-modal-hdr>span,.cs-modal-hdr>span:first-child,.m-notebook-hdr>span:first-child,#collectibles-dialog h2,#companion-shop-dialog h2,.reading-unlock-dialog>h2')];
check(titles.length>=25,'all header families represented');
for(const title of titles){
 const css=getComputedStyle(title),name=title.id||title.className||title.textContent;
 check(css.color==='rgb(209, 213, 219)',name+' color '+css.color);
 check(css.fontSize==='14.4px',name+' size '+css.fontSize);
 check(css.fontWeight==='700',name+' weight '+css.fontWeight);
 check(css.textTransform==='none',name+' casing');
 check(css.letterSpacing==='normal',name+' tracking');
}
const framed=[...document.querySelectorAll('.shop-modal-header,.inv-modal-hdr,.cs-modal-hdr,.pub-modal-hdr,.m-notebook-hdr,#stats-modal-header,#guide-modal-hdr,#forum-modal-hdr')];
for(const header of framed){const css=getComputedStyle(header);check(css.padding==='4px 10px','framed header padding '+header.className+': '+css.padding);}
for(const button of document.querySelectorAll('.modal-close-btn,.inv-close-btn,.pub-close-btn,.shop-close-btn,#stats-modal-close,#party-modal-close,#guide-modal-close,#forum-modal-close,#shortcuts-modal-close,#notebook-modal-close,#cs-modal-close,#collectibles-dialog [data-dialog-close],#companion-shop-dialog [data-dialog-close]')){
 const css=getComputedStyle(button);check(css.width==='22px'&&css.height==='22px','close control dimensions '+button.id);
}
const announcementHeader=getComputedStyle(document.querySelector('#changelog-dialog>header'));
check(announcementHeader.minHeight==='22px'&&announcementHeader.padding==='0px'&&announcementHeader.marginBottom==='8px'&&announcementHeader.justifyContent==='space-between','announcement header uses shared spacing and close alignment');
const samples=['#shop-modal .shop-modal-header','#stats-modal-header','.pub-modal-hdr','.inv-modal-hdr','.cs-modal-hdr','#collectibles-dialog>header','#companion-shop-dialog>header','#changelog-dialog>header','#feedback-modal .modal-title-row'];
const stage=document.createElement('main');stage.className='header-previews';
for(const selector of samples){const card=document.createElement('section');card.className='header-preview';const original=document.querySelector(selector),header=original.cloneNode(true);header.querySelector('#pub-modal-title')?.replaceChildren(document.createTextNode('Player Profile'));if(original.parentElement.matches('#collectibles-dialog,#companion-shop-dialog,#changelog-dialog')){const context=document.createElement('div');context.id=original.parentElement.id;context.style.cssText='width:auto;max-width:none;margin:0;border:0';context.append(header);card.append(context);}else card.append(header);stage.append(card);}
document.body.replaceChildren(stage);
document.body.dataset.test=JSON.stringify({titleCount:titles.length,headerFamilies:framed.length,sharedTypography:true,sharedPadding:true,sharedCloseControls:true,productionWrites:0});
`;
(async () => {
  const results = [];
  for (const [mode, shell, width] of [['desktop', desktop, 1200], ['mobile', mobile, 390]]) {
    const links = [...shell.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*>/gi)].map(match => match[0]).join('\n') + '<link rel="stylesheet" href="/css/components/changelog.css">';
    const file = path.join(root, 'dialog-headers-' + mode + '.html');
    const html = `<!doctype html><html><head>${links}<style>body{background:#111827;color:#d1d5db;font-family:'Segoe UI',sans-serif}.header-previews{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px;padding:16px}.header-preview{background:#19212c;border:1px solid #46505d;border-radius:8px;overflow:hidden}.header-preview>header,.header-preview>.modal-title-row{padding:4px 10px;min-height:30px}</style></head><body>${body}${extra}<script>${script}</script></body></html>`.replace(/(src|href)="\//g, '$1="' + base + '/');
    fs.writeFileSync(file, html);
    try {
      const result = await browser({ file, root, profile: path.join(root, 'dialog-headers-' + mode + '-browser'), width,
        chromium: process.env.CHROMIUM, screenshotPath: path.join(root, 'dialog-headers-' + mode + '.jpg') });
      results.push({ mode, ...result });
    } finally { fs.rmSync(file, { force: true }); }
  }
  fs.writeFileSync(path.join(root, 'dialog-headers-verification.json'), JSON.stringify(results, null, 2) + '\n');
  console.log(JSON.stringify(results));
})().catch(error => { console.error(error); process.exitCode = 1; });
