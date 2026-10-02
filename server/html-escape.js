'use strict';

// Escape single quotes for callers embedding values in onclick string literals.
function escapeHtml(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// Escape values inside double-quoted JSON string literals.
function escapeJsonString(s) {
  return String(s ?? '').replace(/\\/g,'\\\\').replace(/"/g,'\\"').replace(/\n/g,'\\n').replace(/\r/g,'');
}

module.exports = { escapeHtml, escapeJsonString };
