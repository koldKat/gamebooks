'use strict';

// Book/library route handlers: books, stashes, series (incl. runs/characters),
// public-catalog/feed/user/app-xp SSE streams, book CRUD, ratings, notebook,
// export, state save/load, and party (Play Together) routes.

const db = require('../db');
const {
  authenticate, send, readBody, getClientIp, tokenFromReq, isLocalhost, isRequestImpersonating,
} = require('../request-helpers');
const {
  sseRegister, sseUnregister, ssePush,
  publicCatalogRegister, publicCatalogUnregister, publicCatalogPush,
  feedRegister, feedUnregister, feedPush,
  appXpRegister, appXpUnregister,
  userBadgeRegister, userBadgeUnregister, userBadgePush, userBadgePushAll,
} = require('../sse');
const { SSE_PING_MS } = require('../request-helpers');
const { buildFullExportZip, buildBookExportZip, safeFilename } = require('../export');

// ── Book handlers ─────────────────────────────────────────────────────────────

async function handleGetBooks(req, res) {
  const userId = await authenticate(req, res);
  if (userId === null) return;
  send(res, 200, db.getBooks(userId));
}

async function handleGetStashes(req, res) {
  const userId = await authenticate(req, res);
  if (userId === null) return;
  send(res, 200, db.getStashes(userId));
}

async function handleCreateStash(req, res) {
  const userId = await authenticate(req, res);
  if (userId === null) return;
  const { name, book_ids, series_ids, excluded_book_ids } = await readBody(req);
  const result = db.createStash(userId, name, book_ids || [], series_ids || [], excluded_book_ids || []);
  if (!result?.ok) return send(res, 400, { error: result?.error || 'invalid stash' });
  send(res, 200, { ok: true, id: result.id });
}

async function handleDeleteStash(req, res, stashId) {
  const userId = await authenticate(req, res);
  if (userId === null) return;
  if (!db.deleteStash(userId, stashId)) return send(res, 404, { error: 'not found' });
  send(res, 200, { ok: true });
}

async function handleUpdateStash(req, res, stashId) {
  const userId = await authenticate(req, res);
  if (userId === null) return;
  const { name, book_ids, series_ids, excluded_book_ids } = await readBody(req);
  const result = db.updateStash(userId, stashId, name, book_ids || [], series_ids || [], excluded_book_ids || []);
  if (!result?.ok) return send(res, result?.error === 'not found' ? 404 : 400, { error: result?.error || 'invalid stash' });
  send(res, 200, { ok: true });
}

async function handleGetSeries(req, res) {
  const userId = await authenticate(req, res);
  if (userId === null) return;
  return send(res, 200, db.getAllSeries(userId));
}

async function handleUpdateSeries(req, res, seriesId) {
  const userId = await authenticate(req, res);
  if (userId === null) return;
  const series = db.getSeriesById(seriesId);
  if (!series) return send(res, 404, { error: 'not found' });
  const isAdmin = !!db.isUserAdmin(userId);
  if (series.created_by !== userId && !isAdmin) return send(res, 403, { error: 'only the creator can edit this series' });
  const { name, description, is_public, is_open_world } = await readBody(req);
  const owArg = is_open_world !== undefined ? !!is_open_world : null;
  if (!db.updateSeries(seriesId, name, description, !!is_public, owArg)) return send(res, 400, { error: 'name required' });
  send(res, 200, { ok: true });
  if (!series.description && description?.trim()) db.awardXp(userId, 'add_series_description', seriesId);
  if (!series.is_public && is_public === true) db.awardXp(userId, 'make_series_public', seriesId);
  if (!series.is_open_world && owArg === true) {
    db.awardXp(userId, 'series_open_world', seriesId);
    db.migratePreSeriesRuns(seriesId);
  } else if (series.is_open_world && owArg === false) {
    db.reverseSeriesOpenWorld(seriesId);
  }
  if (series.is_public || is_public === true) publicCatalogPush({ type: 'public_catalog_changed', entity: 'series', id: seriesId, action: 'update' });
  feedPush({ type: 'feed_changed', entity: 'series', action: 'update', id: seriesId });
}

async function handleGetSeriesCharacter(req, res, seriesId) {
  const userId = await authenticate(req, res);
  if (userId === null) return;
  const series = db.getSeriesById(seriesId);
  if (!series || !series.is_open_world) return send(res, 404, { error: 'not found or not open world' });
  send(res, 200, db.getSeriesCharacter(userId, seriesId));
}

async function handleSaveSeriesCharacter(req, res, seriesId) {
  const userId = await authenticate(req, res);
  if (userId === null) return;
  const series = db.getSeriesById(seriesId);
  if (!series || !series.is_open_world) return send(res, 404, { error: 'not found or not open world' });
  const { char_data } = await readBody(req);
  if (!char_data || typeof char_data !== 'object') return send(res, 400, { error: 'char_data required' });
  db.saveSeriesCharacter(userId, seriesId, char_data);
  send(res, 200, { ok: true });
}

async function handleGetSeriesRuns(req, res, seriesId) {
  const userId = await authenticate(req, res);
  if (userId === null) return;
  const series = db.getSeriesById(seriesId);
  if (!series || !series.is_open_world) return send(res, 404, { error: 'not found or not open world' });
  send(res, 200, db.getSeriesRuns(userId, seriesId));
}

