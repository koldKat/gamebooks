'use strict';

// Read-only admin canvas watch, behind the localhost gate; never writes or registers player presence.

const db = require('../db');
const { requireLocalhost, send } = require('../request-helpers');

// Use independent admin-watch polling, not the party-scoped SSE registry.
async function handleWatchState(req, res, userId, requestedBookId) {
  if (!requireLocalhost(req, res)) return;
  const user = db.adminGetUser(userId);
  if (!user) return send(res, 404, { error: 'Not found' });

  const meta = db.getBookContainerFields(requestedBookId);
  const series = meta?.series_id ? db.getSeriesById(meta.series_id) : null;
  const isOpenWorld = !!series?.is_open_world;

  // Follow the player's active open-world book, falling back to the requested book when inactive.
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
  // Notebook content is book-level, outside per-run state_data.
  const notebook = db.getNotebook(userId, bookId);
  const bgPref = db.getBookBgPref(userId, bookId);
  // Read canonical text for the resolved active book/section; return null when unavailable.
  const playthroughs = state.playthroughs || [];
  const activePt = state.activePtIndex != null ? playthroughs[state.activePtIndex] : null;
  const path = activePt?.path || [];
  const currentSec = path.length ? path[path.length - 1] : null;
  const section = currentSec != null ? db.getBookSection(bookId, currentSec) : null;
  send(res, 200, { username: user.username, bookId, isOpenWorld, state, items, notebook, bgPref, section, currentSec });
}

module.exports = { handleWatchState };
