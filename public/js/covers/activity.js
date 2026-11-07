import { loadingHtml } from '../ui-helpers/loading.js';
import { coversState } from './state.js';
import { getToken, apiFetch } from '../core/state.js';
import { openPublicModal } from '../account/public-profile.js';
import { fetchPublic as publicFetch } from '../core/util.js';
import { t } from '../i18n.js';

// ── Cover/series activity modals ───────────────────────────────────────────────
export async function openCoverActivity(bookId, bookName) {
  openPublicModal();
  document.getElementById('pub-back-btn').style.display  = 'none';
  const body = document.getElementById('pub-modal-body');
  const serverRendered = body.dataset.serverEntry === `book:${bookId}`;
  if (!serverRendered) document.getElementById('pub-modal-title').textContent = bookName;
  if (!serverRendered) body.innerHTML = loadingHtml(t('covers.loading'), 'pub-loading');
  try {
    const userLoggedIn = !!getToken();
    // These requests are independent; do not add a second round trip before rendering.
    const [res, ratingData] = await Promise.all([
      userLoggedIn ? apiFetch(`/api/public/book/${bookId}/activity`) : publicFetch(`/api/public/book/${bookId}/activity`),
      userLoggedIn ? apiFetch(`/api/books/${bookId}/rating`)
        .then(r => r.ok ? r.json() : null).catch(() => null) : null,
    ]);
    if (!res.ok) throw new Error();
    const data = await res.json();

    let userRating;
    let userCanRate = true;
    let userOwnsBook   = false;
    if (ratingData) {
      userOwnsBook = true;
      userRating = ratingData.rating;
      userCanRate = ratingData.canRate ?? true;
    }

    coversState.renderCoverActivity(bookId, data.book?.name ?? bookName, data.entries ?? [], userRating, data.book, userLoggedIn, userOwnsBook, userCanRate);
  } catch {
    if (!serverRendered) body.innerHTML = `<p class="pub-error">${t('covers.activity_load_failed')}</p>`;
  } finally {
    delete body.dataset.serverEntry;
  }
}

export async function openSeriesActivity(seriesId, seriesName) {
  openPublicModal();
  document.getElementById('pub-back-btn').style.display  = 'none';
  const body = document.getElementById('pub-modal-body');
  const serverRendered = body.dataset.serverEntry === `series:${seriesId}`;
  if (!serverRendered) document.getElementById('pub-modal-title').textContent = seriesName;
  if (!serverRendered) body.innerHTML = loadingHtml(t('covers.loading'), 'pub-loading');
  try {
    // Include optional auth so the server can filter per-user PDF metadata.
    const token = getToken();
    const res = await publicFetch(`/api/public/series/${seriesId}`, token ? { headers: { Authorization: `Bearer ${token}` } } : undefined);
    if (!res.ok) throw new Error();
    const data = await res.json();
    coversState.renderSeriesActivity(data);
  } catch {
    if (!serverRendered) body.innerHTML = `<p class="pub-error">${t('covers.series_load_failed')}</p>`;
  } finally {
    delete body.dataset.serverEntry;
  }
}

// PDF badges rely on the server's permission-filtered pdfPath.