async function handleCreateSeriesRun(req, res, seriesId) {
  const userId = await authenticate(req, res);
  if (userId === null) return;
  const series = db.getSeriesById(seriesId);
  if (!series || !series.is_open_world) return send(res, 404, { error: 'not found or not open world' });
  const run_index = db.createSeriesRun(userId, seriesId);
  send(res, 200, { run_index });
  if (series.is_public) feedPush({ type: 'feed_changed', entity: 'series', action: 'run_started', id: seriesId });
}

async function handleUpdateSeriesRun(req, res, seriesId, runIndex) {
  const userId = await authenticate(req, res);
  if (userId === null) return;
  const series = db.getSeriesById(seriesId);
  if (!series || !series.is_open_world) return send(res, 404, { error: 'not found or not open world' });
  const body = await readBody(req);
  if (body.char_data && typeof body.char_data === 'object') {
    db.updateSeriesRun(userId, seriesId, runIndex, body.char_data);
  }
  if (body.completed === true && typeof body.result === 'string') {
    db.completeSeriesRun(userId, seriesId, runIndex, body.result);
  }
  if (body.is_public !== undefined) {
    db.updateSeriesRunPublic(userId, seriesId, runIndex, !!body.is_public);
  }
  send(res, 200, { ok: true });
  if ((body.completed === true || body.is_public !== undefined) && series.is_public)
    feedPush({ type: 'feed_changed', entity: 'series', action: 'run_updated', id: seriesId });
}

async function handleGetActiveSeriesRuns(req, res) {
  const userId = await authenticate(req, res);
  if (userId === null) return;
  send(res, 200, db.getActiveSeriesRunsForUser(userId));
}

async function handleResetSeriesForUser(req, res, seriesId) {
  const userId = await authenticate(req, res);
  if (userId === null) return;
  const series = db.getSeriesById(seriesId);
  if (!series || !series.is_open_world) return send(res, 404, { error: 'not found or not open world' });
  const bookIds = db.resetSeriesForUser(userId, seriesId);
  for (const bookId of bookIds) feedPush({ type: 'feed_changed', entity: 'book', action: 'reset', id: bookId });
  send(res, 200, { ok: true, bookIds });
}

async function handleDeleteSeriesRun(req, res, seriesId, runIndex) {
  const userId = await authenticate(req, res);
  if (userId === null) return;
  const series = db.getSeriesById(seriesId);
  if (!series || !series.is_open_world) return send(res, 404, { error: 'not found or not open world' });
  db.deleteSeriesRun(userId, seriesId, runIndex);
  db.patchSeriesRunDeletion(userId, seriesId, runIndex);
  send(res, 200, { ok: true });
}

async function handleDeleteSeries(req, res, seriesId) {
  const userId = await authenticate(req, res);
  if (userId === null) return;
  const series = db.getSeriesById(seriesId);
  if (!series) return send(res, 404, { error: 'not found' });
  const cascade = new URL(req.url, 'http://x').searchParams.get('cascade') !== '0';
  if (cascade) {
    db.removeSeriesFromLibrary(userId, seriesId); // removes series + cascade books
  } else {
    // Remove only the user_series row - leave all books in library as standalones
    db.removeSeriesEntryOnly(userId, seriesId);
  }
  // Transfer ownership if the remover was the creator
  if (series.created_by === userId) {
    const next = db.getNextSeriesUser(seriesId);
    if (next) {
      db.transferSeriesOwnership(seriesId, next.user_id);
    } else {
      // No remaining series owner: turn any remaining books into standalones
      // and remove the now-ownerless series row instead of leaving a ghost
      // series discoverable globally.
      db.deleteSeries(seriesId);
    }
  }
  send(res, 200, { ok: true });
  if (series.is_public) publicCatalogPush({ type: 'public_catalog_changed', entity: 'series', id: seriesId, action: 'delete' });
  feedPush({ type: 'feed_changed', entity: 'series', action: 'delete', id: seriesId });
}

async function handleCreateSeries(req, res) {
  const userId = await authenticate(req, res);
  if (userId === null) return;
  const { name, description, is_public } = await readBody(req);
  if (!name?.trim()) return send(res, 400, { error: 'name required' });
  const result = db.createSeries(name.trim(), description, userId, !!is_public);
  if (!result) return send(res, 400, { error: 'invalid name' });
  send(res, 200, { id: result.id, name: result.name, existed: result.existed });
  if (!result.existed) db.awardXp(userId, 'create_series', result.id);
  if (!result.existed && description?.trim()) db.awardXp(userId, 'add_series_description', result.id);
  if (!result.existed && is_public === true) db.awardXp(userId, 'make_series_public', result.id);
  if (!result.existed && is_public === true) publicCatalogPush({ type: 'public_catalog_changed', entity: 'series', id: result.id, action: 'create' });
  if (!result.existed) feedPush({ type: 'feed_changed', entity: 'series', action: 'create', id: result.id });
}

