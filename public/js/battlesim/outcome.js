// Add the shared victory/loss icon and semantic color to simulator outcomes.
const paths = {
  win: 'M6 2h12v7a6 6 0 0 1-5 5.92V18h3v2H8v-2h3v-3.08A6 6 0 0 1 6 9V2ZM4 3H2v4a4 4 0 0 0 4 4V9a2 2 0 0 1-2-2V3Zm16 0h2v4a4 4 0 0 1-4 4V9a2 2 0 0 0 2-2V3Z',
  loss: 'M12 3a8 8 0 0 0-8 8c0 2.8 1.4 5.3 3.6 6.8V20a1 1 0 0 0 1 1h6.8a1 1 0 0 0 1-1v-2.2A8 8 0 0 0 12 3Zm-3 7a2 2 0 1 1 0 4 2 2 0 0 1 0-4Zm6 0a2 2 0 1 1 0 4 2 2 0 0 1 0-4Zm-3 4 2 3h-4l2-3Z',
};

export function decorateOutcome(node, outcome) {
  node.classList.remove('bsim-log-success', 'bsim-log-danger');
  node.querySelector('[data-bsim-outcome-icon]')?.remove();
  if (!paths[outcome]) return node;
  const doc = node.ownerDocument;
  const icon = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
  icon.setAttribute('viewBox', '0 0 24 24');
  icon.setAttribute('aria-hidden', 'true');
  icon.setAttribute('data-bsim-outcome-icon', '');
  icon.setAttribute('class', 'sim-icon ' + (outcome === 'win' ? 'sim-icon-win' : 'sim-icon-dead'));
  const path = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', paths[outcome]); icon.append(path);
  node.prepend(icon);
  node.classList.add(outcome === 'win' ? 'bsim-log-success' : 'bsim-log-danger');
  return node;
}

export function decorateHistory(holder, entries) {
  for (const [index, entry] of entries.entries()) {
    if (holder.children[index]) decorateOutcome(holder.children[index], entry.outcome);
  }
}

// Plain-text histories use the same row layout without interpreting translated text as HTML.
export function renderHistory(holder, entries, label) {
  holder.replaceChildren(...entries.map(entry => {
    const row = holder.ownerDocument.createElement('div');
    row.textContent = label(entry);
    return decorateOutcome(row, entry.outcome);
  }));
}
