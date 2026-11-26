'use strict';

function readingAvailability(readerIds, denied, marked) {
  let hasLiveReading = false;
  let hasOpenReading = false;
  for (const id of readerIds) {
    if (denied.has(id)) continue;
    hasLiveReading = true;
    if (!marked.has(id)) hasOpenReading = true;
  }
  return { hasLiveReading, restrictedReadingBadge: hasLiveReading && !hasOpenReading };
}

// Imported text stays installed while its reader entry point is hidden for this viewer.
function visibleReadingBook(book, denied, marked) {
  const children = book.children?.map(child => visibleReadingBook(child, denied, marked));
  const readers = book.isContainer && children?.length
    ? children.filter(child => child.hasLiveReading)
    : book.hasLiveReading && !denied.has(book.id) ? [{ restrictedReadingBadge: marked.has(book.id) }] : [];
  const hasLiveReading = readers.length > 0;
  const result = children ? { ...book, children, hasLiveReading } : { ...book, hasLiveReading };
  if (hasLiveReading && readers.every(reader => reader.restrictedReadingBadge)) result.restrictedReadingBadge = true;
  if (Object.hasOwn(result, 'has_live_reading')) result.has_live_reading = hasLiveReading ? 1 : 0;
  return result;
}

module.exports = { readingAvailability, visibleReadingBook };
