// Display names keep existing section IDs, saved paths and reader links stable.
const COMPACT_SECTION_LABELS = {
  introduction: 'Intro',
  prologue: 'Intro',
  'opening-prologue': 'Intro',
  'quest-map': 'Map',
};

export function sectionLabel(section, bookId) {
  if (Number(bookId) === 988 && section === 'opening') return 'Начало';
  if (typeof section !== 'string') return section;
  const key = section.toLowerCase();
  if (Object.hasOwn(COMPACT_SECTION_LABELS, key)) return COMPACT_SECTION_LABELS[key];
  return section;
}
