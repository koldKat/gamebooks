'use strict';

// Activity feed (getFeed) + public-listing/sitemap helpers + public profile data.
// A few small profile-flag setters (setPublicProfile/setAuthor/etc.) lived physically
// in this same stretch of the original server/db.js and are kept here verbatim.

const { db, _naturalCompareByName } = require('./connection');
const { computeLevel, getTitleForLevel, getUserXpInfo, _insertNotif } = require('./xp');
const { getRandomLevelUpTemplate, getRandomJoinTemplate } = require('./content');
const { _getAggregateRating, _getAuthorRatings } = require('./books');

// ── Activity feed ─────────────────────────────────────────────────────────────

function getFeed() {
  const cutoffSec = Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60;
  const cutoffMs  = cutoffSec * 1000;
  const entries   = [];

  // ── Series events (from user_series) ─────────────────────────────────────────
  const seriesRows = db.prepare(
    `SELECT us.user_id, us.added_at, s.id AS seriesId, s.name AS seriesName,
            s.description AS seriesDesc, s.created_by, s.is_public, s.published_at,
            u.username, u.public_profile, u.avatar_path, u.hide_from_feed, u.xp,
            u.is_author, u.is_contributor, u.display_name
     FROM user_series us
     JOIN series s ON s.id = us.series_id
     JOIN users u ON u.id = us.user_id
     WHERE s.is_public = 1`
  ).all();

  // Build a set of (userId, seriesId, added_at) for cascade-add suppression
  // Books added within 10s of a series add by the same user are considered cascade adds
  const _cascadeAdds = new Set();
  for (const sr of seriesRows) {
    const isCreator = sr.created_by === sr.user_id;
    const eventMs = ((isCreator ? (sr.published_at || sr.added_at) : sr.added_at) || 0) * 1000;
    if (eventMs < cutoffMs) continue;
    if (sr.hide_from_feed) continue;
    entries.push({
      type: isCreator ? 'series_created' : 'series_added',
      username:    sr.username,
      seriesId:    sr.seriesId,
      seriesName:  sr.seriesName,
      seriesIsPublic: true,
      completedAt: eventMs,
      userPublicProfile: sr.public_profile === 1,
      isAuthor:      sr.is_author === 1,
      isContributor: sr.is_contributor === 1,
      displayName:   sr.display_name || null,
      userLevel:     computeLevel(sr.xp || 0),
      userTitle:     getTitleForLevel(computeLevel(sr.xp || 0)),
      avatarUrl:     sr.avatar_path ? `/avatars/${sr.avatar_path}` : null,
    });
    // Mark this user+series add window for suppression
    _cascadeAdds.add(`${sr.user_id}:${sr.seriesId}:${sr.added_at}`);
  }

  // ── Rating events (books/anthologies/series) ─────────────────────────────────
  // Sourced from the rate_book/rate_series XP award rather than user_books.rated_at
  // directly - xp_events has a UNIQUE(user_id, event, ref) index, so it only ever
  // holds ONE row per user+book/series no matter how many times they re-rate, which
  // is exactly the "first rating only, no re-rating spam" behavior wanted here.
  // rated_at itself is still kept (see setBookRating/setSeriesRating) for other uses
  // that want to know when a rating last changed, not just whether it's been shown.
  const ratedBookRows = db.prepare(
    `SELECT xe.created_at, ub.rating,
            b.id AS bookId, b.name AS bookName, b.is_container AS bookIsContainer,
            b.is_public, b.cover_path, b.series_id AS seriesId,
            s.name AS seriesName, b.series_number AS seriesNumber, s.is_public AS seriesIsPublic,
            p.id AS parentBookId, p.name AS parentBookName, p.is_public AS parentIsPublic, p.cover_path AS parentCoverPath,
            u.username, u.public_profile, u.avatar_path, u.hide_from_feed, u.xp,
            u.is_author, u.is_contributor, u.display_name
     FROM xp_events xe
     JOIN books b      ON b.id = CAST(xe.ref AS INTEGER)
     JOIN user_books ub ON ub.user_id = xe.user_id AND ub.book_id = b.id
     JOIN users u       ON u.id = xe.user_id
     LEFT JOIN series s ON s.id = b.series_id
     LEFT JOIN books p  ON p.id = b.parent_book_id
     WHERE xe.event = 'rate_book' AND b.is_demo = 0`
  ).all();
  for (const row of ratedBookRows) {
    const eventMs = (row.created_at || 0) * 1000;
    const bookIsPublic = row.is_public === 1;
    // row.rating is the CURRENT rating (joined from user_books), not the value at
    // the time of this historical XP event - if the user has since cleared their
    // rating entirely, skip rather than show a "rated" entry with no stars filled.
    if (eventMs < cutoffMs || row.hide_from_feed || !bookIsPublic || row.rating == null) continue;
    entries.push({
      type: 'book_rated', username: row.username, bookName: row.bookName, bookId: row.bookId,
      rating: row.rating, completedAt: eventMs, userPublicProfile: row.public_profile === 1, bookIsPublic,
      isContainer: row.bookIsContainer === 1,
      isAuthor: row.is_author === 1, isContributor: row.is_contributor === 1, displayName: row.display_name || null,
      userLevel: computeLevel(row.xp || 0), userTitle: getTitleForLevel(computeLevel(row.xp || 0)),
      seriesId: row.seriesId || null, seriesName: row.seriesName || null, seriesNumber: row.seriesNumber || null,
      seriesIsPublic: row.seriesIsPublic === 1,
      parentBookId: row.parentBookId || null, parentBookName: row.parentBookName || null,
      parentBookIsPublic: row.parentIsPublic === 1,
      parentCoverUrl: row.parentCoverPath ? `/covers/${row.parentCoverPath}` : null,
      avatarUrl: row.avatar_path ? `/avatars/${row.avatar_path}` : null,
      coverUrl: row.cover_path ? `/covers/${row.cover_path}` : null,
    });
  }

  const ratedSeriesRows = db.prepare(
    `SELECT xe.created_at, us.rating, s.id AS seriesId, s.name AS seriesName,
            u.username, u.public_profile, u.avatar_path, u.hide_from_feed, u.xp,
            u.is_author, u.is_contributor, u.display_name
     FROM xp_events xe
     JOIN series s        ON s.id = CAST(xe.ref AS INTEGER)
     JOIN user_series us  ON us.user_id = xe.user_id AND us.series_id = s.id
     JOIN users u         ON u.id = xe.user_id
     WHERE xe.event = 'rate_series' AND s.is_public = 1`
  ).all();
  for (const row of ratedSeriesRows) {
    const eventMs = (row.created_at || 0) * 1000;
    if (eventMs < cutoffMs || row.hide_from_feed || row.rating == null) continue;
    entries.push({
      type: 'series_rated', username: row.username, seriesId: row.seriesId, seriesName: row.seriesName,
      rating: row.rating, seriesIsPublic: true, completedAt: eventMs, userPublicProfile: row.public_profile === 1,
      isAuthor: row.is_author === 1, isContributor: row.is_contributor === 1, displayName: row.display_name || null,
      userLevel: computeLevel(row.xp || 0), userTitle: getTitleForLevel(computeLevel(row.xp || 0)),
      avatarUrl: row.avatar_path ? `/avatars/${row.avatar_path}` : null,
    });
  }

  // ── Open world series run events ─────────────────────────────────────────────
  // series_runs itself doesn't track which book a run started/ended in
  // (last_book_id/last_section are explicitly nulled on completion - see the
  // comment below), so it's derived from each book's own playthroughs[runIndex],
  // the same way the public journey viewer (getPublicSeriesRun) builds its
  // segment list. Cached per (seriesId, userId) since a user's series-run rows
  // for the same series all read the same book set.
  const _seriesRunBooksCache = new Map();
  function _getSeriesRunBooks(seriesId, userId) {
    const key = `${seriesId}:${userId}`;
    if (_seriesRunBooksCache.has(key)) return _seriesRunBooksCache.get(key);
    const rows = db.prepare(`
      SELECT b.id, b.name, b.is_public, b.cover_path, ub.state_data
      FROM books b JOIN user_books ub ON ub.book_id = b.id AND ub.user_id = ?
      WHERE b.series_id = ?
    `).all(userId, seriesId);
    const parsed = rows.map(r => {
      let st; try { st = JSON.parse(r.state_data); } catch { st = {}; }
      return { id: r.id, name: r.name, isPublic: r.is_public === 1,
               coverUrl: r.cover_path ? `/covers/${r.cover_path}` : null,
               playthroughs: st.playthroughs || [] };
    });
    _seriesRunBooksCache.set(key, parsed);
    return parsed;
  }
  // wantEnd=false: the book with the earliest pt.startedAt for this run index
  // (where the run actually began). wantEnd=true: the book whose pt.completed
  // is true with a non-portal result (where the run actually ended) - there's
  // only ever one, since a portal-paused book always leaves result === 'portal'.
  function _seriesRunBook(seriesId, userId, runIndex, wantEnd) {
    const books = _getSeriesRunBooks(seriesId, userId);
    if (wantEnd) {
      return books.find(b => {
        const pt = b.playthroughs[runIndex];
        return pt && pt.completed && pt.result && pt.result !== 'portal';
      }) || null;
    }
    let best = null, bestTs = Infinity;
    for (const b of books) {
      const pt = b.playthroughs[runIndex];
      if (pt?.startedAt && pt.startedAt < bestTs) { best = b; bestTs = pt.startedAt; }
    }
    return best;
  }

  const seriesRunRows = db.prepare(
    `SELECT sr.run_index, sr.started_at, sr.completed, sr.result, sr.completed_at, sr.is_public,
            s.id AS seriesId, s.name AS seriesName, s.is_public AS seriesIsPublic,
            u.id AS userId, u.username, u.public_profile, u.avatar_path, u.hide_from_feed, u.xp,
            u.is_author, u.is_contributor, u.display_name
     FROM series_runs sr
     JOIN series s ON s.id = sr.series_id
     JOIN users  u ON u.id = sr.user_id
     WHERE s.is_open_world = 1 AND s.is_public = 1`
  ).all();
  for (const sr of seriesRunRows) {
    if (sr.hide_from_feed) continue;
    const pub = sr.public_profile === 1;
    const base = {
      username:          sr.username,
      userId:            sr.userId,
      seriesId:          sr.seriesId,
      seriesName:        sr.seriesName,
      runIndex:          sr.run_index,
      userPublicProfile: pub,
      isAuthor:          sr.is_author === 1,
      isContributor:     sr.is_contributor === 1,
      displayName:       sr.display_name || null,
      userLevel:         computeLevel(sr.xp || 0),
      userTitle:         getTitleForLevel(computeLevel(sr.xp || 0)),
      avatarUrl:         sr.avatar_path ? `/avatars/${sr.avatar_path}` : null,
    };
    const startMs = (sr.started_at || 0) * 1000;
    if (startMs >= cutoffMs) {
      const startBook = _seriesRunBook(sr.seriesId, sr.userId, sr.run_index, false);
      entries.push({ ...base, type: 'series_run_started', completedAt: startMs,
        bookId: startBook?.id ?? null, bookName: startBook?.name ?? null,
        bookIsPublic: !!startBook?.isPublic, coverUrl: startBook?.coverUrl ?? null });
    }
    if (sr.completed && sr.result && sr.completed_at) {
      const endMs = sr.completed_at * 1000;
      if (endMs >= cutoffMs) {
        // No lastSection here - completeSeriesRun() (books.js) explicitly nulls
        // last_book_id/last_section on completion (that pair only tracks an
        // in-progress run's current position), so by the time this entry is
        // read it's always null. The feed tooltip falls back to just the date.
        const endBook = _seriesRunBook(sr.seriesId, sr.userId, sr.run_index, true);
        entries.push({ ...base, type: 'series_run_completed', result: sr.result,
          runIsPublic: !!sr.is_public, completedAt: endMs,
          bookId: endBook?.id ?? null, bookName: endBook?.name ?? null,
          bookIsPublic: !!endBook?.isPublic, coverUrl: endBook?.coverUrl ?? null });
      }
    }
  }

  // ── Book / run events (from user_books state_data) ────────────────────────────
  const rows = db.prepare(
    `SELECT b.id AS bookId, b.name AS bookName, b.cover_path, b.created_by, b.is_public,
            b.is_container AS bookIsContainer, b.series_id AS bookSeriesId,
            b.created_at AS book_created_at, b.published_at AS book_published_at,
            COALESCE(b.series_number, p.series_number) AS series_number,
            ub.state_data, ub.updated_at, ub.created_at AS ub_created_at, ub.party_id,
            u.id AS userId, u.username, u.public_profile, u.avatar_path, u.hide_from_feed, u.xp,
            u.is_author, u.is_contributor, u.display_name,
            p.id AS parentBookId, p.name AS parentBookName, p.is_public AS parentIsPublic,
            p.cover_path AS parentCoverPath,
            COALESCE(s.id,  ps.id)    AS seriesId,
            COALESCE(s.name, ps.name) AS seriesName,
            COALESCE(s.is_open_world, ps.is_open_world, 0) AS seriesIsOpenWorld,
            COALESCE(s.is_public, ps.is_public, 0) AS seriesIsPublic
     FROM user_books ub
     JOIN books b ON b.id = ub.book_id
     LEFT JOIN books p   ON p.id  = b.parent_book_id
     LEFT JOIN series s  ON s.id  = b.series_id
     LEFT JOIN series ps ON ps.id = p.series_id
     JOIN users u ON u.id = ub.user_id
     WHERE b.is_demo = 0`
  ).all();

  // Build a map of userId+bookId → ub_created_at for anthology cascade suppression
  const _anthologyAdded = new Map(); // key: `${userId}:${bookId}` → ub_created_at (seconds)
  for (const row of rows) {
    if (row.bookIsContainer) _anthologyAdded.set(`${row.userId}:${row.bookId}`, row.ub_created_at || 0);
  }

  for (const row of rows) {
    let state; try { state = JSON.parse(row.state_data); } catch { continue; }
    const pub         = row.public_profile === 1;
    const isAuthor      = row.is_author === 1;
    const isContributor = row.is_contributor === 1;
    const displayName   = row.display_name || null;
    const parentBookId   = row.parentBookId   || null;
    const parentBookName = row.parentBookName || null;
    const parentCoverUrl = row.parentCoverPath ? `/covers/${row.parentCoverPath}` : null;
    const seriesId         = row.seriesId         || null;
    const seriesName       = row.seriesName       || null;
    const seriesNumber     = row.series_number    || null;
    const seriesIsOpenWorld = !!row.seriesIsOpenWorld;
    const seriesIsPublic    = row.seriesIsPublic === 1;
    const parentBookIsPublic = row.parentIsPublic === 1;

    const isCreator = row.created_by === row.userId;
    // book_created uses b.published_at so public release time can differ from creation.
    // book_added still uses ub_created_at.
    const eventMs = isCreator
      ? ((row.book_published_at || row.book_created_at || 0) * 1000)
      : (row.ub_created_at   || 0) * 1000;
    const bookIsPublic = row.is_public === 1;

    // Suppress book_added entries that came from a series cascade-add
    const isCascadeAdd = !isCreator && row.bookSeriesId && (() => {
      const ubSec = row.ub_created_at || 0;
      for (const key of _cascadeAdds) {
        const [uid, sid, addedAt] = key.split(':').map(Number);
        if (uid === row.userId && sid === row.bookSeriesId && Math.abs(ubSec - addedAt) <= 10) return true;
      }
      return false;
    })();

    // Suppress book_added entries that came from an anthology cascade-add (children)
    const isAnthologyCascade = !isCreator && row.parentBookId && (() => {
      const parentAddedAt = _anthologyAdded.get(`${row.userId}:${row.parentBookId}`);
      return parentAddedAt != null && Math.abs((row.ub_created_at || 0) - parentAddedAt) <= 10;
    })();

    if (eventMs >= cutoffMs && !row.hide_from_feed && bookIsPublic && !isCascadeAdd && !isAnthologyCascade) {
      const type = isCreator ? 'book_created' : 'book_added';
      entries.push({ type, username: row.username, bookName: row.bookName,
        bookId: row.bookId, completedAt: eventMs, userPublicProfile: pub, bookIsPublic,
        isContainer: row.bookIsContainer === 1,
        isAuthor, isContributor, displayName, userLevel: computeLevel(row.xp || 0), userTitle: getTitleForLevel(computeLevel(row.xp || 0)), parentBookId, parentBookName, parentCoverUrl,
        seriesId, seriesName, seriesNumber, seriesIsPublic, parentBookIsPublic,
        avatarUrl: row.avatar_path ? `/avatars/${row.avatar_path}` : null,
        coverUrl:  row.cover_path  ? `/covers/${row.cover_path}`  : null });
    }

    if (!bookIsPublic) {
      // Still allow explicitly public runs through even for private books
      // (but not for open world - series_run_completed handles those)
      if (!seriesIsOpenWorld) {
        const fallbackTs2 = (row.updated_at || 0) * 1000;
        for (let i = 0; i < (state.playthroughs || []).length; i++) {
          const pt = state.playthroughs[i];
          if (pt.startedAt && pt.startedAt >= cutoffMs && !(row.hide_from_feed && !pt.isPublic)) {
            entries.push({ type: 'run_started', username: row.username, bookName: row.bookName,
              bookId: row.bookId, runIndex: i, completedAt: pt.startedAt, userPublicProfile: pub, bookIsPublic: false,
              userLevel: computeLevel(row.xp || 0), userTitle: getTitleForLevel(computeLevel(row.xp || 0)),
              isAuthor, isContributor, displayName, parentBookId, parentBookName, parentCoverUrl,
              seriesId, seriesName, seriesNumber, seriesIsPublic, parentBookIsPublic,
              avatarUrl: row.avatar_path ? `/avatars/${row.avatar_path}` : null,
              coverUrl:  row.cover_path  ? `/covers/${row.cover_path}`  : null,
              partyId: row.party_id || null, userId: row.userId });
          }
          if (!pt.completed) continue;
          if (pt.result !== 'death' && pt.result !== 'success' && pt.result !== 'battle') continue;
          if (row.hide_from_feed && !pt.isPublic) continue;
          const ts = pt.completedAt || fallbackTs2;
          if (ts < cutoffMs) continue;
          entries.push({ type: 'run_completed', username: row.username, bookName: row.bookName,
            result: pt.result, completedAt: ts, bookId: row.bookId, userId: row.userId, runIndex: i,
            runIsPublic: !!pt.isPublic, bookIsPublic: false, userPublicProfile: pub, isAuthor, isContributor, displayName, userLevel: computeLevel(row.xp || 0), userTitle: getTitleForLevel(computeLevel(row.xp || 0)),
            pathLength: (pt.path || []).length, lastSection: pt.path && pt.path.length ? pt.path[pt.path.length - 1] : null,
            parentBookId, parentBookName, parentCoverUrl, seriesId, seriesName, seriesNumber, seriesIsPublic, parentBookIsPublic,
            avatarUrl: row.avatar_path ? `/avatars/${row.avatar_path}` : null,
            coverUrl:  row.cover_path  ? `/covers/${row.cover_path}`  : null,
            partyId: row.party_id || null });
        }
      }
      // preSeriesRuns (migratePreSeriesRuns) predate the book's series turning
      // open-world, so unlike the playthroughs loop above this one is NOT
      // gated on seriesIsOpenWorld - these runs never get a series_run_completed
      // entry either (they were never tracked in series_runs), so skipping them
      // here would mean they never appear in the feed again after migration.
      {
        const preRuns = state.preSeriesRuns || [];
        const fallbackTs2b = (row.updated_at || 0) * 1000;
        for (let i = 0; i < preRuns.length; i++) {
          const pt = preRuns[i];
          if (!pt.completed) continue;
          if (pt.result !== 'death' && pt.result !== 'success' && pt.result !== 'battle') continue;
          if (row.hide_from_feed && !pt.isPublic) continue;
          const ts = pt.completedAt || fallbackTs2b;
          if (ts < cutoffMs) continue;
          entries.push({ type: 'run_completed', username: row.username, bookName: row.bookName,
            result: pt.result, completedAt: ts, bookId: row.bookId, userId: row.userId,
            runIndex: -(preRuns.length - i),
            runIsPublic: !!pt.isPublic, bookIsPublic: false, userPublicProfile: pub, isAuthor, isContributor, displayName, userLevel: computeLevel(row.xp || 0), userTitle: getTitleForLevel(computeLevel(row.xp || 0)),
            pathLength: (pt.path || []).length, lastSection: pt.path && pt.path.length ? pt.path[pt.path.length - 1] : null,
            parentBookId, parentBookName, parentCoverUrl, seriesId, seriesName, seriesNumber, seriesIsPublic, parentBookIsPublic,
            avatarUrl: row.avatar_path ? `/avatars/${row.avatar_path}` : null,
            coverUrl:  row.cover_path  ? `/covers/${row.cover_path}`  : null,
            partyId: row.party_id || null });
        }
      }
      continue;
    }

    const fallbackTs = (row.updated_at || 0) * 1000;
    const pts = state.playthroughs || [];
    for (let i = 0; i < pts.length; i++) {
      const pt = pts[i];

      // Run started - skip placeholder runs (startedAt null) and open-world books
      // (series run start is recorded once via series_run_started, not per-book)
      if (pt.startedAt && pt.startedAt >= cutoffMs && !seriesIsOpenWorld) {
        if (!row.hide_from_feed) entries.push({ type: 'run_started', username: row.username, bookName: row.bookName,
          bookId: row.bookId, runIndex: i, completedAt: pt.startedAt, userPublicProfile: pub, bookIsPublic,
          userLevel: computeLevel(row.xp || 0), userTitle: getTitleForLevel(computeLevel(row.xp || 0)),
          isAuthor, isContributor, displayName, parentBookId, parentBookName, parentCoverUrl, seriesId, seriesName, seriesNumber, seriesIsPublic, parentBookIsPublic,
          avatarUrl: row.avatar_path ? `/avatars/${row.avatar_path}` : null,
          coverUrl:  row.cover_path  ? `/covers/${row.cover_path}`  : null,
          partyId: row.party_id || null, userId: row.userId });
      }

      // Run completed - suppress per-book event for open world (series_run_completed handles it)
      if (!pt.completed) continue;
      if (pt.result !== 'death' && pt.result !== 'success' && pt.result !== 'battle') continue;
      if (seriesIsOpenWorld) continue;
      const ts = pt.completedAt || fallbackTs;
      if (ts < cutoffMs) continue;
      if (!row.hide_from_feed || pt.isPublic) entries.push({ type: 'run_completed', username: row.username, bookName: row.bookName,
        result: pt.result, completedAt: ts, bookId: row.bookId, userId: row.userId, runIndex: i,
        runIsPublic: pt.isPublic || false, bookIsPublic, userPublicProfile: pub, isAuthor, isContributor, displayName, userLevel: computeLevel(row.xp || 0), userTitle: getTitleForLevel(computeLevel(row.xp || 0)),
        pathLength: (pt.path || []).length, lastSection: pt.path && pt.path.length ? pt.path[pt.path.length - 1] : null,
        parentBookId, parentBookName, parentCoverUrl, seriesId, seriesName, seriesNumber, seriesIsPublic, parentBookIsPublic,
        avatarUrl: row.avatar_path ? `/avatars/${row.avatar_path}` : null,
        coverUrl:  row.cover_path  ? `/covers/${row.cover_path}`  : null,
        partyId: row.party_id || null });
    }

    // preSeriesRuns - same reasoning as the private-book branch above: not
    // gated on seriesIsOpenWorld, since these runs predate joining the series
    // and never get a series_run_completed entry either.
    {
      const preRuns = state.preSeriesRuns || [];
      for (let i = 0; i < preRuns.length; i++) {
        const pt = preRuns[i];
        if (!pt.completed) continue;
        if (pt.result !== 'death' && pt.result !== 'success' && pt.result !== 'battle') continue;
        const ts = pt.completedAt || fallbackTs;
        if (ts < cutoffMs) continue;
        if (!row.hide_from_feed || pt.isPublic) entries.push({ type: 'run_completed', username: row.username, bookName: row.bookName,
          result: pt.result, completedAt: ts, bookId: row.bookId, userId: row.userId,
          runIndex: -(preRuns.length - i),
          runIsPublic: pt.isPublic || false, bookIsPublic, userPublicProfile: pub, isAuthor, isContributor, displayName, userLevel: computeLevel(row.xp || 0), userTitle: getTitleForLevel(computeLevel(row.xp || 0)),
          pathLength: (pt.path || []).length, lastSection: pt.path && pt.path.length ? pt.path[pt.path.length - 1] : null,
          parentBookId, parentBookName, parentCoverUrl, seriesId, seriesName, seriesNumber, seriesIsPublic, parentBookIsPublic,
          avatarUrl: row.avatar_path ? `/avatars/${row.avatar_path}` : null,
          coverUrl:  row.cover_path  ? `/covers/${row.cover_path}`  : null,
          partyId: row.party_id || null });
      }
    }
  }

  // ── Level-up events ────────────────────────────────────────────────────────
  const lvRows = db.prepare(
    `SELECT e.ref AS level, e.created_at, e.template_id, u.username, u.public_profile, u.avatar_path, u.xp,
            u.is_author, u.is_contributor, u.display_name
     FROM xp_events e JOIN users u ON e.user_id = u.id
     WHERE e.event = 'level_up' AND e.created_at > ? AND u.hide_from_feed = 0`
  ).all(cutoffSec);
  for (const row of lvRows) {
    const lv             = parseInt(row.level, 10);
    const abilitiesNow   = lv <= 30 ? 3 : Math.min(10, 3 + Math.ceil((lv - 30) / 10));
    const abilitiesBefore = (lv - 1) <= 30 ? 3 : Math.min(10, 3 + Math.ceil(((lv - 1) - 30) / 10));
    const gainedAbility  = lv > 0 && abilitiesNow > abilitiesBefore;
    const tmplRow = row.template_id != null
      ? db.prepare('SELECT template FROM level_up_templates WHERE id = ?').get(row.template_id)
      : null;
    const levelUpTemplate = tmplRow?.template || getRandomLevelUpTemplate();
    entries.push({ type: 'level_up', username: row.username, level: lv,
      levelTitle: getTitleForLevel(lv), levelUpTemplate, completedAt: row.created_at * 1000,
      userPublicProfile: row.public_profile === 1,
      isAuthor: row.is_author === 1, isContributor: row.is_contributor === 1, displayName: row.display_name || null,
      userLevel: computeLevel(row.xp || 0),
      userTitle: getTitleForLevel(computeLevel(row.xp || 0)),
      avatarUrl: row.avatar_path ? `/avatars/${row.avatar_path}` : null,
      gainedAbility, newAbilityCount: gainedAbility ? abilitiesNow : null });
  }

  // ── All-sections-visited milestone ─────────────────────────────────────────
  const visitRows = db.prepare(
    `SELECT e.ref AS bookId, e.created_at, u.username, u.public_profile, u.avatar_path, u.xp,
            u.is_author, u.is_contributor, u.display_name,
            b.name AS bookName, b.cover_path, b.is_public, ub.party_id,
            COALESCE(b.series_number, p.series_number) AS series_number,
            p.id AS parentBookId, p.name AS parentBookName, p.cover_path AS parentCoverPath, p.is_public AS parentIsPublic,
            COALESCE(s.id, ps.id) AS seriesId, COALESCE(s.name, ps.name) AS seriesName,
            COALESCE(s.is_public, ps.is_public, 0) AS seriesIsPublic
     FROM xp_events e
     JOIN users u ON e.user_id = u.id
     JOIN books b ON CAST(e.ref AS INTEGER) = b.id
     LEFT JOIN books p   ON p.id  = b.parent_book_id
     LEFT JOIN series s  ON s.id  = b.series_id
     LEFT JOIN series ps ON ps.id = p.series_id
     LEFT JOIN user_books ub ON ub.user_id = e.user_id AND ub.book_id = CAST(e.ref AS INTEGER)
     WHERE e.event = 'visit_all' AND e.created_at > ? AND u.hide_from_feed = 0`
  ).all(cutoffSec);
  for (const row of visitRows) {
    entries.push({ type: 'all_visited', username: row.username, bookName: row.bookName,
      bookId: parseInt(row.bookId, 10), completedAt: row.created_at * 1000,
      bookIsPublic: row.is_public === 1, userPublicProfile: row.public_profile === 1,
      isAuthor: row.is_author === 1, isContributor: row.is_contributor === 1, displayName: row.display_name || null,
      userLevel: computeLevel(row.xp || 0),
      userTitle: getTitleForLevel(computeLevel(row.xp || 0)),
      parentBookId: row.parentBookId || null, parentBookName: row.parentBookName || null,
      parentCoverUrl: row.parentCoverPath ? `/covers/${row.parentCoverPath}` : null,
      seriesId: row.seriesId || null, seriesName: row.seriesName || null, seriesNumber: row.series_number || null,
      seriesIsPublic: row.seriesIsPublic === 1, parentBookIsPublic: row.parentIsPublic === 1,
      avatarUrl: row.avatar_path ? `/avatars/${row.avatar_path}` : null,
      coverUrl:  row.cover_path  ? `/covers/${row.cover_path}`  : null,
      partyId: row.party_id || null });
  }

  // ── All-sections-discovered milestone ─────────────────────────────────────
  const discoverRows = db.prepare(
    `SELECT e.ref AS bookId, e.created_at, u.username, u.public_profile, u.avatar_path, u.xp,
            u.is_author, u.is_contributor, u.display_name,
            b.name AS bookName, b.cover_path, b.is_public, ub.party_id,
            COALESCE(b.series_number, p.series_number) AS series_number,
            p.id AS parentBookId, p.name AS parentBookName, p.cover_path AS parentCoverPath, p.is_public AS parentIsPublic,
            COALESCE(s.id, ps.id) AS seriesId, COALESCE(s.name, ps.name) AS seriesName,
            COALESCE(s.is_public, ps.is_public, 0) AS seriesIsPublic
     FROM xp_events e
     JOIN users u ON e.user_id = u.id
     JOIN books b ON CAST(e.ref AS INTEGER) = b.id
     LEFT JOIN books p   ON p.id  = b.parent_book_id
     LEFT JOIN series s  ON s.id  = b.series_id
     LEFT JOIN series ps ON ps.id = p.series_id
     LEFT JOIN user_books ub ON ub.user_id = e.user_id AND ub.book_id = CAST(e.ref AS INTEGER)
     WHERE e.event = 'discover_all' AND e.created_at > ? AND u.hide_from_feed = 0`
  ).all(cutoffSec);
  for (const row of discoverRows) {
    entries.push({ type: 'all_discovered', username: row.username, bookName: row.bookName,
      bookId: parseInt(row.bookId, 10), completedAt: row.created_at * 1000,
      bookIsPublic: row.is_public === 1, userPublicProfile: row.public_profile === 1,
      isAuthor: row.is_author === 1, isContributor: row.is_contributor === 1, displayName: row.display_name || null,
      userLevel: computeLevel(row.xp || 0),
      userTitle: getTitleForLevel(computeLevel(row.xp || 0)),
      parentBookId: row.parentBookId || null, parentBookName: row.parentBookName || null,
      parentCoverUrl: row.parentCoverPath ? `/covers/${row.parentCoverPath}` : null,
      seriesId: row.seriesId || null, seriesName: row.seriesName || null, seriesNumber: row.series_number || null,
      seriesIsPublic: row.seriesIsPublic === 1, parentBookIsPublic: row.parentIsPublic === 1,
      avatarUrl: row.avatar_path ? `/avatars/${row.avatar_path}` : null,
      coverUrl:  row.cover_path  ? `/covers/${row.cover_path}`  : null,
      partyId: row.party_id || null });
  }

  // win_run/death_run/battle_run refs are startedAt-based (see processStateXp), not
  // array-index-based, so the run's current position has to be recovered by matching
  // startedAt against the live playthroughs array - a raw parseInt of the ref segment
  // would be a giant timestamp, not a usable index. Older refs (recorded before that
  // change) are plain indices, so fall back to treating the key as an index too.
  function _resolveRunIndex(stateDataJson, runKey) {
    if (runKey == null || !stateDataJson) return null;
    let parsed;
    try { parsed = JSON.parse(stateDataJson); } catch { return null; }
    const pts = parsed?.playthroughs;
    if (Array.isArray(pts)) {
      const idx = pts.findIndex(p => p && String(p.startedAt) === String(runKey));
      if (idx !== -1) return idx;
    }
    // Also check preSeriesRuns (migratePreSeriesRuns) - a run's startedAt-based
    // key stays stable even after migration moves it out of playthroughs, so a
    // first_win/first_loss/first_battle_death event recorded before migration
    // still needs to resolve to the run's new location - both its tooltip data
    // and the run_completed-suppression key below are keyed on this runIndex.
    const preRuns = parsed?.preSeriesRuns;
    if (Array.isArray(preRuns)) {
      const preIdx = preRuns.findIndex(p => p && String(p.startedAt) === String(runKey));
      if (preIdx !== -1) return -(preRuns.length - preIdx);
    }
    if (Array.isArray(pts)) {
      const asIndex = parseInt(runKey, 10);
      return (!Number.isNaN(asIndex) && pts[asIndex]) ? asIndex : null;
    }
    return null;
  }

  // Feeds the feed entry's own hover tooltip (a cheap plain-text preview,
  // same idea as the one on the public-profile run list) without spinning up
  // the full run graph just for a hover.
  function _runPathInfo(stateDataJson, runIndex) {
    if (runIndex == null || !stateDataJson) return { pathLength: null, lastSection: null };
    try {
      const parsed = JSON.parse(stateDataJson);
      const preRuns = parsed?.preSeriesRuns || [];
      const pt = runIndex < 0 ? preRuns[preRuns.length + runIndex] : parsed?.playthroughs?.[runIndex];
      const path = pt?.path || [];
      return { pathLength: path.length, lastSection: path.length ? path[path.length - 1] : null };
    } catch { return { pathLength: null, lastSection: null }; }
  }

  // win_run/death_run/battle_run refs are book-scoped (`bookId:startedAt`) for a
  // book that wasn't in an open-world series at completion time, but
  // series-scoped (`series:seriesId:startedAt`, see processStateXp) once it is -
  // a book's history can contain both, e.g. pre-conversion losses plus later
  // portal-hopped ones. Finds the earliest of either format so first_win/
  // first_loss/first_battle_death (which always fire on the very first ever
  // completion, in whichever format that completion happened to use) can
  // still resolve their run - matching only the book-scoped format silently
  // failed to link an open-world-native first win/loss to any run at all.
  const _getFirstRunRef = db.prepare(`
    SELECT ref FROM xp_events
    WHERE user_id = ? AND event = ?
      AND (ref LIKE ? || ':%' OR (? IS NOT NULL AND ref LIKE 'series:' || ? || ':%'))
    ORDER BY created_at ASC LIMIT 1
  `);
  function _runKeyFromRef(ref) {
    if (!ref) return null;
    const parts = ref.split(':');
    return parts[0] === 'series' ? parts[2] : parts[1];
  }
  // The seriesId arg to _getFirstRunRef MUST be a JS string, not a number -
  // better-sqlite3 binds a plain JS number as SQLite REAL when it's not
  // provably a safe integer in this driver's default mode, and concatenating
  // a REAL in SQL stringifies it with a trailing ".0" ('series:123.0:%'
  // instead of 'series:123:%'), so the LIKE silently never matches. CAST(?
  // AS TEXT) does NOT fix this - casting an already-REAL bound value still
  // produces "123.0". Stringifying in JS before binding is the only fix that
  // actually works; confirmed by hand against a real row before landing this.
  function _seriesIdParam(seriesId) { return seriesId == null ? null : String(seriesId); }
  const _hasShareRun = db.prepare('SELECT 1 FROM xp_events WHERE user_id=? AND event=? AND ref=?');

  // ── First win ─────────────────────────────────────────────────────────────
  const firstWinRows = db.prepare(`
    SELECT e.ref AS bookId, e.created_at, u.id AS userId, u.username, u.public_profile, u.avatar_path, u.xp,
           u.is_author, u.is_contributor, u.display_name,
           b.name AS bookName, b.cover_path, b.is_public, ub.party_id, ub.state_data,
           COALESCE(b.series_number, p.series_number) AS series_number,
           p.id AS parentBookId, p.name AS parentBookName, p.cover_path AS parentCoverPath, p.is_public AS parentIsPublic,
           COALESCE(s.id, ps.id) AS seriesId, COALESCE(s.name, ps.name) AS seriesName,
           COALESCE(s.is_public, ps.is_public, 0) AS seriesIsPublic
    FROM xp_events e
    JOIN users u ON e.user_id = u.id
    JOIN books b ON CAST(e.ref AS INTEGER) = b.id
    LEFT JOIN books p   ON p.id  = b.parent_book_id
    LEFT JOIN series s  ON s.id  = b.series_id
    LEFT JOIN series ps ON ps.id = p.series_id
    LEFT JOIN user_books ub ON ub.user_id = e.user_id AND ub.book_id = CAST(e.ref AS INTEGER)
    WHERE e.event = 'first_win' AND e.created_at > ? AND u.hide_from_feed = 0
  `).all(cutoffSec);
  for (const row of firstWinRows) {
    const winSeriesIdParam = _seriesIdParam(row.seriesId);
    const winRunRef   = _getFirstRunRef.get(row.userId, 'win_run', row.bookId, winSeriesIdParam, winSeriesIdParam)?.ref;
    const winRunIndex = _resolveRunIndex(row.state_data, _runKeyFromRef(winRunRef));
    // The XP/achievement itself is permanent (deleting a run never revokes
    // XP already earned - same policy as everywhere else in this file), but
    // the feed entry announcing it shouldn't outlive the run it's about: if
    // the run no longer resolves in current state (winRunIndex null - the
    // player deleted it), there's nothing left to link to or show a path
    // for, so skip the entry entirely rather than showing a dangling,
    // unclickable "won for the first time" with no run behind it.
    if (winRunIndex == null) continue;
    const winPathInfo  = _runPathInfo(row.state_data, winRunIndex);
    const runIsPublic  = winRunRef ? !!_hasShareRun.get(row.userId, 'share_run', winRunRef) : false;
    entries.push({ type: 'first_win', username: row.username, bookName: row.bookName,
      bookId: parseInt(row.bookId, 10), userId: row.userId, completedAt: row.created_at * 1000,
      runIndex: winRunIndex, runIsPublic,
      pathLength: winPathInfo.pathLength, lastSection: winPathInfo.lastSection,
      bookIsPublic: row.is_public === 1, userPublicProfile: row.public_profile === 1,
      isAuthor: row.is_author === 1, isContributor: row.is_contributor === 1, displayName: row.display_name || null,
      userLevel: computeLevel(row.xp || 0), userTitle: getTitleForLevel(computeLevel(row.xp || 0)),
      parentBookId: row.parentBookId || null, parentBookName: row.parentBookName || null,
      parentCoverUrl: row.parentCoverPath ? `/covers/${row.parentCoverPath}` : null,
      seriesId: row.seriesId || null, seriesName: row.seriesName || null, seriesNumber: row.series_number || null,
      seriesIsPublic: row.seriesIsPublic === 1, parentBookIsPublic: row.parentIsPublic === 1,
      avatarUrl: row.avatar_path ? `/avatars/${row.avatar_path}` : null,
      coverUrl:  row.cover_path  ? `/covers/${row.cover_path}`  : null,
      partyId: row.party_id || null });
  }

  // ── First loss / first battle death (per book) ───────────────────────────
  for (const type of ['first_loss', 'first_battle_death']) {
    const deathEvent = type === 'first_loss' ? 'death_run' : 'battle_run';
    const rows = db.prepare(`
      SELECT e.created_at, e.ref AS bookId, e.user_id, u.id AS userId, u.username, u.public_profile, u.avatar_path, u.xp,
             u.is_author, u.is_contributor, u.display_name,
             b.name AS bookName, b.cover_path, b.is_public,
             p.id AS parentBookId, p.name AS parentBookName, p.cover_path AS parentCoverPath,
             s.id AS seriesId, s.name AS seriesName, s.is_public AS seriesIsPublic,
             b.series_number, ub.state_data
      FROM xp_events e
      JOIN users u ON e.user_id = u.id
      JOIN books b ON b.id = CAST(e.ref AS INTEGER)
      LEFT JOIN books p       ON p.id  = b.parent_book_id
      LEFT JOIN series s      ON s.id  = b.series_id
      LEFT JOIN user_books ub ON ub.user_id = e.user_id AND ub.book_id = CAST(e.ref AS INTEGER)
      WHERE e.event = ? AND e.created_at > ? AND u.hide_from_feed = 0
    `).all(type, cutoffSec);
    for (const row of rows) {
      const deathSeriesIdParam = _seriesIdParam(row.seriesId);
      const runRef   = _getFirstRunRef.get(row.user_id, deathEvent, row.bookId, deathSeriesIdParam, deathSeriesIdParam)?.ref;
      const runIndex = _resolveRunIndex(row.state_data, _runKeyFromRef(runRef));
      // Same reasoning as first_win above - don't show a dangling entry for
      // a run that's since been deleted from the player's own state.
      if (runIndex == null) continue;
      let runIsPublic = false;
      if (runIndex != null && row.state_data) {
        try {
          const st = JSON.parse(row.state_data);
          const stPreRuns = st.preSeriesRuns || [];
          const stPt = runIndex < 0 ? stPreRuns[stPreRuns.length + runIndex] : st.playthroughs?.[runIndex];
          runIsPublic = !!stPt?.isPublic;
        } catch {}
      }
      const deathPathInfo = _runPathInfo(row.state_data, runIndex);
      entries.push({ type, username: row.username, userId: row.userId,
        bookId: parseInt(row.bookId, 10), bookName: row.bookName,
        bookIsPublic: row.is_public === 1,
        runIndex, runIsPublic,
        pathLength: deathPathInfo.pathLength, lastSection: deathPathInfo.lastSection,
        completedAt: row.created_at * 1000,
        userPublicProfile: row.public_profile === 1,
        isAuthor: row.is_author === 1, isContributor: row.is_contributor === 1, displayName: row.display_name || null,
        userLevel: computeLevel(row.xp || 0), userTitle: getTitleForLevel(computeLevel(row.xp || 0)),
        parentBookId: row.parentBookId || null, parentBookName: row.parentBookName || null,
        parentCoverUrl: row.parentCoverPath ? `/covers/${row.parentCoverPath}` : null,
        seriesId: row.seriesId || null, seriesName: row.seriesName || null, seriesNumber: row.series_number || null,
        seriesIsPublic: row.seriesIsPublic === 1,
        avatarUrl: row.avatar_path ? `/avatars/${row.avatar_path}` : null,
        coverUrl:  row.cover_path  ? `/covers/${row.cover_path}`  : null });
    }
  }

  // ── Won all books in series ────────────────────────────────────────────────
  const wonAllSeriesRows = db.prepare(`
    SELECT e.ref AS seriesId, e.created_at, u.username, u.public_profile, u.avatar_path, u.xp,
           u.is_author, u.is_contributor, u.display_name,
           s.name AS seriesName, s.id AS sid, s.is_public AS seriesIsPublic
    FROM xp_events e
    JOIN users u ON e.user_id = u.id
    JOIN series s ON s.id = CAST(e.ref AS INTEGER)
    WHERE e.event = 'won_all_series' AND e.created_at > ? AND u.hide_from_feed = 0
  `).all(cutoffSec);
  for (const row of wonAllSeriesRows) {
    entries.push({ type: 'won_all_series', username: row.username,
      seriesId: parseInt(row.seriesId, 10), seriesName: row.seriesName,
      seriesIsPublic: row.seriesIsPublic === 1,
      completedAt: row.created_at * 1000, userPublicProfile: row.public_profile === 1,
      isAuthor: row.is_author === 1, isContributor: row.is_contributor === 1, displayName: row.display_name || null,
      userLevel: computeLevel(row.xp || 0), userTitle: getTitleForLevel(computeLevel(row.xp || 0)),
      avatarUrl: row.avatar_path ? `/avatars/${row.avatar_path}` : null });
  }

  // ── Won all books in anthology ─────────────────────────────────────────────
  const wonAllAnthRows = db.prepare(`
    SELECT e.ref AS anthologyId, e.created_at, u.username, u.public_profile, u.avatar_path, u.xp,
           u.is_author, u.is_contributor, u.display_name,
           b.name AS bookName, b.cover_path, b.is_public
    FROM xp_events e
    JOIN users u ON e.user_id = u.id
    JOIN books b ON b.id = CAST(e.ref AS INTEGER)
    WHERE e.event = 'won_all_anthology' AND e.created_at > ? AND u.hide_from_feed = 0
  `).all(cutoffSec);
  for (const row of wonAllAnthRows) {
    entries.push({ type: 'won_all_anthology', username: row.username,
      bookId: parseInt(row.anthologyId, 10), bookName: row.bookName,
      bookIsPublic: row.is_public === 1, completedAt: row.created_at * 1000,
      userPublicProfile: row.public_profile === 1,
      isAuthor: row.is_author === 1, isContributor: row.is_contributor === 1, displayName: row.display_name || null,
      userLevel: computeLevel(row.xp || 0), userTitle: getTitleForLevel(computeLevel(row.xp || 0)),
      avatarUrl: row.avatar_path ? `/avatars/${row.avatar_path}` : null,
      coverUrl:  row.cover_path  ? `/covers/${row.cover_path}`  : null });
  }

  // ── Visit/discover all - series & anthology ────────────────────────────────
  for (const [event, type] of [['visit_all_series','visit_all_series'],['discover_all_series','discover_all_series']]) {
    const rows = db.prepare(`
      SELECT e.ref AS seriesId, e.created_at, u.username, u.public_profile, u.avatar_path, u.xp,
             u.is_author, u.is_contributor, u.display_name,
             s.name AS seriesName, s.is_public AS seriesIsPublic
      FROM xp_events e
      JOIN users u ON e.user_id = u.id
      JOIN series s ON s.id = CAST(e.ref AS INTEGER)
      WHERE e.event = ? AND e.created_at > ? AND u.hide_from_feed = 0
    `).all(event, cutoffSec);
    for (const row of rows) {
      entries.push({ type, username: row.username,
        seriesId: parseInt(row.seriesId, 10), seriesName: row.seriesName,
        seriesIsPublic: row.seriesIsPublic === 1,
        completedAt: row.created_at * 1000, userPublicProfile: row.public_profile === 1,
        isAuthor: row.is_author === 1, isContributor: row.is_contributor === 1, displayName: row.display_name || null,
        userLevel: computeLevel(row.xp || 0), userTitle: getTitleForLevel(computeLevel(row.xp || 0)),
        avatarUrl: row.avatar_path ? `/avatars/${row.avatar_path}` : null });
    }
  }
  for (const [event, type] of [['visit_all_anthology','visit_all_anthology'],['discover_all_anthology','discover_all_anthology']]) {
    const rows = db.prepare(`
      SELECT e.ref AS anthologyId, e.created_at, u.username, u.public_profile, u.avatar_path, u.xp,
             u.is_author, u.is_contributor, u.display_name,
             b.name AS bookName, b.cover_path, b.is_public
      FROM xp_events e
      JOIN users u ON e.user_id = u.id
      JOIN books b ON b.id = CAST(e.ref AS INTEGER)
      WHERE e.event = ? AND e.created_at > ? AND u.hide_from_feed = 0
    `).all(event, cutoffSec);
    for (const row of rows) {
      entries.push({ type, username: row.username,
        bookId: parseInt(row.anthologyId, 10), bookName: row.bookName,
        bookIsPublic: row.is_public === 1, completedAt: row.created_at * 1000,
        userPublicProfile: row.public_profile === 1,
        isAuthor: row.is_author === 1, isContributor: row.is_contributor === 1, displayName: row.display_name || null,
        userLevel: computeLevel(row.xp || 0), userTitle: getTitleForLevel(computeLevel(row.xp || 0)),
        avatarUrl: row.avatar_path ? `/avatars/${row.avatar_path}` : null,
        coverUrl:  row.cover_path  ? `/covers/${row.cover_path}`  : null });
    }
  }

  // ── Party formed ──────────────────────────────────────────────────────────
  const partyFormedRows = db.prepare(`
    SELECT e.ref AS partyId, e.created_at, u.username, u.public_profile, u.avatar_path, u.xp,
           bp.book_id AS bookId, b.name AS bookName, b.cover_path, b.is_public,
           s.id AS seriesId, s.name AS seriesName
    FROM xp_events e
    JOIN users u ON e.user_id = u.id
    JOIN book_parties bp ON bp.id = CAST(e.ref AS INTEGER)
    JOIN books b ON b.id = bp.book_id
    LEFT JOIN series s ON s.id = b.series_id
    WHERE e.event = 'party_formed' AND e.created_at > ? AND u.hide_from_feed = 0
  `).all(cutoffSec);
  const _getPartyMembers = db.prepare(`
    SELECT u.username, u.avatar_path, u.public_profile, u.xp, u.is_author, u.is_contributor, u.display_name
    FROM user_books ub JOIN users u ON u.id = ub.user_id
    WHERE ub.party_id = ? ORDER BY ub.id
  `);
  for (const row of partyFormedRows) {
    const members = _getPartyMembers.all(parseInt(row.partyId, 10));
    if (members.length < 2) continue; // party disbanded
    entries.push({ type: 'party_formed',
      username: members[0].username,
      usernames: members.map(m => ({
        username: m.username, avatarUrl: m.avatar_path ? `/avatars/${m.avatar_path}` : null,
        userPublicProfile: m.public_profile === 1,
        isAuthor: m.is_author === 1, isContributor: m.is_contributor === 1, displayName: m.display_name || null,
        userLevel: computeLevel(m.xp || 0), userTitle: getTitleForLevel(computeLevel(m.xp || 0)),
      })),
      bookId: parseInt(row.bookId, 10), bookName: row.bookName,
      bookIsPublic: row.is_public === 1, completedAt: row.created_at * 1000,
      userPublicProfile: members[0].public_profile === 1,
      isAuthor: members[0].is_author === 1, isContributor: members[0].is_contributor === 1, displayName: members[0].display_name || null,
      userLevel: computeLevel(members[0].xp || 0),
      userTitle: getTitleForLevel(computeLevel(members[0].xp || 0)),
      avatarUrl: members[0].avatar_path ? `/avatars/${members[0].avatar_path}` : null,
      coverUrl:  row.cover_path ? `/covers/${row.cover_path}` : null,
      seriesId: row.seriesId || null, seriesName: row.seriesName || null });
  }

  // ── User joins ────────────────────────────────────────────────────────────
  const joinRows = db.prepare(`
    SELECT u.id, u.username, u.avatar_path, u.public_profile, u.xp, u.hide_from_feed,
           u.created_at, u.join_template_id, u.is_author, u.is_contributor, u.display_name
    FROM users u
    WHERE u.hide_from_feed = 0 AND u.created_at > ?
    ORDER BY u.created_at ASC
  `).all(cutoffSec);
  for (const row of joinRows) {
    const tmplRow = row.join_template_id != null
      ? db.prepare('SELECT template FROM join_templates WHERE id = ?').get(row.join_template_id)
      : null;
    const joinTemplate = tmplRow?.template || getRandomJoinTemplate();
    entries.push({ type: 'user_joined', username: row.username,
      joinTemplate,
      completedAt: row.created_at * 1000,
      userPublicProfile: row.public_profile === 1,
      isAuthor: row.is_author === 1, isContributor: row.is_contributor === 1, displayName: row.display_name || null,
      userLevel: computeLevel(row.xp || 0),
      userTitle: getTitleForLevel(computeLevel(row.xp || 0)),
      avatarUrl: row.avatar_path ? `/avatars/${row.avatar_path}` : null });
  }

  // ── Announcements ─────────────────────────────────────────────────────────
  const annRows = db.prepare(
    'SELECT id, title, body, published_at FROM announcements WHERE is_draft = 0 AND pinned = 0 AND published_at >= ?'
  ).all(cutoffSec);
  for (const row of annRows) {
    entries.push({ type: 'announcement', id: row.id, title: row.title, body: row.body,
      completedAt: row.published_at * 1000 });
  }

  // ── Merge party run entries ──────────────────────────────────────────────────
  // Group run_started / run_completed / first_win entries by (partyId, bookId, runIndex)
  // and collapse party members into a single entry with combined usernames.
  const mergeTypes = new Set(['run_started', 'run_completed', 'all_visited', 'all_discovered', 'first_win']);
  const partyGroups = new Map(); // key → first entry
  const partyExtra  = new Map(); // key → additional { username, avatarUrl, userPublicProfile }[]
  const toRemove    = new Set();

  for (const e of entries) {
    if (!e.partyId || !mergeTypes.has(e.type)) continue;
    const key = `${e.partyId}:${e.bookId}:${e.runIndex ?? ''}:${e.type}`;
    if (!partyGroups.has(key)) {
      partyGroups.set(key, e);
      partyExtra.set(key, []);
    } else {
      partyExtra.get(key).push({ username: e.username, avatarUrl: e.avatarUrl, userPublicProfile: e.userPublicProfile, isAuthor: e.isAuthor, isContributor: e.isContributor, displayName: e.displayName, userLevel: e.userLevel ?? 0, userTitle: e.userTitle || '' });
      toRemove.add(e);
    }
  }
  // Attach combined usernames to the surviving entry
  for (const [key, base] of partyGroups) {
    const extras = partyExtra.get(key);
    if (extras.length > 0) {
      base.usernames = [{ username: base.username, avatarUrl: base.avatarUrl, userPublicProfile: base.userPublicProfile, isAuthor: base.isAuthor, isContributor: base.isContributor, displayName: base.displayName, userLevel: base.userLevel ?? 0, userTitle: base.userTitle || '' }, ...extras];
    }
  }

  // ── Merge achievement entries (won_all_anthology / won_all_series) ───────────
  // No partyId on these - merge any users who achieved the same thing in the feed window.
  const achievementTypes = new Set(['won_all_anthology', 'won_all_series']);
  const achGroups = new Map();
  for (const e of entries) {
    if (!achievementTypes.has(e.type) || toRemove.has(e)) continue;
    const key = `${e.bookId ?? e.seriesId}:${e.type}`;
    if (!achGroups.has(key)) {
      achGroups.set(key, e);
    } else {
      const base = achGroups.get(key);
      if (!base.usernames) {
        base.usernames = [{ username: base.username, avatarUrl: base.avatarUrl, userPublicProfile: base.userPublicProfile, isAuthor: base.isAuthor, isContributor: base.isContributor, displayName: base.displayName, userLevel: base.userLevel ?? 0, userTitle: base.userTitle || '' }];
      }
      base.usernames.push({ username: e.username, avatarUrl: e.avatarUrl, userPublicProfile: e.userPublicProfile, isAuthor: e.isAuthor, isContributor: e.isContributor, displayName: e.displayName, userLevel: e.userLevel ?? 0, userTitle: e.userTitle || '' });
      toRemove.add(e);
    }
  }

  // Suppress run_completed entries already represented by a first_win/first_loss/first_battle_death entry.
  const firstWinKeys   = new Set();
  const firstLossKeys  = new Set();
  const firstBatKeys   = new Set();
  for (const e of entries) {
    if (toRemove.has(e)) continue;
    const k = `${e.username}:${e.bookId}:${e.runIndex ?? ''}`;
    if (e.type === 'first_win')          firstWinKeys.add(k);
    else if (e.type === 'first_loss')    firstLossKeys.add(k);
    else if (e.type === 'first_battle_death') firstBatKeys.add(k);
  }
  for (const e of entries) {
    // series_run_completed carries the end book's own bookId/runIndex (see
    // _seriesRunBook above) in exactly the same shape run_completed does, so
    // it needs the identical suppression - was missing entirely, so an
    // open-world run's first win/loss showed up twice: once as "won series
    // run N" and again as "won for the first time".
    if (toRemove.has(e) || (e.type !== 'run_completed' && e.type !== 'series_run_completed')) continue;
    const k = `${e.username}:${e.bookId}:${e.runIndex ?? ''}`;
    if      (e.result === 'success' && firstWinKeys.has(k))  toRemove.add(e);
    else if (e.result === 'death'   && firstLossKeys.has(k)) toRemove.add(e);
    else if (e.result === 'battle'  && firstBatKeys.has(k))  toRemove.add(e);
  }

  const merged = entries.filter(e => !toRemove.has(e));
  merged.sort((a, b) => b.completedAt - a.completedAt);
  return merged;
}

