import { _sortedByName, _shuffle } from './helpers.js';

export function _buildSeriesCoverEntries(seriesList = [], booksList = []) {
  const bySeries = new Map();
  for (const b of booksList) {
    const sid = b.seriesId ?? b.series_id ?? null;
    if (!sid) continue;
    if (!bySeries.has(sid)) bySeries.set(sid, []);
    bySeries.get(sid).push(b);
  }
  return _sortedByName(
    seriesList.map(series => {
      const seriesBooks = bySeries.get(series.id) || [];
      const withCovers = seriesBooks.filter(b => b.coverUrl);
      const coverBooks = _shuffle(withCovers).slice(0, 4);
      return {
        id: `series_${series.id}`,
        entityId: series.id,
        type: 'series',
        isSeries: true,
        isContainer: false,
        isOpenWorld: !!series.is_open_world,
        name: series.name,
        description: series.description || null,
        createdAt: Math.max(series.createdAt || 0, ...seriesBooks.map(b => b.createdAt || 0)),
        authors: null,
        seriesName: series.name,
        childNames: seriesBooks.map(b => b.name),
        bookIds: seriesBooks.map(b => b.id),
        coverSources: coverBooks.map(b => b.coverUrl).filter(Boolean),
        bookCount: series.book_count ?? seriesBooks.length,
        totalSections: series.total_sections ?? seriesBooks.reduce((s, b) => s + (b.totalSections || 0), 0),
        libraryCount: series.library_count ?? 0,
      };
    })
  );
}
