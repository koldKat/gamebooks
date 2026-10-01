import { _effectiveCoversKindMode } from './filters.js';
import { _syncCoverFavoriteButton } from './markup.js';
import { _removeFavoriteThumbInPlace } from './grid.js';
import { openCoverActivity, openSeriesActivity } from './activity.js';
import { coversState } from './state.js';
import { getToken, isDemoMode } from '../state.js';

export function _initCoverNavigation() {
  // Covers panel click (favorites + thumb navigation)
  document.getElementById('covers-panel').addEventListener('click', e => {
    const favBtn = e.target.closest('.cover-fav-btn');
    if (favBtn) {
      e.stopPropagation();
      if (!getToken() || isDemoMode) return;
      const id = Number(favBtn.dataset.favId);
      let isFavorite = false;
      if (favBtn.dataset.favType === 'series') {
        if (coversState._favoriteSeriesIds.has(id)) coversState._favoriteSeriesIds.delete(id);
        else coversState._favoriteSeriesIds.add(id);
        isFavorite = coversState._favoriteSeriesIds.has(id);
      } else {
        if (coversState._favoriteBookIds.has(id)) coversState._favoriteBookIds.delete(id);
        else coversState._favoriteBookIds.add(id);
        isFavorite = coversState._favoriteBookIds.has(id);
      }
      coversState._hooks.savePrefs?.({
        favoriteBookIds: [...coversState._favoriteBookIds].sort((a, b) => a - b),
        favoriteSeriesIds: [...coversState._favoriteSeriesIds].sort((a, b) => a - b),
      });
      coversState._hooks.onFavoriteToggled?.();
      const coversPanel = document.getElementById('covers-panel');
      const coversSearchEl = document.getElementById('covers-search');
      const favoritesMode = _effectiveCoversKindMode() === 'favorites';
      const searching = coversPanel?.classList.contains('covers-searching') && coversSearchEl?.value.trim();
      if (searching) {
        coversSearchEl.dispatchEvent(new Event('input'));
      } else if (favoritesMode) {
        if (isFavorite) {
          _syncCoverFavoriteButton(favBtn, true);
        } else {
          _removeFavoriteThumbInPlace(favBtn);
        }
      } else {
        _syncCoverFavoriteButton(favBtn, isFavorite);
      }
      return;
    }
    const thumb = e.target.closest('.cover-thumb');
    if (!thumb) return;
    if (thumb.dataset.seriesId) {
      openSeriesActivity(+thumb.dataset.seriesId, thumb.dataset.seriesName || '');
      return;
    }
    openCoverActivity(+thumb.dataset.bookId, thumb.dataset.bookName);
  });

}