function setPublicProfile(userId, value) {
  db.prepare("UPDATE users SET public_profile = ? WHERE id = ?").run(value ? 1 : 0, userId);
}

function setHideFromFeed(userId, value) {
  db.prepare("UPDATE users SET hide_from_feed = ? WHERE id = ?").run(value ? 1 : 0, userId);
}

function setAuthor(userId, value) {
  db.prepare("UPDATE users SET is_author = ? WHERE id = ?").run(value ? 1 : 0, userId);
  if (value) _insertNotif.run(userId, 'role_assigned', JSON.stringify({ role: 'author', label: 'Author' }));
}

function setContributor(userId, value) {
  db.prepare("UPDATE users SET is_contributor = ? WHERE id = ?").run(value ? 1 : 0, userId);
  if (value) _insertNotif.run(userId, 'role_assigned', JSON.stringify({ role: 'contributor', label: 'Contributor' }));
}

function setPdfAccess(userId, value) {
  db.prepare("UPDATE users SET pdf_access = ? WHERE id = ?").run(value ? 1 : 0, userId);
}

function setDisplayName(userId, value) {
  db.prepare("UPDATE users SET display_name = ? WHERE id = ?").run(value?.trim() || null, userId);
}

function getPublicProfile(username) {
  const user = db.prepare("SELECT id, username, avatar_path, public_profile, is_author, is_contributor, display_name FROM users WHERE username = ?").get(username);
  if (!user || !user.public_profile) return null;

  const bookRows = db.prepare(`
    SELECT b.id, b.name, b.created_by, b.parent_book_id, b.is_container, ub.state_data
    FROM user_books ub JOIN books b ON b.id = ub.book_id
    WHERE ub.user_id = ? AND b.is_demo = 0
  `).all(user.id);

  const rootRows     = bookRows.filter(b => !b.parent_book_id);
  const totalBooks   = rootRows.length;
  const createdBooks = rootRows.filter(b => b.created_by === user.id).length;

  // Resolve anthology names for child books
  const parentIds = [...new Set(bookRows.filter(r => r.parent_book_id).map(r => r.parent_book_id))];
  const parentNames = new Map();
  if (parentIds.length) {
    const ph = parentIds.map(() => '?').join(',');
    for (const p of db.prepare(`SELECT id, name FROM books WHERE id IN (${ph})`).all(...parentIds))
      parentNames.set(p.id, p.name);
  }

  // Group runs: child books aggregate under their parent anthology
  const groupMap = new Map();
  for (const row of bookRows) {
    if (row.is_container) continue;
    let s; try { s = JSON.parse(row.state_data); } catch { continue; }
    const mapRun = (pt, i) => ({
      index:       i,
      bookId:      row.id,
      chapterName: row.parent_book_id ? row.name : null,
      result:      pt.result,
      completedAt: pt.completedAt || null,
      isPublic:    pt.isPublic || false,
      pathLength:  (pt.path || []).length,
      lastSection: pt.path && pt.path.length ? pt.path[pt.path.length - 1] : null,
    });
    // preSeriesRuns (migratePreSeriesRuns) holds runs that pre-date a book's
    // series turning open-world - still real, playable-back runs, just moved
    // out of playthroughs so open-world's own run-slot indexing isn't
    // disturbed. Indexed negative here (matching play.js's own "Run -N"
    // display convention for these) so getPublicRun can tell which array a
    // given index came from without an extra flag.
    const preRuns = s.preSeriesRuns || [];
    const runs = [
      ...(s.playthroughs || []).map(mapRun),
      ...preRuns.map((pt, i) => mapRun(pt, -(preRuns.length - i))),
    ].filter(r => r.result === 'death' || r.result === 'success' || r.result === 'battle');
    if (!runs.length) continue;
    const groupId   = row.parent_book_id || row.id;
    const groupName = row.parent_book_id ? (parentNames.get(row.parent_book_id) || row.name) : row.name;
    if (!groupMap.has(groupId)) groupMap.set(groupId, { id: groupId, name: groupName, runs: [] });
    groupMap.get(groupId).runs.push(...runs);
  }

  const books = [...groupMap.values()];
  for (const book of books) book.runs.sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));
  books.sort((a, b) => (b.runs[0]?.completedAt || 0) - (a.runs[0]?.completedAt || 0));

  const xpInfo = getUserXpInfo(user.id);
  return {
    username:      user.username,
    displayName:   user.display_name || null,
    isAuthor:      user.is_author === 1,
    isContributor: user.is_contributor === 1,
    userId:        user.id,
    avatarUrl:     user.avatar_path ? `/avatars/${user.avatar_path}` : null,
    level:         xpInfo.level,
    title:         xpInfo.title,
    totalBooks,
    createdBooks,
    books,
  };
}