async function handleAddSeriesToLibrary(req, res, seriesId, query) {
  const userId = await authenticate(req, res);
  if (userId === null) return;
  const series = db.getSeriesById(seriesId);
  if (!series) return send(res, 404, { error: 'not found' });
  db.addSeriesToLibrary(userId, seriesId);
  // XP for the series creator
  if (series.created_by && series.created_by !== userId)
    db.awardXp(series.created_by, 'series_added_by_other', `${seriesId}:${userId}`);
  let added = 0;
  if (query?.cascade === '1') {
    const publicBooks = db.getPublicBooksInSeries(seriesId);
    for (const book of publicBooks) {
      const result = db.addBookToLibrary(userId, book.id);
      if (result.ok) added++;
    }
  }
  send(res, 200, { ok: true, added });
  feedPush({ type: 'feed_changed', entity: 'series', action: 'library_add', id: seriesId });
}

async function handleGetPublicSeriesInfo(req, res, seriesId) {
  const data = db.getPublicSeriesInfo(seriesId);
  if (!data) return send(res, 404, { error: 'not found' });
  send(res, 200, data);
}

async function handleGetPublicCatalogStream(req, res) {
  req.socket?.setNoDelay?.(true);
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(': connected\n\n');

  publicCatalogRegister(res);
  const ping = setInterval(() => { try { res.write(': ping\n\n'); } catch (_) {} }, SSE_PING_MS);
  req.on('close', () => { clearInterval(ping); publicCatalogUnregister(res); });
}

async function handleGetFeedStream(req, res) {
  req.socket?.setNoDelay?.(true);
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(': connected\n\n');

  feedRegister(res);
  const ping = setInterval(() => { try { res.write(': ping\n\n'); } catch (_) {} }, SSE_PING_MS);
  req.on('close', () => { clearInterval(ping); feedUnregister(res); });
}

async function handleGetUserStream(req, res) {
  const qToken = new URL(req.url, 'https://x').searchParams.get('token');
  const token = qToken || tokenFromReq(req);
  if (!token) return send(res, 401, { error: 'Unauthorized' });
  const session = db.getSession(token);
  if (!session) return send(res, 401, { error: 'Unauthorized' });
  const userId = session.user_id;

  req.socket?.setNoDelay?.(true);
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(': connected\n\n');

  userBadgeRegister(userId, res);
  const ping = setInterval(() => { try { res.write(': ping\n\n'); } catch (_) {} }, SSE_PING_MS);
  req.on('close', () => { clearInterval(ping); userBadgeUnregister(userId, res); });
}

async function handleGetAppXpStream(req, res) {
  const qToken = new URL(req.url, 'https://x').searchParams.get('token');
  const token = qToken || tokenFromReq(req);
  if (!token) return send(res, 401, { error: 'Unauthorized' });
  const session = db.getSession(token);
  if (!session) return send(res, 401, { error: 'Unauthorized' });
  if (!db.isUserAdmin(session.user_id)) return send(res, 403, { error: 'Admin only' });

  req.socket?.setNoDelay?.(true);
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(': connected\n\n');

  appXpRegister(res);
  const ping = setInterval(() => { try { res.write(': ping\n\n'); } catch (_) {} }, SSE_PING_MS);
  req.on('close', () => { clearInterval(ping); appXpUnregister(res); });
}

async function handleCreateBook(req, res) {
  const userId = await authenticate(req, res);
  if (userId === null) return;
  const { name, total_sections, isbn, issn, asin, pages, authors, description,
          series_name, series_number, is_container, parent_book_id, book_order, is_public } = await readBody(req);
  const isContainer = !!is_container;
  const isPublic = is_public === true;
  if (!name?.trim() || (!isContainer && !(total_sections >= 5)))
    return send(res, 400, { error: 'name required; total_sections minimum 5 (unless anthology)' });
  const seriesId = series_name ? db.getOrCreateSeries(series_name, userId, true) : null;
  const book = db.createBook(userId, name.trim(), isContainer ? 0 : (total_sections || 0),
    isbn || null, issn || null, asin || null, pages || null, authors || null, description || null,
    seriesId, series_number || null, isContainer, parent_book_id || null, book_order ?? null, isPublic);
  send(res, 200, book);
  db.awardXp(userId, 'add_book',        book.id);
  if (isbn)        db.awardXp(userId, 'add_isbn',        book.id);
  if (issn)        db.awardXp(userId, 'add_issn',        book.id);
  if (asin)        db.awardXp(userId, 'add_asin',        book.id);
  if (pages)       db.awardXp(userId, 'add_pages',       book.id);
  if (authors)     db.awardXp(userId, 'add_authors',     book.id);
  if (description) db.awardXp(userId, 'add_description', book.id);
  if (isPublic) db.awardXp(userId, 'make_book_public', book.id);
  if (seriesId)    db.awardXp(userId, 'add_book_to_series', book.id);
  if (seriesId && series_number) db.awardXp(userId, 'add_series_number', book.id);
  if (parent_book_id) db.awardXp(userId, 'add_book_to_anthology', book.id);
  if (parent_book_id && book_order != null) db.awardXp(userId, 'add_anthology_order', book.id);
  if (isPublic) publicCatalogPush({ type: 'public_catalog_changed', entity: 'book', id: book.id, action: 'create' });
  feedPush({ type: 'feed_changed', entity: 'book', action: 'create', id: book.id });
}

