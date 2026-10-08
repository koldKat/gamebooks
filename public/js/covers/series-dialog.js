import { _refreshCoversDisplay } from './grid.js';
import { openCoverActivity } from './activity.js';
import { _seriesRowBadges } from './badges.js';
import { coversState } from './state.js';
import { getToken, apiFetch } from '../core/state.js';
import { escapeHtml } from '../core/util.js';
import { t } from '../i18n.js';

export function renderSeriesActivity(data) {
  const backBtn = document.getElementById('pub-back-btn');
  document.getElementById('pub-modal-title').innerHTML =
    escapeHtml(data.name) + ` <span class="pub-modal-type">${t('covers.series_label')}</span>`;
  const body = document.getElementById('pub-modal-body');
  body.style.padding  = '';
  body.style.overflow = '';

  const userLoggedIn  = !!getToken();
  const userHasSeries = userLoggedIn && coversState._hooks.getCachedAllSeries?.()?.some(s => s.id === data.id);

  let html = '<div class="book-modal-header"><div class="book-modal-meta">';
  if (data.description) html += `<div class="book-modal-description">${escapeHtml(data.description)}</div>`;
  html += `<div class="book-modal-sections">${data.books.length} ${data.books.length === 1 ? 'book' : 'books'} in series</div>`;
  html += `<div class="star-rating" id="series-star-widget" data-series-id="${data.id}">`;
  html += coversState._hooks.starsHtml?.(data.avgRating ?? null) ?? '';
  html += `<span class="star-label">${coversState._hooks.starLabelHtml?.(data.avgRating ?? null, data.voteCount ?? 0, 'series') ?? ''}</span>`;
  html += `</div>`;
  if (data.isPublic && userLoggedIn && !userHasSeries) {
    html += `<button class="add-to-library-btn" id="add-series-to-lib-btn" data-series-id="${data.id}">${t('covers.add_to_library')}</button>`;
  }
  if (userLoggedIn && (coversState._hooks.getIsAdmin?.() || (data.isPublic && coversState._hooks.getIsModerator?.()))) {
    html += `<button class="add-to-library-btn" id="edit-public-series-btn">✎ ${t('covers.edit_series')}</button>`;
  }
  html += '</div></div>';

  if (data.books.length) {
    html += `<div class="book-modal-children-section"><div class="book-modal-children-header">${t('covers.books_in_series')}</div><div class="book-modal-children-list">`;
    for (const b of data.books) {
      const num = b.seriesNumber ? ` <span class="child-row-num">#${escapeHtml(b.seriesNumber)}</span>` : '';
      const badges = _seriesRowBadges(b);
      if (b.isContainer) {
        const sub = `<span class="child-row-sections">${b.childCount} ${b.childCount === 1 ? 'book' : 'books'}</span>`;
        html += `<div class="book-modal-anthology-row" data-anthology-id="${b.id}">
          <button class="book-modal-child-row anthology-name-btn" data-book-id="${b.id}" data-book-name="${escapeHtml(b.name)}">
            <span class="child-row-name">${escapeHtml(b.name)}${num}</span>
            <span class="child-row-badges">${badges}</span>
            ${sub}
            <span class="child-row-arrow">&#x203a;</span>
          </button>
          ${b.children.length ? `<button class="anthology-toggle-btn" data-anthology-id="${b.id}" aria-expanded="false" aria-label="${t('covers.expand_anthology')}">&#x25b8;</button>` : ''}
        </div>`;
        if (b.children.length) {
          html += `<div class="anthology-children-list" id="anthology-children-${b.id}" style="display:none">`;
          for (const c of b.children) {
            const csub = c.totalSections ? `<span class="child-row-sections">${c.totalSections} sections</span>` : '';
            html += `<button class="book-modal-child-row anthology-child-btn" data-book-id="${c.id}" data-book-name="${escapeHtml(c.name)}">
              <span class="child-row-name">${escapeHtml(c.name)}</span>
              <span class="child-row-badges">${_seriesRowBadges(c)}</span>
              ${csub}
              <span class="child-row-arrow">&#x203a;</span>
            </button>`;
          }
          html += `</div>`;
        }
      } else {
        const sub = b.totalSections ? `<span class="child-row-sections">${b.totalSections} sections</span>` : '';
        html += `<button class="book-modal-child-row" data-book-id="${b.id}" data-book-name="${escapeHtml(b.name)}">
          <span class="child-row-name">${escapeHtml(b.name)}${num}</span>
          <span class="child-row-badges">${badges}</span>
          ${sub}
          <span class="child-row-arrow">&#x203a;</span>
        </button>`;
      }
    }
    html += '</div></div>';
  } else {
    html += '<p class="pub-empty">No public books in this series yet.</p>';
  }

  body.innerHTML = html;

  body.querySelector('#edit-public-series-btn')?.addEventListener('click', () => {
    coversState._hooks.openEditSeriesModal?.(data.id, data.name, data.description, !!data.isPublic, !!data.isOpenWorld);
  });

  const addSeriesBtn = body.querySelector('#add-series-to-lib-btn');
  if (addSeriesBtn) {
    addSeriesBtn.addEventListener('click', async () => {
      addSeriesBtn.disabled = true;
      addSeriesBtn.textContent = t('covers.adding');
      try {
        const res = await apiFetch(`/api/series/${data.id}/add?cascade=1`, { method: 'POST' });
        if (res.ok) {
          addSeriesBtn.textContent = t('covers.added_to_library');
          addSeriesBtn.classList.add('add-to-library-done');
          await coversState._hooks.refreshBooksListOnly?.();
          _refreshCoversDisplay();
          coversState._hooks.showBooks?.();
        } else {
          addSeriesBtn.disabled = false;
          addSeriesBtn.textContent = t('covers.add_to_library');
        }
      } catch { addSeriesBtn.disabled = false; addSeriesBtn.textContent = t('covers.add_to_library'); }
    });
  }

  body.querySelectorAll('.anthology-toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const list = body.querySelector(`#anthology-children-${btn.dataset.anthologyId}`);
      if (!list) return;
      const expanded = list.style.display !== 'none';
      list.style.display = expanded ? 'none' : '';
      btn.setAttribute('aria-expanded', String(!expanded));
      btn.textContent = expanded ? '▸' : '▾';
    });
  });

  body.querySelectorAll('.book-modal-child-row').forEach(btn => {
    btn.addEventListener('click', () => {
      backBtn.style.display = '';
      backBtn.onclick = () => renderSeriesActivity(data);
      openCoverActivity(+btn.dataset.bookId, btn.dataset.bookName);
    });
  });

  const ssw = body.querySelector('#series-star-widget');
  if (ssw) {
    let currentRating = null;
    let avgRating     = data.avgRating ?? null;
    let voteCount     = data.voteCount ?? 0;
    let canRate       = false;
    const seriesId    = data.id;

    const updateStars = (hoverVal) => {
      const displayVal = hoverVal !== null ? hoverVal : avgRating;
      ssw.querySelectorAll('.star').forEach(s => {
        const p = +s.dataset.pos;
        s.className = (displayVal !== null && displayVal >= p) ? 'star on'
                    : (displayVal !== null && displayVal >= p - 0.5) ? 'star half'
                    : 'star';
      });
      const lbl = ssw.querySelector('.star-label');
      if (hoverVal !== null) {
        lbl.innerHTML = `<span class="star-avg">${hoverVal % 1 === 0 ? hoverVal.toFixed(1) : hoverVal}</span>`;
      } else {
        lbl.innerHTML = coversState._hooks.starLabelHtml?.(avgRating, voteCount, 'series') ?? '';
      }
    };

    updateStars(null);

    if (userLoggedIn && userHasSeries) {
      apiFetch(`/api/series/${seriesId}/rating`).then(async r => {
        if (!r.ok) return;
        const d = await r.json();
        currentRating = d.rating ?? null;
        avgRating     = d.avgRating ?? null;
        voteCount     = d.voteCount ?? 0;
        canRate       = d.canRate ?? false;
        ssw.dataset.userRating = currentRating ?? '';
        if (!canRate) ssw.dataset.tooltip = t('covers.rate_gate_series');
        updateStars(null);
      }).catch(() => {});

      ssw.querySelectorAll('.star').forEach(star => {
        star.addEventListener('mousemove', e => {
          const left = e.offsetX < star.offsetWidth / 2;
          updateStars(+star.dataset.pos - (left ? 0.5 : 0));
        });
        star.addEventListener('click', async e => {
          if (!canRate) { coversState._hooks.flashRatingGate?.(ssw, 'Complete all books in the series first'); return; }
          const left      = e.offsetX < star.offsetWidth / 2;
          const newRating = +star.dataset.pos - (left ? 0.5 : 0);
          const toSave    = newRating === currentRating ? null : newRating;
          const prevRating = currentRating;
          currentRating = toSave;
          ssw.dataset.userRating = toSave ?? '';
          updateStars(null);
          try {
            const res = await apiFetch(`/api/series/${seriesId}/rating`, {
              method: 'PATCH', body: JSON.stringify({ rating: toSave }),
            });
            if (res.ok) {
              const d = await res.json();
              avgRating = d.avgRating ?? null;
              voteCount = d.voteCount ?? 0;
              updateStars(null);
            } else {
              currentRating = prevRating;
              ssw.dataset.userRating = prevRating ?? '';
              updateStars(null);
            }
          } catch {
            currentRating = prevRating;
            ssw.dataset.userRating = prevRating ?? '';
            updateStars(null);
          }
        });
      });
      ssw.addEventListener('mouseleave', () => updateStars(null));
    }
  }
}
