// Compatibility entry point for the public covers and landing background feature.
import { coversState } from './covers/state.js';
import { renderCoverActivity } from './covers/book-dialog.js';
import { renderSeriesActivity } from './covers/series-dialog.js';

export function setCoversHooks(h) { coversState._hooks = h || {}; }
coversState.renderCoverActivity = renderCoverActivity;
coversState.renderSeriesActivity = renderSeriesActivity;

export { _refillLazyIfShort, _startLazy, _refreshCoversDisplay, _showCachedCoversPanel } from './covers/grid.js';
export { _effectiveLandingCoverSource, _applyLandingBgPosition, _canDragLandingBg, _updateLandingBgDragUi, _resetLandingCoverQueue, _startLandingCoverRotation, _stopLandingCoverRotation } from './covers/background.js';
export { pauseCoversAutoRefresh, resumeCoversAutoRefresh, _refreshPublicCatalogIfVisible, _isLandingBooksViewVisible, _visibleCoverItemsExport, loadCovers } from './covers/data.js';
export { openCoverActivity, openSeriesActivity } from './covers/activity.js';
export { _toggleCoverTooltipSettings, resetFeedDisplayPrefsForLogout, setCoversPrefsState } from './covers/prefs.js';
export { initCoversPanel } from './covers/init.js';