function getProfileStats(userId) {
  const bookRows = db.prepare(`
    SELECT b.id, b.created_by, b.parent_book_id, ub.state_data
    FROM user_books ub JOIN books b ON b.id = ub.book_id
    WHERE ub.user_id = ? AND b.is_demo = 0
  `).all(userId);
  // Root-level only (anthology children excluded) - matches getPublicProfile's
  // counting convention, where an anthology counts as one book regardless of
  // how many of its children the user has added.
  const rootRows      = bookRows.filter(b => !b.parent_book_id);
  const totalBooks    = rootRows.length;
  const createdBooks  = rootRows.filter(b => b.created_by === userId).length;
  let booksPlayed = 0, totalRuns = 0, wins = 0, deaths = 0, battles = 0;
  for (const row of bookRows) {
    let s; try { s = JSON.parse(row.state_data); } catch { continue; }
    // preSeriesRuns holds runs that pre-date a book's series turning open-world
    // (migratePreSeriesRuns) - still real, played-out runs, just moved out of
    // playthroughs so open-world's own run-slot indexing isn't disturbed. They
    // should still count here.
    const allRuns = [...(s.playthroughs || []), ...(s.preSeriesRuns || [])];
    const completed = allRuns.filter(pt => pt.result === 'death' || pt.result === 'success' || pt.result === 'battle');
    if (completed.length) booksPlayed++;
    totalRuns += completed.length;
    wins    += completed.filter(pt => pt.result === 'success').length;
    deaths  += completed.filter(pt => pt.result === 'death').length;
    battles += completed.filter(pt => pt.result === 'battle').length;
  }
  return { totalBooks, createdBooks, booksPlayed, totalRuns, wins, deaths, battles };
}

