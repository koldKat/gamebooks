import { bootState } from './state.js';
import { state, saveState, clearToken, clearUsername, apiFetch, currentBookId, mappedCountFor, discoveredSectionsFor } from '../state.js';
import { render, setDiscoverableLimit } from '../play.js';
import { openEditBookModal, closeEditBookModal, maxSectionInUse } from '../edit-book.js';
import { setCoversPrefsState, resetFeedDisplayPrefsForLogout } from '../covers.js';
import { clearBooksCache, _refreshLibraryUi } from '../books.js';
import { getCurrentBookCover, _updateSidebarBookInfo } from '../bg.js';
import { showLogin, showBooks } from './screens.js';

export function initLibraryBindings() {
  // ── Books screen ──────────────────────────────────────────────────
  document.getElementById('logout-btn').addEventListener('click', async () => {
    await apiFetch('/api/logout', { method: 'POST' }).catch(() => {});
    clearBooksCache();
    localStorage.removeItem('books_list_v1'); localStorage.removeItem('series_list_v1'); localStorage.removeItem('stashes_list_v1');
    clearToken(); clearUsername(); bootState._isAdmin = false; bootState._canSeeAppXp = false; setCoversPrefsState({}); resetFeedDisplayPrefsForLogout(); showLogin();
  });



  // ── Main screen ───────────────────────────────────────────────────
  document.getElementById('back-to-books-btn').addEventListener('click', showBooks);

  document.getElementById('edit-book-btn').addEventListener('click', () => {
    const min      = Math.max(5, maxSectionInUse());
    // Gate on the same two counts shown in the HUD ("Mapped" / "Discovered") rather than
    // a graph-only vs. path-only comparison - a section can be fully recorded (mapped)
    // without ever appearing in a playthrough's path (e.g. filled in manually), which
    // made the old discSet/visSet comparison diverge from what the player actually sees
    // and go by when deciding they've hit a wall.
    const mapped    = mappedCountFor(state.graph);
    const discCount = discoveredSectionsFor(state.graph, state.playthroughs, state.startSection).size;
    const hitWall   = mapped > 0 && mapped === discCount && mapped < state.totalSections;
    openEditBookModal({
      bookId:                      currentBookId,
      initialName:                 state.bookName,
      initialSections:             state.totalSections,
      initialIsbn:                 bootState._currentBook.isbn        || '',
      initialIssn:                 bootState._currentBook.issn        || '',
      initialAsin:                 bootState._currentBook.asin        || '',
      initialCoverUrl:             getCurrentBookCover()  || null,
      initialPdfPath:              bootState._currentBook.pdfPath     || null,
      initialPages:                bootState._currentBook.pages       ? String(bootState._currentBook.pages) : '',
      initialAuthors:              bootState._currentBook.authors     || '',
      initialDescription:          bootState._currentBook.description || '',
      initialDiscoverableSections: bootState._currentBook.discoverableSections,
      showDiscoverableSections:    hitWall,
      discoverableHint:            discCount,
      minSections:                 min,
      initialIsPublic:             bootState._currentBook.isPublic,
      initialSeriesName:           bootState._currentBook.seriesName  || '',
      initialSeriesNumber:         bootState._currentBook.seriesNumber || '',
      initialIsContainer:          bootState._currentBook.isContainer,
      initialParentBookId:         bootState._currentBook.parentBookId,
      initialBookOrder:            bootState._currentBook.bookOrder,
      onSave: (name, sections, isbn, issn, asin, pages, authors, description, discoverableSections, isPublic, seriesName, seriesNumber, isContainer, parentId, bookOrder) => {
        bootState._currentBook.isbn                 = isbn        || null;
        bootState._currentBook.issn                 = issn        || null;
        bootState._currentBook.asin                 = asin        || null;
        bootState._currentBook.pages                = pages       || null;
        bootState._currentBook.authors              = authors     || null;
        bootState._currentBook.description          = description || null;
        bootState._currentBook.discoverableSections = discoverableSections ?? null;
        setDiscoverableLimit(discoverableSections ?? null);
        bootState._currentBook.seriesName           = seriesName  || null;
        bootState._currentBook.seriesNumber         = seriesNumber || null;
        bootState._currentBook.isContainer          = !!isContainer;
        bootState._currentBook.parentBookId         = parentId    || null;
        bootState._currentBook.bookOrder            = bookOrder   ?? null;
        state.bookName      = name;
        state.totalSections = isContainer ? state.totalSections : sections;
        _updateSidebarBookInfo();
        apiFetch(`/api/books/${currentBookId}`, {
          method: 'PATCH',
          body:   JSON.stringify({ name, total_sections: isContainer ? 0 : sections, isbn: isbn || null, issn: issn || null, asin: asin || null, pages: pages || null, authors: authors || null, description: description || null, discoverable_sections: discoverableSections ?? null, is_public: isPublic, series_name: seriesName || null, series_number: seriesNumber || null, is_container: isContainer ? 1 : 0, parent_book_id: parentId || null, book_order: bookOrder ?? null }),
        }).then(() => _refreshLibraryUi({ feed: true })).catch(() => {});
        saveState();
        render();
      },
    });
  });

  document.getElementById('edit-book-modal-overlay').addEventListener('click', e => {
    if (e.target === e.currentTarget && bootState._mousedownOnOverlay === e.currentTarget) closeEditBookModal();
  });

}
