'use strict';

// Keep importer-created introductory and closing prose outside section totals.
const supplementalSection = /^(?:intro(?:duction)?|prolog(?:ue)?|epilog(?:ue)?|opening)(?:[-_].+)?$/i;
const isSupplementalSection = id => supplementalSection.test(String(id));
// An ending marker can be recorded as a hint before its section is explored.
const isMappedGraphNode = node => !!node && (!node.discovered
  || (node.choices || []).some(choice => Number(choice) !== 0 && Number(choice) !== -1)
  || (node.portals || []).length > 0);
const names = ['intro', 'introduction', 'prolog', 'prologue', 'epilog', 'epilogue', 'opening'];
const supplementalSectionSql = column => '(' + names.map(name =>
  `(lower(${column})='${name}' OR lower(${column}) GLOB '${name}[-_]*')`).join(' OR ') + ')';

function uncountedReadingSections(db, bookId, entry) {
  const ids = db.prepare(`SELECT section_id FROM book_sections WHERE book_id=? AND ${supplementalSectionSql('section_id')}`)
    .all(bookId).map(row => row.section_id);
  if (entry != null && !ids.includes(entry)) ids.push(entry);
  return ids;
}

module.exports = { isSupplementalSection, supplementalSectionSql, uncountedReadingSections, isMappedGraphNode };
