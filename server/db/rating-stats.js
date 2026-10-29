'use strict';

function getRatingStats(db) {
  const rows = db.prepare(`
    SELECT CASE WHEN b.is_container = 1 THEN 'anthologies' ELSE 'books' END AS kind,
      ub.rating AS star, COUNT(*) AS n
    FROM user_books ub JOIN books b ON b.id = ub.book_id
    WHERE ub.rating IS NOT NULL AND (b.is_container = 0 OR b.parent_book_id IS NULL)
    GROUP BY kind, ub.rating
    UNION ALL
    SELECT 'series', rating, COUNT(*) FROM user_series
    WHERE rating IS NOT NULL GROUP BY rating
  `).all();
  const ratingBreakdown = {};
  for (const kind of ['books', 'anthologies', 'series']) {
    const votes = rows.filter(row => row.kind === kind);
    const count = votes.reduce((sum, row) => sum + row.n, 0);
    ratingBreakdown[kind] = {
      count,
      average: count ? votes.reduce((sum, row) => sum + row.star * row.n, 0) / count : null,
      distribution: Array.from({ length: 10 }, (_, index) => {
        const star = (index + 1) / 2;
        return { star, n: votes.find(row => row.star === star)?.n || 0 };
      }),
    };
  }
  const { books, anthologies, series } = ratingBreakdown;
  return {
    ratingsTotal: books.count + anthologies.count + series.count,
    bookRatingsCount: books.count, bookRatingsAvg: books.average,
    anthologyRatingsCount: anthologies.count, anthologyRatingsAvg: anthologies.average,
    seriesRatingsCount: series.count, seriesRatingsAvg: series.average,
    ratingDist: books.distribution.map(({ star }, index) => ({ star,
      n: books.distribution[index].n + anthologies.distribution[index].n + series.distribution[index].n })),
    ratingBreakdown,
  };
}

function getPlayerRatingStats(db, userId) {
  return db.prepare(`
    SELECT COUNT(*) AS ratingsGiven, AVG(rating) AS averageRating FROM (
      SELECT rating FROM user_books WHERE user_id = ? AND rating IS NOT NULL
      UNION ALL
      SELECT rating FROM user_series WHERE user_id = ? AND rating IS NOT NULL
    )
  `).get(userId, userId);
}

module.exports = { getRatingStats, getPlayerRatingStats };