function getPublicCovers() {
  return db.prepare(
    `SELECT id, name, isbn, issn, asin, cover_path, created_at, published_at
     FROM books
     WHERE cover_path IS NOT NULL AND is_demo = 0 AND is_public = 1
       AND (parent_book_id IS NULL OR parent_book_id = 0)
     ORDER BY RANDOM()`
  ).all().map(r => ({ id: r.id, name: r.name, isbn: r.isbn || null, issn: r.issn || null, asin: r.asin || null, coverUrl: `/covers/${r.cover_path}`, createdAt: r.published_at || r.created_at || 0 }));
}

function getBooksForSitemap() {
  return db.prepare(
    'SELECT id, updated_at FROM books WHERE is_demo = 0 AND is_public = 1 AND parent_book_id IS NULL AND is_container = 0 ORDER BY id'
  ).all();
}

function getAnthologiesForSitemap() {
  return db.prepare(
    'SELECT id, updated_at FROM books WHERE is_demo = 0 AND is_public = 1 AND is_container = 1 ORDER BY id'
  ).all();
}

function getSeriesForSitemap() {
  return db.prepare(
    'SELECT id, created_at FROM series WHERE is_public = 1 ORDER BY id'
  ).all();
}

function getPublicProfilesForSitemap() {
  return db.prepare(
    'SELECT username FROM users WHERE public_profile = 1 ORDER BY id'
  ).all();
}

