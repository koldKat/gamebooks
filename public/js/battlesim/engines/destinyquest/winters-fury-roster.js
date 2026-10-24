// Source rosters live in book_enemies and are passed explicitly to the engine.
function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

export function decodeDestinyRoster(rows) {
  if (!Array.isArray(rows)) throw new TypeError('Invalid enemy response');
  const groups = new Map();
  for (const row of rows) {
    const stats = row.stats;
    if (stats?.family !== 'destinyquest' || stats.schemaVersion !== 1) continue;
    const { encounter, slot, part } = stats;
    if (!encounter || !Number.isSafeInteger(encounter.partCount) || encounter.partCount < 1 || !Number.isSafeInteger(slot) ||
        slot < 0 || slot >= encounter.partCount || !part || part.name !== row.name || typeof encounter.section !== 'string') throw new TypeError('Invalid encounter metadata');
    const signature = JSON.stringify(encounter);
    if (!groups.has(encounter.section)) groups.set(encounter.section, { signature, metadata: encounter, slots: new Map() });
    const group = groups.get(encounter.section);
    if (group.signature !== signature || group.slots.has(slot)) throw new TypeError('Inconsistent encounter metadata');
    group.slots.set(slot, structuredClone(part));
  }
  return freeze([...groups.values()].map(group => {
    if (group.slots.size !== group.metadata.partCount) throw new TypeError('Incomplete encounter roster');
    return { section: group.metadata.section, label: group.metadata.label, printedRules: structuredClone(group.metadata.printedRules),
      parts: Array.from({ length: group.metadata.partCount }, (_, slot) => group.slots.get(slot)) };
  }).sort((a, b) => Number(a.section) - Number(b.section)));
}

export async function loadDestinyRoster(bookId, fetcher) {
  if (!Number.isSafeInteger(bookId) || bookId < 1 || typeof fetcher !== 'function') throw new TypeError('Invalid roster request');
  const response = await fetcher(`/api/books/${bookId}/enemies`);
  if (!response.ok) throw new Error('Could not load book enemies');
  return decodeDestinyRoster(await response.json());
}

export function winterRosterFor(roster, section) {
  if (!Array.isArray(roster)) throw new TypeError('Load the book roster before selecting an encounter');
  const entry = roster.find(row => row.section === String(section));
  if (!entry) throw new RangeError('Unknown Winter encounter');
  return structuredClone(entry);
}
