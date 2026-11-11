// Bind editable Golden Dragon encounters and combat actions to the initiating run.
import {createQuestState} from '../super-endless-quest/state.js';
import {createD20Forms} from '../d20/forms.js';
import {createOpponentEditor} from '../../opponents.js';
import {customDragonEncounter, startDragonFight, dragonAction, canDragonFlee, validateDragonFight} from './core.js';
import {renderDragonReport} from './report.js';

export function createDragonPanel({document, definition, t, getRoster, getRun, getBookId, saveState,
  getButtonRow, showAlert, showConfirm, registerShortcut = () => {}}) {
  const id = definition.stateKey, ui = createD20Forms(document, id, key => t(definition.i18nPrefix + '.' + key));
  const store = createQuestState(() => ({run:getRun(), bookId:getBookId(), definition, saveState}), {validateFight:validateDragonFight});
  let overlay, launch, left, right, hp, psi, agility, gauntlet, editor, custom, threshold, playerDamage, enemyDamage,
    hpField, netModifier, wound, firstPenalty, progressive,
    start, cancel, reset, controls, setupNotes, selected = null, token, mountedRun, mountedOriginal, controlsRun, controlsOriginal;
  const close = () => overlay?.classList.remove('active');
  const busy = state => state.fight?.status === 'fighting';
  function change(callback, expected = token) {
    try {
      if (store.update(state => { state.history = state.history.slice(-199); return callback(state); }, expected)) render();
    } catch { showAlert(ui.tr('invalid')); }
  }
  function presetLayout() {
    custom.hidden = Boolean(selected);
    editor.fixCount(Boolean(selected));
    setupNotes.textContent = selected?.sourceNotes?.join(' ') ?? ui.tr('customRules');
    if (wound) wound.closest('label').hidden = !selected;
    hpField.min = selected?.allowDefeatedOpponents ? 0 : 1;
    for (const input of editor.element.querySelectorAll('[data-stat="hp"]')) {
      input.min = hpField.min;
      input.closest('label').querySelector('span').textContent = selected?.profiles[0]?.unit === 'branches' ? ui.tr('branches') : ui.tr('vigour');
    }
    for (const [input, enabled] of [[firstPenalty, selected?.allowFirstRoundPenalty], [progressive, selected?.allowProgressiveBonus]]) {
      if (!input) continue;
      input.closest('label').hidden = !enabled;
      if (!enabled) input.checked = false;
    }
  }
  function selectPreset(entry) {
    selected = entry;
    editor.set(entry.profiles.map(profile => ({...profile, displayName:profile.name, hp:entry.requiresCurrentHp ? '' : profile.hp})));
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
      const state = snapshot.state;
      hp.value = state.player?.hp ?? ''; psi.value = state.player?.psi ?? ''; agility.value = state.player?.agility ?? '';
      gauntlet.checked = definition.allowRollModifier !== false && state.player?.rollModifier === -1;
      if (netModifier) {
        netModifier.value = state.player?.rollModifier ?? 0;
        wound.value = state.player?.woundDamage ?? 3;
        firstPenalty.checked = state.player?.firstRoundModifier === -2;
        progressive.checked = Boolean(state.player?.progressiveRollBonus);
      }
      selected = state.opponent?.key ? getRoster().find(entry => entry.key === state.opponent.key) ?? null : null;
      editor.set((state.opponent?.profiles ?? [{name:'', hp:''}]).map(profile => ({...profile, displayName:profile.name})));
      presetLayout(); mountedRun = snapshot.run; mountedOriginal = snapshot.original;
    }
    token = snapshot;
    const locked = busy(snapshot.state);
    for (const input of [hp, psi, agility, gauntlet, threshold, playerDamage, enemyDamage,
      netModifier, wound, firstPenalty, progressive].filter(Boolean)) input.disabled = locked;
    editor.lock(locked); start.disabled = reset.disabled = locked; cancel.disabled = !locked;
    if (controlsRun !== snapshot.run || controlsOriginal !== snapshot.original) {
      controlsRun = snapshot.run; controlsOriginal = snapshot.original; controls.replaceChildren();
      if (locked) {
        const fight = snapshot.state.fight;
        if (fight.pendingPsiSave) {
          ui.text(controls, ui.tr('psiSavePrompt') + ' ' + fight.player.psi);
          const dice = ui.group(controls, 'manualDice'), first = ui.field(dice, 'die1', {type:'number', min:1, max:6, optional:true}),
            second = ui.field(dice, 'die2', {type:'number', min:1, max:6, optional:true});
          ui.button(controls, 'psiSave', () => change(state => {
            const values = first.value.trim() || second.value.trim() ? [ui.number(first), ui.number(second)] : undefined;
            state.fight = dragonAction(state.fight, {kind:'psiSave', expectedRevision:fight.revision, dice:values}); return state;
          }, snapshot));
        } else if (fight.unresolved) {
          ui.text(controls, ui.tr('unresolved') + ' ' + fight.unresolved.total);
          const ruling = ui.field(controls, 'printedTotal', {entries:[['', ui.tr('chooseRuling')],
            ...Array.from({length:11}, (_, index) => [String(index + 2), String(index + 2)])]});
          ui.button(controls, 'adjudicate', () => change(state => {
            state.fight = dragonAction(state.fight, {kind:'adjudicate', expectedRevision:fight.revision, printedTotal:ui.number(ruling)}); return state;
          }, snapshot));
        } else {
          const firstLiving = fight.enemies.findIndex(enemy => enemy.hp > 0);
          const entries = fight.enemies.flatMap((enemy, index) => enemy.hp > 0 && (!fight.opponent.sequential || index === firstLiving)
            ? [[String(index), enemy.name + ' (' + enemy.hp + ')']] : []);
          const target = ui.field(controls, 'target', {entries}); target.closest('label').hidden = entries.length === 1;
          const dice = ui.group(controls, 'manualDice'), first = ui.field(dice, 'die1', {type:'number', min:1, max:6, optional:true}),
            second = ui.field(dice, 'die2', {type:'number', min:1, max:6, optional:true});
          const values = () => first.value.trim() || second.value.trim() ? [ui.number(first), ui.number(second)] : undefined;
          ui.button(controls, 'roll', () => change(state => {
            state.fight = dragonAction(state.fight, {kind:'roll', expectedRevision:fight.revision, target:ui.number(target), dice:values()}); return state;
          }, snapshot));
          if (canDragonFlee(fight)) ui.button(controls, 'flee', () => change(state => {
            state.fight = dragonAction(state.fight, {kind:'flee', expectedRevision:fight.revision, dice:values()}); return state;
          }, snapshot));
        }
      }
    }
    renderDragonReport(right, ui, snapshot.state);
  }
  function init() {
    if (overlay) return;
    overlay = document.createElement('div'); overlay.id = id + '-overlay'; overlay.className = 'inv-overlay';
    overlay.innerHTML = '<div class="inv-modal bsim-modal bsim-compact-form"><div class="inv-modal-hdr"><span class="inv-modal-title"></span><button type="button" class="inv-close-btn">&times;</button></div><div class="bsim-body"><div class="bsim-col bsim-col-left"></div><div class="bsim-col bsim-col-right"></div></div></div>';
    overlay.querySelector('.inv-modal-title').textContent = ui.tr('title');
    const closer = overlay.querySelector('.inv-close-btn'); closer.setAttribute('aria-label', t('btn.close')); closer.addEventListener('click', close);
    left = overlay.querySelector('.bsim-col-left'); right = overlay.querySelector('.bsim-col-right'); ui.text(left, ui.tr('rules'));
    hp = ui.field(left, 'currentVigour', {type:'number', min:1});
    psi = ui.field(left, 'currentPsi', {type:'number', min:-1000000});
    agility = ui.field(left, 'currentAgility', {type:'number', min:-1000000});
    gauntlet = ui.checkbox(left, 'gauntlet');
    gauntlet.closest('label').hidden = definition.allowRollModifier === false;
    if (definition.combatOptions) {
      netModifier = ui.field(left, 'netRollModifier', {type:'number', min:-10, max:10, value:0});
      wound = ui.field(left, 'woundDamage', {entries:[['2', '2'], ['3', '3'], ['4', '4']], value:3});
      firstPenalty = ui.checkbox(left, 'firstRoundPenalty');
      progressive = ui.checkbox(left, 'progressiveBonus');
      firstPenalty.closest('label').hidden = progressive.closest('label').hidden = true;
    }
    hpField = {key:'hp', label:ui.tr('vigour'), min:1};
    editor = createOpponentEditor({document, id, t, fields:[hpField],
      presets:getRoster().map(entry => ({displayName:entry.name + ' (§' + entry.section + ')', hp:entry.profiles[0].hp, entry})),
      onSelect:preset => selectPreset(preset.entry)});
    left.append(editor.element); setupNotes = ui.text(left, ui.tr('customRules'));
    reset = ui.button(left, 'custom', () => {
      if (busy(token?.state ?? {})) return; selected = null; editor.set([{displayName:'', hp:''}]); presetLayout();
    });
    custom = ui.group(left, 'customChart');
    threshold = ui.field(custom, 'playerHitThrough', {type:'number', min:2, max:11, value:6});
    playerDamage = ui.field(custom, 'playerDamage', {type:'number', min:1, value:3});
    enemyDamage = ui.field(custom, 'enemyDamage', {type:'number', min:1, value:3});
    start = ui.button(left, 'start', () => change(state => {
      if (busy(state)) return null;
      const profiles = editor.read().map((profile, index) => ({name:profile.displayName, hp:profile.hp,
        ...(selected?.profiles[index]?.unit ? {unit:selected.profiles[index].unit} : {})}));
      const encounter = selected ? {...selected, profiles} : customDragonEncounter(profiles,
        {playerHitThrough:ui.number(threshold), playerDamage:ui.number(playerDamage), enemyDamage:ui.number(enemyDamage)});
      const currentHp = ui.number(hp);
      state.fight = startDragonFight({name:ui.tr('player'), hp:currentHp, maxHp:currentHp, psi:ui.number(psi), agility:ui.number(agility),
        rollModifier:netModifier ? ui.number(netModifier) : gauntlet.checked ? -1 : 0,
        ...(definition.combatOptions ? {...(selected ? {woundDamage:ui.number(wound)} : {}), firstRoundModifier:firstPenalty.checked ? -2 : 0,
          progressiveRollBonus:progressive.checked} : {})}, encounter); return state;
    }));
    controls = document.createElement('div'); controls.id = id + '-controls'; left.append(controls);
    cancel = ui.button(left, 'cancel', () => {
      const expected = token; if (!expected || !busy(expected.state)) return;
      showConfirm(ui.tr('cancelConfirm'), () => change(state => {
        state.fight = dragonAction(state.fight, {kind:'cancel', expectedRevision:state.fight.revision}); return state;
      }, expected));
    });
    document.body.append(overlay); launch = document.createElement('button'); launch.id = id + '-btn'; launch.style.display = 'none'; getButtonRow().append(launch);
    launch.addEventListener('click', () => {
      if (!store.snapshot()) { showAlert(t('battlesim.no_active_playthrough')); return; }
      render(); overlay.classList.add('active');
    });
    registerShortcut({button:launch, overlay, open:() => launch.click(), close});
    let backdrop = false; overlay.addEventListener('mousedown', event => { backdrop = event.target === overlay; });
    overlay.addEventListener('click', event => { if (backdrop && event.target === overlay) close(); });
    overlay.addEventListener('keydown', event => { if (event.key === 'Escape') { event.stopPropagation(); close(); } });
  }
  return {init, render, setVisible(value) { if (launch) launch.style.display = value ? '' : 'none'; if (!value) close(); }};
}
