import { coversState } from './state.js';
import { getToken, apiFetch } from '../core/state.js';
import { openPublicModal } from '../account/public-profile.js';
import { fetchPublic as publicFetch } from '../core/util.js';
import { t } from '../i18n.js';

// ── Cover/series activity modals ───────────────────────────────────────────────
export async function openCoverActivity(bookId, bookName) {
  openPublicModal();
  document.getElementById('pub-modal-title').textContent = bookName;
  document.getElementById('pub-back-btn').style.display  = 'none';
  document.getElementById('pub-modal-body').innerHTML    = `<p class="pub-loading">${t('covers.loading')}</p>`;
  try {
    const res = getToken()
      ? await apiFetch(`/api/public/book/${bookId}/activity`)
      : await publicFetch(`/api/public/book/${bookId}/activity`);
    if (!res.ok) throw new Error();
    const data = await res.json();

    let userRating;
    let userCanRate = true;
    const userLoggedIn = !!getToken();
    let userOwnsBook   = false;
    if (userLoggedIn) {
      try {
        const rRes = await apiFetch(`/api/books/${bookId}/rating`);
        if (rRes.ok) {
          const rData = await rRes.json();
          userOwnsBook = true;
          userRating   = rData.rating;
          userCanRate  = rData.canRate ?? true;
        }
      } catch {}
    }

    coversState.renderCoverActivity(bookId, data.book?.name ?? bookName, data.entries ?? [], userRating, data.book, userLoggedIn, userOwnsBook, userCanRate);
  } catch {
    document.getElementById('pub-modal-body').innerHTML = `<p class="pub-error">${t('covers.activity_load_failed')}</p>`;
  }
}

export async function openSeriesActivity(seriesId, seriesName) {
  openPublicModal();
  document.getElementById('pub-modal-title').textContent = seriesName;
  document.getElementById('pub-back-btn').style.display  = 'none';
  document.getElementById('pub-modal-body').innerHTML    = `<p class="pub-loading">${t('covers.loading')}</p>`;
  try {
    // Send the auth token if we have one (unauthenticated visitors still get
    // a 200) so the server can decide whether to include pdfPath on each
    // book - the endpoint is otherwise public, but PDF availability is
    // per-user metadata (see server/db/books.js getPublicSeriesInfo).
    const token = getToken();
    const res = await publicFetch(`/api/public/series/${seriesId}`, token ? { headers: { Authorization: `Bearer ${token}` } } : undefined);
    if (!res.ok) throw new Error();
    const data = await res.json();
    coversState.renderSeriesActivity(data);
  } catch {
    document.getElementById('pub-modal-body').innerHTML = `<p class="pub-error">${t('covers.series_load_failed')}</p>`;
  }
}

// Battle sim / live reading / PDF badges for series-modal book rows. Mirrors
// the SVGs and badge classes used in books.js's My Books cards so the icon
// language is consistent app-wide; the PDF badge only renders if the server
// included a pdfPath (it strips that field server-side for users without
// pdf_access, so no client-side gating is needed here).