async function handleUpdateBook(req, res, bookId) {
  const fromLocalhost = isLocalhost(req);
  let userId = null;
  if (fromLocalhost) {
    // Admin panel: find the protected user to act as admin
    const adminUser = db.getUserByUsername('koldKat');
    userId = adminUser?.id ?? null;
  } else {
    userId = await authenticate(req, res);
    if (userId === null) return;
  }
  const { name, total_sections, isbn, issn, asin, pages, authors, description, discoverable_sections, is_public,
          series_name, series_number, is_container, parent_book_id, book_order } = await readBody(req);
  const isContainer = !!is_container;
  if (!name?.trim() || (!isContainer && !(total_sections >= (fromLocalhost ? 1 : 5))))
    return send(res, 400, { error: 'name and total_sections (minimum 5) required' });
  if (discoverable_sections != null) {
    if (!Number.isInteger(discoverable_sections) || discoverable_sections < 1)
      return send(res, 400, { error: 'discoverable_sections must be a positive integer' });
    if (discoverable_sections > total_sections)
      return send(res, 400, { error: 'discoverable_sections cannot exceed total_sections' });
    const stateObj = db.getBookState(userId, bookId);
    if (stateObj) {
      const disc = db._discoveredSet(stateObj.graph || {});
      const vis  = db._visitedSet(stateObj.playthroughs || []);
      const minAllowed = Math.max(disc.size, vis.size);
      if (discoverable_sections < minAllowed)
        return send(res, 400, { error: `discoverable_sections cannot be less than ${minAllowed}` });
    }
  }
  const isAdmin = fromLocalhost || !!db.isUserAdmin(userId);
  const old = db.getBookIdentifiers(isAdmin ? null : userId, bookId);
  const cur = db.getBookContainerFields(bookId);
  const seriesId = series_name !== undefined
    ? (series_name ? db.getOrCreateSeries(series_name, userId) : null)
    : (cur?.series_id ?? null);
  const resolvedSeriesNumber  = series_number  !== undefined ? (series_number  || null) : (cur?.series_number  ?? null);
  const resolvedIsContainer   = is_container   !== undefined ? !!is_container            : !!(cur?.is_container);
  const resolvedParentBookId  = parent_book_id !== undefined ? (parent_book_id || null)  : (cur?.parent_book_id ?? null);
  const resolvedBookOrder     = book_order     !== undefined ? (book_order     ?? null)  : (cur?.book_order    ?? null);
  if (!db.updateBook(userId, bookId, name.trim(), resolvedIsContainer ? 0 : (total_sections || 0),
      isbn || null, issn || null, asin || null, pages || null, authors || null, description || null,
      discoverable_sections ?? null, is_public === true, isAdmin,
      seriesId, resolvedSeriesNumber, resolvedIsContainer, resolvedParentBookId, resolvedBookOrder))
    return send(res, 404, { error: 'Not found' });
  db._pruneRedundantAnthologyMembership(bookId, resolvedParentBookId);
  send(res, 200, { ok: true });
  // XP always goes to the book's creator, not the requester (admin may edit others' books)
  if (!old.isbn        && isbn)               db.awardXp(userId, 'add_isbn',          bookId);
  if (!old.issn        && issn)               db.awardXp(userId, 'add_issn',          bookId);
  if (!old.asin        && asin)               db.awardXp(userId, 'add_asin',          bookId);
  if (!old.pages       && pages)              db.awardXp(userId, 'add_pages',         bookId);
  if (!old.authors     && authors)            db.awardXp(userId, 'add_authors',       bookId);
  if (!old.description && description)        db.awardXp(userId, 'add_description',   bookId);
  if (!old.is_public   && is_public === true) db.awardXp(userId, 'make_book_public',  bookId);
  if (!cur?.series_id  && seriesId)           db.awardXp(userId, 'add_book_to_series', bookId);
  if ((!cur?.series_number || cur.series_number === '') && seriesId && resolvedSeriesNumber) db.awardXp(userId, 'add_series_number', bookId);
  if (!cur?.parent_book_id && resolvedParentBookId) db.awardXp(userId, 'add_book_to_anthology', bookId);
  if (cur?.book_order == null && resolvedParentBookId && resolvedBookOrder != null) db.awardXp(userId, 'add_anthology_order', bookId);
  if (old?.is_public || is_public === true) publicCatalogPush({ type: 'public_catalog_changed', entity: 'book', id: bookId, action: 'update' });
  feedPush({ type: 'feed_changed', entity: 'book', action: 'update', id: bookId });
}

