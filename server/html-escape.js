'use strict';

// Escapes single quotes too (not just the HTML-attribute-standard "&<>) since some
// call sites embed escaped values inside single-quoted onclick="..." JS strings.
function escapeHtml(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// Escapes a value for embedding inside a double-quoted JSON string literal
// that itself sits inside a larger hand-built JSON blob (e.g. JSON-LD <script> tags).
function escapeJsonString(s) {
  return String(s ?? '').replace(/\\/g,'\\\\').replace(/"/g,'\\"').replace(/\n/g,'\\n').replace(/\r/g,'');
}

module.exports = { escapeHtml, escapeJsonString };
