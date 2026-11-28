import {definition, opponents, companions, encounters, rules, loadRoster} from './definition.js';
import {createD20Panel} from '../../engines/d20/panel.js';
import {currentBookId, currentPlaythrough, saveState, apiFetch} from '../../run-context.js';
import {getPlayBtnRow} from '../../../play/charsheet.js';
import {showAlert, showConfirm} from '../../../ui-helpers/confirm.js';
import {registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS} from '../../../core/util.js';
import {t} from '../../../i18n.js';

export const loadData = () => loadRoster(apiFetch);

const panel = createD20Panel({
  document, definition, t,
  getRoster: () => encounters,
  getOpponents: () => opponents,
  getCompanions: () => companions,
  getRules: () => rules,
  getRun: currentPlaythrough,
  getBookId: () => currentBookId,
  saveState, getButtonRow: getPlayBtnRow, showAlert, showConfirm,
  registerShortcut({button, overlay, open, close}) {
    button.innerHTML = shortcutLabel(t('battlesim.title'));
    registerPanelShortcut('KeyS', {
      getButton: () => button, getOverlay: () => overlay,
      otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== overlay.id), open, close,
    });
  },
});

export const {init, render, setVisible} = panel;
