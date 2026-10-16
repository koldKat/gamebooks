import { createOpponentEditor } from '../../opponents.js';
import { meleeOpponentFields, shootingOpponentFields } from './opponents.js';
import { CHECKS, definition, PLAYER_DEFAULTS, UNARMED_RETURNS, SHOOTING_RETURNS, shootingEncounter, unarmedEncounter } from './definition.js';
import { createState } from './state.js';
import { startUnarmedFight, stepUnarmedFight, unarmedActions, startShootingFight,
  stepShootingFight, shootingActions, convertShootingToUnarmed, evaluateCheck } from './combat.js';
import { currentBookId, currentPlaythrough, saveState } from '../../../core/state.js';
import { getPlayBtnRow } from '../../../play/charsheet.js';
import { showAlert, showConfirm } from '../../../ui-helpers/confirm.js';
import { registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from '../../../core/util.js';
import { t } from '../../../i18n.js';

const ID = definition.stateKey;
const STATS = Object.keys(PLAYER_DEFAULTS);
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const active = fight => Boolean(fight && !fight.outcome);

export function createMoneyPanel({ document, t, getRun, getBookId, saveState, showAlert, showConfirm,
  getButtonRow, registerShortcut = () => {} }) {
  const tk = (key, params) => t('battlesim700.' + key, params);
  const el = key => document.getElementById(ID + '-' + key);
  const store = createState(() => ({ currentBookId: getBookId(), currentPlaythrough: getRun, saveState }));
  let shownData, shownRun, editors, editorRun, conversionFight;
  const mode = () => el('mode').value;
  const origin = () => Number(el('encounter').value);
  const input = (id, key = id, value = '', step = 1) => `<label class="inv-edit-row"><span>${escape(tk(key))}</span><input class="inv-edit-input" id="${ID}-${id}" type="number" min="0" max="1000000" step="${step}" value="${value ?? ''}"></label>`;
  const check = (key, label = key) => `<label class="bsim-checkbox"><input id="${ID}-${key}" type="checkbox">${escape(tk(label))}</label>`;
  const button = (key, attr = '') => `<button type="button" class="bsim-action-btn" ${attr}>${escape(tk(key))}</button>`;
  function select(id, key, entries) {
    return `<label class="inv-edit-row"><span>${escape(tk(key))}</span><select class="inv-edit-input" id="${ID}-${id}">${entries.map(([value, text]) => `<option value="${value}">${escape(text)}</option>`).join('')}</select></label>`;
  }
  function number(id, optional = false) {
    const field = el(id), value = field.value.trim();
    if (!value && optional) return null;
    const n = Number(value);
    if (!value || !Number.isFinite(n) || n < 0 || n > 1000000) {
      for (let parent = field.parentElement; parent; parent = parent.parentElement) {
        if (parent.tagName === 'DETAILS') parent.open = true;
      }
      field.focus();
      const error = new RangeError('Invalid number');
      const group = field.closest('.bsim-side')?.querySelector('.bsim-side-title')?.textContent;
      error.field = [group, field.closest('label')?.querySelector('span')?.textContent].filter(Boolean).join(' / ');
      throw error;
    }
    return n;
  }
  function character() {
    const p = Object.fromEntries(STATS.map(key => [key, number(key)]));
    if (p.endurance > p.enduranceMax) throw new RangeError('Endurance exceeds maximum');
    return p;
  }
  function snapshot() {
    return Object.fromEntries([...el('setup').querySelectorAll('input,select')].map(field =>
      [field.id.slice(ID.length + 1), field.type === 'checkbox' ? field.checked : field.value]));
  }
  function restore(snapshot) {
    for (const [key, value] of Object.entries(snapshot)) {
      const field = el(key);
      if (!field) continue;
      if (field.type === 'checkbox') field.checked = value;
      else if (field.tagName !== 'SELECT' || [...field.options].some(option => option.value === String(value))) field.value = value;
    }
  }
  function action(update) {
    try { if (store.change(update)) render(true); }
    catch (error) { showAlert(error.field ? tk('invalidField', { field: error.field }) : tk('invalid')); }
  }
  function encounterOptions(selected) {
    const ids = ['0', ...Object.keys(mode() === 'unarmed' ? UNARMED_RETURNS : SHOOTING_RETURNS)];
    el('encounter').innerHTML = ids.map(id => `<option value="${id}">${escape(id === '0' ? t('battlesim.editor.bg.custom') : tk('encounter.' + id) + ' (' + id + ')')}</option>`).join('');
    el('encounter').value = ids.includes(String(selected)) ? String(selected) : ids[0];
  }
  function preset() {
    if (origin() === 0) {
      el('options').innerHTML=mode()==='unarmed' ? '' : `<div class="bsim-side">${select('terrain','terrain',[1,2,3,4].map(n=>[n,tk('terrain.'+n)]))}${['power','range','weight'].map(key=>input('weapon-'+key,key)).join('')}${input('setup-playerCover','playerCover')}</div>`;
      return;
    }
    if (mode() === 'unarmed') {
      el('options').innerHTML = (origin() === 102 ? select('count', 'count', [[1, '1'], [2, '2']]) : '')
        + (origin() === 193 ? check('wounded') : '') + (origin() === 177 ? check('douglas') : '');
      return;
    }
    const spec = shootingEncounter(origin());
    el('options').innerHTML = `<div class="bsim-side"><div class="bsim-side-title">${escape(tk('weapon'))}</div>${['power', 'range', 'weight'].map(key => input('weapon-' + key, key)).join('')}</div>`
      + input('setup-playerCover', 'playerCover', spec.playerCover)
      + (spec.terrain === 3 ? check('simplifiedMap') : '')
      + `<p>${escape(tk('mapNote'))}</p><details><summary>${escape(tk('opponents'))}</summary>`
      + spec.opponents.map((e, i) => `<div class="bsim-side"><div class="bsim-side-title">${escape(tk('opponent', { number: i + 1 }))}</div>`
        + ['effectiveFire', 'weaponPower', 'distance', 'cover'].map(key => input('enemy-' + i + '-' + key, key, e[key])).join('')
        + `<details><summary>${escape(tk('character'))}</summary>`
        + ['strength', 'dexterity', 'speed', 'aggression', 'skillCode'].map(key => input('enemy-' + i + '-' + key, key, e[key])).join('')
        + '</details></div>').join('') + '</details>';
    if (el('simplifiedMap')) el('simplifiedMap').checked = true;
  }
  function switchPreset(resetEncounter) {
    if (active(store.read()?.fight)) return;
    const draft = Object.fromEntries(STATS.map(key => [key, el(key).value]));
    if (resetEncounter) encounterOptions();
    preset();
    action(d => { d.setup = snapshot(); d.customOpponents=Object.fromEntries(['unarmed','shooting'].map(key=>[key,editors[key].snapshot()])); });
    for (const key of STATS) el(key).value = draft[key];
  }
  function saveCharacter(d) {
    const p = character();
    if (active(d.fight)) {
      if (d.fight.mode === 'unarmed') {
        for (const key of ['strength', 'dexterity', 'speed']) {
          d.fight.beforeOpponent[key] = Math.max(0, d.fight.beforeOpponent[key] + p[key] - d.fight.player[key]);
        }
        d.fight.beforeOpponent.endurance = Math.min(d.fight.beforeOpponent.endurance, p.enduranceMax);
      }
      d.fight.player = { ...p };
    }
    d.character = p;
    d.setup = snapshot();
  }
  function weapon() {
    return Object.fromEntries(['power', 'range', 'weight'].map(key => [key, number('weapon-' + key)]));
  }
  function start(d) {
    if (active(d.fight)) return;
    saveCharacter(d);
    if (origin() === 0) {
      const opponents=editors[mode()].read();
      d.customOpponents=Object.fromEntries(['unarmed','shooting'].map(key=>[key,editors[key].snapshot()]));
      d.fight=mode()==='unarmed' ? startUnarmedFight(d.character,0,{opponents})
        : startShootingFight(d.character,0,{opponents,terrain:number('terrain'),weapon:weapon(),playerCover:number('setup-playerCover')});
    } else if (mode() === 'unarmed') {
      d.fight = startUnarmedFight(d.character, origin(), { count: el('count') ? number('count') : 1,
        wounded: el('wounded')?.checked ?? false, playerMultiplier: el('douglas')?.checked ? 2 : 1 });
    } else {
      const spec = shootingEncounter(origin(), { simplifiedMap: el('simplifiedMap')?.checked ?? false });
      const opponents = spec.opponents.map((e, i) => ({ ...e,
        ...Object.fromEntries(['effectiveFire', 'weaponPower', 'distance', 'cover', 'strength', 'dexterity', 'speed', 'aggression', 'skillCode']
          .map(key => [key, number('enemy-' + i + '-' + key, key === 'weaponPower')])) }));
      d.fight = startShootingFight(d.character, origin(), { opponents, weapon: weapon(),
        playerCover: number('setup-playerCover'), simplifiedMap: spec.simplifiedMap });
    }
    d.encounterName = origin() === 0 ? d.fight.opponents.map(e=>e.displayName).join(' / ') : tk('encounter.' + origin());
    d.character = { ...d.fight.player };
    d.decision = null;
  }
  function step(d, value) {
    if (!active(d.fight)) return;
    if (d.fight.mode === 'unarmed') {
      const response = stepUnarmedFight(d.fight, value);
      d.decision = response.needsDecision ? { ...response.needsDecision, action: value } : null;
    } else if (value === 'convert') d.fight = convertShootingToUnarmed(d.fight,d.fight.custom ? editors.conversion.read() : undefined);
    else {
      d.fight.weapon = weapon();
      const options = { position: { distance: number('live-distance'), cover: number('live-cover'), playerCover: number('live-playerCover') },
        weaponPower: number('live-weaponPower', d.fight.pending?.kind !== 'weapon-power'), adjacent: el('adjacent')?.checked ?? false };
      if (options.weaponPower !== null) d.fight.opponents[d.fight.enemyIndex].weaponPower = options.weaponPower;
      if (el('exit')?.value) options.clearExit = el('exit').value === 'clear';
      if (el('occupied')?.value) options.occupiedCover = el('occupied').value === 'yes';
      if (el('nextTarget') && el('nextTarget').value !== '') options.nextTargetIndex = Number(el('nextTarget').value);
      stepShootingFight(d.fight, value, options);
    }
    d.character = { ...d.fight.player };
    d.setup = snapshot();
  }
  function cancel() {
    const run = getRun(), original = store.read(), fight = original?.fight;
    if (!active(fight)) return;
    showConfirm(tk('cancelConfirm'), () => {
      if (Number(getBookId()) !== 700 || getRun() !== run || store.read() !== original || original.fight !== fight) return;
      action(d => { d.fight.outcome = 'cancelled'; d.character = { ...d.fight.player }; d.decision = null; });
    });
  }
  function actionLabel(fight, value) {
    return tk(fight.mode === 'unarmed' ? 'act.' + value : fight.node === 75 && value === 150 ? 'grenade' : 'gun.' + value);
  }
  function eventText(e) {
    if (e.type === 'action') return tk('act.' + e.action);
    if (e.type === 'shooting-action') return tk('gun.' + e.action);
    if (e.type === 'attack' || e.type === 'comparison') return tk('comparison', { player: e.playerTotal, enemy: e.enemyTotal, source: e.source });
    if (e.type === 'calculation') return tk('calculation', e);
    if (e.type === 'player-damaged') return tk('damageTaken', e);
    if (e.type === 'enemy-damaged') return tk('damageDealt', e);
    if (e.type === 'opponent-defeated') return tk('opponentDefeated');
    if (e.type === 'opponent-shot') return tk('eliminated', e);
    if (e.type === 'outcome') return tk('status.' + e.outcome);
    return tk('event.' + e.type);
  }
  function renderLive(fight) {
    if (fight.mode !== 'shooting' || !active(fight)) { el('live').innerHTML = ''; return; }
    const e = fight.opponents[fight.enemyIndex];
    const answers = [['', tk('choose')], ['yes', tk('yes')], ['no', tk('no')]];
    el('live').innerHTML = `<div class="bsim-side-title">${escape(tk('position'))}</div>`
      + input('live-distance', 'distance', e.distance) + input('live-cover', 'cover', e.cover)
      + input('live-playerCover', 'playerCover', fight.playerCover) + input('live-weaponPower', 'weaponPower', e.weaponPower)
      + (fight.pending?.kind === 'exit' ? select('exit', 'exit', [['', tk('choose')], ['clear', tk('clear')], ['blocked', tk('blocked')]]) : '')
      + (fight.pending?.kind === 'cover' ? select('occupied', 'occupied', answers) : '')
      + (fight.node === 85 ? check('adjacent') : '')
      + (fight.terrain === 3 ? select('nextTarget', 'nextTarget', [['', tk('automatic')], ...fight.opponents.flatMap((foe, i) =>
        !foe.defeated && i !== fight.enemyIndex ? [[i, tk('opponent', { number: i + 1 })]] : [])]) : '');
  }
  function render(force = false) {
    if (!el('overlay')?.classList.contains('active')) return;
    if (Number(getBookId()) !== 700 || !getRun()) { close(); return; }
    const d = store.read();
    if (!d) { close(); return; }
    if (!force && d === shownData && getRun() === shownRun) return;
    if (getRun() !== shownRun) resetCheck();
    shownData = d; shownRun = getRun();
    for (const key of STATS) el(key).value = d.character[key];
    el('mode').value = d.setup.mode === 'shooting' ? 'shooting' : 'unarmed';
    encounterOptions(d.setup.encounter);
    preset(); restore(d.setup);
    const fight = d.fight, busy = active(fight);
    if (editorRun !== getRun()) {
      editorRun=getRun();
      for(const key of ['unarmed','shooting']) editors[key].set(d.customOpponents?.[key]??[{}]);
    }
    for(const key of ['unarmed','shooting']) {
      editors[key].element.hidden=origin()!==0||mode()!==key;
      editors[key].lock(busy);
    }
    const converting=!!fight?.custom&&fight.mode==='shooting'&&fight.pending?.kind==='conversion'&&busy;
    editors.conversion.element.hidden=!converting;
    if(converting&&conversionFight!==fight){conversionFight=fight;editors.conversion.set(fight.opponents.filter(e=>!e.defeated).map(e=>({displayName:e.displayName,aggression:e.aggression,skillCode:e.skillCode,strength:e.strength,dexterity:e.dexterity,speed:e.speed,weaponCode:0})));}
    editors.conversion.fixCount(true);
    for (const field of el('setup').querySelectorAll('input,select')) {
      field.disabled = busy && !field.id.startsWith(ID + '-weapon-');
    }
    el('start').disabled = busy;
    el('cancel').disabled = !busy;
    el('actions').innerHTML = '';
    el('pending').textContent = '';
    if (!fight) {
      el('status').textContent = tk('ready');
      el('live').innerHTML = ''; el('log').innerHTML = '';
    }
    else {
      const enemy = fight.mode === 'unarmed' ? fight.enemy : fight.opponents[fight.enemyIndex];
      el('status').textContent = fight.outcome ? tk('status.' + fight.outcome) + ' '
        + (fight.destination ? tk('return', { section: fight.destination }) : fight.outcome === 'escape' ? tk('manualReturn') : '')
        : (fight.mode === 'unarmed' ? tk('foeStatus', { number: fight.enemyIndex + 1, count: fight.opponents.length, ...enemy })
          + (fight.tactics ? '\n' + tk('tactics.' + fight.tactics) : '')
          : tk('gunStatus', { number: fight.enemyIndex + 1, count: fight.opponents.length,
            fire: enemy.effectiveFire, distance: enemy.distance, cover: enemy.cover }) + '\n' + tk('source', { section: fight.node }));
      if(enemy?.displayName) el('status').textContent=enemy.displayName+' · '+el('status').textContent;
      const decision = d.decision ?? fight.pending;
      if (decision) el('pending').textContent = tk('reason.' + decision.reason);
      if (d.decision) {
        el('actions').innerHTML = ['success', 'failure'].map(value => button(value, `data-decision="${value}"`)).join('');
      } else if (busy) {
        const actions = fight.mode === 'unarmed' ? unarmedActions(fight) : shootingActions(fight);
        el('actions').innerHTML = actions.map(value => `<button type="button" class="bsim-action-btn" data-action="${value}">${escape(actionLabel(fight, value))}</button>`).join('');
      }
      renderLive(fight);
      el('log').innerHTML = fight.events.slice(-60).map(e => '<div>' + escape(eventText(e)) + '</div>').join('');
    }
    el('history').innerHTML = d.history.slice(-40).reverse().map(row => '<div>' + escape(row.enemy + ': ' + tk('status.' + row.outcome)) + '</div>').join('');
  }
  function close() { el('overlay')?.classList.remove('active'); }
  function resetCheck() {
    const id = el('checkType').value;
    const flags = ['strikingStyle', 'douglas', 'attackHelis', 'sequential', 'guardPosted'];
    el('checkFields').innerHTML = CHECKS[id].filter(key => !STATS.includes(key)).map(key => {
      if (flags.includes(key)) return check('check-' + key, key === 'douglas' ? key : 'helper.' + key);
      const damage = key === 'labDamage' ? ['0', '1', '2', ...(id === '242' ? ['3'] : [])]
        : key === 'barracksDamage' ? ['0', '1', ...(id === '243' ? ['2'] : [])] : null;
      return damage ? select('check-' + key, 'helper.' + key, damage.map(value => [value, tk('helper.' + key + '.' + value)]))
        : input('check-' + key, 'helper.' + key);
    }).join('');
    el('checkResult').textContent = '';
  }
  function calculateCheck() {
    if (Number(getBookId()) !== 700 || !getRun()) return;
    try {
      const id = el('checkType').value;
      const values = Object.fromEntries(CHECKS[id].map(key => {
        const field = el(STATS.includes(key) ? key : 'check-' + key);
        return [key, field.type === 'checkbox' ? field.checked : number(STATS.includes(key) ? key : 'check-' + key)];
      }));
      const result = evaluateCheck(id, values);
      el('checkResult').textContent = [
        result.score === undefined ? '' : tk('helper.score', { score: result.score }),
        tk('helper.result.' + result.result),
        result.reason ? tk('helper.reason.' + result.reason) : '',
        result.losses === undefined ? '' : tk('helper.losses', result),
        result.destination ? tk('return', { section: result.destination }) : '',
      ].filter(Boolean).join('\n');
    } catch (error) {
      el('checkResult').textContent = '';
      showAlert(error.field ? tk('invalidField', { field: error.field }) : tk('invalid'));
    }
  }
  function open() {
    if (Number(getBookId()) !== 700 || !getRun()) { showAlert(t('battlesim.no_active_playthrough')); return; }
    try {
      const d = store.ensure();
      if (d.schemaVersion !== 1 || !d.character || !Array.isArray(d.history)) throw new RangeError('Unsupported state');
      el('overlay').classList.add('active'); render(true); el('close').focus();
    } catch { close(); showAlert(tk('invalid')); }
  }
  function init() {
    if (el('overlay')) return;
    const overlay = document.createElement('div');
    overlay.id = ID + '-overlay'; overlay.className = 'inv-overlay';
    overlay.innerHTML = `<div class="inv-modal bsim-modal bsim-compact-form" role="dialog" aria-modal="true" aria-labelledby="${ID}-title"><div class="inv-modal-hdr"><span class="inv-modal-title" id="${ID}-title">${escape(tk('title'))}</span><button type="button" class="inv-close-btn" id="${ID}-close" aria-label="${escape(t('btn.close'))}">&times;</button></div><div class="bsim-body"><div class="bsim-col bsim-col-left"><p>${escape(tk('note'))}</p><div class="bsim-side"><div class="bsim-side-title">${escape(tk('character'))}</div>${STATS.map(key => input(key, key, PLAYER_DEFAULTS[key], key.startsWith('endurance') ? '.5' : 1)).join('')}${button('apply', `id="${ID}-apply"`)}</div><div id="${ID}-setup">${select('mode', 'mode', [['unarmed', tk('unarmed')], ['shooting', tk('shootingMode')]])}${select('encounter', 'encounter', [])}<div id="${ID}-options"></div></div><div class="bsim-btn-row">${button('start', `id="${ID}-start"`)}${button('cancel', `id="${ID}-cancel"`)}</div><div class="bsim-status" id="${ID}-status"></div><p id="${ID}-pending"></p><div id="${ID}-live"></div><div class="bsim-btn-row" id="${ID}-actions"></div></div><div class="bsim-col bsim-col-right"><details class="bsim-history"><summary>${escape(tk('history'))}</summary><div class="bsim-history-list" id="${ID}-history"></div></details><div class="bsim-log" id="${ID}-log"></div></div></div></div>`;
    document.body.appendChild(overlay);
    const meleePresets=Object.keys(UNARMED_RETURNS).flatMap(id=>unarmedEncounter(id).map(e=>({...e,displayName:tk('encounter.'+id)})));
    const shootingPresets=Object.keys(SHOOTING_RETURNS).flatMap(id=>shootingEncounter(id).opponents.map(e=>({...e,displayName:tk('encounter.'+id)})));
    editors=Object.fromEntries(['unarmed','shooting','conversion'].map(key=>{
      const editor=createOpponentEditor({document,id:ID+'-'+key,t,language:'bg',
        fields:(key==='shooting'?shootingOpponentFields:meleeOpponentFields).map(f=>({...f,label:tk(f.key)})),
        presets:key==='shooting'?shootingPresets:meleePresets});
      el(key==='conversion'?'live':'options').before(editor.element);return [key,editor];
    }));
    const checks = document.createElement('details');
    checks.className = 'bsim-history';
    checks.innerHTML = `<summary>${escape(tk('helper.title'))}</summary><p>${escape(tk('helper.note'))}</p>`
      + select('checkType', 'helper.check', Object.keys(CHECKS).map(id => [id, tk('helper.check.' + id) + ' (' + id.split('-')[0] + ')']))
      + `<div id="${ID}-checkFields"></div>${button('helper.calculate', `id="${ID}-calculate"`)}`
      + `<p class="bsim-status" id="${ID}-checkResult" role="status" aria-live="polite"></p>`;
    overlay.querySelector('.bsim-col-left').appendChild(checks);
    el('checkType').addEventListener('change', resetCheck);
    el('calculate').addEventListener('click', calculateCheck);
    resetCheck();
    const btn = document.createElement('button'); btn.id = ID + '-btn'; btn.textContent = t('battlesim.title'); btn.style.display = 'none';
    getButtonRow().appendChild(btn); btn.addEventListener('click', open);
    el('close').addEventListener('click', close);
    let backdrop = false;
    overlay.addEventListener('mousedown', e => { backdrop = e.target === overlay; });
    overlay.addEventListener('click', e => { if (backdrop && e.target === overlay) close(); });
    overlay.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } });
    el('mode').addEventListener('change', () => switchPreset(true));
    el('encounter').addEventListener('change', () => switchPreset(false));
    el('apply').addEventListener('click', () => action(saveCharacter));
    el('start').addEventListener('click', () => action(start));
    el('cancel').addEventListener('click', cancel);
    el('actions').addEventListener('click', e => {
      const decision = e.target.closest('[data-decision]');
      if (decision) action(d => {
        if (!d.decision || !active(d.fight)) return;
        stepUnarmedFight(d.fight, d.decision.action, { defenceTie: decision.dataset.decision });
        d.decision = null; d.character = { ...d.fight.player };
      });
      const control = e.target.closest('[data-action]');
      if (control) action(d => step(d, /^\d+$/.test(control.dataset.action) ? Number(control.dataset.action) : control.dataset.action));
    });
    encounterOptions(); preset();
    registerShortcut({ button: btn, overlay, open, close });
  }
  return { init, render, open, close, setVisible(visible) {
    if (el('btn')) el('btn').style.display = visible ? '' : 'none';
    if (!visible) close();
  } };
}

const panel = createMoneyPanel({ document, t, getRun: currentPlaythrough, getBookId: () => currentBookId,
  saveState, showAlert, showConfirm, getButtonRow: getPlayBtnRow,
  registerShortcut({ button, overlay, open, close }) {
    button.innerHTML = shortcutLabel(t('battlesim.title'));
    registerPanelShortcut('KeyS', { getButton: () => button, getOverlay: () => overlay,
      otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== overlay.id), open, close });
  },
});
export function initSim700() { panel.init(); }
export function renderSim700() { panel.render(); }
export function setSim700Visible(visible) { panel.setVisible(visible); }
export { initSim700 as init, renderSim700 as render, setSim700Visible as setVisible };