async function handleAddAnthologyMember(req, res, anthologyId) {
  const fromLocalhost = isLocalhost(req);
  let userId = null;
  if (fromLocalhost) {
    const adminUser = db.getUserByUsername('koldKat');
    userId = adminUser?.id ?? null;
  } else {
    userId = await authenticate(req, res);
    if (userId === null) return;
  }
  const isAdmin = fromLocalhost || !!db.isUserAdmin(userId);
  const { book_id, book_order } = await readBody(req);
  const result = db.addAnthologyMember(userId, anthologyId, book_id, book_order, isAdmin);
  if (result?.error) return send(res, result.error === 'forbidden' ? 403 : 400, { error: result.error });
  send(res, 200, { ok: true });
  // XP always goes to the book's creator, not the requester (the anthology's
  // creator may be adding someone else's book) - same rule as handleUpdateBook.
  // Both events reuse the primary-anthology XP events, but with a ref scoped
  // to this specific anthology (`bookId:anthologyId`) rather than bare bookId -
  // the primary attachment already claimed the bare-bookId ref, so reusing it
  // here would silently no-op for any book that's ever had a primary anthology
  // (i.e. almost always), paying zero XP for secondary memberships entirely.
  const xpRef = `${book_id}:${anthologyId}`;
  if (result.isNew && result.bookCreatedBy) db.awardXp(result.bookCreatedBy, 'add_book_to_anthology', xpRef);
  if (result.bookOrderSet && result.bookCreatedBy) db.awardXp(result.bookCreatedBy, 'add_anthology_order', xpRef);
  feedPush({ type: 'feed_changed', entity: 'book', action: 'update', id: anthologyId });
}

async function handleRemoveAnthologyMember(req, res, anthologyId, bookId) {
  const fromLocalhost = isLocalhost(req);
  let userId = null;
  if (fromLocalhost) {
    const adminUser = db.getUserByUsername('koldKat');
    userId = adminUser?.id ?? null;
  } else {
    userId = await authenticate(req, res);
    if (userId === null) return;
  }
  const isAdmin = fromLocalhost || !!db.isUserAdmin(userId);
  const result = db.removeAnthologyMember(userId, anthologyId, bookId, isAdmin);
  if (result?.error) return send(res, result.error === 'forbidden' ? 403 : 400, { error: result.error });
  send(res, 200, { ok: true });
  feedPush({ type: 'feed_changed', entity: 'book', action: 'update', id: anthologyId });
}

async function handleDeleteBook(req, res, bookId) {
  const userId  = await authenticate(req, res);
  if (userId === null) return;
  const old = db.getBookIdentifiers(userId, bookId);
  const cascade = new URL(req.url, 'http://x').searchParams.get('cascade') !== '0';
  if (!db.deleteBook(userId, bookId, cascade)) return send(res, 404, { error: 'Not found' });
  send(res, 200, { ok: true });
  if (old?.is_public) publicCatalogPush({ type: 'public_catalog_changed', entity: 'book', id: bookId, action: 'delete' });
  feedPush({ type: 'feed_changed', entity: 'book', action: 'delete', id: bookId });
}

async function handleAddBookToLibrary(req, res, bookId) {
  const userId = await authenticate(req, res);
  if (userId === null) return;
  const result = db.addBookToLibrary(userId, bookId);
  if (!result.ok) {
    if (result.reason === 'already_in_library') return send(res, 409, { error: 'Already in your library' });
    return send(res, 404, { error: 'Book not found or not public' });
  }
  send(res, 200, { ok: true });
  feedPush({ type: 'feed_changed', entity: 'book', action: 'library_add', id: bookId });
}

async function handleGetBookRating(req, res, bookId) {
  const userId = await authenticate(req, res);
  if (userId === null) return;
  const result = db.getBookRating(userId, bookId);
  if (result === null) return send(res, 404, { error: 'Not in your library' });
  send(res, 200, result);
}

async function handleSetBookRating(req, res, bookId) {
  const userId = await authenticate(req, res);
  if (userId === null) return;
  const { rating } = await readBody(req);
  if (rating !== null && (typeof rating !== 'number' || ![0.5,1,1.5,2,2.5,3,3.5,4,4.5,5].includes(rating)))
    return send(res, 400, { error: 'Invalid rating' });
  const result = db.setBookRating(userId, bookId, rating ?? null);
  if (!result) return send(res, 404, { error: 'Not in your library' });
  if (result.blocked) return send(res, 403, { error: 'Complete a run first' });
  send(res, 200, { rating: rating ?? null, xpAwarded: result.xpAwarded, avgRating: result.avgRating, voteCount: result.voteCount });
  // getFeed's book_rated block always reads the CURRENT rating live from user_books,
  // not a snapshot from when the feed entry's xp_event fired - so re-rating or
  // clearing a rating changes what an existing feed entry shows even though it
  // doesn't create a new one. Push on every change, not just the first (xpAwarded),
  // so connected clients actually see that update instead of a stale rating.
  feedPush({ type: 'feed_changed', entity: 'book', action: 'rated', id: bookId });
}

async function handleGetSeriesRating(req, res, seriesId) {
  const userId = await authenticate(req, res);
  if (userId === null) return;
  const result = db.getSeriesRating(userId, seriesId);
  if (!result) return send(res, 404, { error: 'Not in your library' });
  send(res, 200, result);
}

async function handleSetSeriesRating(req, res, seriesId) {
  const userId = await authenticate(req, res);
  if (userId === null) return;
  const { rating } = await readBody(req);
  if (rating !== null && (typeof rating !== 'number' || ![0.5,1,1.5,2,2.5,3,3.5,4,4.5,5].includes(rating)))
    return send(res, 400, { error: 'Invalid rating' });
  const result = db.setSeriesRating(userId, seriesId, rating ?? null);
  if (!result) return send(res, 404, { error: 'Not in your library' });
  if (result.blocked) return send(res, 403, { error: 'Complete all books first' });
  send(res, 200, { rating: rating ?? null, xpAwarded: result.xpAwarded, avgRating: result.avgRating, voteCount: result.voteCount });
  // Same reasoning as handleSetBookRating above - the feed reads the live rating,
  // so push on every change, not just the first.
  feedPush({ type: 'feed_changed', entity: 'series', action: 'rated', id: seriesId });
}

