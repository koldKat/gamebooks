import * as rules from './core.js';
import { POLICE_ENCOUNTERS, preparePoliceEnemy } from './roster.js';

const ID = 'sim570';
const stats = ['attack', 'defence', 'damage', 'life'];
const escape = text => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function createPolicePanel({ document, t, getRun, getBookId, saveState, showAlert, showConfirm, getButtonRow, registerShortcut = () => {} }) {
  let shownRun;
  let shownFight;
  const tk = (key, params) => t(`battlesim570.${key}`, params);
  const el = key => document.getElementById(`${ID}-${key}`);
  const busy = d => d?.fight?.status === 'fighting';
  const spec = () => POLICE_ENCOUNTERS.find(row => row.id === el('encounter').value);
  function data() {
    if (Number(getBookId()) !== 570) return null;
    const run = getRun();
    return run ? run[ID] ||= { setup: {}, fight: null, history: [], log: [] } : null;
  }
  function close() { el('overlay')?.classList.remove('active'); }
  function open() {
    if (!data()) { showAlert(t('battlesim.no_active_playthrough')); return; }
    render(); el('overlay').classList.add('active');
  }
  const name = row => tk('names.' + row.id);
  const label = row => tk('encounter_label', { enemy: name(row), section: row.section });
  function action(update) {
    const run = getRun(), old = data();
    if (!old) return;
    try {
      const next = structuredClone(old);
      update(next);
      if (run !== getRun() || Number(getBookId()) !== 570) return;
      const f = next.fight;
      if (f && !f.recorded && ['win', 'loss', 'defeat'].includes(f.status)) {
        f.recorded = true;
        next.history.push({ enemy: next.encounter, outcome: f.status === 'win' ? 'win' : 'loss',
          ts: Math.max(Date.now(), (next.history.at(-1)?.ts ?? 0) + 1) });
      }
      run[ID] = next; saveState(); render();
    } catch (_) { showAlert(tk('invalid')); }
  }
  function confirm(key, update) {
    const run = getRun(), old = data();
    if (!old) return;
    showConfirm(tk(key), () => { if (run === getRun() && old === data()) action(update); });
  }
  function number(key, min = 0) {
    if (!el(key).value.trim()) throw new RangeError('Missing manual value');
    return rules.policeInteger(Number(el(key).value), min);
  }
  const actor = prefix => Object.fromEntries(stats.map(key => [key, number(`${prefix}_${key}`, key === 'life' ? 1 : 0)]));
  function preset() {
    render();
    const row = spec();
    if (!row) return;
    for (const key of stats) el('enemy_' + key).value = row.enemy[key] ?? '';
    el('count').value = row.count ?? '';
    el('mode').value = row.dragon ? 'dragon' : 'solo';
    render();
  }
  function start(d) {
    const mode = el('mode').value, row = spec();
    d.encounter = mode === 'ship' ? tk('ship') : label(row);
    const overrides = {};
    for (const key of stats) {
      if (!el('enemy_' + key).value.trim()) continue;
      const value = number('enemy_' + key, key === 'life' ? 1 : 0);
      if (row.enemy[key] === null || value !== row.enemy[key]) overrides[key] = value;
    }
    const options = { level: number('level', 1), enemy: overrides, cannotRun: el('cannotRun').checked };
    if (el('count').value.trim()) options.count = number('count', 1);
    if (mode === 'ship') {
      d.fight = rules.startPoliceShip({ attack: number('shipAttack'), shield: number('shield'), life: number('shipLife', 1) },
        { attack: number('baseAttack'), defence: number('baseDefence') },
        { targets: number('targets', 1), ammunition: number('ammunition'), atmosphericShield: el('atmosphericShield').checked });
    } else {
      const prepared = preparePoliceEnemy(row.id, options);
      if (mode === 'dragon') {
        if (!row.dragon) throw new RangeError('Choose a dragon encounter');
        const lines = [1, 2, 3].map(i => ({ ...actor(`line${i}`), count: number(`line${i}_count`, 1), type: el(`line${i}_type`).value }));
        d.fight = rules.startPoliceDragon(lines, prepared.enemy, { heroLine: number('heroLine', 1) });
      } else {
        if (row.dragon || mode === 'party' && !row.party) throw new RangeError('Party unavailable in this scene');
        const player = { ...actor('player'), magic: number('magic') };
        let strikes = row.playerStrikes ?? 1;
        if (row.id === 'arenaTroll' && !['axe', 'mace'].includes(el('weapon').value)) throw new RangeError('Troll requires axe or mace');
        if (row.id === 'arenaDwarf' && (['axe', 'mace'].includes(el('weapon').value) || el('steelArmor').checked)) {
          player.attack = player.defence = 4;
        }
        if (row.section === 139 && el('weapon').value === 'swordDagger') { player.defence = 1; strikes = 2; }
        if (row.unarmed && el('weapon').value !== 'unarmed') throw new RangeError('Weapons forbidden');
        if (row.unarmed) player.damage = 10;
        d.fight = rules.startPoliceFight(player, prepared.enemy, {
          count: prepared.count, level: options.level, tactic: el('tactic').value,
          party: mode === 'party', playerStrikes: strikes, spellsAllowed: !row.arena && !row.unarmed,
          nonfatal: row.nonfatal ? number('recovery', 1) : false,
        });
      }
    }
    d.mode = mode;
    d.setup = Object.fromEntries([...el('overlay').querySelectorAll('input,select')].map(input => [input.id,
      input.type === 'checkbox' ? input.checked : input.value]));
    d.log.push(tk('started', { enemy: d.encounter }));
    d.log = d.log.slice(-120);
  }
  function step(d, spell = false) {
    if (!busy(d)) return;
    let result;
    if (d.mode === 'dragon') result = rules.policeDragonRound(d.fight);
    else if (d.mode === 'ship') result = rules.policeShipRound(d.fight, { weapon: el('shipWeapon').value, command: el('command').checked });
    else {
      const options = {};
      if (d.fight.tactic === 'cautious') options.modifiers = Object.fromEntries(
        ['playerAttack', 'playerDefence', 'enemyAttack', 'enemyDefence'].map(key => [key, number('modifier_' + key, -1000000)]));
      if (spell) options.spell = { base: number('spellBase'), minimum: number('spellMinimum', 1), spent: number('spellSpent', 1), bonus: number('spellBonus') };
      result = rules.policeStrike(d.fight, options);
    }
    d.fight = result.fight;
    d.log.push(tk('round', { n: d.fight.round, dice: result.dice.join(' + ') || '-', damage: result.damage,
      actor: result.acting ? tk(result.acting) : d.mode === 'dragon' ? tk('line', { n: result.line }) : tk('ship') }));
    d.log = d.log.slice(-120);
  }
  function resolve(d) {
    const pending = d.fight?.pending;
    if (!pending) return;
    if (pending.kind === 'dragonCasualty') {
      const heroKilled = el('heroKilled').checked;
      const survivor = !heroKilled && d.fight.lines[pending.line].count > 1 ? actor('survivor') : undefined;
      d.fight = rules.resolvePoliceDragonCasualty(d.fight, { heroKilled, survivor });
    } else if (pending.kind === 'enemyCasualties') {
      const killed = number('killed');
      d.fight = rules.resolvePoliceCasualties(d.fight, { killed,
        enemyLife: killed < d.fight.remaining ? number('remainingLife', 1) : undefined });
    } else {
      d.fight = rules.resolvePoliceCasualties(d.fight, { player: el('heroKilled').checked ? { life: 0 }
        : { ...actor('survivor'), magic: d.fight.player.magic } });
    }
  }
  function render() {
    if (!el('overlay')) return;
    const d = data();
    if (!d) { close(); return; }
    if (shownRun !== getRun()) {
      shownRun = getRun();
      shownFight = undefined;
      for (const input of el('setup').querySelectorAll('input,select')) {
        const saved = d.setup[input.id];
        if (input.type === 'checkbox') input.checked = saved ?? input.defaultChecked;
        else input.value = saved ?? (input.tagName === 'SELECT' ? input.options[0].value : input.defaultValue);
      }
    }
    const f = d.fight, active = busy(d), mode = el('mode').value;
    if (shownFight !== f) {
      shownFight = f;
      if (f?.player) {
        for (const key of stats) el('player_' + key).value = f.player[key];
        el('magic').value = f.player.magic ?? 0;
      }
      if (f?.ship) {
        el('shipLife').value = f.ship.life;
        el('ammunition').value = f.ammunition;
      }
    }
    for (const input of el('setup').querySelectorAll('input,select')) input.disabled = active;
    el('start').disabled = active;
    el('cancel').disabled = !active;
    el('attack').disabled = !active || !!f.pending;
    el('cast').disabled = !active || !!f.pending || d.mode === 'dragon' || d.mode === 'ship' || f.turn !== 'player' || !f.spellsAllowed;
    el('resolve').disabled = !active || !f.pending;
    el('dragonSetup').hidden = mode !== 'dragon';
    el('shipSetup').hidden = mode !== 'ship';
    el('heroSetup').hidden = ['dragon', 'ship'].includes(mode);
    el('enemySetup').hidden = mode === 'ship';
    el('pending').hidden = !f?.pending;
    el('modifiers').hidden = !(active && f.tactic === 'cautious');
    el('shipControls').hidden = !(active && d.mode === 'ship');
    el('spellControls').hidden = !active || !f.spellsAllowed;
    el('pendingMessage').textContent = f?.pending ? tk(f.pending.kind, { damage: f.pending.damage ?? 0, n: (f.pending.line ?? 0) + 1 }) : '';
    el('status').textContent = f ? tk('status.' + f.status) + ' · ' + (d.mode === 'ship'
      ? tk('shipHealth', { life: f.ship.life, targets: f.targets, ammunition: f.ammunition })
      : d.mode === 'dragon' ? tk('dragonHealth', { life: f.enemy.life })
        : tk('health', { player: f.player.life, enemy: f.enemy.life, count: f.remaining, turn: tk(f.turn) })) : tk('pick');
    el('log').innerHTML = d.log.slice(-100).reverse().map(text => `<div>${escape(text)}</div>`).join('');
    el('history').innerHTML = d.history.slice(-50).reverse().map(row => `<div class="bsim-history-row">${escape(row.enemy)}: ${escape(tk('status.' + row.outcome))}</div>`).join('');
  }
  function init() {
    if (el('overlay')) return;
    const input = (key, label = key, value = '', min = 0) => `<label class="inv-edit-row">${escape(tk(label))}<input id="${ID}-${key}" class="inv-edit-input" type="number" min="${min}" step="1" value="${value}"></label>`;
    const check = key => `<label class="inv-edit-row"><input type="checkbox" id="${ID}-${key}">${escape(tk(key))}</label>`;
    const select = (key, values) => `<label class="inv-edit-row">${escape(tk(key))}<select id="${ID}-${key}" class="inv-edit-input">${values.map(value => `<option value="${value}">${escape(tk(value))}</option>`).join('')}</select></label>`;
    const button = key => `<button type="button" id="${ID}-${key}" class="bsim-action-btn">${escape(tk(key))}</button>`;
    const fields = (prefix, life = '') => stats.map(key => input(prefix + '_' + key, key, key === 'life' ? life : '', key === 'life' ? 1 : 0)).join('');
    const overlay = document.createElement('div');
    overlay.id = `${ID}-overlay`; overlay.className = 'inv-overlay';
    overlay.innerHTML = `<div class="inv-modal bsim-modal bsim-compact-form"><div class="inv-modal-hdr"><span class="inv-modal-title">${escape(tk('title'))}</span><button id="${ID}-close" class="inv-close-btn" aria-label="${escape(t('btn.close'))}">&times;</button></div>
      <div class="bsim-body"><div class="bsim-col bsim-col-left"><div id="${ID}-setup"><p>${escape(tk('manualNote'))}</p>
      ${select('mode', ['solo', 'party', 'dragon', 'ship'])}${input('level', 'level', 1, 1)}
      <div id="${ID}-enemySetup"><label class="inv-edit-row">${escape(tk('encounter'))}<select id="${ID}-encounter" class="inv-edit-input">${POLICE_ENCOUNTERS.map(row => `<option value="${row.id}">${escape(label(row))}</option>`).join('')}</select></label>${fields('enemy')}${input('count', 'count', 1, 1)}${check('cannotRun')}</div>
      <div class="bsim-side" id="${ID}-heroSetup"><div class="bsim-side-title">${escape(tk('player'))}</div>${fields('player', 30)}${input('magic', 'magic', 0)}${select('weapon', ['unarmed', 'axe', 'mace', 'swordDagger', 'otherWeapon'])}${check('steelArmor')}${select('tactic', ['dynamic', 'aggressive', 'defensive', 'cautious'])}${input('recovery', 'recovery', '', 1)}</div>
      <div id="${ID}-dragonSetup">${input('heroLine', 'heroLine', 1, 1)}${[1, 2, 3].map(i => `<details><summary>${escape(tk('line', { n: i }))}</summary>${select(`line${i}_type`, ['warrior', 'archer', 'mage'])}${input(`line${i}_count`, 'members', i, 1)}${fields(`line${i}`, 1)}</details>`).join('')}</div>
      <div id="${ID}-shipSetup">${input('shipAttack')}${input('shield')}${input('shipLife', 'life', 60, 1)}${input('baseAttack')}${input('baseDefence')}${input('targets', 'targets', '', 1)}${input('ammunition', 'ammunition', 0)}${check('atmosphericShield')}</div></div>
      <div class="bsim-btn-row">${button('start')}${button('cancel')}</div><div id="${ID}-status" class="bsim-status"></div>
      <details id="${ID}-modifiers"><summary>${escape(tk('manualModifiers'))}</summary>${['playerAttack', 'playerDefence', 'enemyAttack', 'enemyDefence'].map(key => input('modifier_' + key, key, '', -1000000)).join('')}</details>
      <div id="${ID}-shipControls">${select('shipWeapon', ['blaster', 'antiproton', 'atomic', 'pa', 'pb'])}${check('command')}</div>
      <details id="${ID}-spellControls"><summary>${escape(tk('spell'))}</summary><p>${escape(tk('spellNote'))}</p>${input('spellBase')}${input('spellMinimum', 'spellMinimum', '', 1)}${input('spellSpent', 'spellSpent', '', 1)}${input('spellBonus', 'spellBonus', 0)}</details>
      <div class="bsim-btn-row">${button('attack')}${button('cast')}</div><div id="${ID}-pending"><p id="${ID}-pendingMessage"></p>${input('killed')}${input('remainingLife', 'remainingLife', '', 1)}${check('heroKilled')}<details><summary>${escape(tk('survivors'))}</summary>${fields('survivor', 1)}</details>${button('resolve')}</div></div>
      <div class="bsim-col bsim-col-right"><details class="bsim-history"><summary>${escape(tk('history'))}</summary><div id="${ID}-history" class="bsim-history-list"></div></details><div id="${ID}-log" class="bsim-log"></div></div></div></div>`;
    document.body.appendChild(overlay);
    const btn = document.createElement('button'); btn.id = `${ID}-btn`; btn.textContent = t('battlesim.title'); btn.style.display = 'none';
    getButtonRow().appendChild(btn); btn.addEventListener('click', open); el('close').addEventListener('click', close);
    let backdrop = false;
    overlay.addEventListener('mousedown', e => { backdrop = e.target === overlay; });
    overlay.addEventListener('click', e => { if (backdrop && e.target === overlay) close(); });
    overlay.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } });
    registerShortcut({ button: btn, overlay, open, close });
    el('encounter').addEventListener('change', preset);
    el('mode').addEventListener('change', render);
    el('start').addEventListener('click', () => { if (!busy(data())) action(start); });
    el('attack').addEventListener('click', () => action(d => step(d)));
    el('cast').addEventListener('click', () => action(d => step(d, true)));
    el('resolve').addEventListener('click', () => action(resolve));
    el('cancel').addEventListener('click', () => confirm('cancelConfirm', d => { if (busy(d)) d.fight.status = 'cancelled'; }));
    preset();
  }
  return { init, render, setVisible(visible) { const btn = el('btn'); if (btn) btn.style.display = visible ? '' : 'none'; if (!visible) close(); } };
}
