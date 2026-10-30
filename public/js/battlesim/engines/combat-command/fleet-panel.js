// Connect optional fleet encounter controls to the current user's saved playthrough.
import { createFleetPanelState, fleetBattleActive, storeFleetPanelBattle } from './fleet-state.js';
import { startFleetBattle } from './fleet-battle.js';
import { createFleetSetupPanel } from './fleet-setup-panel.js';
import { renderFleetControls } from './fleet-controls-panel.js';
import { renderFleetReport } from './fleet-report-panel.js';
import { escapeFleet, fleetSelect, fleetButton } from './fleet-form.js';

export function createFleetPanel({ document, definition, getRoster, getPlayerDefaults, getCharts, t,
  getRun, getBookId, saveState, getButtonRow, showAlert, registerShortcut = () => {} }) {
  const id = definition.stateKey, el = key => document.getElementById(`${id}-${key}`);
  let shownRun, mountedEncounter, wasActive = false, setup, encounter, start;
  const data = () => Number(getBookId()) === definition.id ? getRun()?.[id] : null;
  const close = () => el('overlay')?.classList.remove('active');
  function action(update, expectedFight) {
    const run = getRun(), original = data();
    if (!original || run !== shownRun || expectedFight && original.fight !== expectedFight) return;
    try {
      const next = update(structuredClone(original));
      if (!next || run !== getRun() || data() !== original) return;
      run[id] = next; saveState(); render();
    } catch (error) { showAlert(error.message ?? 'Check the fleet values.'); }
  }
  const dispatch = (update, expectedFight) => action(state => storeFleetPanelBattle(state, update(state.fight)), expectedFight);
  function render() {
    if (!el('overlay')) return;
    const run = getRun();
    if (!run || Number(getBookId()) !== definition.id) { shownRun = undefined; close(); return; }
    const state = run[id] ??= createFleetPanelState(getPlayerDefaults());
    const active = fleetBattleActive(state.fight), preset = getRoster().find(entry => entry.key === state.encounter);
    if (shownRun !== run || mountedEncounter !== state.encounter || wasActive && !active) {
      setup.mount(state, preset); mountedEncounter = state.encounter;
    }
    shownRun = run; wasActive = active;
    encounter.value = state.encounter; encounter.disabled = active; start.disabled = active;
    setup.lock(active);
    renderFleetControls({ document, holder: el('controls'), fight: state.fight, dispatch });
    renderFleetReport({ result: el('result'), forces: el('opponents'), log: el('log'), history: el('history') }, state);
  }
  function open() {
    if (!getRun() || Number(getBookId()) !== definition.id) { showAlert(t('battlesim.no_active_playthrough')); return; }
    render(); el('overlay').classList.add('active');
  }
  function init() {
    if (el('overlay')) return;
    const overlay = document.createElement('div'); overlay.id = `${id}-overlay`; overlay.className = 'inv-overlay';
    overlay.innerHTML = `<div class="inv-modal bsim-modal bsim-compact-form"><div class="inv-modal-hdr"><span class="inv-modal-title">${escapeFleet(t(`${definition.i18nPrefix}.title`))}</span><button class="inv-close-btn" type="button" id="${id}-close" aria-label="${escapeFleet(t('btn.close'))}">&times;</button></div><div class="bsim-body"><div class="bsim-col bsim-col-left"><div id="${id}-choose"></div><div id="${id}-setup"></div><div class="bsim-btn-row" id="${id}-start-row"></div><div id="${id}-controls"></div></div><div class="bsim-col bsim-col-right"><h4 class="bsim-side-title" id="${id}-result" role="status"></h4><div class="bsim-log" id="${id}-opponents"></div><h4 class="bsim-side-title">Combat log</h4><div class="bsim-log" id="${id}-log"></div><h4 class="bsim-side-title">Battle history</h4><div class="bsim-log" id="${id}-history"></div></div></div></div>`;
    document.body.appendChild(overlay);
    encounter = fleetSelect(document, el('choose'), 'Encounter / formation', [{ value: '', label: 'Custom fight' },
      ...getRoster().map(entry => ({ value: entry.key, label: entry.name }))]);
    encounter.id = `${id}-encounter`;
    setup = createFleetSetupPanel({ document, holder: el('setup'), id, t, getRoster, getPlayerDefaults });
    encounter.addEventListener('change', () => action(state => fleetBattleActive(state.fight) ? undefined : { ...state, encounter: encounter.value }));
    start = fleetButton(document, el('start-row'), 'Start encounter', () => action(state => {
      if (fleetBattleActive(state.fight)) return;
      const values = setup.read();
      state.morale = values.setup.morale; state.stealth = values.setup.stealth;
      if (!state.encounter) state.custom = values.custom;
      return storeFleetPanelBattle(state, startFleetBattle(values.player, values.config, getCharts(), values.setup));
    }));
    start.id = `${id}-start`;
    const launch = document.createElement('button'); launch.id = `${id}-btn`; launch.style.display = 'none';
    getButtonRow().appendChild(launch); launch.addEventListener('click', open); el('close').addEventListener('click', close);
    registerShortcut({ button: launch, overlay, open, close });
    let backdrop = false;
    overlay.addEventListener('mousedown', event => { backdrop = event.target === overlay; });
    overlay.addEventListener('click', event => { if (backdrop && event.target === overlay) close(); });
    overlay.addEventListener('keydown', event => { if (event.key === 'Escape') { event.stopPropagation(); close(); } });
  }
  return { init, render, setVisible(value) {
    const launch = el('btn'); if (launch) launch.style.display = value ? '' : 'none'; if (!value) close();
  } };
}