function getPublicBookMeta(bookId) {
  const row = db.prepare(
    `SELECT b.id, b.name, b.description, b.authors, b.cover_path, b.total_sections,
            b.isbn, b.issn, b.asin, b.pages, b.is_container,
            p.id AS parentId, p.name AS parentName, p.cover_path AS parentCoverPath
     FROM books b
     LEFT JOIN books p ON p.id = b.parent_book_id
     WHERE b.id = ? AND b.is_demo = 0
       AND (b.is_public = 1
            OR EXISTS (SELECT 1 FROM books pp WHERE pp.id = b.parent_book_id AND pp.is_public = 1))`
  ).get(bookId);
  if (!row) return null;
  const result = {
    id:            row.id,
    name:          row.name,
    description:   row.description || null,
    authors:       row.authors || null,
    coverUrl:      row.cover_path ? `/covers/${row.cover_path}` : null,
    totalSections: row.total_sections,
    isbn:          row.isbn  || null,
    issn:          row.issn  || null,
    asin:          row.asin  || null,
    pages:         row.pages || null,
    isContainer:   row.is_container === 1,
    parentId:      row.parentId   || null,
    parentName:    row.parentName || null,
  };
  if (result.isContainer) {
    result.children = db.prepare(
      'SELECT id, name, total_sections, book_order FROM books WHERE parent_book_id = ? AND is_demo = 0'
    ).all(bookId).sort((a, b) => {
      const aOrder = a.book_order;
      const bOrder = b.book_order;
      const aHas = aOrder != null;
      const bHas = bOrder != null;
      if (aHas && bHas && aOrder !== bOrder) return aOrder - bOrder;
      if (aHas !== bHas) return aHas ? -1 : 1;
      return _naturalCompare(a.name, b.name);
    }).map(({ book_order, ...child }) => child);
  }
  return result;
}

