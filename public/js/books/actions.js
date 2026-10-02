import { _isMobile } from './helpers.js';
import { booksState } from './state.js';
import { _justRevealedBooks, _booksListDisplayChanged, _patchCachedBook, _refreshLibraryUi, _refreshBooksListOnly } from './data.js';
import { _saveExpandedPref } from './prefs.js';
import { _scheduleAnthologyCardCoverFlows, _queueBookCovers } from './covers.js';
import { _materializeLazyGroup, _maybeReclaimLazyGroup } from './lazy.js';
import { _starLabelHtml, _flashRatingGate } from './markup.js';
import { isDemoMode, apiFetch, getDemoState, setDemoState } from '../core/state.js';
import { refreshCoinsDisplay } from '../progression/shop.js';
import { openCoverActivity, openSeriesActivity } from '../covers.js';
import { t } from '../i18n.js';
import { showConfirm, showTwoChoice } from '../play.js';

function _findRenderedContent(root, selector) {
  const descendants = [...root.querySelectorAll(selector)];
  return root.matches?.(selector) ? [root, ...descendants] : descendants;
}

export function _wireRenderedContent(list) {
  // Hover highlight via a class in addition to :hover (add-book.css matches
  // both). Expand/collapse mutates the tree under the cursor, and Chromium
  // drops :hover for a frame around the mutation - with the 0.1s background
  // transition that reads as a black-to-grey flash. The JS-toggled class
  // survives DOM mutations, so the highlight stays put while children load.
  _findRenderedContent(list, '.series-header-row, .stash-header-row').forEach(row => {
    row.addEventListener('mouseenter', () => row.classList.add('is-hover'));
    row.addEventListener('mouseleave', () => row.classList.remove('is-hover'));
  });

  _findRenderedContent(list, '.series-edit-btn:not([disabled])').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      booksState._hooks.openEditSeriesModal?.(+btn.dataset.seriesId, btn.dataset.seriesName, btn.dataset.seriesDesc, btn.dataset.seriesPublic === '1', btn.dataset.seriesOpenWorld === '1');
    });
  });

  _findRenderedContent(list, '.series-del-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const id   = +btn.dataset.seriesId;
      const name = btn.dataset.seriesName;
      showTwoChoice(
        t('books.remove_series_confirm', { name }),
        t('books.delete_series'),          async () => { await apiFetch(`/api/series/${id}?cascade=0`, { method: 'DELETE' }); _refreshBooksListOnly(); },
        t('books.delete_series_contents'), async () => { await apiFetch(`/api/series/${id}?cascade=1`, { method: 'DELETE' }); _refreshBooksListOnly(); }
      );
    });
  });

  _findRenderedContent(list, '.series-browse-btn').forEach(btn => {
    btn.addEventListener('click', e => { e.stopPropagation(); openSeriesActivity(+btn.dataset.seriesId, btn.dataset.seriesName); });
  });

  _findRenderedContent(list, '.stash-del-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      showConfirm(t('books.delete_stash_confirm', { name: btn.dataset.stashName }), async () => {
        await apiFetch(`/api/stashes/${+btn.dataset.stashId}`, { method: 'DELETE' });
        await _refreshBooksListOnly();
      });
    });
  });

  _findRenderedContent(list, '.stash-edit-btn').forEach(btn => {
    btn.addEventListener('click', e => { e.stopPropagation(); booksState._hooks.openEditStash?.(+btn.dataset.stashId); });
  });

  _findRenderedContent(list, '.stash-header-row').forEach(row => {
    row.addEventListener('click', e => {
      if (_justRevealedBooks()) return;
      if (e.target.closest('.stash-del-btn') || e.target.closest('.stash-edit-btn')) return;
      const sid      = row.dataset.stashId;
      // Always this header's own next sibling (see the container toggle).
      const group    = row.nextElementSibling?.classList.contains('stash-items-group') ? row.nextElementSibling : null;
      const nowExpanded = row.dataset.expanded !== '1';
      row.dataset.expanded = nowExpanded ? '1' : '0';
      if (nowExpanded && group) _materializeLazyGroup(group);
      if (group) group.style.display = nowExpanded ? '' : 'none';
      if (!nowExpanded && group) _maybeReclaimLazyGroup(group);
      _saveExpandedPref('stash', String(sid), `stash_expanded_${sid}`, nowExpanded);
      if (nowExpanded && group) _queueBookCovers(group, { reset: false });
      _scheduleAnthologyCardCoverFlows(list);
    });
  });

  _findRenderedContent(list, '.series-header-row').forEach(row => {
    row.addEventListener('click', e => {
      if (_justRevealedBooks()) return;
      if (e.target.closest('.series-edit-btn') || e.target.closest('.series-del-btn')) return;
      const sid     = row.dataset.seriesId;
      const stashId = row.dataset.stashId || '';
      // Always this header's own next sibling (see the container toggle) -
      // chunk-wired subtrees scope queries to a single child, and a list-wide
      // query could also grab another copy of the same series.
      const group   = row.nextElementSibling?.classList.contains('series-books-group') ? row.nextElementSibling : null;
      const nowExpanded = row.dataset.expanded !== '1';
      row.dataset.expanded = nowExpanded ? '1' : '0';
      if (nowExpanded && group) _materializeLazyGroup(group);
      if (group) group.style.display = nowExpanded ? '' : 'none';
      if (!nowExpanded && group) _maybeReclaimLazyGroup(group);
      _saveExpandedPref('series', `${stashId || 'main'}:${sid}`, `${stashId ? `stash_${stashId}_sr_` : 'sr_'}expanded_${sid}`, nowExpanded);
      if (nowExpanded && group) _queueBookCovers(group, { reset: false });
      _scheduleAnthologyCardCoverFlows(list);
    });
  });

  _findRenderedContent(list, '.book-item--container').forEach(row => {
    row.addEventListener('click', e => {
      if (_justRevealedBooks()) return;
      if (e.target.closest('.book-secondary-actions')) return;
      if (e.target.closest('.star-rating')) return;
      const bid = row.dataset.containerId;
      // The children group is always this card's own next sibling - a
      // container can appear in more than one stash block, so a
      // list-wide data-parent query would grab the first copy's group.
      const group = row.nextElementSibling?.classList.contains('book-children-group') ? row.nextElementSibling : null;
      const nowExpanded = row.dataset.expanded !== '1';
      row.dataset.expanded = nowExpanded ? '1' : '0';
      if (nowExpanded && group) _materializeLazyGroup(group);
      if (group) group.style.display = nowExpanded ? '' : 'none';
      if (!nowExpanded && group) _maybeReclaimLazyGroup(group);
      _saveExpandedPref('book', String(bid), `bk_expanded_${bid}`, nowExpanded);
      if (nowExpanded && group) _queueBookCovers(group, { reset: false });
      _scheduleAnthologyCardCoverFlows(list);
    });
  });

  _findRenderedContent(list, '.book-name-text').forEach(btn =>
    btn.addEventListener('click', () => {
      // Demo books are client-only fake IDs (e.g. "demo_1") with no server-side
      // public activity to show - +id would be NaN and 404.
      if (isDemoMode) return;
      if (!btn.closest('.book-item--container')) openCoverActivity(+btn.dataset.id, btn.dataset.name);
    })
  );

  _findRenderedContent(list, '.book-open-btn').forEach(btn =>
    btn.addEventListener('click', () => {
      const id = /^\d+$/.test(btn.dataset.id) ? +btn.dataset.id : btn.dataset.id;
      // showMain() unconditionally bounces every mobile visit back to this
      // same books list (see boot.js) - it's a no-op here, which is exactly
      // why "Open" looked like it did nothing. /mobile is the real
      // destination on mobile now.
      if (_isMobile()) { window.location.href = `/mobile?book=${encodeURIComponent(id)}`; return; }
      booksState._hooks.showMain?.(id, btn.dataset.isbn || null, btn.dataset.issn || null, btn.dataset.asin || null,
        btn.dataset.cover || btn.dataset.parentCover || null, btn.dataset.pdf || null,
        btn.dataset.pages ? Number(btn.dataset.pages) : null, btn.dataset.authors || null,
        btn.dataset.description || null, btn.dataset.discoverable ? +btn.dataset.discoverable : null,
        btn.dataset.public === '1', btn.dataset.creator === '1', btn.dataset.series || null,
        btn.dataset.seriesNum || null, btn.dataset.isContainer === '1',
        btn.dataset.parentId ? +btn.dataset.parentId : null, btn.dataset.bookOrder ? +btn.dataset.bookOrder : null);
    })
  );

  _findRenderedContent(list, '.book-edit-btn').forEach(btn =>
    btn.addEventListener('click', async () => {
      const bid         = btn.dataset.id;
      const isContainer = btn.dataset.isContainer === '1';

      if (isContainer) {
        booksState._hooks.openEditCompModal?.({
          bookId:              +bid,
          initialName:         btn.dataset.name,
          initialIsbn:         btn.dataset.isbn,
          initialIssn:         btn.dataset.issn,
          initialAsin:         btn.dataset.asin,
          initialCoverUrl:     btn.dataset.cover || null,
          initialPdfPath:      btn.dataset.pdf || null,
          initialPdfSize:      btn.dataset.pdfSize ? +btn.dataset.pdfSize : null,
          initialPages:        btn.dataset.pages || '',
          initialAuthors:      btn.dataset.authors || '',
          initialDescription:  btn.dataset.description || '',
          initialSeriesName:   btn.dataset.series || '',
          initialSeriesNumber: btn.dataset.seriesNum || '',
          initialIsPublic:     btn.dataset.public === '1',
          onSave: async (name, isbn, issn, asin, pages, authors, description, isPublic, seriesName, seriesNum) => {
            try {
              await apiFetch(`/api/books/${bid}`, {
                method: 'PATCH',
                body:   JSON.stringify({ name, total_sections: 0, isbn: isbn || null, issn: issn || null, asin: asin || null, pages: pages || null, authors: authors || null, description: description || null, is_public: isPublic, series_name: seriesName || null, series_number: seriesNum || null, is_container: 1 }),
              });
              if (_booksListDisplayChanged(bid, { name, sections: 0, discoverableSections: null, isPublic, seriesName, seriesNumber: seriesNum, isContainer: true, parentId: null, bookOrder: null })) {
                await _refreshLibraryUi({ feed: true });
              } else {
                _patchCachedBook(bid, { isbn: isbn || null, issn: issn || null, asin: asin || null, pages: pages || null, authors: authors || null, description: description || null });
                await Promise.allSettled([booksState._hooks.loadFeed?.()]);
              }
            } catch (_) {
              document.getElementById('ecc-error').textContent = t('err.save');
            }
          },
        });
        return;
      }

      let min = 20, hitWall = false, discCount = 0;
      if (isDemoMode) {
        const saved = getDemoState(bid);
        if (saved) min = Math.max(5, booksState._hooks.maxSectionInUse?.(saved) ?? 5);
      } else {
        try {
          const res       = await apiFetch(`/api/books/${bid}/state`);
          const bookState = await res.json();
          min = Math.max(5, booksState._hooks.maxSectionInUse?.(bookState) ?? 5);
          const mapped = booksState._hooks.mappedCountFor?.(bookState?.graph) || 0;
          const disc   = booksState._hooks.discoveredSectionsFor?.(bookState?.graph, bookState?.playthroughs, bookState?.startSection) || new Set();
          const total  = +btn.dataset.sections;
          hitWall   = mapped > 0 && mapped === disc.size && mapped < total;
          discCount = disc.size;
        } catch (_) {}
      }

      booksState._hooks.openEditBookModal?.({
        bookId:                     isDemoMode ? bid : +bid,
        initialName:                btn.dataset.name,
        initialSections:            +btn.dataset.sections,
        initialIsbn:                btn.dataset.isbn,
        initialIssn:                btn.dataset.issn,
        initialAsin:                btn.dataset.asin,
        initialCoverUrl:            btn.dataset.cover || null,
        initialPdfPath:             btn.dataset.pdf || null,
        initialPdfSize:             btn.dataset.pdfSize ? +btn.dataset.pdfSize : null,
        initialPages:               btn.dataset.pages || '',
        initialAuthors:             btn.dataset.authors || '',
        initialDescription:         btn.dataset.description || '',
        initialDiscoverableSections: btn.dataset.discoverable ? +btn.dataset.discoverable : null,
        showDiscoverableSections:   hitWall,
        discoverableHint:           discCount,
        minSections:                min,
        initialIsPublic:            btn.dataset.public === '1',
        initialSeriesName:          btn.dataset.series || '',
        initialSeriesNumber:        btn.dataset.seriesNum || '',
        initialParentBookId:        btn.dataset.parentId ? +btn.dataset.parentId : null,
        initialBookOrder:           btn.dataset.bookOrder ? +btn.dataset.bookOrder : null,
        onSave: async (name, sections, isbn, issn, asin, pages, authors, description, discoverableSections, isPublic, seriesName, seriesNumber, _isContainer, parentId, bookOrder) => {
          if (isDemoMode) {
            const demoBooks = booksState._hooks.getDemoBooks?.() || [];
            const book = demoBooks.find(b => b.id === bid);
            if (book) { book.name = name; book.total_sections = sections; book.isbn = isbn || null; book.issn = issn || null; book.asin = asin || null; book.pages = pages || null; book.authors = authors || null; book.description = description || null; }
            const saved = getDemoState(bid);
            if (saved) { saved.bookName = name; saved.totalSections = sections; setDemoState(bid, saved); }
            await booksState._hooks.showBooks?.();
            return;
          }
          try {
            await apiFetch(`/api/books/${bid}`, {
              method: 'PATCH',
              body:   JSON.stringify({ name, total_sections: sections, isbn: isbn || null, issn: issn || null, asin: asin || null, pages: pages || null, authors: authors || null, description: description || null, discoverable_sections: discoverableSections ?? null, is_public: isPublic, series_name: seriesName || null, series_number: seriesNumber || null, is_container: 0, parent_book_id: parentId || null, book_order: bookOrder ?? null }),
            });
            if (_booksListDisplayChanged(bid, { name, sections, discoverableSections, isPublic, seriesName, seriesNumber, isContainer: false, parentId, bookOrder })) {
              await _refreshLibraryUi({ feed: true });
            } else {
              _patchCachedBook(bid, { isbn: isbn || null, issn: issn || null, asin: asin || null, pages: pages || null, authors: authors || null, description: description || null });
              await Promise.allSettled([booksState._hooks.loadFeed?.()]);
            }
          } catch (_) {
            document.getElementById('edit-book-error').textContent = t('err.save');
          }
        },
      });
    })
  );

  _findRenderedContent(list, '.book-del-btn').forEach(btn =>
    btn.addEventListener('click', () => {
      const id          = btn.dataset.id;
      const name        = btn.dataset.name;
      const isContainer = btn.dataset.container === '1';
      const inSeries    = !!btn.closest('.series-books-group');
      const cachedBook  = (booksState._cachedBooks || []).find(b => String(b.id) === String(id));

      const doRemoveFromSeries = async () => {
        if (!cachedBook) return;
        try {
          await apiFetch(`/api/books/${id}`, {
            method: 'PATCH',
            body: JSON.stringify({
              name: cachedBook.name, total_sections: cachedBook.is_container ? 0 : cachedBook.total_sections,
              isbn: cachedBook.isbn || null, issn: cachedBook.issn || null, asin: cachedBook.asin || null,
              pages: cachedBook.pages || null, authors: cachedBook.authors || null, description: cachedBook.description || null,
              discoverable_sections: cachedBook.discoverable_sections ?? null, is_public: !!cachedBook.is_public,
              series_name: null, series_number: null, is_container: cachedBook.is_container ? 1 : 0,
              parent_book_id: cachedBook.parent_book_id || null, book_order: cachedBook.book_order ?? null,
            }),
          });
          await _refreshLibraryUi({ feed: true });
        } catch (_) {}
      };

      const doDelete = async (cascade) => {
        if (isDemoMode) {
          const demoBooks = booksState._hooks.getDemoBooks?.() || [];
          booksState._hooks.setDemoBooks?.(demoBooks.filter(b => b.id !== id));
          await booksState._hooks.showBooks?.();
          return;
        }
        try {
          await apiFetch(`/api/books/${id}?cascade=${cascade ? '1' : '0'}`, { method: 'DELETE' });
          await _refreshBooksListOnly();
        } catch (_) {}
      };

      if (inSeries && cachedBook?.series_id) { showConfirm(t('books.remove_from_series_confirm', { name }), doRemoveFromSeries); return; }
      if (isContainer) {
        showTwoChoice(t('books.remove_anthology_confirm', { name }),
          t('books.delete_anthology'),          () => doDelete(false),
          t('books.delete_anthology_contents'), () => doDelete(true)
        );
      } else {
        showConfirm(t('confirm.delete_book', { name }), () => doDelete(true));
      }
    })
  );

  if (!isDemoMode) {
    _findRenderedContent(list, '.book-rating-row').forEach(row => {
      const bookId = +row.dataset.bookId;
      const cached = () => booksState._cachedBooks?.find(b => b.id === bookId);
      let myRating = parseFloat(row.dataset.userRating) || null;
      let curAvg   = cached()?.avgRating ?? null;
      let curCount = cached()?.voteCount ?? 0;
      const stars  = row.querySelectorAll('.star');
      const lbl    = row.querySelector('.star-label');

      const updateStars = (hoverVal) => {
        const displayVal = hoverVal !== null ? hoverVal : curAvg;
        stars.forEach(s => {
          const p = +s.dataset.pos;
          s.className = (displayVal !== null && displayVal >= p) ? 'star on'
                      : (displayVal !== null && displayVal >= p - 0.5) ? 'star half'
                      : 'star';
        });
        lbl.innerHTML = hoverVal !== null
          ? `<span class="star-avg">${hoverVal % 1 === 0 ? hoverVal.toFixed(1) : hoverVal}</span>`
          : _starLabelHtml(curAvg, curCount);
      };

      stars.forEach(star => {
        star.addEventListener('mousemove', e => { const left = e.offsetX < star.offsetWidth / 2; updateStars(+star.dataset.pos - (left ? 0.5 : 0)); });
        star.addEventListener('click', async e => {
          const left      = e.offsetX < star.offsetWidth / 2;
          const newRating = +star.dataset.pos - (left ? 0.5 : 0);
          const toSave    = newRating === myRating ? null : newRating;
          const prevRating = myRating;
          myRating = toSave;
          row.dataset.userRating = toSave ?? '';
          try {
            const res = await apiFetch(`/api/books/${bookId}/rating`, { method: 'PATCH', body: JSON.stringify({ rating: toSave }) });
            if (res.ok) {
              const data = await res.json();
              curAvg = data.avgRating; curCount = data.voteCount;
              const c = cached(); if (c) { c.userRating = toSave; c.avgRating = curAvg; c.voteCount = curCount; }
              updateStars(null);
              if (data.xpAwarded) refreshCoinsDisplay();
            } else if (res.status === 403) {
              myRating = prevRating; row.dataset.userRating = prevRating ?? '';
              updateStars(null);
              const errData = await res.json().catch(() => ({}));
              _flashRatingGate(row, errData.error || 'Complete a run first to rate');
            }
          } catch {}
        });
      });
      row.addEventListener('mouseleave', () => updateStars(null));
    });
  }

}
