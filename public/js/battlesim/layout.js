// Keep controls in the scrollable play column; the other column is for reports.
import {createThemedSelect, normalSimulatorCase} from '../ui-helpers/themed-select.js';

const controlPanels = new WeakMap();
function prepareControls(overlay) {
  if (controlPanels.has(overlay)) { controlPanels.get(overlay)(); return; }
  const modal = overlay.querySelector('.bsim-modal'), view = overlay.ownerDocument.defaultView;
  if (!modal || !view.MutationObserver) return;
  const menus = new Map();
  let queued = false;
  function sync() {
    // Older saved logs and database notes retain their original stored text.
    for (const prose of modal.querySelectorAll('p, [id$="-note"], [id$="-hint"], .bsim-log, .ac-sub')) {
      const walker = overlay.ownerDocument.createTreeWalker(prose, view.NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        if (node.parentElement.closest('select, input, textarea, code')) continue;
        if (!prose.matches('.ac-sub') && node.parentElement.closest('[role="listbox"]')) continue;
        const text = normalSimulatorCase(node.data);
        if (node.data !== text) node.data = text;
      }
    }
    for (const [select, menu] of menus) {
      if (!modal.contains(select)) { menu.destroy(); menus.delete(select); }
    }
    for (const select of modal.querySelectorAll('select:not([multiple])')) {
      if (select.size > 1 || select.classList.contains('themed-select-native')) continue;
      menus.set(select, createThemedSelect(select));
    }
    for (const menu of menus.values()) menu.sync();
  }
  function schedule() {
    if (queued) return;
    queued = true;
    queueMicrotask(() => { queued = false; if (overlay.classList.contains('active')) sync(); });
  }
  // Observe changing combat controls only while this dialog is open.
  const content = new view.MutationObserver(schedule);
  function visibility() {
    content.disconnect();
    if (overlay.classList.contains('active')) {
      sync();
      content.observe(modal, {subtree:true, childList:true, attributes:true,
        attributeFilter:['disabled','hidden','style','selected','label','value']});
    } else for (const menu of menus.values()) menu.close();
  }
  new view.MutationObserver(visibility).observe(overlay, {attributes:true, attributeFilter:['class']});
  for (const event of ['click','input','change','keydown']) overlay.addEventListener(event, schedule, true);
  controlPanels.set(overlay, sync);
  sync(); visibility();
}

export function prepareBattleSimLayout(overlay) {
  const left = overlay?.querySelector('.bsim-col-left');
  const right = overlay?.querySelector('.bsim-col-right');
  if (!left || !right) return;
  for (const child of [...right.children]) {
    const report = child.matches('.bsim-log, .bsim-side-title, .bsim-report, [role="status"]')
      || /-(?:log|history|result|status|opponents)$/.test(child.id)
      || child.matches('p') && /-(?:totals|destination|actor)$/.test(child.id)
      || child.querySelector('.bsim-log, .bsim-history-list, [id$="-log"], [id$="-history"], [id$="-history-list"]');
    if (!report) left.appendChild(child);
  }
  prepareControls(overlay);
}

export function simulatorOverlay(document, id) {
  return document.getElementById(id === 829 ? 'bsim-overlay' : id === 8 ? 's8-overlay' : `sim${id}-overlay`);
}
