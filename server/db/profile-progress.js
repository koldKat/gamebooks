'use strict';

// Summarize exploration and victories from each book's already-loaded chart and runs.
const { isSupplementalSection, isMappedGraphNode } = require('./reading-section-counts');
const { completionTarget, hasFullBookCoverage } = require('./book-section-coverage');

function addBookProgress(totals, state, entry, book = {}, sectionIds = () => []) {
  const discovered = new Set(), visited = new Set();
  const valid = id => id != null && String(id).trim() !== ''
    && !['0', '-1', String(entry)].includes(String(id)) && !isSupplementalSection(id);
  const add = (set, id) => { if (valid(id)) set.add(String(id)); };
  for (const [id, node] of Object.entries(state?.graph || {})) {
    if (!node || typeof node !== 'object') continue;
    add(discovered, id);
    if (isMappedGraphNode(node)) add(visited, id);
    for (const choice of Array.isArray(node.choices) ? node.choices : []) add(discovered, choice);
  }
  const runs = [
    ...(Array.isArray(state?.playthroughs) ? state.playthroughs : []),
    ...(Array.isArray(state?.preSeriesRuns) ? state.preSeriesRuns : []),
  ];
  for (const run of runs) for (const id of Array.isArray(run?.path) ? run.path : []) {
    add(visited, id);
    add(discovered, id);
  }
  for (const id of visited) discovered.add(id);
  totals.sectionsDiscovered += discovered.size;
  totals.sectionsVisited += visited.size;
  totals.booksWon += runs.some(run => run?.result === 'success') ? 1 : 0;
  const target = completionTarget(book);
  if (book.is_container || !(target > 0) || discovered.size < target) return;
  const canonical = sectionIds(book.id).map(String).filter(valid);
  if (hasFullBookCoverage(book, discovered, canonical)) totals.booksFullyDiscovered++;
  if (hasFullBookCoverage(book, visited, canonical)) totals.booksFullyMapped++;
}

function collectedCount(db, userId) {
  return db.prepare('SELECT COUNT(*) AS n FROM user_collectibles WHERE user_id=?').get(userId)?.n ?? 0;
}

module.exports = { addBookProgress, collectedCount };
