import { _isMobile } from './helpers.js';
import { escapeHtml } from '../core/util.js';

export function _initCoverPreview() {
  // Cover hover preview
  const _coverPopup      = document.getElementById('cover-preview-popup');
  const _coverPopupImg   = document.getElementById('cover-preview-popup-img');
  const _coverPopupSeries = document.getElementById('cover-preview-popup-series');
  const _coverPopupTitle = document.getElementById('cover-preview-popup-title');
  const _hideCoverPopup = () => {
    _coverPopup.classList.remove('visible', 'series-preview');
    if (_coverPopupSeries) _coverPopupSeries.innerHTML = '';
  };
  // Show the single-cover (non-series) enlarge popup anchored to `anchorEl`.
  // Shared by the covers-panel thumbs and the book info dialog's header cover.
  const _showSingleCoverPopup = (anchorEl, coverUrl, title) => {
    _coverPopup.classList.remove('series-preview');
    _coverPopupImg.src = coverUrl;
    _coverPopupTitle.textContent = title || '';
    _coverPopup.classList.add('visible');
    const rect = anchorEl.getBoundingClientRect();
    const top  = Math.min(rect.top, window.innerHeight - _coverPopup.offsetHeight - 8);
    _coverPopup.style.left = (rect.right + 8) + 'px';
    _coverPopup.style.top  = Math.max(8, top) + 'px';
  };
  document.getElementById('covers-panel').addEventListener('mouseover', e => {
    // Skip hover previews on mobile; synthetic mouseover can swallow the intended tap.
    if (_isMobile()) return;
    const thumb = e.target.closest('.cover-thumb');
    if (!thumb) { _hideCoverPopup(); return; }
    if (thumb.dataset.seriesId) {
      const raw = thumb.dataset.seriesCoverSources;
      const bookCount = Number(thumb.dataset.seriesBookCount) || 0;
      let sources = [];
      try { sources = raw ? JSON.parse(raw) : []; } catch (_) {}
      if (!sources.length) { _hideCoverPopup(); return; }
      const title = thumb.dataset.seriesName || '';
      const useSingleSeriesCover = sources.length < 4;
      _coverPopup.classList.add('series-preview');
      _coverPopupSeries.innerHTML =
        (useSingleSeriesCover
          ? `<div class="cover-series-grid cover-series-grid--single">` +
              `<div class="cover-series-cell"><img src="${escapeHtml(sources[0])}" alt=""></div>` +
            `</div>`
          : `<div class="cover-series-grid">` +
              sources.map(src => `<div class="cover-series-cell"><img src="${escapeHtml(src)}" alt=""></div>`).join('') +
              Array.from({ length: Math.max(0, 4 - sources.length) }, () => `<div class="cover-series-cell"></div>`).join('') +
            `</div>`);
      _coverPopupTitle.textContent = title;
      _coverPopup.classList.add('visible');
      const rect = thumb.getBoundingClientRect();
      const top  = Math.min(rect.top, window.innerHeight - _coverPopup.offsetHeight - 8);
      _coverPopup.style.left = (rect.right + 8) + 'px';
      _coverPopup.style.top  = Math.max(8, top) + 'px';
      return;
    }
    const coverUrl = thumb.dataset.coverUrl;
    const img = thumb.querySelector('img');
    if (!coverUrl || !img || img.style.opacity !== '1') { _hideCoverPopup(); return; }
    _showSingleCoverPopup(thumb, coverUrl, thumb.dataset.bookName || thumb.dataset.seriesName || '');
  });
  document.getElementById('covers-panel').addEventListener('mouseout', e => {
    const fromThumb = e.target.closest('.cover-thumb');
    if (!fromThumb) return;
    const toThumb = e.relatedTarget?.closest?.('.cover-thumb');
    if (toThumb !== fromThumb) _hideCoverPopup();
  });
  document.getElementById('covers-panel').addEventListener('mouseleave', _hideCoverPopup);

  // Preview dialog covers above the modal, except on touch-only mobile.
  const _pubOverlay = document.getElementById('public-modal-overlay');
  if (_pubOverlay) {
    _pubOverlay.addEventListener('mouseover', e => {
      if (_isMobile()) return;
      const cov = e.target.closest('.book-modal-cover');
      if (!cov) { _hideCoverPopup(); return; }
      const url = cov.currentSrc || cov.src;
      if (!url) { _hideCoverPopup(); return; }
      _showSingleCoverPopup(cov, url, cov.getAttribute('alt') || '');
    });
    _pubOverlay.addEventListener('mouseout', e => {
      const from = e.target.closest('.book-modal-cover');
      if (from && e.relatedTarget?.closest?.('.book-modal-cover') !== from) _hideCoverPopup();
    });
    _pubOverlay.addEventListener('mouseleave', _hideCoverPopup);
  }

}