async function handleSetBookBgPref(req, res, bookId) {
  const userId = await authenticate(req, res);
  if (userId === null) return;
  const { hidden, pos_y } = await readBody(req);
  db.setBookBgPref(userId, bookId, !!hidden, pos_y ?? 50);
  send(res, 200, { ok: true });
}

async function handleGetNotebook(req, res, bookId) {
  const userId = await authenticate(req, res);
  if (userId === null) return;
  const text = db.getNotebook(userId, bookId);
  if (text === null) return send(res, 404, { error: 'Not in your library' });
  send(res, 200, { text });
}

async function handleSetNotebook(req, res, bookId) {
  const userId = await authenticate(req, res);
  if (userId === null) return;
  const { text, ptIdx } = await readBody(req);
  if (typeof text !== 'string') return send(res, 400, { error: 'Invalid text' });
  if (text.length > 100000) return send(res, 400, { error: 'Notebook too large' });
  if (!db.setNotebook(userId, bookId, text)) return send(res, 404, { error: 'Not in your library' });
  let xpAwarded = false;
  if (typeof ptIdx === 'number' && ptIdx >= 0) {
    // startedAt-based, not the raw array index - a deleted run's old slot can be reused
    // by an unrelated later run, and an index-based ref would collide with the deleted
    // run's leftover xp_events row, silently blocking the new run's legitimate award.
    // Same fix already applied to death_run/win_run/battle_run/share_run/
    // charsheet_saved/charsheet_run/add_charsheet_field - this one was missed then.
    const bookState = db.getBookState(userId, bookId);
    const startedAt = bookState?.playthroughs?.[ptIdx]?.startedAt;
    const ref = `${bookId}:${startedAt ?? ptIdx}`;
    xpAwarded = db.awardXp(userId, 'notebook_saved', ref);
  }
  send(res, 200, { ok: true, xpAwarded });
}

async function handleExportAll(req, res) {
  const userId = await authenticate(req, res);
  if (userId === null) return;
  const user  = db.getUserById(userId);
  const books = db.getAllBooksForExport(userId);
  const items = db.getActiveItemsMeta();
  const date  = new Date().toISOString().slice(0, 10);
  // Graph snapshots (graph.svg) are generated server-side from each book's saved state -
  // see buildGraphSvg in server/export.js.
  const zip   = buildFullExportZip(user.username, books, items);
  db.awardXp(userId, 'export_all', '0');
  res.writeHead(200, { 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="gamebooks-export-${date}.zip"` });
  res.end(zip);
}

async function handleExportBook(req, res, bookId) {
  const userId = await authenticate(req, res);
  if (userId === null) return;
  const user = db.getUserById(userId);
  const book = db.getBookForExport(userId, bookId);
  if (!book) return send(res, 404, { error: 'Not found' });
  const items = db.getActiveItemsMeta();
  const zip   = buildBookExportZip(user.username, book, items);
  db.awardXp(userId, 'export_book', String(bookId));
  const safeName  = safeFilename(book.name, `book-${book.id}`);
  const encodedFn = encodeURIComponent(`${safeName}.zip`);
  res.writeHead(200, { 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename*=UTF-8''${encodedFn}` });
  res.end(zip);
}

async function handleGetState(req, res, bookId) {
  const userId = await authenticate(req, res);
  if (userId === null) return;
  const state = db.getBookState(userId, bookId);
  if (!state) return send(res, 404, { error: 'Not found' });
  send(res, 200, state);
}

async function handleGetBookEnemies(req, res, bookId) {
  const userId = await authenticate(req, res);
  if (userId === null) return;
  send(res, 200, db.getBookEnemies(bookId));
}

