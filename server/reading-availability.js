'use strict';

// Imported text stays installed while its reader entry point is hidden for this viewer.
function visibleReadingBook(book, denied, marked) {
  const children = book.children?.map(child => visibleReadingBook(child, denied, marked));
  const ownAccess = book.hasLiveReading && !denied.has(book.id);
  const hasLiveReading = denied.size && children && book.isContainer
    ? children.some(child => child.hasLiveReading)
    : !!ownAccess;
  const result = children ? { ...book, children, hasLiveReading } : { ...book, hasLiveReading };
  if (hasLiveReading && (marked.has(book.id) || children?.some(child => child.restrictedReadingBadge))) {
    result.restrictedReadingBadge = true;
  }
  if (Object.hasOwn(result, 'has_live_reading')) result.has_live_reading = hasLiveReading ? 1 : 0;
  return result;
}

module.exports = { visibleReadingBook };
