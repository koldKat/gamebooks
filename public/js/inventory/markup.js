// markup.js - Internal inventory module; use ../inventory.js externally.

import { escapeHtml } from '../util.js';

export function _invLineHtml(item, displayName, note, qty, badgeText = null, kind = null) {
  const noteHtml = note?.trim() ? ` <span class="inv-line-note">${escapeHtml(note.trim())}</span>` : '';
  const qtyHtml  = (qty > 1)   ? ` <span class="inv-line-qty">×${qty}</span>`                      : '';
  const badgeHtml = badgeText ? ` <span class="inv-line-slot">${escapeHtml(badgeText)}</span>` : '';
  const cls = kind ? `inv-line inv-line--${kind}` : 'inv-line';
  // Badge always last (rightmost, since the whole line is right-aligned) -
  // name/qty/note stay together on the left so the badge reads as a
  // consistent right-hand column across every line, not shifted around by
  // whether a note happens to be present.
  return `<span class="${cls}"><span class="inv-line-icon">${item.svg_data}</span><span class="inv-line-name">${escapeHtml(displayName)}</span>${qtyHtml}${noteHtml}${badgeHtml}</span>`;
}