async function handleSaveState(req, res, bookId) {
  const userId = await authenticate(req, res);
  if (userId === null) return;
  const impersonating = isRequestImpersonating(req);
  const stateObj = await readBody(req);
  if (!stateObj || typeof stateObj !== 'object' || Array.isArray(stateObj)) return send(res, 400, { error: 'Invalid state' });
  const oldState = db.getBookState(userId, bookId);
  if (!db.saveBookState(userId, bookId, stateObj, { skipTimestamp: impersonating })) return send(res, 404, { error: 'Not found' });
  send(res, 200, { ok: true });
  // Track current position / completion for open world series.
  // Must scan ALL playthroughs because endPlaythrough clears activePtIndex before saveState runs.
  const bookMeta = db.getBookContainerFields(bookId);
  if (bookMeta?.series_id) {
    const series = db.getSeriesById(bookMeta.series_id);
    if (series?.is_open_world) {
      const oldPts = oldState?.playthroughs || [];
      (stateObj.playthroughs || []).forEach((newPt, i) => {
        const oldPt = oldPts[i];
        const isNowTerminal = newPt.completed && newPt.result !== 'portal';
        const wasTerminal = oldPt?.completed && oldPt?.result !== 'portal';
        // startedAt check guards against a run's completion getting synced
        // (open-world.js) onto a book the run never actually visited - without
        // it, that book's own save looks like a genuine new completion here
        // too and re-awards XP / re-stamps series_runs.completed_at. Not
        // path.length - a since-fixed open-world.js bug could inject a single
        // path entry into an untouched placeholder without ever setting
        // startedAt, which defeated a path.length-only guard.
        if (isNowTerminal && !wasTerminal && newPt.startedAt) {
          // Newly completed - record completion and sync public status
          db.completeSeriesRun(userId, bookMeta.series_id, i, newPt.result);
          db.updateSeriesRunPublic(userId, bookMeta.series_id, i, !!newPt.isPublic);
        } else if (isNowTerminal) {
          // Already completed - sync public status change only
          db.updateSeriesRunPublic(userId, bookMeta.series_id, i, !!newPt.isPublic);
        } else if (!newPt.completed && newPt.path?.length > 0) {
          const lastSec = newPt.path[newPt.path.length - 1];
          db.updateSeriesRunPosition(userId, bookMeta.series_id, i, bookId, lastSec);
        }
      });
    }
  }
  // Same invisibility contract as the skipTimestamp save above - an admin's
  // own actions while impersonating must not earn the impersonated user real
  // XP for something the admin did, not them.
  if (oldState && !impersonating) db.processStateXp(userId, bookId, oldState, stateObj, stateObj.totalSections || 0);
  // Fan out to party members and award them the same XP milestones
  const party = db.getPartyForBook(userId, bookId);
  if (party) {
    const memberIds = db.getPartyMemberIds(party.partyId, userId);
    const memberOldStates = memberIds.map(id => ({ id, old: db.getBookState(id, bookId) }));
    const updatedIds = db.fanOutState(party.partyId, userId, stateObj);
    // Same invisibility contract as the actor's own award above - a state
    // change driven by an admin impersonating the actor must not earn OTHER
    // real party members XP either, since the "progress" behind it isn't real.
    if (!impersonating) {
      for (const { id, old } of memberOldStates) {
        if (old) db.processStateXp(id, bookId, old, stateObj, stateObj.totalSections || 0);
      }
    }
    if (updatedIds.length) ssePush(party.partyId, userId, { type: 'state_updated', by: userId, bookId });
  }
  // Only push when something feed-visible actually changed: a run starting or completing.
  // Regular section navigation doesn't add feed entries, so pushing on every save floods SSE.
  const oldPts = oldState?.playthroughs || [];
  const newPts = stateObj.playthroughs || [];
  const feedRelevant = newPts.some((pt, i) => {
    const op = oldPts[i];
    return (pt.startedAt && !op?.startedAt)
        || (pt.completed && !op?.completed)
        || (pt.isPublic && !op?.isPublic && pt.completed);
  });
  if (feedRelevant) feedPush({ type: 'feed_changed', entity: 'book', action: 'state_save', id: bookId });
}

async function handleResetBookProgress(req, res, bookId) {
  const userId = await authenticate(req, res);
  if (userId === null) return;

  const stateObj = db.resetBookProgress(userId, bookId);
  if (!stateObj) return send(res, 404, { error: 'Not found' });
  send(res, 200, stateObj);

  const party = db.getPartyForBook(userId, bookId);
  if (party) {
    const memberIds = db.getPartyMemberIds(party.partyId, userId);
    for (const id of memberIds) db.resetBookProgress(id, bookId);
    const updatedIds = db.fanOutState(party.partyId, userId, stateObj);
    if (updatedIds.length) ssePush(party.partyId, userId, { type: 'state_updated', by: userId, bookId });
  }
  feedPush({ type: 'feed_changed', entity: 'book', action: 'reset', id: bookId });
}

