import { currentBookId, currentPlaythrough, saveState } from "../../../core/state.js";
import { getPlayBtnRow } from "../../../play/charsheet.js";
import { showAlert, showConfirm } from "../../../ui-helpers/confirm.js";
import { registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from "../../../core/util.js";
import { t } from "../../../i18n.js";
import { createFabledPanel } from "../.././engines/fabled-lands/panel.js";
import { RISING_FIGHTS, RISING_DEFAULTS, RISING_SEA_CHECKS, risingSeaCheck,
  startRisingFight, risingRound, fleeRisingFight } from "../.././engines/fabled-lands/rising-sun.js";

const sectionsFor = special => RISING_FIGHTS.filter(f=>f.special===special).map(f=>f.section);
const panel = createFabledPanel({ document, t, getRun: currentPlaythrough,
  getBookId: () => currentBookId, saveState, showAlert, showConfirm, getButtonRow: getPlayBtnRow,
  bookId:679, fights:RISING_FIGHTS, characterDefaults:RISING_DEFAULTS,
  seaChecks:RISING_SEA_CHECKS, seaCheck:risingSeaCheck, startFight:startRisingFight,
  roundFight:risingRound, fleeFight:fleeRisingFight,
  extraFlags:['divineWrath','diseaseBlessing','permanentStorms'],
  encounterOptions:[
    {key:'light',type:'checkbox',sections:sectionsFor('darkness')},
    {key:'subdue',type:'checkbox',sections:sectionsFor('subdue')},
    {key:'weaponBonus',min:0,max:12,sections:sectionsFor('subdue')},
    {key:'exchangedWeaponBonus',min:-2,max:12,sections:sectionsFor('exchangedWeapon')},
    {key:'crimsonArrow',type:'checkbox',sections:sectionsFor('poisonSpider')},
    {key:'divineWrathUse',type:'checkbox',sections:RISING_FIGHTS.map(f=>f.section)},
    {key:'enemyDamage',min:0,max:RISING_FIGHTS.find(f=>f.special==='morituriOutside').enemies[0].stamina-1,sections:sectionsFor('morituriOutside')},
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

export { initSim679 as init, renderSim679 as render, setSim679Visible as setVisible };
