// Coordinate Real Life combat controls, live playthrough state and the shared modal layout.
import {startRealLifeFight, realLifeStep, realLifeTurn, realLifeActive, realLifeInteger, skipRealLifeOpening, endRealLifeFight,
  canTestRealLifeLuck, testRealLifeLuck} from './core.js';
import {createRealLifeState} from './state.js';
import {realLifeSetupMarkup, createRealLifeSetup, escapeRealLife as esc} from './setup-panel.js';
import {renderRealLifeReport} from './report.js';

export function createRealLifePanel({document, definition, t, getRoster, getRun, getBookId, saveState,
  getButtonRow, showAlert, showConfirm, registerShortcut = () => {}}) {
  const id = definition.stateKey, el = key => document.getElementById(id + '-' + key);
  const store = createRealLifeState(() => ({run: getRun(), bookId: getBookId(), definition, saveState}));
  let setup, shownRun, wasActive = false;
  const button = (key, label) => `<button class="bsim-action-btn" type="button" id="${id}-${key}">${esc(label)}</button>`;
  function close() {el('overlay')?.classList.remove('active');}
  function open() {
    if (!store.snapshot()) {showAlert(t('battlesim.no_active_playthrough')); return;}
    render(); el('overlay').classList.add('active');
  }
  function action(change, token = store.snapshot()) {
    if (!token) return;
    try {if (store.update(change, token)) render();}
    catch (error) {showAlert(error instanceof RangeError ? error.message : 'Unable to resolve this combat action.');}
  }
  function manualRoll(state) {
    if (!state.setup.manualDice) return undefined;
    const values = ['die1', 'die2'].map(key => realLifeInteger(el(key).value, 1, 6));
    return () => {if (!values.length) throw new RangeError('Extra die roll'); return values.shift();};
  }
  function render() {
    if (!el('overlay')) return;
    const token = store.snapshot();
    if (!token) {shownRun = undefined; wasActive = false; close(); return;}
    const state = token.state, fight = state.fight, active = realLifeActive(fight);
    const changingRun = shownRun !== token.run;
    if (changingRun) {shownRun = token.run; setup.restore(state);}
    if (active && (changingRun || !wasActive)) el('setup').open = false;
    wasActive = active;
    if (fight) for (const key of definition.combatFields ?? ['strength', 'sword', 'firearm', 'horsemanship', 'wounds']) el(key).value = fight.hero[key];
    setup.refresh(active);
    const turn = active ? realLifeTurn(fight) : null;
    const selected = el('target').value;
    el('target').innerHTML = (turn?.targets ?? []).map(target => {
      const actor = [fight.hero, ...fight.opponents, ...fight.allies].find(actor => actor.id === target);
      return `<option value="${target}">${esc(actor.name)}</option>`;
    }).join('');
    if (turn?.targets.includes(selected)) el('target').value = selected;
    el('target').disabled = !active || Boolean(fight?.pending) || (turn?.targets.length ?? 0) < 2;
    el('both').closest('label').hidden = !fight?.encounter.simultaneousAttack;
    el('both').disabled = !active || turn?.attacker !== 'hero' || turn?.kind !== 'attack' || !fight?.encounter.simultaneousAttack;
    if (el('both').disabled) el('both').checked = false;
    const splitRound = fight?.splitRound && fight.splitRound.round === fight.round ? fight.splitRound : null;
    el('split').closest('label').hidden = !fight?.encounter.splitSkillAttacks;
    el('split').disabled = !active || turn?.attacker !== 'hero' || turn?.kind !== 'attack' || Boolean(splitRound);
    if (splitRound) el('split').checked = Boolean(splitRound.remaining);
    else if (el('split').disabled) el('split').checked = false;
    el('defensive').disabled = !active || turn?.attacker !== 'hero' || ['firearm', 'javelin'].includes(fight?.weapon)
      || fight?.encounter.cannotDefend || el('both').checked || el('split').checked || Boolean(fight?.opening || fight?.pending) || !['attack', 'horsemanship'].includes(turn?.kind);
    if (fight?.pending) el('defensive').checked = Boolean(fight.pending.defensive);
    else if (el('defensive').disabled) el('defensive').checked = false;
    el('attack').disabled = !active;
    const labels = {horsemanship: 'Roll Horsemanship', 'round-horsemanship': 'Roll Horsemanship',
      initiative: 'Roll initiative Agility', charge: 'Roll mounted charge', agility: 'Avoid boar charge',
      'opening-agility': 'Roll Agility for opening shot', 'avoid-pistol': 'Avoid pistol shot', 'knife-possession': 'Roll for knife possession'};
    el('attack').textContent = labels[turn?.kind] ?? (fight?.opening ? 'Fire opening shot' : 'Next attack');
    el('luck-roll').hidden = !fight?.encounter.optionalRoundLuckTarget; el('luck-roll').disabled = !canTestRealLifeLuck(fight);
    el('start').disabled = active; el('cancel').disabled = !active;
    el('skip').hidden = !fight?.opening; el('skip').disabled = !active || !fight?.opening || Boolean(fight?.openingAgilityPending);
    for (const [key, field] of [['escape', 'escapeTarget'], ['surrender', 'surrenderTarget']]) {
      el(key).hidden = !fight?.encounter[field]; el(key).disabled = !active;
    }
    el('dice').hidden = !(active ? state.setup.manualDice : el('manualDice').checked);
    el('turn').textContent = turn ? `${[fight.hero, ...fight.opponents, ...fight.allies].find(actor => actor.id === turn.attacker).name}: ${labels[turn.kind] ?? 'attack'}` : '';
    renderRealLifeReport(document, el('results'), state);
  }
  function init() {
    if (el('overlay')) return;
    const overlay = document.createElement('div'); overlay.id = id + '-overlay'; overlay.className = 'inv-overlay';
    overlay.innerHTML = `<div class="inv-modal bsim-modal bsim-compact-form"><div class="inv-modal-hdr"><span class="inv-modal-title">${esc(definition.title)} · ${esc(t('battlesim.title'))}</span><button class="inv-close-btn" id="${id}-close" aria-label="${esc(t('btn.close'))}">&times;</button></div>
      <div class="bsim-body"><div class="bsim-col bsim-col-left">${realLifeSetupMarkup(id, getRoster(), definition)}
      <div class="bsim-btn-row">${button('start', 'Start fight')}${button('cancel', 'Cancel fight')}</div>
      <p id="${id}-turn"></p><label class="inv-edit-row"><span>Target</span><select class="inv-edit-input" id="${id}-target" aria-label="Target"></select></label>
      <label class="bsim-checkbox"><input type="checkbox" id="${id}-defensive">Defensive attack: halve both weapon skills, rounding up</label>
      <label class="bsim-checkbox"><input type="checkbox" id="${id}-both" hidden>Attack both foes together at half skill</label>
      <label class="bsim-checkbox"><input type="checkbox" id="${id}-split">Split skill across all opponents, rolling separately for each</label>
      <div id="${id}-dice" class="bsim-btn-row">${['die1', 'die2'].map(key => `<label class="inv-edit-row"><span>${key === 'die1' ? 'Die 1' : 'Die 2'}</span><input class="inv-edit-input" id="${id}-${key}" type="number" min="1" max="6" step="1" value="1"></label>`).join('')}</div>
      <div class="bsim-btn-row">${button('attack', 'Next attack')}${button('luck-roll', 'Optional Luck roll')}${button('skip', 'Skip opening shot')}${button('escape', 'Escape')}${button('surrender', 'Surrender')}</div>
      </div><div class="bsim-col bsim-col-right" id="${id}-results"></div></div></div>`;
    document.body.append(overlay);
    setup = createRealLifeSetup({document, id, t, entries: getRoster(), definition});
    el('both').addEventListener('change', render);
    el('split').addEventListener('change', render);
    const launcher = document.createElement('button'); launcher.id = id + '-btn'; launcher.textContent = t('battlesim.title'); launcher.style.display = 'none';
    getButtonRow().append(launcher); launcher.addEventListener('click', open); el('close').addEventListener('click', close);
    let backdrop = false;
    overlay.addEventListener('mousedown', event => {backdrop = event.target === overlay;});
    overlay.addEventListener('click', event => {if (backdrop && event.target === overlay) close();});
    overlay.addEventListener('keydown', event => {if (event.key === 'Escape') {event.stopPropagation(); close();}});
    registerShortcut({button: launcher, overlay, open, close});
    el('setup').addEventListener('change', event => {
      const token = store.snapshot(); if (!token || realLifeActive(token.state.fight)) return;
      if (event.target === el('encounter')) setup.applyPreset();
      else if (event.target === el('weapon')) setup.applyPreset(true);
      action(state => {state.fight = null; Object.assign(state, setup.snapshot()); return state;}, token);
    });
    el('start').addEventListener('click', () => action(state => {
      if (realLifeActive(state.fight)) return null;
      const {player, encounter, options} = setup.read(); Object.assign(state, setup.snapshot());
      state.fight = startRealLifeFight(player, encounter, options); return state;
    }));
    el('attack').addEventListener('click', () => action(state => {
      if (!realLifeActive(state.fight)) return null;
      state.fight = realLifeStep(state.fight, {target: el('target').value || undefined, defensive: el('defensive').checked,
        attackBoth: el('both').checked, splitSkill: el('split').checked && !el('split').disabled}, manualRoll(state)); return state;
    }));
    el('luck-roll').addEventListener('click', () => action(state => {
      state.fight = testRealLifeLuck(state.fight, manualRoll(state)); return state;
    }));
    el('skip').addEventListener('click', () => action(state => {state.fight = skipRealLifeOpening(state.fight); return state;}));
    for (const [key, status] of [['escape', 'escaped'], ['surrender', 'surrendered']]) el(key).addEventListener('click', () => action(state => {
      state.fight = endRealLifeFight(state.fight, status); return state;
    }));
    el('cancel').addEventListener('click', () => {
      const token = store.snapshot(); if (!token || !realLifeActive(token.state.fight)) return;
      showConfirm('Cancel this encounter? Wounds already lost are retained.', () => action(state => {
        state.fight = endRealLifeFight(state.fight); return state;
      }, token));
    });
    render();
  }
  return {init, render, setVisible(visible) {const launcher = el('btn'); if (launcher) launcher.style.display = visible ? '' : 'none'; if (!visible) close();}};
}
