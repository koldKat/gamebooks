// Mobile browser Back dismisses the top dialog before reaching screen navigation.
import { getTopDialog, dismissDialog } from './dialog-escape.js';

const installed = new WeakSet();
const candidates = 'dialog,[id$="-overlay"],[id$="-dialog"],.modal-overlay,.inv-overlay,.pub-overlay,.img-lightbox,.inv-ctx-menu,#video-modal';

export function installDialogHistory(win = window) {
  if (installed.has(win)) return;
  installed.add(win);
  const doc = win.document, history = win.history;
  const mobile = () => win.matchMedia('(max-width: 768px), (pointer: coarse)').matches;
  const stack = [];
  let sequence = 0, pendingClose = null, restoring = !!history.state?.dialogOpen;
  const active = element => element.isConnected && element.matches('dialog[open],.active,.inv-ctx-menu,#video-modal')
    && element.getClientRects().length > 0 && win.getComputedStyle(element).visibility !== 'hidden';
  const push = entry => history.pushState({ ...history.state, dialogOpen: true, dialogLayer: entry.id }, '');
  const sync = () => {
    if (pendingClose || restoring) return;
    const last = stack.at(-1);
    if (last && !active(last.element)) {
      if (history.state?.dialogLayer === last.id) {
        pendingClose = { url: win.location.href };
        history.back();
        return;
      }
      stack.pop();
    }
    if (!mobile() && !stack.length) return;
    const element = getTopDialog(win);
    if (!element || stack.some(entry => entry.element === element)) return;
    const entry = { element, id: `${Date.now()}:${++sequence}` };
    stack.push(entry); push(entry);
  };
  win.addEventListener('popstate', event => {
    const unknownLayer = event.state?.dialogOpen && (!event.state.dialogLayer || !stack.some(entry => entry.id === event.state.dialogLayer));
    if (restoring || unknownLayer) {
      event.stopImmediatePropagation();
      if (unknownLayer) { restoring = true; history.back(); }
      else { restoring = false; sync(); }
      return;
    }
    const last = stack.at(-1);
    if (last && event.state?.dialogLayer !== last.id) {
      // Capture prevents every legacy router/panel listener from navigating underneath.
      event.stopImmediatePropagation();
      const explicit = pendingClose;
      pendingClose = null;
      if (active(last.element)) dismissDialog(last.element, win);
      if (active(last.element)) push(last); // A busy/cancel handler kept the dialog open.
      else {
        stack.pop();
        if (explicit && win.location.href !== explicit.url) history.replaceState(history.state, '', explicit.url);
      }
      sync();
    }
  }, true);
  const affectsDialog = node => node.nodeType === 1
    && (node.matches(candidates) || node.querySelector(candidates));
  new win.MutationObserver(records => {
    if (records.some(record => record.type === 'attributes' ? record.target.matches(candidates)
      : [...record.addedNodes, ...record.removedNodes].some(affectsDialog))) sync();
  }).observe(doc.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'open', 'style'] });
  win.addEventListener('resize', sync);
  // Reload/Forward cannot reopen dismissed overlays or leave extra exit-blocking entries.
  if (restoring) history.back();
  sync();
}

if (typeof window !== 'undefined') {
  if (document.body) installDialogHistory();
  else document.addEventListener('DOMContentLoaded', () => installDialogHistory(), { once: true });
}
