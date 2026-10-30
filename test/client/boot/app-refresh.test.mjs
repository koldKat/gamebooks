import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const runtime = readFileSync(new URL('../../../public/js/boot/app-refresh.js', import.meta.url), 'utf8');
const safety = readFileSync(new URL('../../../public/js/boot/refresh-safety.js', import.meta.url), 'utf8');
const settle = () => new Promise(resolve => setImmediate(resolve));

function setup(initial = { version: '1.3.1.0' }) {
  const win = new EventTarget(), doc = new EventTarget();
  let now = 0, reloads = 0, requests = 0, unsaved = false, fields = [], dialogs = [];
  let latest = { version: '1.3.1.0' }, pending = null;
  const visible = { getClientRects: () => [1] }, hidden = { getClientRects: () => [] };
  const nodes = { 'landing-wrapper': visible, 'main-screen': hidden };
  doc.visibilityState = 'visible';
  doc.getElementById = id => nodes[id];
  doc.querySelectorAll = selector => selector.startsWith('input') ? fields : dialogs;
  const location = { pathname: '/', hash: '', reload: () => reloads++ };
  const history = { state: { view: 'books' } };
  const timeouts = new Map();
  const context = vm.createContext({ window: win, document: doc, location, history,
    currentBookId: null, hasUnsavedStateSaves: () => unsaved,
    Date: { now: () => now }, AbortController,
    setTimeout: fn => { const id = Symbol(); timeouts.set(id, fn); return id; },
    clearTimeout: id => timeouts.delete(id),
    fetch: async (url, options) => {
      requests++;
      assert.equal(url, '/api/config');
      assert.equal(options.cache, 'no-store');
      if (pending) return pending.promise;
      if (latest instanceof Error) throw latest;
      return { ok: latest !== null, json: async () => latest };
    },
  });
  for (const source of [safety, runtime]) vm.runInContext(source.replace(/^import .*;\n/gm, '').replace(/\bexport /g, ''), context);
  context.initAppRefresh(initial);
  function emit(target, type) { target.dispatchEvent(new Event(type)); }
  return {
    context, nodes, location, history, visible, hidden,
    get reloads() { return reloads; }, get requests() { return requests; },
    set latest(value) { latest = value; }, set unsaved(value) { unsaved = value; },
    set fields(value) { fields = value; }, set dialogs(value) { dialogs = value; },
    advance(ms) { now += ms; },
    hide() { doc.visibilityState = 'hidden'; emit(doc, 'visibilitychange'); },
    show() { doc.visibilityState = 'visible'; emit(doc, 'visibilitychange'); },
    emitDocument(type) { emit(doc, type); }, emitWindow(type) { emit(win, type); },
    timeout() { for (const fn of timeouts.values()) fn(); },
    play() { context.currentBookId = 1470; location.hash = '#book/1470'; history.state = { view: 'book' }; nodes['main-screen'] = visible; nodes['landing-wrapper'] = hidden; },
    home() { context.currentBookId = null; location.hash = '#books'; history.state = { view: 'books' }; nodes['main-screen'] = hidden; nodes['landing-wrapper'] = visible; },
    defer() { pending = {}; pending.promise = new Promise(resolve => { pending.resolve = resolve; }); return data => { pending.resolve({ ok: true, json: async () => data }); pending = null; }; },
  };
}
async function returnAfter(s, ms = 300000) { s.hide(); s.advance(ms); s.show(); await settle(); }