function getAllPublicBooks() {
  const rows = db.prepare(
    `SELECT b.id, b.name, b.cover_path, b.created_at, b.published_at, b.authors,
            b.is_container, b.total_sections, b.description,
            b.isbn, b.issn, b.asin, b.pages,
            b.series_id, b.series_number, s.name AS series_name,
            GROUP_CONCAT(c.name, '|||') AS child_names,
            GROUP_CONCAT(c.id) AS child_ids,
            COALESCE(SUM(c.total_sections), 0) AS children_total_sections,
            COUNT(DISTINCT ub.user_id) AS library_count
     FROM books b
     LEFT JOIN books c ON c.parent_book_id = b.id AND c.is_demo = 0
     LEFT JOIN series s ON s.id = b.series_id
     LEFT JOIN user_books ub ON ub.book_id = b.id
     WHERE b.is_demo = 0
       AND (b.parent_book_id IS NULL OR b.parent_book_id = 0)
       AND (
         b.is_public = 1
         OR EXISTS (SELECT 1 FROM books ch WHERE ch.parent_book_id = b.id AND ch.is_public = 1)
       )
     GROUP BY b.id`
  ).all();
  return rows.map(r => ({
    id: r.id, name: r.name,
    coverUrl: r.cover_path ? `/covers/${r.cover_path}` : null,
    createdAt: ((r.published_at || r.created_at || 0) * 1000),
    authors: r.authors || null,
    isContainer: r.is_container ? true : false,
    totalSections: r.is_container ? (r.children_total_sections || 0) : (r.total_sections || 0),
    libraryCount: r.library_count || 0,
    description: r.description || null,
    isbn: r.isbn || null,
    issn: r.issn || null,
    asin: r.asin || null,
    pages: r.pages || null,
    seriesId: r.series_id || null,
    seriesName: r.series_name || null,
    seriesNumber: r.series_number || null,
    childNames: r.child_names ? r.child_names.split('|||') : [],
    childIds: r.child_ids ? r.child_ids.split(',').map(Number) : [],
  }));
}

