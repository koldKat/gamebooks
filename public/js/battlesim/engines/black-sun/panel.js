// Bind optional combat setup and actions to the current playthrough's themed panel.
import {createOpponentEditor} from '../../opponents.js';
import {blackSunPlayer, blackSunStart, blackSunRound, blackSunCancel, blackSunAcknowledge,
  blackSunUseEffect, blackSunMindOverBody, blackSunSelectSpecial, blackSunTransition, vitalityNames} from './combat.js';
import {prepareBlackSunEncounter} from './catalog.js';
import {drawBlackSunPage, rerollBlackSunPage, drawBlackSunSpecialPage} from './random.js';
import {createBlackSunState} from './state.js';
import {renderBlackSunReport} from './report.js';
import {blackSunTargetAllowed} from './special.js';
import {blackSunEffectAvailable} from './effects.js';

export function createBlackSunPanel({document, definition, t, getRoster, getSupport, getRun, getBookId,
  saveState, getButtonRow, showAlert, showConfirm, registerShortcut = () => {}}) {
  const id = definition.stateKey, store = createBlackSunState(() => ({definition, run: getRun(), bookId: getBookId(), saveState}));
  let overlay, launch, setup, controls, right, preset, variant, editor, gifts, effects, shown, mountedRun;
  const initialFields = {};
  const fields = {}, playerKeys = ['strength', 'dexterity', 'fighterBonus', 'weaponBonus', 'protection', 'karma', 'kyrnaVitality', 'riderRank', 'fatePoints'];
  const active = state => ['fighting', 'paused'].includes(state.fight?.status);
  const close = () => overlay?.classList.remove('active');
  function field(parent, label, input) {
    const row = document.createElement('label'), span = document.createElement('span');
    row.className = 'inv-edit-row'; span.textContent = label; input.className = 'inv-edit-input'; row.append(span, input); parent.append(row); return input;
  }
  function number(parent, label, value = 0, min = 0, max = 1000) {
    const node = document.createElement('input'); node.type = 'number'; node.min = min; node.max = max; node.step = 1; node.value = value;
    return field(parent, label, node);
  }
  function select(parent, label, options) {
    const node = document.createElement('select');
    for (const [value, title] of options) {const option = document.createElement('option'); option.value = value; option.textContent = title; node.append(option);}
    return field(parent, label, node);
  }
  function check(parent, label, value = false) {
    const row = document.createElement('label'), input = document.createElement('input'), span = document.createElement('span');
    row.className = 'bsim-checkbox'; input.type = 'checkbox'; input.checked = value; span.textContent = label; row.append(input, span); parent.append(row); return input;
  }
  function button(parent, label, action, key) {
    const node = document.createElement('button'); node.type = 'button'; node.className = 'bsim-action-btn'; node.textContent = label;
    if (key) node.id = id + '-' + key; node.addEventListener('click', action); parent.append(node); return node;
  }
  function details(parent, label) {
    const node = document.createElement('details'), summary = document.createElement('summary'); summary.textContent = label;
    node.append(summary); parent.append(node); return node;
  }
  function numeric(input) {
    const value = Number(input.value);
    if (!input.value.trim() || !Number.isSafeInteger(value) || value < Number(input.min) || value > Number(input.max)) throw new RangeError('Invalid field');
    return value;
  }
  function change(update, token = shown) {
    try {if (store.update(update, token)) render();} catch {showAlert('Check the combat values and the printed conditions for this action.');}
  }
  function selected(holder) {return [...holder.querySelectorAll('input:checked')].map(input => input.dataset.key);}
  function entry() {return getRoster().find(entry => entry.section === preset.value);}
  function choosePreset() {
    const source = entry(), combat = source?.combat;
    fields.enemyAttack.value = combat?.attack ?? 10; fields.enemyDefense.value = combat?.defense ?? 9;
    fields.extraDamage.closest('label').hidden = !combat?.entryDamageAndRounds;
    fields.enemyAttack.placeholder = combat?.relativeAttack != null ? 'Your Attack +5' : '';
    fields.enemyDefense.placeholder = combat?.relativeDefense != null ? 'Your Defense +5' : 'Not printed';
    if (combat?.relativeAttack != null || combat?.separatePartAttacks) fields.enemyAttack.value = '';
    if (combat?.relativeDefense != null || combat?.defenseOnly) fields.enemyDefense.value = '';
    variant.replaceChildren();
    for (const item of [{key: '', label: 'Printed setup'}, ...(combat?.variants ?? []).map(v => ({...v, label: v.label || v.key}))]) {
      const option = document.createElement('option'); option.value = item.key; option.textContent = item.label; variant.append(option);
    }
    editor?.element.remove();
    const part = Boolean(combat?.separatePartAttacks);
    editor = createOpponentEditor({document, id, t,
      fields: [{key: 'resistance', label: 'Resistance', min: 1}, ...(part ? [{key: 'attack', label: 'Limb Attack'}]
        : [{key: 'attackBonus', label: 'Attack bonus'}, {key: 'defenseBonus', label: 'Defense bonus'}])],
      isStatUnavailable: (key, row) => key === 'resistance' ? row.resistance == null : key === 'attack' && row.attack == null,
      presets: getRoster().map(e => ({displayName: `${e.label} (${e.section})`, entrySection: e.section,
        resistance: e.combat.opponents[0].resistance, attackBonus: 0, defenseBonus: 0})),
      onSelect(value) {preset.value = value.entrySection; choosePreset();}});
    editor.set(combat?.opponents.map(unit => ({...unit, displayName: unit.name})) ?? [{displayName: '', resistance: 2, attackBonus: 0, defenseBonus: 0}]);
    editor.fixCount(Boolean(source)); setup.append(editor.element);
    if (combat?.opponents.some(unit => unit.track)) for (const input of editor.element.querySelectorAll('[data-stat="resistance"]')) input.readOnly = true;
    for (const holder of [gifts, effects]) for (const input of holder.querySelectorAll('input')) {
      const collection = holder === gifts ? getSupport().passives : getSupport().effects;
      const item = collection.find(item => item.id === input.dataset.key);
      const available = !item.sections || item.sections.includes(source?.section);
      input.closest('label').hidden = !available; if (!available) input.checked = false;
    }
  }
  function snapshotSetup() {
    return {preset: preset.value, variant: variant.value, passives: selected(gifts), effects: selected(effects),
      values: Object.fromEntries(Object.entries(fields).map(([key, input]) => [key, input.type === 'checkbox' ? input.checked : input.value]))};
  }
  function begin(state) {
    if (active(state)) return state;
    const source = entry(), options = {variants: variant.value ? [variant.value] : [], passives: selected(gifts), effects: selected(effects), rage: numeric(fields.rage), extraDamage: numeric(fields.extraDamage)};
    const opponents = editor.read().map(unit => ({...unit, name: unit.displayName || 'Opponent'}));
    const base = source ?? {label: 'Custom encounter', section: 'custom', combat: {label: 'Custom encounter', section: 'custom', attack: numeric(fields.enemyAttack), defense: numeric(fields.enemyDefense)}};
    const combat = prepareBlackSunEncounter({...base, combat: {...base.combat, opponents}}, options, getSupport());
    if (!combat.relativeAttack && !combat.separatePartAttacks && (!source || numeric(fields.enemyAttack) !== source.combat.attack)) combat.attack = numeric(fields.enemyAttack);
    if (!combat.relativeDefense && !combat.defenseOnly && (!source || numeric(fields.enemyDefense) !== source.combat.defense)) combat.defense = numeric(fields.enemyDefense);
    const player = blackSunPlayer({...Object.fromEntries(playerKeys.map(key => [key, numeric(fields[key])])),
      vitality: Number(fields.vitality.value), expert: fields.expert.checked, mounted: fields.mounted.checked, weaponName: fields.weaponName.value});
    state.fight = blackSunStart(player, combat); state.encounter = combat.section; state.setup = snapshotSetup();
    state.recoveryPage = null;
    state.page = drawBlackSunPage(getSupport().randomizer.pages); return state;
  }
  function resolveRound(state, action) {
    const f = state.fight, priorRound = f.log.at(-1)?.round;
    state.page ??= drawBlackSunPage(getSupport().randomizer.pages);
    const slot = f.round + Number(!f.roundStarted);
    const extraDefensePage = f.extraIncomingRound === slot ? drawBlackSunPage(getSupport().randomizer.pages) : undefined;
    state.fight = blackSunRound(f, state.page, {...action, expectedRound: f.round, extraDefensePage});
    if (state.fight.log.at(-1)?.round !== priorRound || !active(state)) state.page = null;
    if (state.fight.status === 'fighting') state.page ??= drawBlackSunPage(getSupport().randomizer.pages);
    return state;
  }
  function renderActions(state, token) {
    controls.replaceChildren(); const f = state.fight;
    if (!active(state)) return;
    const target = select(controls, 'Target', f.opponents.map((enemy, i) => [String(i), enemy.name || 'Opponent ' + (i + 1)]));
    target.id = id + '-target';
    for (const option of target.options) option.disabled = !f.encounter.defenseOnly
      && (f.opponents[Number(option.value)].resistance === 0 || !blackSunTargetAllowed(f, f.opponents[Number(option.value)]));
    target.value = String(Math.max(0, f.opponents.findIndex(enemy => f.encounter.defenseOnly || enemy.resistance > 0)));
    const secondary = f.encounter.splitHitDamage ? select(controls, 'Second opponent', f.opponents.map((enemy, i) => [String(i), enemy.name || 'Opponent ' + (i + 1)])) : null;
    if (secondary) {
      secondary.id = id + '-secondary-target';
      const updateSecondary = () => {
        for (const option of secondary.options) {
          const enemy = f.opponents[Number(option.value)];
          option.disabled = option.value === target.value || !enemy.resistance || !blackSunTargetAllowed(f, enemy);
        }
        secondary.value = [...secondary.options].find(option => !option.disabled)?.value ?? '';
      };
      target.addEventListener('change', updateSecondary); updateSecondary();
    }
    if (f.status === 'paused' && f.pending.transitionTarget) button(controls, 'Continue fight under the new conditions', () => change(next => {
      const source = getRoster().find(entry => entry.section === f.pending.transitionTarget);
      const keys = kind => (next.setup?.[kind] ?? []).map(key => f.pending.selectionMap?.[kind]?.[key] ?? key)
        .filter(key => getSupport()[kind].some(item => item.id === key && (!item.sections || item.sections.includes(source.section))));
      const passives = keys('passives'), effects = keys('effects');
      const combat = prepareBlackSunEncounter(source, {passives, effects}, getSupport());
      next.fight = blackSunTransition(next.fight, combat); next.encounter = source.section;
      next.setup = {...next.setup, preset: source.section, variant: '', passives, effects};
      next.page = drawBlackSunPage(getSupport().randomizer.pages); return next;
    }, token), 'transition');
    else if (f.status === 'paused' && f.pending.requiresUnusedMoonAttack) button(controls, 'Draw an unused special attack', () => change(next => {
      const draw = drawBlackSunSpecialPage(getSupport().randomizer.pages, f.encounter.specialMoonRoutes, f.specialAttacksUsed ?? []);
      const testPage = drawBlackSunPage(getSupport().randomizer.pages);
      next.fight = blackSunSelectSpecial(next.fight, draw, testPage); return next;
    }, token), 'special');
    else if (f.status === 'paused') button(controls, 'Continue after printed instructions', () => change(next => {
      next.fight = blackSunAcknowledge(next.fight);
      if (next.fight.status === 'fighting') next.page ??= drawBlackSunPage(getSupport().randomizer.pages);
      else if (!active(next)) next.page = null;
      return next;
    }, token), 'continue');
    else {
      const spine = f.encounter.spineBonus && !f.player.twoHandedWeapon && !f.encounter.noEquipment
        ? select(controls, 'Nergal’s Spine', [['none', 'Do not use'], ['combined', 'Add bonus to main attack'], ['separate', 'Separate attack with the same dice']]) : null;
      const attack = check(controls, 'Automatic attack (Karma)'), extraAttack = check(controls, 'Extra resistance loss (additional Karma)');
      attack.disabled = !f.encounter.allowKarmaAttack; extraAttack.disabled = !f.encounter.karmaDamage;
      const defense = check(controls, 'Automatic defense (Karma)'), extraDefense = check(controls, 'Regenerate vitality (additional Karma)');
      defense.disabled = !f.encounter.allowKarmaDefense; extraDefense.disabled = !f.encounter.karmaHeal;
      button(controls, 'Resolve round', () => change(next => {
        return resolveRound(next, {target: Number(target.value),
          secondaryTarget: secondary ? Number(secondary.value) : undefined, spine: spine?.value,
          autoAttack: attack.checked, enhancedAttack: extraAttack.checked, autoDefense: defense.checked, enhancedDefense: extraDefense.checked});
      }, token), 'round');
      for (const key of ['skip', 'trade']) if (f.encounter.tactics?.[key]) {
        const node = button(controls, key === 'skip' ? 'Play for time (two rounds)' : 'Force a hit (lose one vitality)',
          () => change(next => resolveRound(next, {type: 'tactic', tactic: key}), token), 'tactic-' + key);
        node.disabled = f.usedTactics?.includes(key) || false;
      }
      if (f.harpooned) {
        for (const [key, label] of [['pull-harpoon', 'Pull lodged Rider’s Thorn'], ['release-harpoon', 'Release Rider’s Thorn']]) {
          if (key === 'pull-harpoon' && !f.encounter.harpoonPull) continue;
          button(controls, label, () => change(next => resolveRound(next, {type: key}), token), key);
        }
      }
      if (f.encounter.keeperCharm && state.page?.base === 1) button(controls, 'Keeper’s Charm: reroll page', () => change(next => {
        next.page = rerollBlackSunPage(next.page, getSupport().randomizer.pages, true); return next;
      }, token), 'reroll');
      const swap = number(controls, 'New weapon Hit Bonus', f.player.weaponBonus);
      const swapName = field(controls, 'New weapon name', document.createElement('input'));
      const swapTwoHanded = check(controls, 'New weapon requires two hands');
      button(controls, 'Change weapon instead of attacking', () => change(next => {
        return resolveRound(next, {type: 'change-weapon', weaponBonus: numeric(swap), weaponName: swapName.value, twoHandedWeapon: swapTwoHanded.checked});
      }, token), 'weapon');
      if (f.encounter.mindOverBody) {
        const strength = select(controls, 'Mind over Body: points to Strength', [['0', '0'], ['1', '1'], ['2', '2']]);
        button(controls, 'Use Mind over Body', () => change(next => {next.fight = blackSunMindOverBody(next.fight, Number(strength.value)); return next;}, token), 'mind');
      }
    }
    const restoration = select(controls, 'Restored vitality', vitalityNames.slice(0, 5).map((name, i) => [String(i), name]));
    const available = (f.encounter.effects ?? []).filter(effect => blackSunEffectAvailable(f, effect));
    const needsMoon = effect => (effect.vitalityByMoon || effect.playerLossByMoon)
      && !(effect.restoreFitWithAbility && f.encounter[effect.restoreFitWithAbility])
      && !(effect.chooseVitalityWithAbility && f.encounter[effect.chooseVitalityWithAbility]);
    restoration.closest('label').hidden = !available.some(effect => effect.chooseVitality
      || effect.chooseVitalityOnMoon && state.recoveryPage?.moon === effect.chooseVitalityOnMoon
      || effect.chooseVitalityWithAbility && f.encounter[effect.chooseVitalityWithAbility]);
    if (!state.recoveryPage && available.some(needsMoon)) button(controls,
      available.some(effect => effect.playerLossByMoon) ? 'Determine the guard’s accuracy' : 'Determine divine assistance', () => change(next => {
      next.recoveryPage = drawBlackSunPage(getSupport().randomizer.pages); return next;
    }, token), 'recovery-moon');
    for (const effect of f.encounter.effects ?? []) {
      const node = button(controls, effect.label, () => change(next => {
        const moon = next.recoveryPage?.moon;
        next.fight = blackSunUseEffect(next.fight, effect.id, {target: Number(target.value), vitality: Number(restoration.value), moon});
        if (effect.vitalityByMoon || effect.playerLossByMoon) next.recoveryPage = null;
        return next;
      }, token), 'effect-' + effect.id);
      node.disabled = !blackSunEffectAvailable(f, effect) || Boolean(needsMoon(effect) && !state.recoveryPage);
    }
    button(controls, 'End encounter', () => showConfirm('End this encounter?', () => change(next => {
      next.fight = blackSunCancel(next.fight); next.page = null; return next;
    }, token)), 'end');
  }
  function render() {
    if (!overlay) return;
    const token = store.snapshot(); if (!token) {shown = null; mountedRun = null; close(); return;}
    shown = token; const state = token.state, locked = active(state);
    if (locked && state.fight.encounter.section !== preset.value && getRoster().some(entry => entry.section === state.fight.encounter.section)) {
      preset.value = state.fight.encounter.section; choosePreset();
    }
    if (mountedRun !== token.run) {
      const saved = state.setup;
      for (const [key, input] of Object.entries(fields)) {
        const value = saved?.values[key] ?? state.player?.[key] ?? getSupport().playerDefaults[key] ?? initialFields[key];
        if (input.type === 'checkbox') input.checked = Boolean(value);
        else if (value != null) input.value = value;
      }
      preset.value = saved?.preset || 'custom'; choosePreset(); variant.value = saved?.variant || '';
      if (locked && preset.value === 'custom') editor.set(state.fight.opponents.map(enemy => ({...enemy, displayName: enemy.name})));
      for (const holder of [gifts, effects]) for (const input of holder.querySelectorAll('input')) input.checked = (saved?.[holder === gifts ? 'passives' : 'effects'] ?? []).includes(input.dataset.key);
      mountedRun = token.run;
    }
    for (const input of setup.querySelectorAll('input,select,button')) input.disabled = locked;
    editor.lock(locked); fields.enemyAttack.disabled = locked || Boolean(entry()?.combat.relativeAttack || entry()?.combat.separatePartAttacks);
    fields.enemyDefense.disabled = locked || Boolean(entry()?.combat.relativeDefense || entry()?.combat.defenseOnly);
    document.getElementById(id + '-start').disabled = locked;
    if (!locked && state.player) for (const key of [...playerKeys, 'vitality']) fields[key].value = state.player[key] ?? fields[key].value;
    renderActions(state, token); renderBlackSunReport(document, right, state);
  }
  function open() {if (!store.snapshot()) {showAlert(t('battlesim.no_active_playthrough')); return;} render(); overlay.classList.add('active');}
  function init() {
    if (overlay) return;
    overlay = document.createElement('div'); overlay.id = id + '-overlay'; overlay.className = 'inv-overlay';
    overlay.innerHTML = '<div class="inv-modal bsim-modal bsim-compact-form"><div class="inv-modal-hdr"><span class="inv-modal-title"></span><button type="button" class="inv-close-btn">&times;</button></div><div class="bsim-body"><div class="bsim-col bsim-col-left"></div><div class="bsim-col bsim-col-right"></div></div></div>';
    overlay.querySelector('.inv-modal-title').textContent = definition.title;
    overlay.querySelector('.inv-close-btn').setAttribute('aria-label', t('btn.close'));
    overlay.querySelector('.inv-close-btn').addEventListener('click', close);
    const left = overlay.querySelector('.bsim-col-left'); right = overlay.querySelector('.bsim-col-right');
    setup = document.createElement('div'); left.append(setup);
    preset = select(setup, 'Encounter', [['custom', 'Custom opponent'], ...getRoster().map(e => [e.section, `${e.label} (${e.section})`])]);
    preset.id = id + '-encounter';
    preset.addEventListener('change', () => {choosePreset(); render();});
    variant = select(setup, 'Encounter variant', [['', 'Printed setup']]);
    variant.id = id + '-variant';
    const defaults = getSupport().playerDefaults;
    const labels = {strength: 'Strength', dexterity: 'Dexterity', fighterBonus: 'Fighter Attack bonus', weaponBonus: 'Weapon Hit Bonus', protection: 'Clothing Protection', karma: 'Karma', kyrnaVitality: 'Kyrna’s vitality level', riderRank: 'Rider Rank', fatePoints: 'Fate Points'};
    for (const key of playerKeys) fields[key] = number(setup, labels[key], defaults[key] ?? 0, key === 'riderRank' ? 1 : 0, key === 'fatePoints' ? 13 : key === 'kyrnaVitality' || key === 'riderRank' ? 5 : 1000);
    fields.vitality = select(setup, 'Vitality', vitalityNames.map((name, i) => [String(i), name])); fields.vitality.value = '1';
    fields.weaponName = field(setup, 'Weapon name', document.createElement('input'));
    fields.expert = check(setup, 'Expert wound penalties'); fields.mounted = check(setup, 'Mounted on Kyrna');
    fields.rage = number(setup, 'Current Rage', 0);
    fields.extraDamage = number(setup, 'Extra Damage from your notes', 0, 0, 4);
    fields.enemyAttack = number(setup, 'Base enemy Attack', 10); fields.enemyDefense = number(setup, 'Base enemy Defense', 9);
    for (const [key, input] of Object.entries(fields)) {
      input.id = id + '-' + key;
      initialFields[key] = input.type === 'checkbox' ? input.checked : input.value;
    }
    gifts = details(setup, 'Combat gifts and equipment'); effects = details(setup, 'Available combat effects');
    for (const [holder, collection] of [[gifts, getSupport().passives], [effects, getSupport().effects]]) for (const item of collection) check(holder, item.label).dataset.key = item.id;
    choosePreset(); button(left, 'Start encounter', () => change(begin), 'start');
    controls = document.createElement('div'); left.append(controls); document.body.append(overlay);
    launch = document.createElement('button'); launch.id = id + '-btn'; launch.type = 'button'; launch.className = 'btn btn-secondary';
    launch.textContent = t('battlesim.title'); launch.addEventListener('click', open); getButtonRow()?.append(launch);
    registerShortcut({button: launch, overlay, open, close});
    let backdrop = false;
    overlay.addEventListener('mousedown', event => {backdrop = event.target === overlay;});
    overlay.addEventListener('click', event => {if (backdrop && event.target === overlay) close();});
    overlay.addEventListener('keydown', event => {if (event.key === 'Escape') {event.stopPropagation(); close();}});
  }
  return {init, render, setVisible(value) {if (launch) launch.style.display = value ? '' : 'none'; if (!value) close();}};
}
