'use strict';

const bookEvents = new Set([
  'add_book', 'add_isbn', 'add_issn', 'add_asin', 'add_pages', 'add_authors',
  'add_description', 'make_book_public', 'upload_cover', 'add_book_to_series',
  'add_series_number', 'add_book_to_anthology', 'add_anthology_order', 'book_added_by_other',
]);
const seriesEvents = new Set([
  'create_series', 'add_series_description', 'make_series_public', 'series_open_world', 'series_added_by_other',
]);
const statements = new WeakMap();

function prepareSeasonalContributionEligibility(db) {
  if (statements.has(db)) return;
  if (db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='table' AND name IN ('books','series')").get().n !== 2) return;
  statements.set(db, {
    book: db.prepare('SELECT is_public,series_id,parent_book_id FROM books WHERE id=?'),
    series: db.prepare('SELECT is_public FROM series WHERE id=?'),
  });
}

function seasonalContributionEligible(db, event, ref) {
  if (!bookEvents.has(event) && !seriesEvents.has(event) && event !== 'favorite_cover') return true;
  let kind = seriesEvents.has(event) ? 'series' : 'book';
  let value = String(ref ?? '');
  if (event === 'favorite_cover') {
    const match = /^(book|series):([1-9]\d*)$/.exec(value);
    if (!match) return false;
    [, kind, value] = match;
  }
  const match = /^([1-9]\d*)(?::[1-9]\d*)?$/.exec(value);
  if (!match || !Number.isSafeInteger(Number(match[1]))) return false;
  let queries = statements.get(db);
  if (!queries) {
    prepareSeasonalContributionEligibility(db);
    queries = statements.get(db);
  }
  if (!queries) return false;
  const item = queries[kind].get(Number(match[1]));
  if (item?.is_public !== 1) return false;
  if (event === 'add_book_to_series' || event === 'add_series_number') {
    return queries.series.get(item.series_id)?.is_public === 1;
  }
  if (event === 'add_book_to_anthology' || event === 'add_anthology_order') {
    const parent = value.includes(':') ? Number(value.split(':')[1]) : item.parent_book_id;
    return queries.book.get(parent)?.is_public === 1;
  }
  return true;
}

// Retain the current award's eligibility through the synchronous job-XP trigger.
function ensureJobSeasonEligibility(db) {
  const columns = db.pragma('table_info(user_job_xp)');
  if (columns.length && !columns.some(column => column.name === 'seasonal_bonus_eligible')) {
    db.exec('ALTER TABLE user_job_xp ADD COLUMN seasonal_bonus_eligible INTEGER NOT NULL DEFAULT 1');
  }
}

module.exports = { seasonalContributionEligible, ensureJobSeasonEligibility };
