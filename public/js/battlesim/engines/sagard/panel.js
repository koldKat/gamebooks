// Coordinate Sagard encounter controls, live playthrough state and the shared simulator layout.
import {startSagardFight, sagardTurn, resolveSagardTurn, fleeSagardFight, healSagardFight, cancelSagardFight,
  withdrawSagardFight, throwSagardProjectile, canThrowSagardProjectile} from './core.js';
import {sagardProjectileRule} from './effects.js';
import {createSagardState} from './state.js';
import {sagardSetupMarkup, createSagardSetup, escapeSagard as esc} from './setup-panel.js';
import {renderSagardReport} from './report.js';
import {startSagardEncounter, sagardEncounterTurn, resolveSagardEncounter, cancelSagardEncounter, fleeSagardEncounter} from './encounter.js';
import {healSagardEncounter, sagardMeleeFight, throwSagardEncounterProjectile} from './actions.js';
import {sagardExtraActionsMarkup, createSagardTurnExtras, sagardEncounterActors, sagardSpecialTurnLabel} from './turn-panel.js';

export function createSagardPanel({document, definition, t, getRoster, getRun, getBookId, saveState,
  getButtonRow, showAlert, showConfirm, registerShortcut = () => {}}) {
  const id = definition.stateKey, el = key => document.getElementById(id + '-' + key);
  const store = createSagardState(() => ({run: getRun(), bookId: getBookId(), definition, saveState}));
  let setup, extras, shownRun, wasActive = false, turnKey;
  const button = (key, label) => `<button class="bsim-action-btn" type="button" id="${id}-${key}">${esc(label)}</button>`;
  const active = fight => fight?.status === 'fighting';
  const healers = () => ['fang', 'moss', ...(getRoster()[0].rules.spiritLuckEnabled ? ['spiritLuck'] : [])];
  function close() {el('overlay')?.classList.remove('active');}
  function open() {
    try {
      if (!store.snapshot()) {showAlert(t('battlesim.no_active_playthrough')); return;}
      render(); el('overlay').classList.add('active');
    } catch (error) {showAlert(error.message);}
  }
  function action(change, token = store.snapshot()) {
    if (!token) return;
    try {if (store.update(change, token)) render();}
    catch (error) {showAlert(error instanceof RangeError ? error.message : 'Unable to resolve this combat action.');}
  }
  const die = state => state.setup.manualDice ? Number(el('die').value) : 1 + Math.floor(Math.random() * 4);
  function render() {
    if (!el('overlay')) return;
    const token = store.snapshot();
    if (!token) {shownRun = undefined; wasActive = false; turnKey = undefined; close(); return;}
    const state = token.state, fight = state.fight, running = active(fight), changedRun = shownRun !== token.run;
    if (changedRun) {shownRun = token.run; setup.restore(state); turnKey = undefined;}
    if (running && (changedRun || !wasActive)) el('setup').open = false;
    wasActive = running; setup.syncFight(fight); setup.refresh(running);
    if (fight?.kind === 'naval') el('shipHp').value = fight.ship.hp;
    else if (fight) {
      el('hp').value = fight.hero.hp; el('shield').value = fight.hero.shield;
      for (const item of healers()) el(item).checked = Boolean(fight.healing[item]);
      for (const item of fight.rules.projectiles ?? []) el('ammo-' + item.id).value = fight.ammo[item.id];
      if (fight.stunStone) el('stunStone').checked = fight.stunStone.held;
      if (fight.rules.magicDagger) el('magicDaggerPower').value = fight.magicDaggerPower;
      if (fight.rules.salt) el('saltBags').value = fight.saltBags;
      if (fight.monkeys) el('monkeyWhistle').checked = fight.monkeys.held;
      if (fight.kind === 'beast') el('crewRemaining').value = fight.crewRemaining;
      if (fight.kind === 'forces') {
        el('alliesRemaining').value = fight.alliesRemaining; el('enemiesRemaining').value = fight.enemiesRemaining;
      }
    }
    const turn = running ? sagardEncounterTurn(fight) : null, selected = el('target').value;
    const nextKey = turn ? [fight.round, fight.phase, fight.cursor, turn.attackerId].join(':') : '';
    const needsChoice = (turn?.targets?.length ?? 0) > 1;
    el('target').innerHTML = (needsChoice ? '<option value="">Choose target</option>' : '')
      + (turn?.targets ?? []).map(target => `<option value="${target}">${esc(sagardEncounterActors(fight).find(row => row.id === target).name)}</option>`).join('');
    if (turnKey === nextKey && turn?.targets?.includes(selected)) el('target').value = selected;
    else if (needsChoice) el('target').value = '';
    turnKey = nextKey;
    el('target-row').hidden = !turn?.targets.length; el('target').disabled = !running || !needsChoice;
    el('target-note').textContent = turn?.attackerId?.startsWith('enemy') && needsChoice
      ? 'Choose which surviving companion receives this attack. The book does not assign one.' : '';
    el('turn').textContent = !turn ? '' : sagardSpecialTurnLabel(turn) ?? (turn.kind === 'initiative' ? 'Roll for initiative.'
      : turn.kind === 'breakOff' ? 'The first exchange is over. Break off or continue fighting.'
        : turn.kind === 'prelude' ? 'Use your chosen missiles, then begin melee.'
        : turn.kind === 'recovery' ? 'Use Spirit luck now or accept defeat.'
        : turn.kind === 'projectile' ? 'Throw another missile of this type or finish the turn.'
        : turn.kind === 'retrieve' ? 'Roll to recover the map. The guardian then attacks.'
        : turn.kind === 'escape' ? 'The map is recovered. Attempt to escape.'
        : turn.kind === 'escapeVolley' ? `${turn.attackerName}: resolve the escaping dagger volley.`
        : turn.kind === 'escapeAttack' ? `${turn.attackerName}: resolve its final escape attack.`
        : `${turn.attackerName}: ${turn.kind === 'melt' ? 'melting before its attack' : 'attack'}`);
    el('dice').hidden = !(running && state.setup.manualDice && turn.requiresDie !== false && !['breakOff', 'recovery'].includes(turn.kind));
    el('attack').disabled = !running || ['breakOff', 'chooseAction', 'chooseDuel'].includes(turn.kind)
      || (turn.kind === 'escape' && fight?.kind !== 'naval');
    el('attack').textContent = {initiative: 'Roll initiative', prelude: 'Begin melee', recovery: 'Accept defeat',
      projectile: 'Finish missile turn', retrieve: 'Try recovering map', escape: 'Map recovered',
      escapeVolley: 'Resolve dagger roll', escapeAttack: 'Resolve final attack', chooseShip: 'Choose ship',
      allocate: 'Apply damage', lamp: 'Try taking lamp (4)', digestion: 'Apply damage'}[turn?.kind] ?? 'Next attack';
    el('flee').disabled = !turn?.canFlee;
    const escapeVariants = fight?.encounter.escapeVariants ?? [], previousVariant = el('escape-variant').value;
    el('escape-variant-row').hidden = !escapeVariants.length;
    el('escape-variant').innerHTML = '<option value="">Choose escape route</option>'
      + escapeVariants.map((row, index) => `<option value="${index}">${esc(row.label)}</option>`).join('');
    if (previousVariant !== '' && escapeVariants[Number(previousVariant)]) el('escape-variant').value = previousVariant;
    el('escape-variant').disabled = !turn?.canFlee;
    el('flee').textContent = {four: 'Try escaping (4)', one: 'Try fleeing (1)', automatic: 'Leave valuables and escape',
      jump: 'Jump into the pit'}[fight?.encounter.escape] ?? 'Try fleeing (even)';
    el('break-actions').hidden = turn?.kind !== 'breakOff';
    for (const item of healers()) el('heal-' + item).disabled = !running || !fight.healing?.[item]
      || fight.hero.hp === fight.hero.maxHp || (turn.kind === 'recovery' && item !== 'spiritLuck');
    for (const item of getRoster()[0].rules.projectiles ?? []) el('throw-' + item.id).disabled = !canThrowSagardProjectile(sagardMeleeFight(fight), item.id);
    el('surrender').hidden = !fight?.encounter.withdrawTarget;
    el('surrender').disabled = !running || fight.phase === 'recovery';
    el('start').disabled = running || setup.selected()?.mode === 'manual'; el('cancel').disabled = !running;
    extras.render(fight, turn);
    renderSagardReport(document, el('results'), state);
  }
  function init() {
    if (el('overlay')) return;
    const overlay = document.createElement('div'); overlay.id = id + '-overlay'; overlay.className = 'inv-overlay';
    const rules = getRoster()[0].rules;
    overlay.innerHTML = `<div class="inv-modal bsim-modal bsim-compact-form"><div class="inv-modal-hdr"><span class="inv-modal-title">${esc(definition.title)} · ${esc(t('battlesim.title'))}</span><button class="inv-close-btn" id="${id}-close" aria-label="${esc(t('btn.close'))}">&times;</button></div>
      <div class="bsim-body"><div class="bsim-col bsim-col-left">${sagardSetupMarkup(id, getRoster())}
      <div class="bsim-btn-row">${button('start', 'Start fight')}${button('cancel', 'Cancel fight')}</div>
      <p id="${id}-turn"></p><label class="inv-edit-row" id="${id}-target-row"><span>Target</span><select class="inv-edit-input" id="${id}-target" aria-label="Target"></select></label><p id="${id}-target-note"></p>
      <label class="inv-edit-row" id="${id}-dice"><span>Die (1–4)</span><input class="inv-edit-input" id="${id}-die" type="number" min="1" max="4" step="1" value="1"></label>
      <div class="bsim-btn-row">${button('attack', 'Next attack')}${button('flee', 'Try fleeing (even)')}</div>
      <label class="inv-edit-row" id="${id}-escape-variant-row" hidden><span>Escape route</span><select class="inv-edit-input" id="${id}-escape-variant"></select></label>
      ${sagardExtraActionsMarkup(id)}
      <div class="bsim-btn-row" id="${id}-break-actions" hidden>${button('withdraw', 'Break off')}${button('continue', 'Continue fighting')}</div>
      <div class="bsim-btn-row">${healers().map(item => button('heal-' + item, 'Use ' + rules.healingLabels[item])).join('')}</div>
      <div class="bsim-btn-row">${(rules.projectiles ?? []).map(item => button('throw-' + item.id, 'Use ' + item.label)).join('')}${button('surrender', 'Offer story valuables')}</div>
      </div><div class="bsim-col bsim-col-right" id="${id}-results"></div></div></div>`;
    document.body.append(overlay); setup = createSagardSetup({document, id, t, entries: getRoster()});
    extras = createSagardTurnExtras({el, action, die});
    el('target').addEventListener('change', () => {
      const fight = store.snapshot()?.state.fight;
      extras.render(fight, active(fight) ? sagardEncounterTurn(fight) : null);
    });
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
      const {hero, encounter, rules, options} = setup.read(); Object.assign(state, setup.snapshot());
      state.fight = startSagardEncounter(hero, encounter, rules, options); return state;
    }));
    el('attack').addEventListener('click', () => action(state => {
      if (!active(state.fight)) return null;
      const turn = sagardEncounterTurn(state.fight), kind = turn.kind;
      if (['prelude', 'projectile', 'recovery'].includes(kind)) {
        state.fight = resolveSagardEncounter(state.fight, null, {decision: kind === 'recovery' ? 'decline' : 'continue'}); return state;
      }
      if (kind === 'melt') state.fight = resolveSagardEncounter(state.fight, null);
      if (active(state.fight)) state.fight = resolveSagardEncounter(state.fight, turn.requiresDie === false ? null : die(state),
        {target: el('target').value || undefined, amount: Number(el('amount').value)});
      return state;
    }));
    el('flee').addEventListener('click', () => action(state => {
      if (!active(state.fight)) return null;
      state.fight = fleeSagardEncounter(state.fight, state.fight.encounter.escape === 'automatic' ? null : die(state),
        {variant: el('escape-variant').value === '' ? undefined : Number(el('escape-variant').value)}); return state;
    }));
    for (const [key, decision] of [['withdraw', 'leave'], ['continue', 'continue']]) el(key).addEventListener('click', () => action(state => {
      if (!active(state.fight)) return null;
      state.fight = resolveSagardTurn(state.fight, null, {decision}); return state;
    }));
    for (const item of healers()) el('heal-' + item).addEventListener('click', () => action(state => {
      if (!active(state.fight)) return null;
      state.fight = healSagardEncounter(state.fight, item); return state;
    }));
    for (const item of rules.projectiles ?? []) el('throw-' + item.id).addEventListener('click', () => action(state => {
      if (!active(state.fight)) return null;
      const rule = sagardProjectileRule(state.fight, item.id);
      state.fight = throwSagardEncounterProjectile(state.fight, item.id, rule.hitDice ? die(state) : null, {target: el('target').value || undefined});
      return state;
    }));
    el('surrender').addEventListener('click', () => action(state => {
      if (!active(state.fight)) return null;
      state.fight = withdrawSagardFight(state.fight); return state;
    }));
    el('cancel').addEventListener('click', () => {
      const token = store.snapshot(); if (!token || !active(token.state.fight)) return;
      showConfirm('Cancel this encounter?', () => action(state => {state.fight = cancelSagardEncounter(state.fight); return state;}, token));
    });
    render();
  }
  return {init, render, setVisible(visible) {const launcher = el('btn'); if (launcher) launcher.style.display = visible ? '' : 'none'; if (!visible) close();}};
}
