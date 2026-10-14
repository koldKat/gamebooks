import { currentBookId, currentPlaythrough, saveState } from '../core/state.js';
import { getPlayBtnRow } from '../play/charsheet.js';
import { showAlert, showConfirm } from '../ui-helpers/confirm.js';
import { registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from '../core/util.js';
import { t } from '../i18n.js';
import { createFabledPanel } from './engines/fabled-lands/panel.js';
import { RISING_FIGHTS, RISING_DEFAULTS, RISING_SEA_CHECKS, risingSeaCheck,
  startRisingFight, risingRound, fleeRisingFight } from './engines/fabled-lands/rising-sun.js';

const panel = createFabledPanel({ document, t, getRun: currentPlaythrough,
  getBookId: () => currentBookId, saveState, showAlert, showConfirm, getButtonRow: getPlayBtnRow,
  bookId:679, fights:RISING_FIGHTS, characterDefaults:RISING_DEFAULTS,
  seaChecks:RISING_SEA_CHECKS, seaCheck:risingSeaCheck, startFight:startRisingFight,
  roundFight:risingRound, fleeFight:fleeRisingFight,
  extraFlags:['divineWrath','diseaseBlessing','permanentStorms'],
  encounterOptions:[
    {key:'light',type:'checkbox',sections:[624]},
    {key:'subdue',type:'checkbox',sections:[490]},
    {key:'weaponBonus',min:0,max:12,sections:[490]},
    {key:'exchangedWeaponBonus',min:-2,max:12,sections:[656]},
    {key:'crimsonArrow',type:'checkbox',sections:[481]},
    {key:'divineWrathUse',type:'checkbox',sections:RISING_FIGHTS.map(f=>f.section)},
    {key:'enemyDamage',min:0,max:37,sections:[460]},
  ],
  registerShortcut({ button, overlay, open, close }) {
    button.innerHTML = shortcutLabel(t('battlesim.title'));
    registerPanelShortcut('KeyS',{getButton:()=>button,getOverlay:()=>overlay,
      otherOverlayIds:ALL_PANEL_OVERLAY_IDS.filter(id=>id!==overlay.id),open,close});
  },
});
export function initSim679() { panel.init(); }
export function renderSim679() { panel.render(); }
export function setSim679Visible(visible) { panel.setVisible(visible); }
