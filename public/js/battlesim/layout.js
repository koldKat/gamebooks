// Keep controls in the scrollable play column; the other column is for reports.
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
}

export function simulatorOverlay(document, id) {
  return document.getElementById(id === 829 ? 'bsim-overlay' : id === 8 ? 's8-overlay' : `sim${id}-overlay`);
}