function getPublicBooksInSeries(seriesId) {
  // Direct books in series + public children of anthology containers in the series
  return db.prepare(`
    SELECT b.id FROM books b
    WHERE b.is_demo = 0 AND b.is_public = 1
      AND (
        b.series_id = ?
        OR EXISTS (
          SELECT 1 FROM books p
          WHERE p.id = b.parent_book_id AND p.series_id = ? AND p.is_demo = 0
        )
      )
  `).all(seriesId, seriesId);
}

function getAllPublicSeries() {
  return db.prepare(`
    SELECT s.id, s.name, s.description, s.is_open_world, s.created_at, s.published_at,
           COUNT(DISTINCT b.id) AS book_count,
           COALESCE(SUM(
             CASE WHEN b.is_container = 1
               THEN (SELECT COALESCE(SUM(c.total_sections), 0) FROM books c WHERE c.parent_book_id = b.id AND c.is_demo = 0)
               ELSE b.total_sections
             END
           ), 0) AS total_sections,
           COUNT(DISTINCT us.user_id) AS library_count
    FROM series s
    LEFT JOIN books b ON b.series_id = s.id AND b.is_demo = 0
    LEFT JOIN user_series us ON us.series_id = s.id
    WHERE s.is_public = 1
    GROUP BY s.id
  `).all().map(r => ({
    ...r,
    is_open_world: !!r.is_open_world,
    createdAt: ((r.published_at || r.created_at || 0) * 1000),
    total_sections: r.total_sections || 0,
    library_count: r.library_count || 0,
  })).sort(_naturalCompareByName);
}

function getAllPublicAnthologies() {
  return db.prepare(`
    SELECT b.id, b.name, b.cover_path, b.authors, b.description,
           COUNT(c.id) AS child_count
    FROM books b
    LEFT JOIN books c ON c.parent_book_id = b.id AND c.is_demo = 0
    WHERE b.is_container = 1 AND b.is_public = 1 AND b.is_demo = 0
    GROUP BY b.id
  `).all().map(r => ({
    id: r.id, name: r.name,
    coverUrl: r.cover_path ? `/covers/${r.cover_path}` : null,
    authors: r.authors || null,
    description: r.description || null,
    childCount: r.child_count,
  })).sort(_naturalCompareByName);
}


