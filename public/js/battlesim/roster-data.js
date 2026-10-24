export async function loadRosterDataset(bookId, dataset, fetcher, legacyDecoder) {
  if (!Number.isSafeInteger(bookId) || bookId < 1 || typeof dataset !== 'string' || typeof fetcher !== 'function') throw new TypeError('Invalid roster request');
  const response = await fetcher(`/api/books/${bookId}/enemies`);
  if (!response.ok) throw new Error('Could not load the book roster');
  const rows = await response.json();
  if (!Array.isArray(rows)) throw new TypeError('Invalid enemy response');
  const entries = new Map();
  for (const row of rows) {
    const stats = row.stats;
    if (stats?.schemaVersion !== 1 || stats.dataset !== dataset) continue;
    if (!Number.isSafeInteger(stats.entryIndex) || stats.entryIndex < 0 || !stats.entry ||
        !Number.isSafeInteger(stats.slot) || stats.slot < 0 || !Number.isSafeInteger(stats.partCount) || stats.slot >= stats.partCount) throw new TypeError('Invalid roster metadata');
    const signature = JSON.stringify(stats.entry);
    if (!entries.has(stats.entryIndex)) entries.set(stats.entryIndex, { entry: stats.entry, signature, count: stats.partCount, slots: new Set() });
    const group = entries.get(stats.entryIndex);
    if (group.signature !== signature || group.count !== stats.partCount || group.slots.has(stats.slot)) throw new TypeError('Conflicting roster metadata');
    group.slots.add(stats.slot);
  }
  if (entries.size) {
    for (const entry of entries.values()) if (entry.slots.size !== entry.count) throw new TypeError('Incomplete roster metadata');
    return [...entries].sort(([a],[b])=>a-b).map(([,group])=>structuredClone(group.entry));
  }
  // Compatibility for a running server that still returns the original enemy
  // fields. The caller supplies identity mapping, never fallback combat stats.
  const legacy = legacyDecoder ? rows.map(legacyDecoder).filter(Boolean) : [];
  if (!legacy.length) throw new Error('The book roster has not been installed');
  return legacy;
}

export function createRosterLoader(bookId, dataset, install) {
  let ready = false, pending;
  return function load(fetcher) {
    if (ready) return Promise.resolve();
    if (!pending) pending = loadRosterDataset(bookId, dataset, fetcher).then(rows => {
      install(rows);
      ready = true;
    }).finally(() => { pending = null; });
    return pending;
  };
}

export async function prepareRosterData(bookId) {
  if (![412, 521, 522, 523, 524, 527, 528, 529, 530, 531, 532, 533, 534, 555, 557, 807, 808, 860, 869, 877, 881, 882].includes(bookId)) return;
  const [{ apiFetch }, { loadRoster }] = await Promise.all([
    import('../core/state.js'), import(`./books/${bookId}/definition.js`),
  ]);
  await loadRoster(apiFetch);
}
