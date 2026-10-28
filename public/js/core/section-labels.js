// Display names keep existing section IDs, saved paths and reader links stable.
export function sectionLabel(section, bookId) {
  if (Number(bookId) === 988 && section === 'opening') return 'Начало';
  return section;
}
