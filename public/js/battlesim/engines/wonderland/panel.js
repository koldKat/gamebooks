import { WONDERLAND_ENCOUNTERS } from './roster.js';
import { createWonderlandCharacter, wonderlandTest, wonderlandInteger } from './random.js';
import { startWonderlandFight, wonderlandRound, resolveWonderlandInitiative } from './core.js';

const ID = 'sim636';
const attributes = ['agility', 'logic', 'combat', 'endurance', 'insanity'];
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function createWonderlandPanel({ document, t, getRun, getBookId, saveState, showAlert,
  showConfirm, getButtonRow, registerShortcut = () => {} }) {
  const tk = (key, params) => t('battlesim636.' + key, params);
  const el = key => document.getElementById(ID + '-' + key);
  let shownRun, shownData;
  const busy = d => d?.fight?.status === 'fighting';
  const spec = () => WONDERLAND_ENCOUNTERS.find(row => row.section === Number(el('encounter').value));
  const label = row => tk('encounter_label', { enemy: row.enemies.map(e => e.name).join(' / '), section: row.section });
  function data() {
    if (Number(getBookId()) !== 636) return null;
    const run = getRun();
    return run ? run[ID] ||= { character: createWonderlandCharacter({ agility: 3, logic: 3, combat: 3, endurance: 1 }),
      setup: {}, fight: null, history: [], log: [] } : null;
  }
  function close() { el('overlay')?.classList.remove('active'); }
  function open() {
    if (!data()) { showAlert(t('battlesim.no_active_playthrough')); return; }
    render(); el('overlay').classList.add('active');
  }
  function number(key, min = 0, half = false) {
    if (!el(key).value.trim()) throw new RangeError('Missing value');
    const value = Number(el(key).value);
    if (half) {
      if (!Number.isFinite(value) || !Number.isInteger(value * 2) || value < min || value > 1000000) throw new RangeError('Invalid Endurance');
      return value;
    }
    return wonderlandInteger(value, min);
  }
  function action(update) {
    const run = getRun(), original = data();
    if (!original) return;
    try {
      const d = structuredClone(original);
      update(d);
      if (getRun() !== run || Number(getBookId()) !== 636) return;
      if (d.fight && !d.fight.recorded && ['win', 'loss'].includes(d.fight.status)) {
        d.fight.recorded = true;
        d.history.push({ enemy: d.encounter, outcome: d.fight.status,
          ts: Math.max(Date.now(), (d.history.at(-1)?.ts ?? 0) + 1) });
      }
      d.log = d.log.slice(-100);
      run[ID] = d; saveState(); render();
    } catch (_) { showAlert(tk('invalid')); }
  }
  function confirm(key, update) {
    const run = getRun(), original = data();
    if (!original) return;
    showConfirm(tk(key), () => { if (run === getRun() && original === data()) action(update); });
  }
  function snapshot(d) {
    d.setup = Object.fromEntries([...el('setup').querySelectorAll('input,select')].map(input =>
      [input.id, input.type === 'checkbox' ? input.checked : input.value]));
  }
  function saveCharacter(d) {
    if (busy(d)) throw new RangeError('Finish the current fight');
    for (const key of [...attributes, 'curiouser', 'pen', 'cakeUses', 'pepperUses']) {
      d.character[key] = number(key, 0, key === 'endurance');
    }
    snapshot(d);
  }
  function start(d) {
    if (busy(d)) return;
    saveCharacter(d);
    const source = spec();
    if (!source) throw new RangeError('Missing encounter');
    const encounter = { ...source, enemies: source.enemies.map((enemy, i) => ({ ...enemy,
      combat: number('enemy' + i + 'Combat'), endurance: number('enemy' + i + 'Endurance', .5, true) })) };
    d.fight = startWonderlandFight(d.character, encounter, {
      initiative: el('initiative').value, mode: el('mode').value, weapon: el('weapon').value,
      protection: el('protection').value, teapotInjury: el('teapotInjury').checked,
      cake: el('cake').checked, cakeUses: d.character.cakeUses,
      pepper: el('pepper').checked, pepperUses: d.character.pepperUses,
    });
    d.character.cakeUses -= d.fight.cakeSpent;
    d.character.pepperUses -= d.fight.pepperSpent;
    d.character.endurance = d.fight.player.endurance;
    d.encounter = label(source);
    snapshot(d);
    d.log.push(tk('started', { enemy: d.encounter }));
  }
  function step(d) {
    const result = wonderlandRound(d.fight);
    d.fight = result.fight;
    d.character.combat = d.fight.player.combat;
    d.character.endurance = d.fight.player.endurance;
    const random = result.draws.map(draw => draw.cards.length
      ? draw.cards.map(c => tk('card', { rank: c.rank === 1 ? 'A' : c.rank === 11 ? 'J' : c.rank === 12 ? 'Q' : c.rank === 13 ? 'K' : c.rank, suit: tk(c.suit) })).join(' + ')
      : draw.dice.join(' + ')).join(' | ');
    d.log.push(tk('round', { n: d.fight.round, rating: result.playerRating, loss: result.playerLoss,
      enemies: result.results.map(r => `${d.fight.enemies[r.index].name}: ${r.enemyRating}, -${r.enemyLoss}`).join('; '), random }));
    if (d.fight.status !== 'fighting') d.log.push(tk('status.' + d.fight.status));
  }
  function preset(force = false) {
    if (!force && busy(data())) return;
    const row = spec();
    if (!row) return;
    el('enemies').innerHTML = row.enemies.map((enemy, i) => `<div class="bsim-side"><div class="bsim-side-title">${escape(enemy.name)}</div>${input('enemy' + i + 'Combat', 'combat', enemy.combat)}${input('enemy' + i + 'Endurance', 'endurance', enemy.endurance, .5, '.5')}</div>`).join('');
    el('initiative').value = row.initiative ?? '';
    el('teapotInjury').checked = false;
    el('teapotRow').hidden = row.section !== 271;
    el('pepper').checked = false;
  }
  function render() {
    if (!el('overlay')) return;
    const d = data();
    if (!d) { close(); return; }
    if (shownRun !== getRun()) {
      shownRun = getRun(); shownData = undefined;
      for (const field of el('setup').querySelectorAll('input,select')) {
        if (field.type === 'checkbox') field.checked = d.setup[field.id] ?? field.defaultChecked;
        else field.value = d.setup[field.id] ?? (field.tagName === 'SELECT' ? field.options[0].value : field.defaultValue);
      }
      preset(true);
      for (const field of el('setup').querySelectorAll('input,select')) {
        if (d.setup[field.id] === undefined) continue;
        if (field.type === 'checkbox') field.checked = d.setup[field.id];
        else field.value = d.setup[field.id];
      }
      el('initiative').value = d.setup[ID + '-initiative'] ?? spec()?.initiative ?? '';
      el('teapotInjury').checked = d.setup[ID + '-teapotInjury'] ?? false;
    }
    if (shownData !== d) {
      shownData = d;
      for (const key of [...attributes, 'curiouser', 'pen', 'cakeUses', 'pepperUses']) el(key).value = d.character[key] ?? 0;
    }
    const active = busy(d), f = d.fight;
    for (const field of el('setup').querySelectorAll('input,select,button')) field.disabled = active;
    el('start').disabled = active || d.character.endurance <= 0;
    el('attack').disabled = !active || f.pendingInitiative;
    el('cancel').disabled = !active;
    el('initiativeDecision').hidden = !f?.pendingInitiative;
    el('status').textContent = f ? tk('status.' + f.status) + ' · ' + tk('health', {
      life: f.player.endurance, opponents: f.active.map(i => f.enemies[i].name + ': ' + f.enemies[i].endurance).join(' / '),
    }) : tk('ready');
    el('log').innerHTML = d.log.slice().reverse().map(line => `<div>${escape(line)}</div>`).join('');
    el('history').innerHTML = d.history.slice(-30).reverse().map(h => `<div>${escape(h.enemy)} · ${escape(tk('status.' + h.outcome))}</div>`).join('');
  }
  const input = (id, key = id, value = 0, min = 0, step = 1) => `<label class="inv-edit-row">${escape(tk(key))}<input class="inv-edit-input" id="${ID}-${id}" type="number" min="${min}" step="${step}" value="${value}"></label>`;
  const select = (id, keys) => `<label class="inv-edit-row">${escape(tk(id))}<select class="inv-edit-input" id="${ID}-${id}">${keys.map(key => `<option value="${key}">${escape(tk(key || 'chooseInitiative'))}</option>`).join('')}</select></label>`;
  const button = key => `<button class="bsim-action-btn" id="${ID}-${key}" type="button">${escape(tk(key))}</button>`;
  const check = key => `<label class="bsim-checkbox"><input type="checkbox" id="${ID}-${key}">${escape(tk(key))}</label>`;
  function init() {
    if (el('overlay')) return;
    const overlay = document.createElement('div');
    overlay.id = ID + '-overlay'; overlay.className = 'inv-overlay';
    overlay.innerHTML = `<div class="inv-modal bsim-modal bsim-compact-form"><div class="inv-modal-hdr"><span class="inv-modal-title">${escape(tk('title'))}</span><button class="inv-close-btn" id="${ID}-close" aria-label="${escape(t('btn.close'))}">&times;</button></div><div class="bsim-body"><div class="bsim-col bsim-col-left"><div id="${ID}-setup"><p>${escape(tk('note'))}</p><div class="bsim-side"><div class="bsim-side-title">${escape(tk('alice'))}</div>${attributes.map(key => input(key, key, key === 'endurance' ? 21 : key === 'insanity' ? 0 : 9, 0, key === 'endurance' ? '.5' : 1)).join('')}<details><summary>${escape(tk('abilities'))}</summary>${input('curiouser', 'curiouser', 3)}${input('pen', 'pen', 3)}${input('cakeUses')}${input('pepperUses')}</details><details><summary>${escape(tk('newCharacter'))}</summary><p>${escape(tk('allocationNote'))}</p>${['agility', 'logic', 'combat', 'endurance'].map(key => input('points_' + key, key, key === 'endurance' ? 1 : 3)).join('')}${button('allocate')}</details></div>${select('mode', ['dice', 'cards'])}${select('weapon', ['unarmed', 'scissors', 'spade', 'knife', 'tusk', 'axe', 'vorpal', 'club', 'mallet'])}${select('protection', ['none', 'shell', 'tray', 'coat'])}<label class="inv-edit-row">${escape(tk('encounter'))}<select class="inv-edit-input" id="${ID}-encounter">${WONDERLAND_ENCOUNTERS.map(row => `<option value="${row.section}">${escape(label(row))}</option>`).join('')}</select></label>${select('initiative', ['', 'player', 'enemy', 'none'])}<div id="${ID}-teapotRow">${check('teapotInjury')}</div>${check('cake')}${check('pepper')}<details><summary>${escape(tk('enemyStats'))}</summary><div id="${ID}-enemies"></div></details></div><div class="bsim-btn-row">${button('start')}${button('cancel')}${button('attack')}</div><div id="${ID}-status" class="bsim-status"></div><div id="${ID}-initiativeDecision"><p>${escape(tk('mixed'))}</p>${select('nextInitiative', ['player', 'enemy', 'none'])}${button('resolve')}</div><details><summary>${escape(tk('tests'))}</summary>${select('attribute', attributes)}${button('test')}</details></div><div class="bsim-col bsim-col-right"><details class="bsim-history"><summary>${escape(tk('history'))}</summary><div class="bsim-history-list" id="${ID}-history"></div></details><div class="bsim-log" id="${ID}-log"></div></div></div></div>`;
    document.body.appendChild(overlay);
    const btn = document.createElement('button'); btn.id = ID + '-btn'; btn.textContent = t('battlesim.title'); btn.style.display = 'none';
    getButtonRow().appendChild(btn); btn.addEventListener('click', open);
    el('close').addEventListener('click', close);
    let backdrop = false;
    overlay.addEventListener('mousedown', event => { backdrop = event.target === overlay; });
    overlay.addEventListener('click', event => { if (backdrop && event.target === overlay) close(); });
    overlay.addEventListener('keydown', event => { if (event.key === 'Escape') { event.stopPropagation(); close(); } });
    registerShortcut({ button: btn, overlay, open, close });
    el('encounter').addEventListener('change', () => preset());
    el('teapotInjury').addEventListener('change', () => { if (spec()?.section === 271) el('initiative').value = el('teapotInjury').checked ? 'enemy' : 'player'; });
    el('setup').addEventListener('change', () => { if (!busy(data())) action(saveCharacter); });
    el('start').addEventListener('click', () => action(start));
    el('attack').addEventListener('click', () => action(step));
    el('resolve').addEventListener('click', () => action(d => { d.fight = resolveWonderlandInitiative(d.fight, el('nextInitiative').value); }));
    el('cancel').addEventListener('click', () => confirm('cancelConfirm', d => { if (busy(d)) { d.fight.status = 'cancelled'; d.fight.pendingInitiative = false; } }));
    el('allocate').addEventListener('click', () => confirm('allocateConfirm', d => {
      if (busy(d)) return;
      d.character = createWonderlandCharacter(Object.fromEntries(['agility', 'logic', 'combat', 'endurance'].map(key => [key, number('points_' + key)])));
      d.fight = null; snapshot(d);
    }));
    el('test').addEventListener('click', () => action(d => {
      const key = el('attribute').value;
      if (!busy(d)) saveCharacter(d);
      let value = d.character[key];
      const protection = d.fight && busy(d) ? d.fight.protection : el('protection').value;
      if (key === 'agility') value = Math.max(0, value - (protection === 'shell' ? 2 : protection === 'tray' ? 1 : 0));
      if (key === 'combat') value = Math.max(0, value + (busy(d) ? d.fight.combatModifier : el('weapon').value === 'vorpal' ? 1 : el('weapon').value === 'axe' ? -1 : 0));
      const result = wonderlandTest(key, value, busy(d) ? d.fight.mode : el('mode').value);
      d.log.push(tk('testResult', { attribute: tk(key), value: result.value, result: tk(result.passed ? 'passed' : 'failed') }));
    }));
    preset();
  }
  return { init, render, setVisible(visible) {
    const btn = el('btn'); if (btn) btn.style.display = visible ? '' : 'none'; if (!visible) close();
  } };
}
