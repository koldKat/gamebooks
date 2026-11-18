'use strict';

// Keep importer-created prose and read-only reference copies outside gamebook totals.
const supplementalSection = /^(?:(?:intro(?:duction)?|prolog(?:ue)?|epilog(?:ue)?|opening)(?:[-_].+)?|sleep|bonanza|original-maps|k-map|reference-[1-9]\d*)$/i;
const isSupplementalSection = id => supplementalSection.test(String(id));
// An ending marker can be recorded as a hint before its section is explored.
const isMappedGraphNode = node => !!node && (!node.discovered
  || (node.choices || []).some(choice => Number(choice) !== 0 && Number(choice) !== -1)
  || (node.portals || []).length > 0);

// Completing an ending proves it was read, even in older saves retaining a hint flag.
function restoreCompletedEndingMappings(state) {
  for (const run of state.playthroughs || []) {
    if (!run.completed || !['success', 'death'].includes(run.result)) continue;
    const node = state.graph?.[run.path?.at(-1)];
    const ending = run.result === 'success' ? 0 : -1;
    if (node?.discovered && node.choices?.some(choice => Number(choice) === ending)) {
      delete node.discovered;
    }
  }
}
const names = ['intro', 'introduction', 'prolog', 'prologue', 'epilog', 'epilogue', 'opening'];
const supplementalSectionSql = (column, bookColumn) => '(' + names.map(name =>
  `(lower(${column})='${name}' OR lower(${column}) GLOB '${name}[-_]*')`).concat(
    `lower(${column}) IN ('sleep','bonanza','original-maps','k-map')`,
    `(lower(${column}) GLOB 'reference-[1-9]*' AND substr(${column},11) NOT GLOB '*[^0-9]*')`
  ).concat(bookColumn ? [`EXISTS (SELECT 1 FROM book_reading_supplements reading_supplement
    WHERE reading_supplement.book_id=${bookColumn} AND reading_supplement.section_id=${column})`] : []).join(' OR ') + ')';

// Printed page IDs can span several introductory pages; keep their saved IDs intact.
function initializeReadingSupplements(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS book_reading_supplements (
    book_id INTEGER NOT NULL,
    section_id TEXT NOT NULL,
    PRIMARY KEY (book_id, section_id),
    FOREIGN KEY (book_id, section_id) REFERENCES book_sections(book_id, section_id) ON DELETE CASCADE
  )`);
}

function uncountedReadingSections(db, bookId, entry) {
  const ids = db.prepare(`SELECT section_id FROM book_sections WHERE book_id=? AND ${supplementalSectionSql('book_sections.section_id', 'book_sections.book_id')}`)
    .all(bookId).map(row => row.section_id);
  if (entry != null && !ids.includes(entry)) ids.push(entry);
  return ids;
}

module.exports = { isSupplementalSection, supplementalSectionSql, uncountedReadingSections, isMappedGraphNode, restoreCompletedEndingMappings, initializeReadingSupplements };
