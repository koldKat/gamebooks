'use strict';

// Admin-only, read-only "watch a user's live canvas" prototype. Fully separate
// from the player-facing app and from admin.js - nothing here writes anything,
// registers any presence, or is visible to the watched user in any way. Same
// requireLocalhost gate as the rest of the admin panel (see admin.js), not a
// login-based admin check.

const db = require('../db');
const { requireLocalhost, send } = require('../request-helpers');

// Polled by admin/js/watch.js every few seconds - deliberately not push/SSE
// for this prototype, to avoid touching the party SSE registry (keyed by
// partyId, not meant for an arbitrary admin/user/book triple) at all.
async function handleWatchState(req, res, userId, requestedBookId) {
  if (!requireLocalhost(req, res)) return;
  const user = db.adminGetUser(userId);
  if (!user) return send(res, 404, { error: 'Not found' });

  const meta = db.getBookContainerFields(requestedBookId);
  const series = meta?.series_id ? db.getSeriesById(meta.series_id) : null;
  const isOpenWorld = !!series?.is_open_world;

  // Open-world: the player can portal to a different book in the series at
  // any moment - always serve whichever book they're truly active in right
  // now, not whichever one the "Watch" button happened to be clicked from.
  // Falls back to the requested book if nobody's currently active anywhere
  // in the series (they closed it, or haven't started yet).
  let bookId = requestedBookId;
  if (isOpenWorld) {
    const activeBookId = db.getActiveBookInSeries(userId, meta.series_id);
    if (activeBookId) bookId = activeBookId;
  }

  const state = db.getBookState(userId, bookId);
  if (!state) return send(res, 404, { error: 'Not found' });
  // Includes svg_data (unlike getActiveItemsMeta) so the HUD can show the
  // same item icons the real inventory/equipment displays do, not just names.
  const items = db.getActiveItems();
  // The notebook lives in its own user_books.notebook column, not state_data -
  // it's book-level (like graph notes), not tied to any one playthrough, so
  // it's real content worth showing even on a run with an empty charsheet.
  const notebook = db.getNotebook(userId, bookId);
  const bgPref = db.getBookBgPref(userId, bookId);
  send(res, 200, { username: user.username, bookId, isOpenWorld, state, items, notebook, bgPref });
}

module.exports = { handleWatchState };
