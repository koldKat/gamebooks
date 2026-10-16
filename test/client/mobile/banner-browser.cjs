const fs = require('node:fs');
const path = require('node:path');
const checkBrowser = require('../battlesim/browser-harness.cjs');

const root = process.env.TMPDIR;
if (!root?.startsWith('/media/koldKat/MediaDrive/.tmp/')) throw Error('Use MediaDrive scratch');
const repo = process.cwd();
const source = fs.readFileSync('public/index.html', 'utf8');
const start = source.indexOf('<div id="app-banner">');
const end = source.indexOf('<div id="books-tip-bar"', start);
if (start < 0 || end < 0) throw Error('Banner markup not found');
const markup = source.slice(start, end);
const inboxMarkup = source.slice(source.indexOf('<div id="inbox-modal-overlay"'), source.indexOf('<div id="confirm-overlay"'));
const scratch = fs.mkdtempSync(path.join(root, 'mobile-banner-'));

(async () => {
  try {
    const css = ['style', 'landing', 'feedback', 'mobile'].map(name =>
      `<link rel="stylesheet" href="file://${repo}/public/css/${name}.css">`).join('');
    const script = `
      const check=(ok,label)=>{if(!ok)throw Error(label);};
      document.getElementById('app-version').textContent='v. 1.0.13.0';
      for(const node of document.querySelectorAll('#app-banner-btns [style]'))node.style.display='';
      document.fonts.ready.then(async()=>{
        const banner=document.getElementById('app-banner');
        const title=document.getElementById('app-banner-title');
        const brand=document.getElementById('app-banner-brand');
        const buttons=document.getElementById('app-banner-btns');
        const t=title.getBoundingClientRect(),b=brand.getBoundingClientRect();
        const mobile=innerWidth<=768;
        check(title.scrollWidth<=title.clientWidth+1,'title overflow');
        check(banner.scrollWidth<=banner.clientWidth+1,'banner overflow');
        if(mobile){
          check(Math.abs((t.top+t.bottom)/2-(b.top+b.bottom)/2)<2,'brand and title must share row');
          check(t.right<=b.left+1,'brand overlaps title');
          check(buttons.getBoundingClientRect().top>=Math.max(t.bottom,b.bottom),'buttons below heading');
          const tools=[...document.querySelectorAll('#app-banner-tools button,#app-banner-tools a')];
          const dock=document.getElementById('app-banner-community');
          const dockBounds=dock.getBoundingClientRect();
          check(getComputedStyle(dock).position==='fixed'&&Math.abs(dockBounds.right-(innerWidth-10))<1&&Math.abs(dockBounds.bottom-(innerHeight-10))<1,'bottom-right mobile dock');
          check(getComputedStyle(buttons).justifyContent==='flex-start','top buttons left-aligned');
          const first=tools[0].getBoundingClientRect();
          for(const tool of tools){
            const bounds=tool.getBoundingClientRect();
            const docked=dock.contains(tool);
            check(bounds.height===(docked?36:30)&&bounds.width>=30,'consistent utility target');
            if(docked){
              check(Math.abs(bounds.top-first.top)<1,'single dock row');
              check(bounds.left>=dockBounds.left&&bounds.right<=dockBounds.right,'dock encloses every button');
            }
            check(tool.textContent.trim()||tool.getAttribute('aria-label'),'accessible utility name');
            if(tool.id!=='notif-btn'&&tool.id!=='display-settings-btn'){
              const icon=getComputedStyle(tool,'::before');
              check(icon.width==='18px'&&icon.maskImage.includes('svg'),'SVG utility icon');
            }
          }
          for(const id of ['mobile-books-btn','mobile-addbook-btn']){
            const style=getComputedStyle(document.getElementById(id));
            check(Math.abs(parseFloat(style.height)-27.2)<.1&&parseFloat(style.fontSize)>13,'primary button styling retained');
            check(style.animationName!=='none','primary navigation pulse retained');
          }
          const topIds=['mobile-addbook-btn','mobile-books-btn','bonus-gc-btn','notif-btn','display-settings-btn'];
          const centers=topIds.map(id=>{const r=document.getElementById(id).getBoundingClientRect();return (r.top+r.bottom)/2;});
          check(Math.max(...centers)-Math.min(...centers)<1,'single top button row');
        }else check(getComputedStyle(banner).display==='flex','desktop layout unchanged');
        const state=await import('file://${repo}/public/js/core/state.js');
        const notif=await import('file://${repo}/public/js/community/notif.js');
        const inboxModule=await import('file://${repo}/public/js/community/inbox.js');
        inboxModule.initInbox(()=>null);
        state.setToken('isolated-banner-test');
        let unread=12;
        window.fetch=async()=>new Response(JSON.stringify([{user_unread:unread}]),{headers:{'Content-Type':'application/json'}});
        await notif.refreshInboxBadge();
        const inbox=document.getElementById('inbox-btn');
        check(inbox.dataset.unread==='12'&&inbox.textContent.includes('(12)'),'live unread count retained');
        if(mobile)check(getComputedStyle(inbox,'::after').content==='"12"','visible mobile unread badge');
        const bounds=inbox.getBoundingClientRect();
        check(document.elementFromPoint(bounds.x+bounds.width/2,bounds.y+bounds.height/2)?.closest('#inbox-btn')===inbox,'inbox tap target unobstructed');
        const normalFetch=window.fetch;
        let finishLoad;
        window.fetch=()=>new Promise(resolve=>{finishLoad=resolve;});
        inbox.click();
        const overlay=document.getElementById('inbox-modal-overlay');
        check(overlay.classList.contains('active')&&document.querySelector('#inbox-list [role="status"]'),'inbox opens immediately while loading');
        finishLoad(new Response('[]',{headers:{'Content-Type':'application/json'}}));
        await new Promise(resolve=>setTimeout(resolve,30));
        check(overlay.classList.contains('active')&&getComputedStyle(overlay).display==='flex','inbox opens from navigation');
        document.getElementById('inbox-close-btn').click();
        check(!overlay.classList.contains('active'),'inbox closes');
        window.fetch=async()=>{throw Error('Offline test');};
        inbox.click();await new Promise(resolve=>setTimeout(resolve,30));
        check(document.querySelector('#inbox-list [role="alert"]')&&document.querySelector('.inbox-retry-btn'),'failed inbox has visible retry');
        window.fetch=normalFetch;
        document.querySelector('.inbox-retry-btn').click();await new Promise(resolve=>setTimeout(resolve,30));
        check(!document.querySelector('.inbox-retry-btn')&&document.querySelector('.inbox-item'),'inbox retry recovers');
        document.getElementById('inbox-close-btn').click();
        window.fetch=()=>new Promise(resolve=>{finishLoad=resolve;});
        inbox.click();document.getElementById('inbox-close-btn').click();
        finishLoad(new Response('[]',{headers:{'Content-Type':'application/json'}}));
        await new Promise(resolve=>setTimeout(resolve,30));
        check(!overlay.classList.contains('active'),'late inbox response cannot reopen closed dialog');
        window.fetch=normalFetch;
        unread=0;await notif.refreshInboxBadge();
        check(inbox.dataset.unread===''&&!inbox.classList.contains('inbox-btn--active'),'read count clears');
        unread=2;await notif.refreshInboxBadge();
        notif.resetNotifBadgesForLogout();state.clearToken();
        check(!inbox.hasAttribute('data-unread'),'logout clears mobile badge');
        document.body.dataset.test=JSON.stringify({width:innerWidth,mobile,sameRow:Math.abs(t.top-b.top)<10});
      }).catch(error=>{document.body.dataset.failure=error.message;});`;
    const file = path.join(scratch, 'banner.html');
    fs.writeFileSync(file, `<!doctype html><meta charset="utf-8">${css}<body style="padding:0 12px"><script>addEventListener('error',e=>document.body.dataset.failure=e.message)</script>${markup}${inboxMarkup}<script>${script}</script>`);
    for (const width of [320, 360, 390, 768, 1100]) {
      console.log(JSON.stringify(await checkBrowser({ file, root, width,
        profile: path.join(scratch, 'profile-' + width), chromium: process.env.CHROMIUM })));
    }
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