function getBookActivity(bookId) {
  const book = db.prepare(
    `SELECT b.id, b.name, b.total_sections, b.isbn, b.issn, b.asin, b.cover_path,
            b.pages, b.authors, b.description, b.is_public, b.is_container,
            COALESCE(b.series_number, p.series_number) AS series_number,
            p.id AS parentId, p.name AS parentName,
            COALESCE(s.id,  ps.id)   AS seriesId,
            COALESCE(s.name, ps.name) AS seriesName
     FROM books b
     LEFT JOIN books p   ON p.id  = b.parent_book_id
     LEFT JOIN series s  ON s.id  = b.series_id
     LEFT JOIN series ps ON ps.id = p.series_id
     WHERE b.id = ?`
  ).get(bookId);
  if (!book) return null;

  // Group by book_id directly (all users tracking this book), or expand to ISBN/ISSN siblings
  const ubRows = book.isbn
    ? db.prepare(
        `SELECT ub.state_data, ub.book_id AS id, b.name,
                u.id AS userId, u.username, u.avatar_path, u.public_profile
         FROM user_books ub
         JOIN books b ON b.id = ub.book_id
         JOIN users u ON u.id = ub.user_id
         WHERE b.isbn = ?`
      ).all(book.isbn)
    : book.issn
    ? db.prepare(
        `SELECT ub.state_data, ub.book_id AS id, b.name,
                u.id AS userId, u.username, u.avatar_path, u.public_profile
         FROM user_books ub
         JOIN books b ON b.id = ub.book_id
         JOIN users u ON u.id = ub.user_id
         WHERE b.issn = ?`
      ).all(book.issn)
    : db.prepare(
        `SELECT ub.state_data, ub.book_id AS id, b.name,
                u.id AS userId, u.username, u.avatar_path, u.public_profile
         FROM user_books ub
         JOIN books b ON b.id = ub.book_id
         JOIN users u ON u.id = ub.user_id
         WHERE ub.book_id = ?`
      ).all(bookId);

  const entries = [];
  for (const row of ubRows) {
    let s; try { s = JSON.parse(row.state_data); } catch { continue; }
    const runs = [];
    for (let i = 0; i < (s.playthroughs || []).length; i++) {
      const pt = s.playthroughs[i];
      if (!pt.completed || !pt.isPublic) continue;
      runs.push({ runIndex: i, result: pt.result, completedAt: pt.completedAt || null });
    }
    // preSeriesRuns (migratePreSeriesRuns) - same negative-index convention
    // as getPublicProfile/getPublicRun, so these are still reachable here too.
    const preRuns = s.preSeriesRuns || [];
    for (let i = 0; i < preRuns.length; i++) {
      const pt = preRuns[i];
      if (!pt.completed || !pt.isPublic) continue;
      runs.push({ runIndex: -(preRuns.length - i), result: pt.result, completedAt: pt.completedAt || null });
    }
    runs.sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));
    if (!runs.length) continue;
    entries.push({
      bookId:        row.id,
      bookName:      row.name,
      userId:        row.userId,
      username:      row.username,
      avatarUrl:     row.avatar_path ? `/avatars/${row.avatar_path}` : null,
      publicProfile: row.public_profile === 1,
      runs,
    });
  }
  entries.sort((a, b) => (b.runs[0]?.completedAt || 0) - (a.runs[0]?.completedAt || 0));
  const isContainer = book.is_container === 1;
  const children = isContainer
    ? db.prepare('SELECT id, name, total_sections FROM books WHERE parent_book_id = ? AND is_demo = 0 ORDER BY book_order IS NULL, book_order, name').all(bookId)
    : [];
  return {
    book: {
      id:            book.id,
      name:          book.name,
      totalSections: book.total_sections,
      coverUrl:      book.cover_path ? `/covers/${book.cover_path}` : null,
      isbn:          book.isbn        || null,
      issn:          book.issn        || null,
      asin:          book.asin        || null,
      pages:         book.pages       || null,
      authors:       book.authors     || null,
      description:   book.description || null,
      isPublic:      book.is_public === 1,
      isContainer,
      parentId:      book.parentId    || null,
      parentName:    book.parentName  || null,
      seriesId:      book.seriesId    || null,
      seriesName:    book.seriesName  || null,
      seriesNumber:  book.series_number || null,
      children,
      ..._getAggregateRating(book.id),
      authorRatings: _getAuthorRatings(book.authors),
    },
    entries,
  };
}

// Shared by getPublicRun/getPublicSeriesRun: the plain single-graph run
// viewer (no journey segmentation, no per-segment result badge) - used both
// for non-open-world books and for an open-world run that never actually
// crossed a portal (journey.length === 1), since forcing that case through
// the journey UI showed a lone, disconnected-looking result pill with no
// portal transitions around it to give it context.
function _standardRunView(bookName, st, runIndex, pt) {
  const allVisited = new Set();
  (st.playthroughs || []).forEach(p => {
    (p.path || []).forEach(n => { if (n >= 1) allVisited.add(n); });
  });
  const endNodes = [];
  (st.playthroughs || []).forEach((p, i) => {
    if (i === runIndex) return;
    if (!p.completed || !p.path || !p.path.length) return;
    endNodes.push({ id: p.path[p.path.length - 1], result: p.result });
  });
  return {
    bookName,
    graph:         st.graph     || {},
    positions:     st.positions || {},
    totalSections: st.totalSections || 0,
    allVisited:    [...allVisited],
    endNodes,
    startSection:  pt.path?.[0] ?? null,
    // Positive runs display as "Run N" (1-based); pre-series runs display as
    // "Run -N" (already negative, see getPublicProfile) - no +1 offset for those.
    run: { path: pt.path, result: pt.result, completedAt: pt.completedAt || null, runNumber: runIndex < 0 ? runIndex : runIndex + 1 }
  };
}

function getPublicRun(bookId, userId, runIndex) {
  const row = db.prepare(
    `SELECT ub.state_data, b.name, b.series_id, u.public_profile
     FROM user_books ub
     JOIN books b ON b.id = ub.book_id
     JOIN users u ON u.id = ub.user_id
     WHERE ub.book_id = ? AND ub.user_id = ?`
  ).get(bookId, userId);
  if (!row) return null;
  let s; try { s = JSON.parse(row.state_data); } catch { return null; }
  // Negative runIndex means a preSeriesRuns entry (see getPublicProfile) -
  // these never went through open-world series-run tracking at all, so they
  // skip straight to the plain pt.isPublic check below.
  const isPreSeries = runIndex < 0;
  const preRuns = s.preSeriesRuns || [];
  const pt = isPreSeries ? preRuns[preRuns.length + runIndex] : (s.playthroughs || [])[runIndex];
  if (!pt || !pt.completed) return null;

  // For open world series: series_runs.is_public is the source of truth
  let owPublicVerified = false;
  if (!isPreSeries && row.series_id) {
    const series = db.prepare('SELECT is_open_world, name FROM series WHERE id = ?').get(row.series_id);
    if (series?.is_open_world) {
      const sr = db.prepare(
        'SELECT is_public FROM series_runs WHERE user_id=? AND series_id=? AND run_index=?'
      ).get(userId, row.series_id, runIndex);
      if (!sr?.is_public) return null;
      owPublicVerified = true; // don't re-check pt.isPublic below

      // Collect the multi-book journey sorted by startedAt
      const seriesBooks = db.prepare(`
        SELECT b.id, b.name, ub.state_data
        FROM books b
        JOIN user_books ub ON ub.book_id = b.id AND ub.user_id = ?
        WHERE b.series_id = ? AND b.is_public = 1
        ORDER BY b.book_order, b.id
      `).all(userId, row.series_id);

      const journey = [];
      for (const sb of seriesBooks) {
        let st; try { st = JSON.parse(sb.state_data); } catch { continue; }
        const spt = (st.playthroughs || [])[runIndex];
        if (!spt?.path?.length) continue;
        journey.push({
          bookId:      sb.id,
          bookName:    sb.name,
          path:        spt.path,
          result:      spt.result,
          startedAt:   spt.startedAt || 0,
          portalTarget: spt.portalTarget || null,
          graph:       st.graph     || {},
          positions:   st.positions || {},
          startSection: spt.path?.[0] ?? null,
        });
      }
      journey.sort((a, b) => a.startedAt - b.startedAt);

      if (journey.length > 1) {
        const finalSeg = journey[journey.length - 1];
        return {
          isOpenWorld:   true,
          seriesName:    series.name,
          bookName:      row.name,
          run:           { result: finalSeg.result, runNumber: runIndex + 1,
                           completedAt: pt.completedAt || null },
          journey,
        };
      }
      // Single-book open world run - fall through to standard single-book view
    }
  }

  if (!owPublicVerified && !pt.isPublic) return null;

  return _standardRunView(row.name, s, runIndex, pt);
}

function getPublicSeriesRun(seriesId, userId, runIndex) {
  const series = db.prepare('SELECT id, name, is_open_world, is_public FROM series WHERE id = ?').get(seriesId);
  if (!series?.is_open_world || !series.is_public) return null;
  const sr = db.prepare(
    'SELECT is_public FROM series_runs WHERE user_id=? AND series_id=? AND run_index=?'
  ).get(userId, seriesId, runIndex);
  if (!sr?.is_public) return null;

  const seriesBooks = db.prepare(`
    SELECT b.id, b.name, ub.state_data
    FROM books b
    JOIN user_books ub ON ub.book_id = b.id AND ub.user_id = ?
    WHERE b.series_id = ? AND b.is_public = 1
    ORDER BY b.book_order, b.id
  `).all(userId, seriesId);

  const journey = [];
  const statesByBookId = new Map();
  for (const sb of seriesBooks) {
    let st; try { st = JSON.parse(sb.state_data); } catch { continue; }
    const spt = (st.playthroughs || [])[runIndex];
    if (!spt?.path?.length) continue;
    statesByBookId.set(sb.id, { st, spt, bookName: sb.name });
    journey.push({
      bookId:       sb.id,
      bookName:     sb.name,
      path:         spt.path,
      result:       spt.result,
      startedAt:    spt.startedAt || 0,
      portalTarget: spt.portalTarget || null,
      graph:        st.graph     || {},
      positions:    st.positions || {},
      startSection: spt.path?.[0] ?? null,
    });
  }
  journey.sort((a, b) => a.startedAt - b.startedAt);
  if (!journey.length) return null;

  // A run that never actually crossed a portal (journey.length === 1) falls
  // through to the same plain single-graph view non-open-world runs use -
  // see _standardRunView's comment for why the journey UI looks wrong here.
  if (journey.length === 1) {
    const { st, spt, bookName } = statesByBookId.get(journey[0].bookId);
    return _standardRunView(bookName, st, runIndex, spt);
  }

  const finalSeg = journey[journey.length - 1];
  return {
    isOpenWorld: true,
    seriesName:  series.name,
    bookName:    journey[0].bookName,
    run:         { result: finalSeg.result, runNumber: runIndex + 1, completedAt: null },
    journey,
  };
}


module.exports = {
  getFeed,
  setPublicProfile, setHideFromFeed, setAuthor, setContributor, setPdfAccess, setDisplayName,
  getPublicProfile, getProfileStats,
  getPublicCovers, getBooksForSitemap, getAnthologiesForSitemap, getSeriesForSitemap, getPublicProfilesForSitemap,
  getPublicBookMeta, getAllPublicBooks, getPublicBooksInSeries, getAllPublicSeries, getAllPublicAnthologies,
  getBookActivity, getPublicRun, getPublicSeriesRun,
};