test('visible idle time and live version announcements never refresh an active page', async () => {
  const s = setup(); s.latest = { version: '1.3.2.0' };
  s.advance(24 * 60 * 60 * 1000);
  s.emitWindow('focus'); s.emitWindow('pageshow');
  await settle();
  assert.equal(s.requests, 0); assert.equal(s.reloads, 0);
});
test('short tab switches and window blur do not refresh or check versions', async () => {
  const s = setup(); s.latest = { version: '1.3.2.0' };
  await returnAfter(s, 299999);
  s.emitWindow('blur'); s.advance(600000); s.emitWindow('focus');
  await settle(); assert.equal(s.requests, 0); assert.equal(s.reloads, 0);
});
test('unchanged versions never refresh, even across repeated long absences or server restarts', async () => {
  const s = setup({ version: '1.3.1.0', serverInstanceId: 'old' });
  s.latest = { version: '1.3.1.0', serverInstanceId: 'restarted' };
  for (let i = 0; i < 3; i++) await returnAfter(s);
  assert.equal(s.requests, 3); assert.equal(s.reloads, 0);
});
test('a changed version refreshes the returning main page once, preserving its URL', async () => {
  const s = setup(); s.location.hash = '#books'; s.latest = { version: '1.3.2.0' };
  await returnAfter(s); s.emitWindow('focus'); s.emitWindow('pageshow'); await returnAfter(s);
  assert.equal(s.requests, 1); assert.equal(s.reloads, 1); assert.equal(s.location.hash, '#books');
});
test('restored history snapshots check only after an actual long absence', async () => {
  const s = setup(); s.latest = { version: '1.3.2.0' };
  s.emitWindow('pageshow'); await settle(); assert.equal(s.requests, 0);
  s.emitWindow('pagehide'); s.advance(300000); s.emitWindow('pageshow'); await settle();
  assert.equal(s.requests, 1); assert.equal(s.reloads, 1);
});
test('play, loading book routes, public pages and mobile reader never check or refresh', async () => {
  for (const block of [s => s.play(), s => { s.context.currentBookId = 1; }, s => { s.location.hash = '#book/1'; },
    s => { s.history.state = {view:'book'}; }, s => { s.nodes['main-screen'] = s.visible; },
    s => { s.nodes['landing-wrapper'] = s.hidden; }, s => { s.location.pathname = '/mobile/'; }, s => { s.location.pathname = '/book/1'; }]) {
    const s = setup(); s.latest = {version:'1.3.2.0'}; block(s); await returnAfter(s);
    assert.equal(s.requests, 0); assert.equal(s.reloads, 0);
  }
});
test('entering play while a version request is pending cancels the update', async () => {
  const s = setup(), finish = s.defer();
  s.hide(); s.advance(300000); s.show(); s.play();
  finish({version:'1.3.2.0'}); await settle(); assert.equal(s.reloads, 0);
});
test('any interaction, route change or new departure cancels an in-flight update', async () => {
  for (const event of ['pointerdown','pointermove','keydown','input','change','wheel','touchstart','scroll','popstate','hashchange','departure']) {
    const s = setup(), finish = s.defer();
    s.hide(); s.advance(300000); s.show();
    if (['popstate','hashchange'].includes(event)) s.emitWindow(event);
    else if (event === 'departure') s.hide(); else s.emitDocument(event);
    finish({version:'1.3.2.0'}); await settle(); assert.equal(s.reloads, 0, event);
  }
});
test('failed and in-flight saves block refresh before and after the request', async () => {
  const s = setup(); s.latest = {version:'1.3.2.0'}; s.unsaved = true;
  await returnAfter(s); assert.equal(s.requests, 0);
  s.unsaved = false; const finish = s.defer(); s.hide(); s.advance(300000); s.show(); s.unsaved = true;
  finish({version:'1.3.2.0'}); await settle(); assert.equal(s.reloads, 0);
});
test('visible dialogs and edited fields protect drafts; hidden and unchanged fields do not block', async () => {
  const cases = [
    {tagName:'INPUT',type:'text',value:'Draft',defaultValue:''},
    {tagName:'TEXTAREA',value:'Draft note',defaultValue:''},
    {tagName:'INPUT',type:'checkbox',checked:true,defaultChecked:false},
    {tagName:'INPUT',type:'file',files:[{}]},
    {tagName:'SELECT',options:[{defaultSelected:true},{}],selectedIndex:1},
    {isContentEditable:true},
  ];
  for (const field of cases) {
    const s = setup(); s.latest = {version:'1.3.2.0'}; s.fields = [{...s.visible,...field}];
    await returnAfter(s); assert.equal(s.requests, 0); assert.equal(s.reloads, 0);
  }
  const s = setup(); s.latest = {version:'1.3.2.0'}; s.dialogs = [s.visible];
  await returnAfter(s); assert.equal(s.requests, 0);
  s.dialogs = [s.hidden]; s.fields = [{...s.hidden,value:'Draft',defaultValue:''},{...s.visible,type:'text',value:'Saved',defaultValue:'Saved'},
    {...s.visible,tagName:'SELECT',options:[{},{}],selectedIndex:0}];
  await returnAfter(s); assert.equal(s.reloads, 1);
});
test('offline, maintenance, malformed and missing version responses leave the page intact', async () => {
  for (const data of [Error('offline'),null,{}, {version:''},{version:2}]) {
    const s = setup(); s.latest = data; await returnAfter(s); assert.equal(s.reloads, 0);
  }
  const s = setup({}); s.latest = {version:'1.3.2.0'}; await returnAfter(s); assert.equal(s.reloads, 0);
});
