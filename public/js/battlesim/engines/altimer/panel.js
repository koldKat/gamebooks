// Bind editable BODY/SPIRIT encounters to the run that opened this combat panel.
import {createQuestState} from '../super-endless-quest/state.js';
import {createD20Forms} from '../d20/forms.js';
import {createOpponentEditor} from '../../opponents.js';
import {startAltimerFight, altimerAction, validateAltimerFight} from './core.js';
import {renderAltimerReport} from './report.js';

export function createAltimerPanel({document, definition, t, getRoster, getRun, getBookId, saveState,
  getButtonRow, showAlert, showConfirm, registerShortcut = () => {}}) {
  const id = definition.stateKey, ui = createD20Forms(document, id, key => t(definition.i18nPrefix + '.' + key));
  const store = createQuestState(() => ({run: getRun(), bookId: getBookId(), definition, saveState}),
    {validateFight: validateAltimerFight});
  let overlay, launch, body, hp, attack, enemyAttack, bonus, armor, ultraviolet, customOptions,
    sucker, weakness, support, weapon, shield, vest, patch, editor, notes, controls, right, start, cancel, reset, selected = null,
    token, mountedRun, mountedOriginal, controlsRun, controlsOriginal;
  const close = () => overlay?.classList.remove('active');
  const busy = state => state.fight?.status === 'fighting';
  function change(callback, expected = token) {
    try {
      if (store.update(state => {state.history = state.history.slice(-199); return callback(state);}, expected)) render();
    } catch {showAlert(ui.tr('invalid'));}
  }
  function presetLayout() {
    editor.fixCount(Boolean(selected)); customOptions.hidden = Boolean(selected);
    ultraviolet.closest('label').hidden = !selected?.options?.invisibilityPenalty;
    notes.textContent = selected?.sourceNotes?.join(' ') || ui.tr('customRules');
  }
  function selectPreset(entry) {
    selected = entry; editor.set(entry.enemies.map(enemy => ({...enemy, displayName: enemy.name})));
    presetLayout();
  }
  function render() {
    if (!overlay) return;
    const snapshot = store.snapshot();
    if (!snapshot) {
      token = null; mountedRun = mountedOriginal = controlsRun = controlsOriginal = null;
      controls.replaceChildren(); right.replaceChildren(); close(); return;
    }
    if (mountedRun !== snapshot.run || mountedOriginal !== snapshot.original) {
      const state = snapshot.state, setup = state.player?.setup ?? {};
      body.value = state.player?.baseBody ?? state.player?.body ?? '';
      hp.value = state.player?.hp ?? '';
      attack.value = setup.attackModifier ?? 0; enemyAttack.value = setup.enemyModifier ?? 0;
      bonus.value = setup.damageBonus ?? 0; armor.value = setup.damageReduction ?? 0;
      ultraviolet.checked = Boolean(setup.ultraviolet); sucker.checked = Boolean(setup.sucker);
      weakness.checked = Boolean(setup.allowWeakSpot);
      if (support) support.value = setup.supportDamage ?? 'none';
      if (weapon) {
        weapon.value = setup.weapon ?? 'none'; shield.checked = Boolean(setup.shield);
        vest.checked = Boolean(setup.vest); patch.checked = Boolean(setup.healingPatch);
      }
      selected = state.opponent?.key ? getRoster().find(entry => entry.key === state.opponent.key) ?? null : null;
      editor.set((state.opponent?.enemies ?? [{name: '', body: '', hp: ''}])
        .map(enemy => ({...enemy, displayName: enemy.name})));
      presetLayout(); mountedRun = snapshot.run; mountedOriginal = snapshot.original;
    }
    token = snapshot;
    const locked = busy(snapshot.state);
    for (const input of [body, hp, attack, enemyAttack, bonus, armor, ultraviolet, sucker, weakness, support,
      weapon, shield, vest, patch].filter(Boolean)) input.disabled = locked;
    editor.lock(locked); start.disabled = reset.disabled = locked; cancel.disabled = !locked;
    if (controlsRun !== snapshot.run || controlsOriginal !== snapshot.original) {
      controlsRun = snapshot.run; controlsOriginal = snapshot.original; controls.replaceChildren();
      if (locked) {
        const fight = snapshot.state.fight, drain = fight.options.sucker && fight.phase === 'enemy';
        let first, second, weakSpot, vestDie;
        if (!drain) {
          const dice = ui.group(controls, 'manualDice');
          first = ui.field(dice, 'die1', {type: 'number', min: 1, max: 6, optional: true});
          second = ui.field(dice, 'die2', {type: 'number', min: 1, max: 6, optional: true});
          if (fight.phase === 'enemy' && fight.options.vest) {
            vestDie = ui.field(dice, 'vestDie', {type: 'number', min: 1, max: 6, optional: true});
          }
        }
        if (fight.phase === 'player' && fight.options.allowWeakSpot && !fight.options.sucker) {
          weakSpot = ui.checkbox(controls, 'weakSpot');
        }
        ui.button(controls, drain ? 'suckerTurn' : 'attack', () => change(state => {
          const values = !drain && (first.value.trim() || second.value.trim())
            ? [ui.number(first), ui.number(second)] : undefined;
          state.fight = altimerAction(state.fight, {kind: 'attack', expectedRevision: fight.revision,
            dice: values, weakSpot: Boolean(weakSpot?.checked),
            vestDie: vestDie?.value.trim() ? ui.number(vestDie) : undefined});
          return state;
        }, snapshot));
      }
    }
    renderAltimerReport(right, ui, snapshot.state);
  }
  function init() {
    if (overlay) return;
    overlay = document.createElement('div'); overlay.id = id + '-overlay'; overlay.className = 'inv-overlay';
    overlay.innerHTML = '<div class="inv-modal bsim-modal bsim-compact-form"><div class="inv-modal-hdr"><span class="inv-modal-title"></span><button type="button" class="inv-close-btn">&times;</button></div><div class="bsim-body"><div class="bsim-col bsim-col-left"></div><div class="bsim-col bsim-col-right"></div></div></div>';
    overlay.querySelector('.inv-modal-title').textContent = ui.tr('title');
    const closer = overlay.querySelector('.inv-close-btn'); closer.setAttribute('aria-label', t('btn.close'));
    closer.addEventListener('click', close);
    const left = overlay.querySelector('.bsim-col-left'); right = overlay.querySelector('.bsim-col-right');
    ui.text(left, ui.tr('rules'));
    body = ui.field(left, 'currentBody', {type: 'number', min: 2, max: 10});
    hp = ui.field(left, 'currentSpirit', {type: 'number', min: definition.equipment ? 0.5 : 1, max: 100000});
    if (definition.equipment) hp.step = '0.5';
    const modifiers = ui.group(left, 'modifiers');
    attack = ui.field(modifiers, 'attackModifier', {type: 'number', min: -1000, max: 1000, value: 0});
    enemyAttack = ui.field(modifiers, 'enemyModifier', {type: 'number', min: -1000, max: 1000, value: 0});
    bonus = ui.field(modifiers, 'damageBonus', {type: 'number', min: 0, max: 1000, value: 0});
    armor = ui.field(modifiers, 'damageReduction', {type: 'number', min: 0, max: 1000, value: 0});
    if (definition.equipment) {
      const gear = ui.group(left, 'equipment');
      weapon = ui.field(gear, 'weapon', {entries: ['none', 'crowbar', 'twins', 'rpg'].map(key => [key, ui.tr('weapon.' + key)])});
      shield = ui.checkbox(gear, 'shield'); vest = ui.checkbox(gear, 'vest'); patch = ui.checkbox(gear, 'healingPatch');
      ui.text(gear, ui.tr('equipmentOrder'));
    }
    ultraviolet = ui.checkbox(left, 'ultraviolet');
    editor = createOpponentEditor({document, id, t,
      fields: [{key: 'body', label: ui.tr('body'), min: 0, max: 1000},
        {key: 'hp', label: ui.tr('spirit'), min: definition.equipment ? 0.5 : 1, step: definition.equipment ? 0.5 : 1, max: 100000}],
      presets: getRoster().map(entry => ({displayName: entry.name + ' (§' + entry.section + ')',
        body: entry.enemies[0].body, hp: entry.enemies[0].hp, entry})),
      onSelect: preset => selectPreset(preset.entry)});
    left.append(editor.element); notes = ui.text(left, ui.tr('customRules'));
    customOptions = ui.group(left, 'specialRules');
    sucker = ui.checkbox(customOptions, 'sucker'); weakness = ui.checkbox(customOptions, 'allowWeakSpot');
    if (definition.equipment) support = ui.field(customOptions, 'supportDamage', {
      entries: ['none', 'others', 'all'].map(key => [key, ui.tr('support.' + key)])});
    if (definition.firstBookTechniques === false) {
      sucker.closest('label').hidden = true; weakness.closest('label').hidden = true;
    }
    reset = ui.button(left, 'custom', () => {
      if (busy(token?.state ?? {})) return;
      selected = null; sucker.checked = weakness.checked = false;
      if (support) support.value = 'none';
      editor.set([{displayName: '', body: '', hp: ''}]); presetLayout();
    });
    start = ui.button(left, 'start', () => change(state => {
      if (busy(state)) return null;
      const enemies = editor.read().map(enemy => ({name: enemy.displayName || ui.tr('opponent'), body: enemy.body, hp: enemy.hp}));
      const setup = {attackModifier: ui.number(attack), enemyModifier: ui.number(enemyAttack),
        damageBonus: ui.number(bonus), damageReduction: ui.number(armor), ultraviolet: ultraviolet.checked,
        sucker: selected ? Boolean(selected.options?.sucker) : sucker.checked,
        allowWeakSpot: selected ? Boolean(selected.options?.allowWeakSpot) : weakness.checked};
      if (definition.equipment) Object.assign(setup, {weapon: weapon.value, shield: shield.checked,
        vest: vest.checked, healingPatch: patch.checked,
        supportDamage: selected ? selected.options?.supportDamage ?? 'none' : support.value});
      const options = {...setup, attackModifier: setup.attackModifier + (selected?.options?.teamAttackBonus ?? 0)
        + (setup.ultraviolet ? 0 : selected?.options?.invisibilityPenalty ?? 0)
        + (selected?.options?.attackPenalty ?? 0) + (setup.weapon === 'crowbar' ? 1 : setup.weapon === 'twins' ? 2 : 0),
        areaDamage: setup.weapon === 'rpg'};
      const spirit = Number(hp.value);
      if (!hp.value.trim() || !Number.isSafeInteger(spirit * (definition.equipment ? 2 : 1))
          || spirit < Number(hp.min) || spirit > Number(hp.max)) throw RangeError('Invalid SPIRIT');
      state.fight = startAltimerFight({name: ui.tr('player'), body: ui.number(body), hp: spirit, setup},
        {...selected, name: selected?.name ?? enemies.map(enemy => enemy.name).join(' / '), enemies}, options);
      return state;
    }));
    controls = document.createElement('div'); controls.id = id + '-controls'; left.append(controls);
    cancel = ui.button(left, 'cancel', () => {
      const expected = token; if (!expected || !busy(expected.state)) return;
      showConfirm(ui.tr('cancelConfirm'), () => change(state => {
        state.fight = altimerAction(state.fight, {kind: 'cancel', expectedRevision: state.fight.revision}); return state;
      }, expected));
    });
    document.body.append(overlay); launch = document.createElement('button'); launch.id = id + '-btn';
    launch.style.display = 'none'; getButtonRow().append(launch);
    launch.addEventListener('click', () => {
      if (!store.snapshot()) {showAlert(t('battlesim.no_active_playthrough')); return;}
      render(); overlay.classList.add('active');
    });
    registerShortcut({button: launch, overlay, open: () => launch.click(), close});
    let backdrop = false;
    overlay.addEventListener('mousedown', event => {backdrop = event.target === overlay;});
    overlay.addEventListener('click', event => {if (backdrop && event.target === overlay) close();});
    overlay.addEventListener('keydown', event => {if (event.key === 'Escape') {event.stopPropagation(); close();}});
    presetLayout();
  }
  return {init, render, setVisible(value) {if (launch) launch.style.display = value ? '' : 'none'; if (!value) close();}};
}
