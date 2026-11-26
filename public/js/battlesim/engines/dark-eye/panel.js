import { ALL_PANEL_OVERLAY_IDS, escapeHtml, registerPanelShortcut, shortcutLabel } from '../../../core/util.js';
import { t } from '../../../i18n.js';
import { getPlayBtnRow } from '../../../play/charsheet.js';
import { showConfirm } from '../../../ui-helpers/confirm.js';
import { advanceFight, createFight } from './combat.js';
import { createOpponentEditor } from '../../opponents.js';
import { decorateOutcome, renderHistory } from '../../outcome.js';
import { apiFetch, currentBookId, currentPlaythrough, isReadOnlySimulator, saveState } from '../../run-context.js';

export function createDarkEyePanel({
  definition, defaultHero, defaultWeapon, weapons, encounters, loadRoster,
  normalProfiles = Object.keys(weapons), variableDice = false,
}) {
  const id = definition.stateKey;
  const el = key => document.getElementById(`${id}-${key}`);
  const copy = (key, params) => t(`battlesim${definition.id}.${key}`, params);
  const label = (key, params) => escapeHtml(copy(key, params));
  const statBounds = { life: [0, 999], attack: [0, 20], parry: [0, 20], dodge: [0, 20],
    protection: [0, 50], damageDice: [1, 10], damageBonus: [-12, 50] };
  if (variableDice) statBounds.damageSides = [2, 6];
  const statKeys = Object.keys(statBounds);
  const fields = () => statKeys.map(key => {
    const [min, max] = statBounds[key];
    return { key, min, max, label: copy(key) };
  });
  const freshOpponent = { life: 20, attack: 12, parry: 6, dodge: 5, protection: 0, damageDice: 1, damageBonus: 2, damageSides: 6 };
  const option = (value, text) => `<option value="${escapeHtml(value)}">${escapeHtml(text)}</option>`;
  const button = key => `<button type="button" class="bsim-action-btn" id="${id}-${key}">${label(key)}</button>`;
  const select = (key, options) => `<label class="inv-edit-row"><span>${label(key)}</span>
    <select class="inv-edit-input" id="${id}-${key}">${options.join('')}</select></label>`;
  let editor, openedRun, shownOpponent;

  function loadData() { return loadRoster(apiFetch); }

  function current() {
    if (Number(currentBookId) !== definition.id) return null;
    const run = currentPlaythrough();
    return run[id] ??= { hero: { ...defaultHero }, weapon: defaultWeapon, encounter: 'custom', defense: 'best',
      custom: { ...freshOpponent }, fight: null, events: [], history: [] };
  }

  function preset(data) {
    return encounters.find(encounter => encounter.key === data.encounter);
  }

  function isAnimal(data) {
    return data.form?.key === data.encounter;
  }

  function heroSetup(data) {
    const form = isAnimal(data) ? data.form : null;
    return form ? { ...weapons[form.weapon], life: form.life } : data.hero;
  }

  function refreshWeapons(encounter, data) {
    const animal = isAnimal(data);
    const allowed = animal ? encounter.allowedHeroProfiles : ['custom', ...normalProfiles];
    const control = el('weapon');
    const group = allowed.join(',');
    if (control.dataset.group !== group) {
      control.innerHTML = allowed.map(value => option(value, copy(value === 'custom' ? 'customWeapon' : value))).join('');
      control.dataset.group = group;
    }
    control.value = animal ? data.form.weapon : data.weapon;
  }

  function update(action) {
    if (openedRun !== currentPlaythrough() || isReadOnlySimulator() || !el('overlay')?.classList.contains('active')) return;
    const data = current();
    if (data && action(data) !== false) {
      saveState();
      render();
    }
  }

  function formatEvent(event, opponent) {
    const name = event.attacker === 'hero' ? copy('you') : opponent;
    const attack = label('attackLog', { name, roll: event.attackRoll, target: event.attackTarget });
    const defense = event.defense ? label('defenseLog', {
      kind: copy(event.defense.kind), roll: event.defense.roll, target: event.defense.target,
    }) : '';
    const type = event.result === 'hit' ? (event.attacker === 'hero' ? 'success' : 'danger') : 'accent';
    const detail = event.result === 'hit'
      ? label('hit', { dice: `${event.damageRolls.join(' + ')} (${event.damageBonus >= 0 ? '+' : ''}${event.damageBonus})`,
          protection: event.protection, damage: event.damage })
      : label(event.result === 'miss' ? 'missed' : 'defended');
    return `<div>${attack} ${defense} <span class="bsim-log-${type}">${detail}</span></div>`;
  }

  function render() {
    if (!el('overlay')?.classList.contains('active')) return;
    if (openedRun !== currentPlaythrough()) { close(); return; }
    const data = current();
    if (!data) { close(); return; }
    const encounter = preset(data);
    const fight = data.fight;
    const active = fight?.status === 'fighting';
    const readonly = isReadOnlySimulator();
    const setup = !readonly && !active;
    const animal = isAnimal(data);
    const hero = active ? fight.hero : heroSetup(data);
    const opponent = active ? fight.opponent : encounter?.opponent ?? data.custom;
    if (shownOpponent !== opponent) {
      shownOpponent = opponent;
      editor.set([opponent]);
    }
    editor.lock(!setup || Boolean(encounter));
    for (const key of ['encounter', 'weapon']) el(key).disabled = !setup;
    for (const key of statKeys) {
      const control = el(key);
      control.disabled = !setup || (animal && key !== 'life');
      if (document.activeElement !== control) control.value = hero[key];
    }
    refreshWeapons(encounter, data);
    if (el('wolf-paw')) {
      el('wolf-paw').closest('label').hidden = !animal;
      el('wolf-paw').disabled = !setup || !animal;
      el('wolf-paw').checked = animal && data.form.wolfPaw;
    }
    el('encounter').value = data.encounter;
    el('defense').value = data.defense;
    el('defense').disabled = readonly;
    el('notes').textContent = encounter?.notes.map(note => copy(note)).join(' ') ?? '';
    el('start').disabled = !setup || hero.life <= 0;
    el('advance').disabled = readonly || !active;
    el('advance').textContent = copy(fight?.openingPending ? 'opening' : 'advance');
    el('cancel').disabled = readonly || !active;
    el('status').textContent = copy(fight?.status ?? 'ready', { round: (fight?.round ?? 0) + 1 });
    decorateOutcome(el('status'), fight?.status);
    el('life-left').textContent = fight ? copy('lives', { hero: fight.hero.life, opponent: fight.opponent.life }) : '';
    el('log').innerHTML = fight ? data.events.map(event => formatEvent(event, fight.opponent.displayName)).join('') : '';
    renderHistory(el('history'), data.history.slice().reverse(), item => `${item.enemy} · ${copy(item.result)}`);
  }

  function close() { el('overlay')?.classList.remove('active'); }

  function open() {
    if (!current()) return;
    openedRun = currentPlaythrough();
    shownOpponent = null;
    el('overlay').classList.add('active');
    render();
    el('close').focus();
  }

  function start(data) {
    const hero = heroSetup(data);
    if (data.fight?.status === 'fighting' || hero.life <= 0) return false;
    const encounter = preset(data);
    try {
      const opponent = encounter?.opponent ?? editor.read()[0];
      if (opponent.life < 1) throw new RangeError('Opponent life');
      if (!encounter) data.custom = opponent;
      data.fight = createFight({ hero, opponent: { ...opponent, displayName: opponent.displayName || copy('opponent') },
        rules: encounter?.rules });
    } catch (err) {
      if (!(err instanceof RangeError)) throw err;
      el('status').textContent = copy('invalid');
      return false;
    }
    data.events = [];
    return true;
  }

  function advance(data) {
    if (data.fight?.status !== 'fighting') return false;
    const { fight, events } = advanceFight(data.fight, { defense: data.defense });
    data.fight = fight;
    if (isAnimal(data)) data.form.life = fight.hero.life;
    else data.hero.life = fight.hero.life;
    data.events = [...data.events, ...events].slice(-100);
    if (fight.status !== 'fighting') {
      const outcome = fight.status === 'loss' ? 'loss' : 'win';
      const ts = Math.max(Date.now(), (data.history.at(-1)?.ts ?? 0) + 1);
      data.history = [...data.history, { enemy: fight.opponent.displayName, outcome, result: fight.status, ts }].slice(-50);
    }
    return true;
  }

  function init() {
    if (el('overlay')) return;
    const overlay = document.createElement('div');
    overlay.id = `${id}-overlay`;
    overlay.className = 'inv-overlay';
    overlay.innerHTML = `<div class="inv-modal bsim-modal bsim-compact-form" role="dialog" aria-modal="true" aria-labelledby="${id}-title">
      <header class="inv-modal-hdr"><span class="inv-modal-title" id="${id}-title">${label('title')}</span>
        <button type="button" id="${id}-close" class="inv-close-btn" aria-label="${escapeHtml(t('btn.close'))}">&times;</button></header>
      <div class="bsim-body"><div class="bsim-col bsim-col-left">
        ${select('encounter', [option('custom', copy('custom')), ...encounters.map(item =>
          option(item.key, copy('section', { section: item.section, name: item.opponent.displayName })))])}
        <p id="${id}-notes"></p>
        <details class="bsim-side" open><summary>${label('hero')}</summary>
          ${select('weapon', [])}
          ${variableDice ? `<label class="bsim-checkbox" hidden><input type="checkbox" id="${id}-wolf-paw"><span>${label('wolfPaw')}</span></label>` : ''}
          ${fields().map(({ key, min, max }) => `<label class="inv-edit-row"><span>${label(key)}</span>
            <input class="inv-edit-input" type="number" id="${id}-${key}" min="${min}" max="${max}" step="1" required autocomplete="off"></label>`).join('')}
        </details>
        <div id="${id}-opponent-editor"></div>
        ${select('defense', ['best', 'parry', 'dodge'].map(key => option(key, copy(key))))}
        <div class="bsim-btn-row">${button('start')}${button('advance')}${button('cancel')}</div>
      </div><div class="bsim-col bsim-col-right">
        <div id="${id}-status" class="bsim-status" role="status" aria-live="polite"></div>
        <p id="${id}-life-left"></p><div id="${id}-log" class="bsim-log"></div>
        <details class="bsim-history"><summary>${label('history')}</summary><div id="${id}-history" class="bsim-history-list"></div></details>
      </div></div></div>`;
    document.body.appendChild(overlay);
    editor = createOpponentEditor({ document, id, t, fields: fields(),
      presets: [...new Map(encounters.map(item => [item.opponent.displayName, item.opponent])).values()] });
    editor.fixCount(true);
    el('opponent-editor').append(editor.element);
    const trigger = document.createElement('button');
    trigger.id = `${id}-btn`;
    trigger.style.display = 'none';
    trigger.innerHTML = shortcutLabel(t('battlesim.title'));
    trigger.setAttribute('aria-keyshortcuts', 'S');
    getPlayBtnRow().appendChild(trigger);
    trigger.addEventListener('click', open);
    el('close').addEventListener('click', close);
    let backdropStart = false;
    overlay.addEventListener('mousedown', event => { backdropStart = event.target === overlay; });
    overlay.addEventListener('click', event => { if (backdropStart && event.target === overlay) close(); });
    registerPanelShortcut('KeyS', { getButton: () => trigger, getOverlay: () => overlay,
      otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(key => key !== overlay.id), open, close });
    el('encounter').addEventListener('change', () => update(data => {
      if (data.fight?.status === 'fighting') return false;
      data.encounter = el('encounter').value;
      const encounter = preset(data);
      if (encounter?.wolfPawLife && !isAnimal(data)) {
        data.form = { key: encounter.key, weapon: encounter.allowedHeroProfiles[0], wolfPaw: false, life: data.hero.life };
      } else if (!encounter?.wolfPawLife && data.form) {
        delete data.form;
      }
    }));
    el('weapon').addEventListener('change', () => update(data => {
      if (data.fight?.status === 'fighting') return false;
      if (isAnimal(data)) {
        if (!preset(data).allowedHeroProfiles.includes(el('weapon').value)) return false;
        data.form.weapon = el('weapon').value;
        return;
      }
      data.weapon = el('weapon').value;
      if (weapons[data.weapon]) Object.assign(data.hero, weapons[data.weapon]);
    }));
    el('wolf-paw')?.addEventListener('change', () => update(data => {
      if (data.fight?.status === 'fighting' || !isAnimal(data)) return false;
      data.form.wolfPaw = el('wolf-paw').checked;
      data.form.life = data.form.wolfPaw ? preset(data).wolfPawLife : data.hero.life;
    }));
    for (const key of statKeys) {
      el(key).addEventListener('change', () => update(data => {
        if (data.fight?.status === 'fighting') return false;
        const control = el(key);
        if (!control.validity.valid) { control.value = heroSetup(data)[key]; return false; }
        if (isAnimal(data)) {
          if (key !== 'life') return false;
          data.form.life = control.valueAsNumber;
          return;
        }
        data.hero[key] = control.valueAsNumber;
        if (weapons[data.weapon] && Object.hasOwn(weapons[data.weapon], key)) data.weapon = 'custom';
      }));
    }
    el('defense').addEventListener('change', () => update(data => { data.defense = el('defense').value; }));
    el('start').addEventListener('click', () => update(start));
    el('advance').addEventListener('click', () => update(advance));
    el('cancel').addEventListener('click', () => {
      const run = currentPlaythrough();
      const fight = current()?.fight;
      showConfirm(copy('cancelConfirm'), () => {
        if (run === currentPlaythrough() && current()?.fight === fight) update(data => { data.fight.status = 'canceled'; });
      });
    });
  }

  function setVisible(visible) {
    if (el('btn')) el('btn').style.display = visible ? '' : 'none';
    if (!visible) close();
  }

  return { init, loadData, render, setVisible };
}
