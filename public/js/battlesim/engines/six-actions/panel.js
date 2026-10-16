import { createCustomOpponentSetup } from '../../custom-setup.js';
import { sixActionsOpponentFields } from './opponents.js';
import { newSixActionsCharacter, sixActionsCheck, startSixActionsFight,
  sixActionsRound, sixActionsPostCheck } from './core.js';
import { SIX_ACTIONS_FIGHTS, SIX_ACTIONS_CHECKS, SIX_ACTIONS_WEAPONS } from './roster.js';

const ID = 'sim658';
const escape = value => String(value).replace(/[&<>"']/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const contexts = [...SIX_ACTIONS_FIGHTS, ...SIX_ACTIONS_CHECKS].sort((a, b) => a.section - b.section);

export function createSixActionsPanel({ document, t, getRun, getBookId, saveState,
  showAlert, showConfirm, getButtonRow, registerShortcut = () => {} }) {
  const tk = (key, params) => t('battlesim658.' + key, params);
  const el = key => document.getElementById(ID + '-' + key);
  const busy = game => ['fighting', 'post-check'].includes(game?.fight?.status);
  let shownRun, customSetup;
  function data() {
    if (Number(getBookId()) !== 658) return null;
    const run = getRun();
    return run ? run[ID] ||= { character: newSixActionsCharacter(), fight: null,
      history: [], log: [], setup: {} } : null;
  }
  function close() { el('overlay')?.classList.remove('active'); }
  function open() {
    if (!data()) { showAlert(t('battlesim.no_active_playthrough')); return; }
    render(); el('overlay').classList.add('active');
  }
  function number(key, max = 10000) {
    const text = el(key).value.trim(), value = Number(text);
    if (!text || !Number.isSafeInteger(value) || value < 0 || value > max) throw new RangeError('Invalid source value');
    return value;
  }
  function snapshot(game) {
    game.setup = Object.fromEntries([...el('setup').querySelectorAll('input,select')]
      .map(field => [field.id, field.type === 'checkbox' ? field.checked : field.value]));
  }
  function action(update) {
    const run = getRun(), original = data();
    if (!original) return;
    try {
      const next = structuredClone(original);
      update(next);
      if (run !== getRun() || Number(getBookId()) !== 658) return;
      if (next.fight) {
        next.character = structuredClone(next.fight.character);
        if (!next.fight.recorded && ['win', 'loss'].includes(next.fight.status)) {
          next.fight.recorded = true;
          next.history.push({ enemy: next.fight.config.custom ? next.fight.config.name : tk('context.' + next.fight.config.section), outcome: next.fight.status,
            ts: Math.max(Date.now(), (next.history.at(-1)?.ts ?? 0) + 1) });
        }
      }
      next.log = next.log.slice(-100);
      next.history = next.history.slice(-30);
      run[ID] = next; saveState(); render();
    } catch (_) { showAlert(tk('invalid')); }
  }
  function report(game, result) {
    game.fight = result.fight;
    if (result.player) game.log.push(tk('playerRoll', {
      dice: result.player.dice.join(' + '), bonus: result.player.bonus,
      total: result.player.total, kills: result.player.kills,
    }));
    if (result.enemy?.length) game.log.push(tk('enemyRolls', {
      rolls: result.enemy.map(item => item.dice.join(' + ') + ' = ' + item.total).join('; '),
      hits: result.enemy.filter(item => item.hit).length,
    }));
    if (result.total !== undefined) game.log.push(tk('checkRoll', { total: result.total, section: result.fight.section }));
    if (game.fight.status !== 'fighting') game.log.push(tk('status.' + game.fight.status));
    if (game.fight.section) game.log.push(tk('destination', { section: game.fight.section }));
  }
  function contextChanged() {
    const entry = SIX_ACTIONS_FIGHTS.find(c => c.section === Number(el('context').value));
    el('secondThreshold-row').hidden = !entry?.manualSecondThreshold;
    el('remainingEnemies-row').hidden = !entry?.manualEnemies;
    if (entry?.manualEnemies && data()?.fight?.config.section === 90) {
      el('remainingEnemies').value = String(data().fight.remaining);
    }
    el('contextNote').textContent = entry?.manualShots ? tk('manualShotsNote')
      : entry?.manualSecondThreshold ? tk('secondThresholdNote')
      : entry?.postCheck ? tk('postCheckNote') : '';
  }
  function render() {
    if (!el('overlay')) return;
    const game = data();
    if (!game) { shownRun = undefined; close(); return; }
    const restoring = shownRun !== getRun();
    if (restoring) {
      shownRun = getRun();
      for (const field of el('setup').querySelectorAll('input,select')) {
        const saved = game.setup[field.id];
        if (field.type === 'checkbox') field.checked = saved ?? field.defaultChecked;
        else field.value = saved ?? (field.tagName === 'SELECT' ? field.options[0]?.value ?? '' : field.defaultValue);
      }
      el('enemyShots').value = '';
      el('target').value = String(game.fight?.targetAlive?.findIndex(Boolean) ?? 0);
      el('grenade').checked = false;
    }
    customSetup?.render();
    const fight = game.fight, active = busy(game);
    for (const key of ['wounds', 'bombs', 'grenades', 'weapon']) el(key).value = String(game.character[key]);
    for (const field of el('setup').querySelectorAll('input,select,button')) field.disabled = active;
    el('start').disabled = active || game.character.wounds === 3;
    el('apply').disabled = active;
    el('step').disabled = fight?.status !== 'fighting';
    el('postCheck').hidden = fight?.status !== 'post-check';
    el('cancel').disabled = !active;
    el('grenade-row').hidden = !fight?.config.grenade;
    el('group-row').hidden = !fight?.config.groups;
    el('target-row').hidden = fight?.config.kind !== 'knife';
    el('enemyShots-row').hidden = fight?.status !== 'fighting' || fight.config.kind === 'knife';
    el('enemyShots').required = !!fight?.config.manualShots;
    el('grenade').disabled = !active || game.character.grenades === 0;
    el('status').textContent = fight ? tk('fightStatus', {
      round: fight.round, remaining: fight.remaining, wounds: game.character.wounds,
      hits: fight.vehicleHits, status: tk('status.' + fight.status),
    }) : tk('ready');
    el('log').innerHTML = game.log.slice(-100).reverse().map(line => `<div>${escape(line)}</div>`).join('');
    el('history').innerHTML = game.history.slice(-30).reverse()
      .map(item => `<div>${escape(item.enemy)} · ${escape(tk('status.' + item.outcome))}</div>`).join('');
    contextChanged();
  }
  const field = (key, value = '', max = 10000) => `<label class="inv-edit-row" id="${ID}-${key}-row">${escape(tk(key))}<input class="inv-edit-input" type="number" min="0" max="${max}" step="1" id="${ID}-${key}" value="${value}"></label>`;
  const select = (key, entries) => `<label class="inv-edit-row" id="${ID}-${key}-row">${escape(tk(key))}<select class="inv-edit-input" id="${ID}-${key}">${entries.map(([value, name]) => `<option value="${escape(value)}">${escape(tk(name))}</option>`).join('')}</select></label>`;
  const button = key => `<button class="bsim-action-btn" type="button" id="${ID}-${key}">${escape(tk(key))}</button>`;
  function init() {
    if (el('overlay')) return;
    const overlay = document.createElement('div');
    overlay.id = ID + '-overlay'; overlay.className = 'inv-overlay';
    overlay.innerHTML = `<div class="inv-modal bsim-modal bsim-compact-form"><div class="inv-modal-hdr"><span class="inv-modal-title">${escape(tk('title'))}</span><button class="inv-close-btn" id="${ID}-close" aria-label="${escape(t('btn.close'))}">&times;</button></div><div class="bsim-body"><div class="bsim-col bsim-col-left"><p>${escape(tk('note'))}</p><div id="${ID}-setup">${select('wounds', [0, 1, 2, 3].map(n => [n, 'health.' + n]))}${select('weapon', Object.keys(SIX_ACTIONS_WEAPONS).map(key => [key, 'weapon.' + key]))}${field('bombs', 12)}${field('grenades', 12)}${button('apply')}${select('context', contexts.map(c => [c.section, 'context.' + c.section]))}${field('secondThreshold', '', 12)}${field('remainingEnemies', '', 100)}<p id="${ID}-contextNote"></p>${button('start')}</div><div class="bsim-status" id="${ID}-status"></div>${select('target', [[0, 'firstEnemy'], [1, 'secondEnemy']])}${select('group', [['armour', 'armourGroup'], ['jeep', 'jeepGroup']])}${field('enemyShots', '', 100)}<label class="bsim-checkbox" id="${ID}-grenade-row"><input type="checkbox" id="${ID}-grenade">${escape(tk('grenade'))}</label><div class="bsim-btn-row">${button('step')}${button('postCheck')}${button('cancel')}</div></div><div class="bsim-col bsim-col-right"><details class="bsim-history"><summary>${escape(tk('history'))}</summary><div class="bsim-history-list" id="${ID}-history"></div></details><div class="bsim-log" id="${ID}-log"></div></div></div></div>`;
    document.body.appendChild(overlay);
    customSetup=createCustomOpponentSetup({document,id:ID,t,getRun,getData:data,selectKey:'context',language:'bg',fixedCount:true,isBusy:busy,
      fields:sixActionsOpponentFields.map(f=>({...f,label:tk(f.key)})),defaults:{killsPerHit:1,modifier:0},
      presets:SIX_ACTIONS_FIGHTS.filter(f=>!f.kind&&f.enemies).map(f=>({...f,displayName:tk('context.'+f.section),killsPerHit:f.killsPerHit??1,modifier:0})),
    });
    const btn = document.createElement('button');
    btn.id = ID + '-btn'; btn.textContent = t('battlesim.title'); btn.style.display = 'none';
    getButtonRow().appendChild(btn); btn.addEventListener('click', open);
    el('close').addEventListener('click', close);
    let backdrop = false;
    overlay.addEventListener('mousedown', event => { backdrop = event.target === overlay; });
    overlay.addEventListener('click', event => { if (backdrop && event.target === overlay) close(); });
    overlay.addEventListener('keydown', event => { if (event.key === 'Escape') { event.stopPropagation(); close(); } });
    registerShortcut({ button: btn, overlay, open, close });
    el('context').addEventListener('change', contextChanged);
    el('apply').addEventListener('click', () => action(game => {
      if (busy(game)) return;
      game.character = newSixActionsCharacter({ wounds: number('wounds', 3),
        bombs: number('bombs'), grenades: number('grenades'), weapon: el('weapon').value });
      game.fight = null; snapshot(game); game.log.push(tk('adjusted'));
    }));
    el('start').addEventListener('click', () => action(game => {
      if (busy(game)) return;
      const section = number('context', 150);
      snapshot(game);
      if (SIX_ACTIONS_CHECKS.some(c => c.section === section)) {
        const result = sixActionsCheck(game.character, section);
        game.log.push(tk('context.' + section), tk('checkRoll', result));
      } else {
        game.fight = startSixActionsFight(game.character, section, customSetup.settings(game, {
          secondThreshold: el('secondThreshold').value ? number('secondThreshold', 12) : undefined,
          remainingEnemies: el('remainingEnemies').value ? number('remainingEnemies', 100) : undefined,
        }));
        el('enemyShots').value = ''; el('grenade').checked = false;
        el('target').value = '0';
        game.log.push(section ? tk('context.' + section) : game.fight.config.name);
      }
    }));
    el('step').addEventListener('click', () => action(game => {
      if (game.fight?.status !== 'fighting') return;
      report(game, sixActionsRound(game.fight, {
        target: number('target', 1), group: el('group').value, grenade: el('grenade').checked,
        enemyShots: el('enemyShots').value.trim() ? number('enemyShots', 100) : undefined,
      }));
      if (game.fight.config.kind === 'knife') el('target').value = String(game.fight.targetAlive.findIndex(Boolean));
      el('enemyShots').value = '';
      el('grenade').checked = false;
    }));
    el('postCheck').addEventListener('click', () => action(game => report(game, sixActionsPostCheck(game.fight))));
    el('cancel').addEventListener('click', () => {
      const run = getRun(), original = data();
      if (!busy(original)) return;
      showConfirm(tk('cancelConfirm'), () => {
        if (run === getRun() && original === data()) action(game => {
          game.fight.status = 'cancelled'; game.log.push(tk('status.cancelled'));
        });
      });
    });
  }
  return { init, render, setVisible(visible) {
    const btn = el('btn'); if (btn) btn.style.display = visible ? '' : 'none'; if (!visible) close();
  } };
}