async function handleGetBookStream(req, res, bookId) {
  // EventSource can't set headers - accept token from query string
  const qToken = new URL(req.url, 'https://x').searchParams.get('token');
  const token = qToken || tokenFromReq(req);
  if (!token) return send(res, 401, { error: 'Unauthorized' });
  const session = db.getSession(token);
  if (!session) return send(res, 401, { error: 'Unauthorized' });
  const userId = session.user_id;
  const party = db.getPartyForBook(userId, bookId);
  if (!party) return send(res, 404, { error: 'Not in a party for this book' });

  req.socket?.setNoDelay?.(true);
  res.writeHead(200, {
    'Content-Type':  'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection':    'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(': connected\n\n');

  const entry = sseRegister(party.partyId, userId, res);
  const ping = setInterval(() => { try { res.write(': ping\n\n'); } catch (_) {} }, SSE_PING_MS);
  req.on('close', () => { clearInterval(ping); sseUnregister(party.partyId, entry); });
}

async function handleCreateParty(req, res, bookId) {
  const userId = await authenticate(req, res);
  if (userId === null) return;
  const { usernames } = await readBody(req);
  if (!Array.isArray(usernames) || usernames.length === 0) return send(res, 400, { error: 'usernames required' });

  const result = db.createParty(bookId, userId);
  if (result.error === 'not_tracking') return send(res, 404, { error: 'Book not in your library' });
  if (result.error) return send(res, 400, { error: result.error });

  const errors = [];
  for (const username of usernames) {
    const profile = db.getUserByUsername(username);
    if (!profile) { errors.push({ username, error: 'user_not_found' }); continue; }
    const inv = db.inviteToParty(result.partyId, userId, profile.id);
    if (inv.error) errors.push({ username, error: inv.error });
    else userBadgePush(profile.id);
  }
  send(res, 200, { ok: true, partyId: result.partyId, errors });
}

async function handleInviteToParty(req, res, bookId) {
  const userId = await authenticate(req, res);
  if (userId === null) return;
  const party = db.getPartyForBook(userId, bookId);
  if (!party) return send(res, 404, { error: 'Not in a party for this book' });
  const { username } = await readBody(req);
  if (!username) return send(res, 400, { error: 'username required' });
  const profile = db.getUserByUsername(username);
  if (!profile) return send(res, 404, { error: 'User not found' });
  const result = db.inviteToParty(party.partyId, userId, profile.id);
  if (result.error === 'already_tracking') return send(res, 409, { error: 'User already tracking this book independently' });
  if (result.error === 'already_invited')  return send(res, 409, { error: 'User already has a pending invite' });
  if (result.error) return send(res, 400, { error: result.error });
  send(res, 200, { ok: true });
  userBadgePush(profile.id);
}

async function handleAcceptPartyInvite(req, res, inviteId) {
  const userId = await authenticate(req, res);
  if (userId === null) return;
  // Same invisibility contract as handleSaveState - accepting on an
  // impersonated account must not credit them with the source's real XP.
  const result = db.acceptPartyInvite(inviteId, userId, { skipXp: isRequestImpersonating(req) });
  if (result.error === 'invite_not_found') return send(res, 404, { error: 'Invite not found' });
  if (result.error === 'already_tracking') return send(res, 409, { error: 'You already track this book' });
  if (result.error) return send(res, 400, { error: result.error });
  send(res, 200, { ok: true });
  for (const uid of (result.notifyUserIds || [userId])) userBadgePush(uid);
  if (result.partyId) ssePush(result.partyId, userId, { type: 'party_changed' });
}

async function handleDeclinePartyInvite(req, res, inviteId) {
  const userId = await authenticate(req, res);
  if (userId === null) return;
  const result = db.declinePartyInvite(inviteId, userId);
  if (result.error) return send(res, 404, { error: 'Invite not found' });
  send(res, 200, { ok: true });
  userBadgePush(userId);
}

async function handleLeaveParty(req, res, bookId) {
  const userId = await authenticate(req, res);
  if (userId === null) return;
  const result = db.leaveParty(userId, bookId);
  if (result.error) return send(res, 404, { error: 'Not in a party for this book' });
  send(res, 200, { ok: true });
  if (result.partyId) ssePush(result.partyId, userId, { type: 'party_changed' });
}

async function handleGetParty(req, res, bookId) {
  const userId = await authenticate(req, res);
  if (userId === null) return;
  const party = db.getPartyForBook(userId, bookId);
  if (!party) return send(res, 200, { party: null });
  send(res, 200, { party });
}

async function handleGetPendingInvites(req, res) {
  const userId = await authenticate(req, res);
  if (userId === null) return;
  send(res, 200, { invites: db.getPendingInvites(userId) });
}

async function handleSearchUsers(req, res) {
  const userId = await authenticate(req, res);
  if (userId === null) return;
  const q = new URL(req.url, 'https://x').searchParams.get('q') || '';
  if (q.length < 1) return send(res, 200, { users: [] });
  send(res, 200, { users: db.searchUsers(q, userId) });
}


module.exports = {
  handleAcceptPartyInvite,
  handleAddBookToLibrary,
  handleAddSeriesToLibrary,
  handleCreateBook,
  handleCreateParty,
  handleCreateSeries,
  handleAddAnthologyMember,
  handleCreateSeriesRun,
  handleCreateStash,
  handleDeclinePartyInvite,
  handleDeleteBook,
  handleDeleteSeries,
  handleDeleteSeriesRun,
  handleDeleteStash,
  handleExportAll,
  handleExportBook,
  handleGetActiveSeriesRuns,
  handleGetAppXpStream,
  handleGetBookEnemies,
  handleGetBookRating,
  handleGetBooks,
  handleGetBookStream,
  handleGetFeedStream,
  handleGetNotebook,
  handleGetParty,
  handleGetPendingInvites,
  handleGetPublicCatalogStream,
  handleGetPublicSeriesInfo,
  handleGetSeries,
  handleGetSeriesCharacter,
  handleGetSeriesRating,
  handleGetSeriesRuns,
  handleGetStashes,
  handleGetState,
  handleGetUserStream,
  handleInviteToParty,
  handleLeaveParty,
  handleRemoveAnthologyMember,
  handleResetBookProgress,
  handleResetSeriesForUser,
  handleSaveSeriesCharacter,
  handleSaveState,
  handleSearchUsers,
  handleSetBookBgPref,
  handleSetBookRating,
  handleSetNotebook,
  handleSetSeriesRating,
  handleUpdateBook,
  handleUpdateSeries,
  handleUpdateSeriesRun,
  handleUpdateStash,
};
