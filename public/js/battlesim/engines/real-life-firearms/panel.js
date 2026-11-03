// Coordinate lethal firearm controls, playthrough state and the shared simulator layout.
import {startFirearmFight, firearmTurn, resolveFirearmTurn, cancelFirearmFight} from './core.js';
import {createFirearmState} from './state.js';
import {firearmSetupMarkup, createFirearmSetup, escapeFirearm as esc} from './setup-panel.js';
import {renderFirearmReport} from './report.js';

export function createFirearmPanel({document, definition, t, getRoster, getRun, getBookId, saveState,
  getButtonRow, showAlert, showConfirm, registerShortcut = () => {}}) {
  const id = definition.stateKey, el = key => document.getElementById(id + '-' + key);
  const store = createFirearmState(() => ({run: getRun(), bookId: getBookId(), definition, saveState}));
  let setup, shownRun, turnKey, wasActive = false;
  const button = (key, label) => `<button class="bsim-action-btn" type="button" id="${id}-${key}">${esc(label)}</button>`;
  const active = fight => fight?.status === 'fighting';
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
  function roll(state, prefix = '') {
    return [1, 2].map(n => state.setup.manualDice ? Number(el(prefix + 'die' + n).value) : 1 + Math.floor(Math.random() * 6));
  }
  function render() {
    if (!el('overlay')) return;
    const token = store.snapshot();
    if (!token) {shownRun = undefined; wasActive = false; turnKey = undefined; close(); return;}
    const state = token.state, fight = state.fight, running = active(fight), changedRun = shownRun !== token.run;
    if (changedRun) {shownRun = token.run; setup.restore(state); turnKey = undefined;}
    if (running && (changedRun || !wasActive)) el('setup').open = false;
    wasActive = running; setup.refresh(running);
    if (fight) el(fight.encounter.heroSkill === 'Combat' ? 'combat' : 'firearm').value = fight.hero.skill;
    const turn = running ? firearmTurn(fight) : null, selected = el('target').value;
    const nextKey = turn ? [fight.round, fight.log.length, turn.attackerId].join(':') : '';
    const needsChoice = turn?.requiresTarget && (fight.phase === 'enemies' || turn.kind === 'sprayHit');
    el('target').innerHTML = (needsChoice ? '<option value="">Choose target</option>' : '') + (turn?.targets ?? []).map(target => {
      const row = [fight.hero, ...fight.opponents, ...fight.allies].find(actor => actor.id === target);
      return `<option value="${target}">${esc(row.name)}</option>`;
    }).join('');
    if (turnKey === nextKey && turn?.targets?.includes(selected)) el('target').value = selected;
    else if (needsChoice) el('target').value = '';
    turnKey = nextKey;
    el('target').disabled = !running || turn?.kind === 'simultaneous' || (turn?.targets?.length ?? 0) < 2;
    el('target-row').hidden = ['simultaneous', 'spray'].includes(turn?.kind) || !turn;
    el('target-note').textContent = turn?.kind === 'sprayHit'
      ? 'The spray hit. The book does not specify how to allocate it; select its recipient to continue.'
      : needsChoice ? (fight.mode === 'team' ? 'Select the target of this enemy shot; the book does not assign one.'
        : 'The printed target list is exhausted. Choose whom this extra enemy fires at.') : '';
    el('turn').textContent = turn ? (turn.kind === 'simultaneous' ? 'Both sides fire together.'
      : turn.kind === 'sprayHit' ? 'Allocate the successful spray hit.'
        : `${[fight.hero, ...fight.opponents, ...fight.allies].find(row => row.id === turn.attackerId).name}: ${fight.encounter.heroSkill === 'Combat' ? 'attack' : 'fire'}`) : '';
    el('dice').hidden = !(running && state.setup.manualDice && turn.kind !== 'sprayHit');
    el('enemy-dice').hidden = !(running && state.setup.manualDice && turn.kind === 'simultaneous');
    el('attack').disabled = !running; el('attack').textContent = turn?.kind === 'simultaneous' ? 'Fire both shots'
      : turn?.kind === 'sprayHit' ? 'Apply spray hit' : fight?.encounter.heroSkill === 'Combat' ? 'Next attack' : 'Next shot';
    el('start').disabled = running || setup.selected()?.mode === 'manual'; el('cancel').disabled = !running;
    renderFirearmReport(document, el('results'), state);
  }
  function init() {
    if (el('overlay')) return;
    const overlay = document.createElement('div'); overlay.id = id + '-overlay'; overlay.className = 'inv-overlay';
    const diceMarkup = (prefix, label) => `<div id="${id}-${prefix ? 'enemy-dice' : 'dice'}">${[1, 2].map(n => `<label class="inv-edit-row"><span>${label} ${n}</span><input class="inv-edit-input" id="${id}-${prefix}die${n}" type="number" min="1" max="6" step="1" value="1"></label>`).join('')}</div>`;
    overlay.innerHTML = `<div class="inv-modal bsim-modal bsim-compact-form"><div class="inv-modal-hdr"><span class="inv-modal-title">${esc(definition.title)} · ${esc(t('battlesim.title'))}</span><button class="inv-close-btn" id="${id}-close" aria-label="${esc(t('btn.close'))}">&times;</button></div>
      <div class="bsim-body"><div class="bsim-col bsim-col-left">${firearmSetupMarkup(id, getRoster(), definition)}
      <div class="bsim-btn-row">${button('start', 'Start fight')}${button('cancel', 'Cancel fight')}</div>
      <p id="${id}-turn"></p><label class="inv-edit-row" id="${id}-target-row"><span>Target</span><select class="inv-edit-input" id="${id}-target" aria-label="Target"></select></label><p id="${id}-target-note"></p>
      ${diceMarkup('', 'Die')}${diceMarkup('enemy-', 'Enemy die')}<div class="bsim-btn-row">${button('attack', 'Next shot')}</div>
      </div><div class="bsim-col bsim-col-right" id="${id}-results"></div></div></div>`;
    document.body.append(overlay); setup = createFirearmSetup({document, id, t, entries: getRoster(), definition});
    const launcher = document.createElement('button'); launcher.id = id + '-btn'; launcher.textContent = t('battlesim.title'); launcher.style.display = 'none';
    getButtonRow().append(launcher); launcher.addEventListener('click', open); el('close').addEventListener('click', close);
    let backdrop = false;
    overlay.addEventListener('mousedown', event => {backdrop = event.target === overlay;});
    overlay.addEventListener('click', event => {if (backdrop && event.target === overlay) close();});
    overlay.addEventListener('keydown', event => {if (event.key === 'Escape') {event.stopPropagation(); close();}});
    registerShortcut({button: launcher, overlay, open, close});
    el('setup').addEventListener('change', event => {
      const token = store.snapshot(); if (!token || active(token.state.fight)) return;
      if (event.target === el('encounter')) setup.applyPreset();
      action(state => {state.fight = null; Object.assign(state, setup.snapshot()); return state;}, token);
    });
    el('start').addEventListener('click', () => action(state => {
      if (active(state.fight)) return null;
      const {skill, encounter, options} = setup.read(); Object.assign(state, setup.snapshot());
      state.fight = startFirearmFight(skill, encounter, options); return state;
    }));
    el('attack').addEventListener('click', () => action(state => {
      if (!active(state.fight)) return null;
      const turn = firearmTurn(state.fight), rolls = turn.kind === 'sprayHit' ? null : turn.kind === 'simultaneous'
        ? {hero: roll(state), enemy: roll(state, 'enemy-')} : roll(state);
      state.fight = resolveFirearmTurn(state.fight, rolls, {target: el('target').value || undefined}); return state;
    }));
    el('cancel').addEventListener('click', () => {
      const token = store.snapshot(); if (!token || !active(token.state.fight)) return;
      showConfirm('Cancel this encounter?', () => action(state => {state.fight = cancelFirearmFight(state.fight); return state;}, token));
    });
    render();
  }
  return {init, render, setVisible(visible) {const launcher = el('btn'); if (launcher) launcher.style.display = visible ? '' : 'none'; if (!visible) close();}};
}
