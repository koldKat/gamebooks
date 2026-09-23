// Usage: node fixbook_v2.js <bookId> <pdfParasJsonPath>
const Database = require('better-sqlite3');
const fs = require('fs');
const db = new Database('database.sqlite');

const bookId = process.argv[2];
const pdfParasPath = process.argv[3];
const pdfParas = JSON.parse(fs.readFileSync(pdfParasPath, 'utf-8'));

function isSentenceEnd(s) {
  s = s.trimEnd();
  if (!s) return false;
  const last = s[s.length - 1];
  if ('.!?…'.includes(last)) return true;
  if ('"”“\'»)'.includes(last) && s.length > 1 && '.!?…'.includes(s[s.length - 2])) return true;
  return false;
}

function normalize(s) {
  return s.replace(/\s+/g, ' ').trim();
}

// Build a normalized-plain-text string from `inner` (html with tags, no outer <p>),
// while recording, for every char in the normalized plain string, the corresponding
// index in `inner` (the position right AFTER that char in the original string).
function buildNormMap(inner) {
  let norm = '';
  const map = []; // map[k] = index in `inner` right after norm[k]
  let i = 0;
  let lastWasSpace = true; // to collapse leading/consecutive whitespace like \s+ -> ' '
  while (i < inner.length) {
    if (inner[i] === '<') {
      const close = inner.indexOf('>', i);
      i = close === -1 ? inner.length : close + 1;
      continue;
    }
    const ch = inner[i];
    if (/\s/.test(ch)) {
      if (!lastWasSpace) {
        norm += ' ';
        map.push(i + 1);
        lastWasSpace = true;
      }
      i++;
      continue;
    }
    norm += ch;
    map.push(i + 1);
    lastWasSpace = false;
    i++;
  }
  return { norm, map };
}

const rows = db.prepare('SELECT section_id, html FROM book_sections WHERE book_id = ?').all(bookId);
const results = { fixed: [], rejectedMidSentence: [], skippedNoPdf: [], errors: [] };
const upd = db.prepare('UPDATE book_sections SET html=? WHERE book_id=? AND section_id=?');

for (const row of rows) {
  const id = row.section_id;
  const pdfP = pdfParas[id];
  if (!pdfP || pdfP.length <= 1) { results.skippedNoPdf.push(id); continue; }

  const html = row.html;
  let inner = html.replace(/<\/p><p>/g, ' ').replace(/^<p>/, '').replace(/<\/p>$/, '');
  const { norm, map } = buildNormMap(inner);

  let cutPoints = []; // positions in `inner` (original string) where we cut
  let searchStart = 0;
  let anyRejected = false;
  let failed = false;

  for (let i = 0; i < pdfP.length - 1; i++) {
    const anchor35 = normalize(pdfP[i]).slice(-35);
    const anchor18 = normalize(pdfP[i]).slice(-18);
    let idx = norm.indexOf(anchor35, searchStart);
    let anchorLen = anchor35.length;
    if (idx === -1) {
      idx = norm.indexOf(anchor18, searchStart);
      anchorLen = anchor18.length;
    }
    if (idx === -1) { failed = true; break; }
    const endOfAnchorNormIdx = idx + anchorLen; // position right after anchor in norm
    const beforeText = norm.slice(0, endOfAnchorNormIdx);
    searchStart = endOfAnchorNormIdx;
    if (!isSentenceEnd(beforeText)) { anyRejected = true; continue; }
    const innerPos = map[Math.min(endOfAnchorNormIdx - 1, map.length - 1)];
    cutPoints.push(innerPos);
  }

  if (failed) { results.errors.push({ id, reason: 'anchor-not-found' }); continue; }

  cutPoints = [...new Set(cutPoints)].sort((a, b) => a - b);
  if (cutPoints.length === 0) {
    if (anyRejected) results.rejectedMidSentence.push(id);
    else results.skippedNoPdf.push(id); // shouldn't happen since pdfP.length > 1, but safe
    continue;
  }

  const allPoints = [0, ...cutPoints, inner.length];
  const parts = [];
  for (let i = 0; i < allPoints.length - 1; i++) {
    const part = inner.slice(allPoints[i], allPoints[i + 1]).trim();
    if (part) parts.push(part);
  }
  if (parts.length <= 1) { results.rejectedMidSentence.push(id); continue; }

  const newHtml = parts.map(p => `<p>${p}</p>`).join('');
  upd.run(newHtml, bookId, id);
  results.fixed.push({ id, newParas: parts.length });
}

console.log('FIXED:', results.fixed.length);
console.log('REJECTED (mid-sentence only, genuine single-flow):', results.rejectedMidSentence.length);
console.log('SKIPPED (PDF shows <=1 para):', results.skippedNoPdf.length);
console.log('ERRORS:', results.errors.length, JSON.stringify(results.errors));
fs.writeFileSync('/tmp/fixresults_v2_' + bookId + '.json', JSON.stringify(results, null, 1));
