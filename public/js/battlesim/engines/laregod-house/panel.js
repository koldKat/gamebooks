import { laregodPoints, startLaregodFight, laregodRound } from './core.js';

const ID = 'sim644';
const equipmentKeys = ['sword', 'mail', 'dagger', 'scimitar', 'success', 'stone'];
const contexts = ['yard', 'market', 'guard', 'manual'];
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function createLaregodHousePanel({ document, t, getRun, getBookId, saveState, showAlert,
  showConfirm, getButtonRow, registerShortcut = () => {} }) {
  const tk = (key, params) => t('battlesim644.' + key, params);
  const el = key => document.getElementById(ID + '-' + key);
  let shownRun;
  const busy = d => d?.fight?.status === 'fighting';
  function data() {
    if (Number(getBookId()) !== 644) return null;
    const run = getRun();
    return run ? run[ID] ||= { setup: {}, fight: null, history: [], log: [] } : null;
  }
  function close() { el('overlay')?.classList.remove('active'); }
  function open() {
    if (!data()) { showAlert(t('battlesim.no_active_playthrough')); return; }
    render(); el('overlay').classList.add('active');
  }
  function number(key) {
    const text = el(key).value.trim(), value = Number(text);
    if (!text || !Number.isSafeInteger(value) || value < 0 || value > 1000000) throw new RangeError('Invalid random number');
    return value;
  }
  function snapshot(d) {
    d.setup = Object.fromEntries([...el('setup').querySelectorAll('input,select')].map(field =>
      [field.id, field.type === 'checkbox' ? field.checked : field.value]));
  }
  function action(update) {
    const run = getRun(), original = data();
    if (!original) return;
    try {
      const d = structuredClone(original);
      update(d);
      if (run !== getRun() || Number(getBookId()) !== 644) return;
      if (d.fight && !d.fight.recorded && ['win', 'loss'].includes(d.fight.status)) {
        d.fight.recorded = true;
        d.history.push({ enemy: d.encounter, outcome: d.fight.status,
          ts: Math.max(Date.now(), (d.history.at(-1)?.ts ?? 0) + 1) });
      }
      d.log = d.log.slice(-100);
      run[ID] = d; saveState(); render();
    } catch (_) { showAlert(tk('invalid')); }
  }
  function start(d) {
    if (busy(d)) return;
    const context = el('context').value;
    const equipment = Object.fromEntries(equipmentKeys.map(key => [key, el(key).checked]));
    d.manualRandom = el('manualRandom').checked;
    d.fight = startLaregodFight(context, { equipment, opponent: el('opponent').value,
      enemyNumber: d.manualRandom ? number('enemyNumber') : undefined });
    d.encounter = tk(context === 'manual' ? 'opponent.' + d.fight.opponent : 'context.' + context);
    snapshot(d);
    d.log.push(tk('started', { enemy: d.encounter, player: d.fight.player.points,
      opponent: d.fight.enemy.points, number: d.fight.enemyNumber }));
  }
  function step(d) {
    const result = laregodRound(d.fight, { number: d.manualRandom ? number('number') : undefined });
    d.fight = result.fight;
    d.log.push(tk('round', { n: d.fight.round, number: result.number, player: result.playerRating,
      enemy: result.enemyRating, playerLoss: result.playerLoss, enemyLoss: result.enemyLoss }));
    if (!busy(d)) d.log.push(tk('status.' + d.fight.status));
  }
  function render() {
    if (!el('overlay')) return;
    const d = data();
    if (!d) { shownRun = undefined; close(); return; }
    if (shownRun !== getRun()) {
      shownRun = getRun();
      for (const field of el('setup').querySelectorAll('input,select')) {
        if (field.type === 'checkbox') field.checked = d.setup[field.id] ?? field.defaultChecked;
        else field.value = d.setup[field.id] ?? (field.tagName === 'SELECT' ? field.options[0].value : field.defaultValue);
      }
      el('number').value = '0';
    }
    const active = busy(d), f = d.fight;
    for (const field of el('setup').querySelectorAll('input,select')) field.disabled = active;
    el('manualOpponent').hidden = el('context').value !== 'manual';
    el('enemyNumberRow').hidden = !el('manualRandom').checked;
    el('manualRound').hidden = !active || !d.manualRandom;
    el('number').disabled = !active || !d.manualRandom;
    el('start').disabled = active; el('attack').disabled = !active; el('cancel').disabled = !active;
    const context = el('context').value;
    const opponent = context === 'guard' ? 'other' : context === 'manual' ? el('opponent').value : 'wingrugur';
    const equipment = Object.fromEntries(equipmentKeys.map(key => [key, el(key).checked]));
    el('points').textContent = tk('points', { n: f && active ? f.player.points : laregodPoints(equipment, opponent, context) });
    el('status').textContent = f ? tk('status.' + f.status) + ' | ' + tk('health', {
      player: f.player.endurance, enemy: f.enemy.endurance }) : tk('ready');
    el('log').innerHTML = d.log.slice().reverse().map(line => `<div>${escape(line)}</div>`).join('');
    el('history').innerHTML = d.history.slice(-30).reverse().map(h => `<div>${escape(h.enemy)} | ${escape(tk('status.' + h.outcome))}</div>`).join('');
  }
  const check = key => `<label class="bsim-checkbox"><input type="checkbox" id="${ID}-${key}">${escape(tk(key))}</label>`;
  const button = key => `<button class="bsim-action-btn" type="button" id="${ID}-${key}">${escape(tk(key))}</button>`;
  const input = key => `<label class="inv-edit-row" id="${ID}-${key}Row">${escape(tk(key))}<input class="inv-edit-input" type="number" min="0" max="1000000" step="1" value="0" id="${ID}-${key}"></label>`;
  function init() {
    if (el('overlay')) return;
    const overlay = document.createElement('div');
    overlay.id = ID + '-overlay'; overlay.className = 'inv-overlay';
    overlay.innerHTML = `<div class="inv-modal bsim-modal bsim-compact-form"><div class="inv-modal-hdr"><span class="inv-modal-title">${escape(tk('title'))}</span><button class="inv-close-btn" id="${ID}-close" aria-label="${escape(t('btn.close'))}">&times;</button></div><div class="bsim-body"><div class="bsim-col bsim-col-left"><div id="${ID}-setup"><p>${escape(tk('note'))}</p><label class="inv-edit-row">${escape(tk('context'))}<select class="inv-edit-input" id="${ID}-context">${contexts.map(key => `<option value="${key}">${escape(tk('context.' + key))}</option>`).join('')}</select></label><label class="inv-edit-row" id="${ID}-manualOpponent">${escape(tk('opponent'))}<select class="inv-edit-input" id="${ID}-opponent">${['other', 'wingrugur', 'butchersword'].map(key => `<option value="${key}">${escape(tk('opponent.' + key))}</option>`).join('')}</select></label><div class="bsim-side"><div class="bsim-side-title">${escape(tk('equipment'))}</div>${equipmentKeys.map(check).join('')}<div id="${ID}-points"></div></div>${check('manualRandom')}<p>${escape(tk('randomNote'))}</p>${input('enemyNumber')}</div><div class="bsim-btn-row">${button('start')}${button('cancel')}${button('attack')}</div><div id="${ID}-manualRound">${input('number')}</div><div class="bsim-status" id="${ID}-status"></div></div><div class="bsim-col bsim-col-right"><details class="bsim-history"><summary>${escape(tk('history'))}</summary><div class="bsim-history-list" id="${ID}-history"></div></details><div class="bsim-log" id="${ID}-log"></div></div></div></div>`;
    document.body.appendChild(overlay);
    const btn = document.createElement('button');
    btn.id = ID + '-btn'; btn.textContent = t('battlesim.title'); btn.style.display = 'none';
    getButtonRow().appendChild(btn); btn.addEventListener('click', open);
    el('close').addEventListener('click', close);
    let backdrop = false;
    overlay.addEventListener('mousedown', event => { backdrop = event.target === overlay; });
    overlay.addEventListener('click', event => { if (backdrop && event.target === overlay) close(); });
    overlay.addEventListener('keydown', event => { if (event.key === 'Escape') { event.stopPropagation(); close(); } });
    registerShortcut({ button: btn, overlay, open, close });
    el('setup').addEventListener('change', () => { if (!busy(data())) action(snapshot); });
    el('start').addEventListener('click', () => action(start));
    el('attack').addEventListener('click', () => action(step));
    el('cancel').addEventListener('click', () => {
      const run = getRun(), original = data();
      if (!busy(original)) return;
      showConfirm(tk('cancelConfirm'), () => {
        if (run === getRun() && original === data()) action(d => { if (busy(d)) d.fight.status = 'cancelled'; });
      });
    });
  }
  return { init, render, setVisible(visible) {
    const btn = el('btn'); if (btn) btn.style.display = visible ? '' : 'none'; if (!visible) close();
  } };
}
