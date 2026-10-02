import { setViewingPt, setOnViewingPtChange } from '../state.js';
import { render, setOnTrailToggle, setOnChoicesRecorded, setAfterRenderFn } from '../play.js';
import { applyTranslations } from '../i18n.js';
import { initCharSheet, renderCharSheetDisplay } from '../charsheet.js';
import { initInventory, setExtraDisplayItemsProvider } from '../inventory.js';
import { initEquipment, getVisibleEquippedItems } from '../equipment.js';
import { savePrefs, _setPlayPanelCollapsed } from '../prefs.js';
import { renderActiveBattleSim } from '../battle-sim-loader.js';
import { initLiveRead, renderLiveRead } from '../reading/liveread.js';
import { initTooltip } from '../ui-helpers/tooltip.js';
import { _refreshInvDisplay } from './helpers.js';

export function initPlayFeatures() {
  applyTranslations();

  initCharSheet();
  initInventory();
  initEquipment();
  initLiveRead();
  // renderLiveRead() also needs to run after every render() (fast-travel
  // jumps and the sidebar's own choice buttons move pt.path without going
  // through setViewingPt, unlike renderLiveRead()'s other trigger below).
  setAfterRenderFn(renderLiveRead);
  setExtraDisplayItemsProvider(async () => await getVisibleEquippedItems());
  setOnViewingPtChange(() => {
    _refreshInvDisplay();
    renderCharSheetDisplay();
    renderActiveBattleSim();
    renderLiveRead();
  });
  initTooltip();

  // ── Legend collapse ──────────────────────────────────────────────
  {
    const legend = document.getElementById('legend');
    const header = document.getElementById('legend-header');
    if (localStorage.getItem('legendCollapsed') === '1') legend.classList.add('legend-collapsed');
    header.addEventListener('click', () => {
      _setPlayPanelCollapsed('legendCollapsed', !legend.classList.contains('legend-collapsed'));
    });
  }
  {
    const panel = document.getElementById('play-xp-summary');
    const header = document.getElementById('play-xp-header');
    if (localStorage.getItem('playXpCollapsed') === '1') panel?.classList.add('play-xp-collapsed');
    header?.addEventListener('click', () => {
      _setPlayPanelCollapsed('playXpCollapsed', !panel?.classList.contains('play-xp-collapsed'));
    });
  }

  // ── Trail collapse prefs hook ────────────────────────────────────
  setOnTrailToggle(v => savePrefs({ trailCollapsed: v ? '1' : '0' }));

  // ── Choices-input onboarding pulse counter ────────────────────────
  setOnChoicesRecorded(n => savePrefs({ choicesRecordedCount: n }));

}
