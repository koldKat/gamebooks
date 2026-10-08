import { _isMobile } from './helpers.js';
import { _refreshCoversDisplay } from './grid.js';
import { openCoverActivity, openSeriesActivity } from './activity.js';
import { _seriesRowBadges } from './badges.js';
import { coversState } from './state.js';
import { apiFetch } from '../core/state.js';
import { closePublicModal, renderPublicProfile, openPublicRun, _destroyPubNetworks } from '../account/public-profile.js';
import { refreshCoinsDisplay } from '../progression/shop.js';
import { escapeHtml, fetchPublic as publicFetch } from '../core/util.js';
import { t } from '../i18n.js';

export function renderCoverActivity(bookId, bookName, entries, userRating, bookMeta, userLoggedIn, userOwnsBook, userCanRate = true) {
  _destroyPubNetworks();
  document.getElementById('public-modal').classList.remove('pub-modal--run');
  const backBtn = document.getElementById('pub-back-btn');
  backBtn.style.display = 'none';
  const typeLabel = bookMeta?.isContainer ? 'Anthology' : bookMeta?.issn ? 'Magazine' : '';
  document.getElementById('pub-modal-title').innerHTML =
    escapeHtml(bookName) + (typeLabel ? ` <span class="pub-modal-type">(${typeLabel})</span>` : '');
  const body = document.getElementById('pub-modal-body');
  body.style.padding  = '';
  body.style.overflow = '';

  let headerHtml = '<div class="book-modal-header">';
  if (bookMeta?.coverUrl) {
    const coverBadges = _seriesRowBadges(bookMeta);
    headerHtml += `<div class="book-modal-cover-col">` +
      `<img class="book-modal-cover" src="${escapeHtml(bookMeta.coverUrl)}" alt="${escapeHtml(bookName)}">` +
      (coverBadges ? `<div class="book-modal-cover-badges">${coverBadges}</div>` : '') +
      `</div>`;
  }
  headerHtml += '<div class="book-modal-meta">';
  // Include both primary and secondary anthology memberships.
  const anthologyChips = [
    ...(bookMeta?.parentId ? [{ id: bookMeta.parentId, name: bookMeta.parentName }] : []),
    ...(bookMeta?.secondaryAnthologies || []),
  ];
  if (anthologyChips.length) {
    headerHtml += `<div class="book-modal-in-collection"><span class="in-collection-label">${anthologyChips.length > 1 ? t('covers.anthologies_label') : t('covers.anthology_label')}</span>` +
      anthologyChips.map(a => `<button class="book-modal-parent-btn" data-book-id="${a.id}" data-book-name="${escapeHtml(a.name)}">${escapeHtml(a.name)}</button>`).join('') +
      `</div>`;
  }
  if (bookMeta?.seriesName) {
    const seriesLabel = bookMeta.seriesNumber
      ? `${escapeHtml(bookMeta.seriesName)} #${escapeHtml(bookMeta.seriesNumber)}`
      : escapeHtml(bookMeta.seriesName);
    headerHtml += `<div class="book-modal-in-collection"><span class="in-collection-label">Series:</span><button class="book-modal-series-btn" data-series-id="${bookMeta.seriesId || ''}" data-series-name="${escapeHtml(bookMeta.seriesName)}">${seriesLabel}</button></div>`;
  }
  if (bookMeta?.authors) {
    // Rate authors individually across public books, not as one comma-separated credit.
    const ratingsByName = new Map((bookMeta.authorRatings || []).map(r => [r.name, r]));
    const authorNames = bookMeta.authors.split(/\s*,\s*/).map(a => a.trim()).filter(Boolean);
    const namesHtml = authorNames.map(name => {
      const r = ratingsByName.get(name);
      const ratingHtml = (r?.voteCount > 0)
        ? ` <span class="book-modal-author-rating" data-tooltip="${escapeHtml(t('covers.author_rating_votes', { n: r.voteCount, s: r.voteCount === 1 ? '' : 's' }))}">★${(Number.isInteger(r.avgRating) ? r.avgRating + '.0' : r.avgRating.toFixed(1))}</span>`
        : '';
      return `<span class="book-modal-author-name">${escapeHtml(name)}</span>${ratingHtml}`;
    }).join(', ');
    headerHtml += `<div class="book-modal-authors">${namesHtml}</div>`;
  }
  const metaBits = [];
  if (bookMeta?.totalSections) metaBits.push(`${bookMeta.totalSections} sections`);
  if (bookMeta?.pages)         metaBits.push(`${bookMeta.pages} pages`);
  if (metaBits.length) headerHtml += `<div class="book-modal-sections">${metaBits.join(' · ')}</div>`;
  const ids = [];
  if (bookMeta?.isbn) ids.push(`ISBN ${escapeHtml(bookMeta.isbn)}`);
  if (bookMeta?.asin) ids.push(`ASIN ${escapeHtml(bookMeta.asin)}`);
  if (bookMeta?.issn) ids.push(`ISSN ${escapeHtml(bookMeta.issn)}`);
  if (ids.length) headerHtml += `<div class="book-modal-ids">${ids.join(' · ')}</div>`;
  if (bookMeta?.description) {
    headerHtml += `<div class="book-modal-description">${escapeHtml(bookMeta.description)}</div>`;
  }
  const avgRating  = bookMeta?.avgRating ?? null;
  const voteCount  = bookMeta?.voteCount ?? 0;
  const showWidget = userOwnsBook || voteCount > 0;
  if (showWidget) {
    headerHtml += `<div class="star-rating" data-book-id="${bookId}">
      ${coversState._hooks.starsHtml?.(avgRating) ?? ''}
      <span class="star-label">${coversState._hooks.starLabelHtml?.(avgRating, voteCount) ?? ''}</span>
    </div>`;
  }
  // Anthologies are grouping shells; open their children instead.
  // Mobile books use the separate /mobile reader.
  if (userOwnsBook && !bookMeta?.isContainer) {
    headerHtml += `<button class="add-to-library-btn open-owned-book-btn" data-book-id="${bookId}">${t('covers.open_book')}</button>`;
  }
  if (bookMeta?.isPublic && userLoggedIn && !userOwnsBook) {
    headerHtml += `<button class="add-to-library-btn add-public-book-btn" data-book-id="${bookId}">${t('covers.add_to_library')}</button>`;
  }
  if (bookMeta?.isPublic && !userLoggedIn) {
    headerHtml += `<button class="add-to-library-btn login-to-add-book-btn">${t('covers.login_to_add_book')}</button>`;
  }
  if (coversState._hooks.getIsAdmin?.()) {
    headerHtml += `<button class="add-to-library-btn catalog-admin-edit-btn" data-book-id="${bookId}" style="color:#f5a623;border-color:#92400e">✎ Admin Edit</button>`;
  }
  headerHtml += '</div></div>';

  if (bookMeta?.isContainer && bookMeta?.children?.length) {
    headerHtml += `<div class="book-modal-children-section">
      <div class="book-modal-children-header">${t('covers.books_in_anthology')}</div>
      <div class="book-modal-children-list">`;
    headerHtml += bookMeta.children.map(c =>
      `<button class="book-modal-child-row" data-book-id="${c.id}" data-book-name="${escapeHtml(c.name)}">
        <span class="child-row-name">${escapeHtml(c.name)}</span>
        ${c.total_sections ? `<span class="child-row-sections">${c.total_sections} sections</span>` : ''}
        <span class="child-row-arrow">›</span>
      </button>`
    ).join('');
    headerHtml += `</div></div>`;
  }

  let activityHtml = '';
  if (!entries.length) {
    activityHtml = `<p class="pub-empty">No public activity for this ${bookMeta?.isContainer ? 'anthology' : bookMeta?.issn ? 'magazine' : 'book'} yet.</p>`;
  } else {
    const multiBook = entries.some(e => e.bookName !== entries[0].bookName);
    activityHtml = '<div class="cover-activity-view">';
    for (const e of entries) {
      const initial    = escapeHtml(e.username.charAt(0).toUpperCase());
      const avatarHtml = e.avatarUrl
        ? `<img class="cover-act-avatar" src="${escapeHtml(e.avatarUrl)}" alt="">`
        : `<div class="cover-act-avatar cover-act-avatar-ph">${initial}</div>`;
      const userEl = e.publicProfile
        ? `<button class="cover-act-username" data-username="${escapeHtml(e.username)}">${escapeHtml(e.username)}</button>`
        : `<span class="cover-act-username-plain">${escapeHtml(e.username)}</span>`;
      const bookLabel = (multiBook || bookMeta?.isContainer)
        ? `<span class="cover-act-header-book">${escapeHtml(e.bookName)}</span>` : '';
      activityHtml += `<div class="cover-act-entry cover-act-entry--collapsed">
        <div class="cover-act-user cover-act-toggle">${avatarHtml}${userEl}${bookLabel}<span class="cover-act-run-count">${e.runs.length} run${e.runs.length === 1 ? '' : 's'}</span><span class="cover-act-chevron">&#9658;</span></div>
        <div class="cover-act-body">
        <div class="cover-act-runs">`;
      for (const run of e.runs) {
        const isWin    = run.result === 'success';
        const isBattle = run.result === 'battle';
        // Negative runIndex = a pre-series run (see getBookActivity), shown
        // as "Run -N" matching play.js's own convention - no +1 for those.
        const runN  = run.runIndex < 0 ? run.runIndex : run.runIndex + 1;
        const label = `Run ${runN} - ${isWin ? '★ Victory' : isBattle ? '⚔ Battle Death' : '† Lost'}`;
        const cls   = isWin ? 'pub-run-win' : 'pub-run-death';
        activityHtml += `<button class="pub-run-btn ${cls}" data-book-id="${e.bookId}" data-user-id="${e.userId}" data-run-index="${run.runIndex}">${escapeHtml(label)}</button>`;
      }
      activityHtml += `</div></div></div>`;
    }
    activityHtml += '</div>';
  }

  body.innerHTML = headerHtml + activityHtml;

  body.querySelectorAll('.cover-act-toggle').forEach(toggle => {
    toggle.addEventListener('click', () => {
      toggle.closest('.cover-act-entry').classList.toggle('cover-act-entry--collapsed');
    });
  });

  const loginBtn = body.querySelector('.login-to-add-book-btn');
  if (loginBtn) {
    loginBtn.addEventListener('click', () => {
      closePublicModal();
      document.body.classList.remove('mobile-addbook-open', 'mobile-books-open');
      coversState._hooks.showLogin?.();
    });
  }

  const addBtn = body.querySelector('.add-public-book-btn');
  if (addBtn) {
    addBtn.addEventListener('click', async () => {
      addBtn.disabled = true;
      addBtn.textContent = t('covers.adding');
      try {
        const res = await apiFetch(`/api/books/${bookId}/add`, { method: 'POST' });
        if (res.ok) {
          await coversState._hooks.refreshBooksListOnly?.();
          _refreshCoversDisplay();
          renderCoverActivity(
            bookId, bookName, entries, currentMyRating,
            { ...bookMeta, avgRating: currentAvg, voteCount: currentCount },
            userLoggedIn, true, false
          );
        } else {
          const d = await res.json().catch(() => ({}));
          addBtn.textContent = d.error || t('covers.failed');
          addBtn.disabled = false;
        }
      } catch {
        addBtn.textContent = t('covers.error_retry');
        addBtn.disabled = false;
      }
    });
  }

  const adminEditBtn = body.querySelector('.catalog-admin-edit-btn');
  if (adminEditBtn) {
    adminEditBtn.addEventListener('click', () => {
      // Use the anthology editor; the book editor saves is_container:false.
      if (bookMeta?.isContainer) {
        coversState._hooks.openEditCompModal?.({
          bookId,
          initialName:          bookMeta?.name          || bookName,
          initialIsbn:          bookMeta?.isbn           || '',
          initialIssn:          bookMeta?.issn           || '',
          initialAsin:          bookMeta?.asin           || '',
          initialCoverUrl:      bookMeta?.coverUrl       || null,
          initialPdfPath:       bookMeta?.pdfPath        || null,
          initialPdfSize:       bookMeta?.pdfSize        || null,
          initialEpubPath:      bookMeta?.epubPath       || null,
          initialEpubSize:      bookMeta?.epubSize       || null,
          initialPages:         bookMeta?.pages          ? String(bookMeta.pages) : '',
          initialAuthors:       bookMeta?.authors        || '',
          initialDescription:   bookMeta?.description    || '',
          initialIsPublic:      bookMeta?.isPublic       ?? true,
          initialSeriesName:    bookMeta?.seriesName     || '',
          initialSeriesNumber:  bookMeta?.seriesNumber   || '',
          onSave: async (name, isbn, issn, asin, pages, authors, description, isPublic, seriesName, seriesNum) => {
            try {
              await apiFetch(`/api/books/${bookId}`, {
                method: 'PATCH',
                body: JSON.stringify({ name, total_sections: 0, isbn: isbn || null, issn: issn || null, asin: asin || null, pages: pages || null, authors: authors || null, description: description || null, is_public: isPublic, series_name: seriesName || null, series_number: seriesNum || null, is_container: 1 }),
              });
            } catch (_) {}
            openCoverActivity(bookId, bookName);
          },
        });
        return;
      }
      coversState._hooks.openEditBookModal?.({
        bookId,
        initialName:          bookMeta?.name          || bookName,
        initialSections:      bookMeta?.totalSections  || 0,
        initialMaxSectionNumber: bookMeta?.maxSectionNumber ?? bookMeta?.totalSections,
        initialIsbn:          bookMeta?.isbn           || '',
        initialIssn:          bookMeta?.issn           || '',
        initialAsin:          bookMeta?.asin           || '',
        initialCoverUrl:      bookMeta?.coverUrl       || null,
        initialPdfPath:       bookMeta?.pdfPath        || null,
        initialPdfSize:       bookMeta?.pdfSize        || null,
        initialEpubPath:      bookMeta?.epubPath       || null,
        initialEpubSize:      bookMeta?.epubSize       || null,
        initialPages:         bookMeta?.pages          ? String(bookMeta.pages) : '',
        initialAuthors:       bookMeta?.authors        || '',
        initialDescription:   bookMeta?.description    || '',
        initialIsPublic:      bookMeta?.isPublic       ?? true,
        // Edit only the book's direct series membership, not the anthology-inherited display context.
        initialSeriesName:    bookMeta?.ownSeriesName     || '',
        initialSeriesNumber:  bookMeta?.ownSeriesNumber   || '',
        initialIsContainer:   bookMeta?.isContainer    ?? false,
        initialParentBookId:  bookMeta?.parentId       || null,
        initialBookOrder:     bookMeta?.bookOrder      ?? null,
        minSections: 1,
        onSave: async (name, sections, isbn, issn, asin, pages, authors, description, discoverableSections, isPublic, seriesName, seriesNumber, isContainer, parentId, bookOrder, maxSectionNumber) => {
          const res = await apiFetch(`/api/books/${bookId}`, {
            method: 'PATCH',
            body: JSON.stringify({ name, total_sections: sections, max_section_number: maxSectionNumber, isbn: isbn || null, issn: issn || null, asin: asin || null, pages: pages || null, authors: authors || null, description: description || null, discoverable_sections: discoverableSections ?? null, is_public: isPublic, series_name: seriesName || null, series_number: seriesNumber || null, is_container: !!isContainer, parent_book_id: parentId || null, book_order: bookOrder ?? null }),
          });
          if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || t('err.save'));
          await openCoverActivity(bookId, name);
        },
      });
    });
  }

  const openOwnedBtn = body.querySelector('.open-owned-book-btn');
  if (openOwnedBtn) {
    openOwnedBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      // Use /mobile rather than the desktop play view.
      const targetBookId = +openOwnedBtn.dataset.bookId;
      // Pass the book ID so the mobile reader opens this book.
      if (_isMobile()) { window.location.href = `/mobile?book=${encodeURIComponent(targetBookId)}`; return; }
      openOwnedBtn.disabled = true;
      openOwnedBtn.textContent = t('covers.opening');
      coversState._hooks.lockView?.('book', 1500);
      await coversState._hooks.navigateToBook?.(targetBookId);
      closePublicModal();
    });
  }

  let currentMyRating = userRating ?? null;
  let currentAvg      = avgRating;
  let currentCount    = voteCount;
  const bookCanRate = userCanRate;

  const starWidget = body.querySelector('.star-rating');
  if (starWidget && userOwnsBook) {
    starWidget.dataset.userRating = currentMyRating ?? '';
    if (!bookCanRate) starWidget.dataset.tooltip = t('covers.rate_gate_book');

    const updateDisplay = (hoverVal) => {
      const displayVal = hoverVal !== null ? hoverVal : currentAvg;
      starWidget.querySelectorAll('.star').forEach(s => {
        const p = +s.dataset.pos;
        s.className = (displayVal !== null && displayVal >= p) ? 'star on'
                    : (displayVal !== null && displayVal >= p - 0.5) ? 'star half'
                    : 'star';
      });
      const lbl = starWidget.querySelector('.star-label');
      if (hoverVal !== null) {
        lbl.innerHTML = `<span class="star-avg">${hoverVal % 1 === 0 ? hoverVal.toFixed(1) : hoverVal}</span>`;
      } else {
        lbl.innerHTML = coversState._hooks.starLabelHtml?.(currentAvg, currentCount) ?? '';
      }
    };

    starWidget.querySelectorAll('.star').forEach(star => {
      star.addEventListener('mousemove', e => {
        if (!bookCanRate) return;
        const left = e.offsetX < star.offsetWidth / 2;
        updateDisplay(+star.dataset.pos - (left ? 0.5 : 0));
      });
      star.addEventListener('click', async e => {
        if (!bookCanRate) { coversState._hooks.flashRatingGate?.(starWidget, 'Complete a run first to rate'); return; }
        const left      = e.offsetX < star.offsetWidth / 2;
        const newRating = +star.dataset.pos - (left ? 0.5 : 0);
        const toSave    = newRating === currentMyRating ? null : newRating;
        const prevRating = currentMyRating;
        currentMyRating = toSave;
        starWidget.dataset.userRating = toSave ?? '';
        updateDisplay(null);
        try {
          const res = await apiFetch(`/api/books/${bookId}/rating`, {
            method: 'PATCH', body: JSON.stringify({ rating: toSave }),
          });
          if (res.ok) {
            const data = await res.json();
            currentAvg   = data.avgRating;
            currentCount = data.voteCount;
            updateDisplay(null);
            if (data.xpAwarded) refreshCoinsDisplay();
          } else {
            currentMyRating = prevRating;
            starWidget.dataset.userRating = prevRating ?? '';
            updateDisplay(null);
          }
        } catch {
          currentMyRating = prevRating;
          starWidget.dataset.userRating = prevRating ?? '';
          updateDisplay(null);
        }
      });
    });
    starWidget.addEventListener('mouseleave', () => updateDisplay(null));
  }

  body.querySelectorAll('.cover-act-username').forEach(btn => {
    btn.addEventListener('click', async () => {
      const username = btn.dataset.username;
      document.getElementById('pub-modal-title').innerHTML = escapeHtml(coversState._hooks.displayFor?.(username) ?? username) + (coversState._hooks.adminBadge?.(username) ?? '') + (coversState._hooks.authorBadge?.(username) ?? '') + (coversState._hooks.contributorBadge?.(username) ?? '');
      document.getElementById('pub-modal-body').innerHTML  = `<p class="pub-loading">${t('covers.loading')}</p>`;
      backBtn.style.display = '';
      backBtn.onclick = () => renderCoverActivity(bookId, bookName, entries, currentMyRating, { ...bookMeta, avgRating: currentAvg, voteCount: currentCount }, userLoggedIn, userOwnsBook, bookCanRate);
      try {
        const res = await publicFetch(`/api/public/user/${encodeURIComponent(username)}`);
        if (!res.ok) throw new Error();
        const profile = await res.json();
        renderPublicProfile(profile);
        backBtn.style.display = '';
        backBtn.onclick = () => renderCoverActivity(bookId, bookName, entries, currentMyRating, { ...bookMeta, avgRating: currentAvg, voteCount: currentCount }, userLoggedIn, userOwnsBook, bookCanRate);
      } catch {
        document.getElementById('pub-modal-body').innerHTML = `<p class="pub-error">${t('pub.profile_unavailable')}</p>`;
      }
    });
  });

  body.querySelectorAll('.pub-run-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      openPublicRun(+btn.dataset.bookId, +btn.dataset.userId, +btn.dataset.runIndex, null);
      backBtn.style.display = '';
      backBtn.onclick = () => renderCoverActivity(bookId, bookName, entries, currentMyRating, { ...bookMeta, avgRating: currentAvg, voteCount: currentCount }, userLoggedIn, userOwnsBook, bookCanRate);
    });
  });

  body.querySelectorAll('.book-modal-parent-btn, .book-modal-child-btn, .book-modal-child-row').forEach(btn => {
    btn.addEventListener('click', () => {
      backBtn.style.display = '';
      backBtn.onclick = () => renderCoverActivity(bookId, bookName, entries, currentMyRating, { ...bookMeta, avgRating: currentAvg, voteCount: currentCount }, userLoggedIn, userOwnsBook, bookCanRate);
      openCoverActivity(+btn.dataset.bookId, btn.dataset.bookName);
    });
  });

  body.querySelectorAll('.book-modal-series-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const sid = +btn.dataset.seriesId;
      if (!sid) return;
      backBtn.style.display = '';
      backBtn.onclick = () => renderCoverActivity(bookId, bookName, entries, currentMyRating, { ...bookMeta, avgRating: currentAvg, voteCount: currentCount }, userLoggedIn, userOwnsBook, bookCanRate);
      openSeriesActivity(sid, btn.dataset.seriesName);
    });
  });
}
