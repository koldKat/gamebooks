// Present player-selected encounters and editable printed combat values without story automation.
import { currentPlaythrough, currentBookId, saveState } from '../../../core/state.js';
import { getPlayBtnRow } from '../../../play/charsheet.js';
import { escapeHtml, shortcutLabel, registerPanelShortcut, ALL_PANEL_OVERLAY_IDS } from '../../../core/util.js';
import { showAlert } from '../../../ui-helpers/confirm.js';
import { t } from '../../../i18n.js';
import { createOpponentEditor } from '../../opponents.js';
import { createFight, attack, resolveHit, setRoundProfile } from './combat.js';

export function createTigerPanel({ definition, getEncounters }) {
  const id = `sim${definition.id}`, el = suffix => document.getElementById(`${id}-${suffix}`);
  const supports = key => definition.combatOptions?.[key] === true;
  const playerFields = [['endurance', 'Endurance', 20], ['innerForce', 'Inner Force', 5],
    ['punch', 'Punch modifier', 0], ['kick', 'Kick modifier', 0], ['throw', 'Throw modifier', 0], ['shurikens', 'Shuriken', 5]];
  if (supports('fate')) playerFields.push(['fate', 'Fate modifier', 0]);
  const fields = [{ key: 'endurance', label: 'Endurance', min: 0.5, step: 'any' },
    { key: 'defense', label: 'Defense against selected attack', min: 0 },
    { key: 'damageDice', label: 'Counterattack damage dice', min: 0, max: 20 },
    { key: 'damageBonus', label: 'Counterattack damage bonus', min: 0 }];
  let editor, selected = null;
  const data = () => {
    const pt = currentPlaythrough();
    if (!pt || Number(currentBookId) !== definition.id) return null;
    return pt[definition.stateKey] ||= { player: Object.fromEntries(playerFields.map(([key, , value]) => [key, value])), fight: null, history: [] };
  };
  const active = () => Boolean(data()?.fight && !data().fight.outcome);
  const number = key => {
    const input = el(key), value = Number(input.value);
    if (input.value === '' || !Number.isInteger(value) || value < Number(input.min || 0) || value > Number(input.max || 1000000)) throw new Error('Enter a valid ' + input.dataset.label + '.');
    return value;
  };
  const input = (key, label, value = 0, min = 0) => `<label class="inv-edit-row"><span>${escapeHtml(label)}</span><input class="inv-edit-input" id="${id}-${key}" type="number" min="${min}" max="1000000" value="${value}" data-label="${escapeHtml(label)}" autocomplete="off"></label>`;
  const button = (key, label) => `<button class="bsim-action-btn" id="${id}-${key}" type="button">${label}</button>`;
  function close() { el('overlay')?.classList.remove('active'); }
  function perform(action) {
    try { action(); saveState(); render(); }
    catch (error) { showAlert(error.message); }
  }
  function record() {
    const d = data(), fight = d?.fight;
    if (!fight) return;
    if (fight.log.length > 200) fight.log.splice(0, fight.log.length - 200);
    d.player = { ...fight.player };
    if (fight.outcome && !fight.recorded) {
      fight.recorded = true;
      if (fight.outcome === 'reader') return;
      d.history.push({ enemy: fight.opponents.map(enemy => enemy.name || enemy.displayName || 'Opponent').join(', '),
        outcome: fight.outcome, playerEndurance: fight.player.endurance, ts: Date.now() });
    }
  }
  function renderAttackOptions(rules) {
    el('inner').disabled = rules.innerForceForbidden === true || rules.innerForceRequired === true;
    if (el('inner').disabled) el('inner').checked = rules.innerForceRequired === true;
    for (const key of ['attack-defense', 'player-defense']) {
      el(key).disabled = rules.mirrorPlayer === true;
      if (rules.mirrorPlayer) el(key).value = rules.mirrorDefense ?? 7;
    }
    if (el('nerve-strike')) {
      el('nerve-strike').disabled = !rules.nerveStrikeDamage;
      if (el('nerve-strike').disabled) el('nerve-strike').checked = false;
    }
    if (el('mirror-controls')) el('mirror-controls').hidden = !rules.mirrorPlayer;
  }
  function render() {
    const d = data();
    if (!el('overlay')) return;
    if (!d) { close(); return; }
    const fight = d.fight, locked = active();
    const profiles = fight ? getEncounters().filter(profile => profile.opponents.length === fight.opponents.length
      && profile.opponents.every((enemy, index) => enemy.name === fight.opponents[index].name)) : [];
    el('round-profile').innerHTML = '<option value="">Current values</option>' + profiles.map(profile => `<option value="${profile.section}">${escapeHtml(profile.name)}</option>`).join('');
    el('round-profile').value = d.roundSection || '';
    el('round-profile').disabled = !locked || Boolean(fight?.pendingHits.length);
    editor.lock(locked);
    for (const [key] of playerFields) {
      el(key).disabled = locked;
      if (document.activeElement !== el(key)) el(key).value = (fight?.player || d.player)[key];
    }
    for (const key of ['saintLocket', 'rubyCirclet']) if (el(key)) {
      el(key).disabled = locked;
      el(key).checked = Boolean((fight?.player || d.player)[key]);
    }
    const rules = (locked ? fight?.rules : selected?.rules) || {};
    renderAttackOptions(rules);
    el('nonlethal').disabled = locked;
    el('profile-note').textContent = selected?.note || d.profileNote || '';
    el('start').disabled = locked;
    el('custom').disabled = locked;
    const target = el('target'), previous = target.value;
    target.innerHTML = (fight?.opponents || []).map((enemy, index) => `<option value="${index}"${enemy.counterOnly || enemy.endurance <= 0 ? ' disabled' : ''}>${escapeHtml(enemy.name || enemy.displayName || 'Opponent')} (${enemy.counterOnly ? 'counterattack only' : enemy.endurance})</option>`).join('');
    if ([...target.options].some(option => option.value === previous && !option.disabled)) target.value = previous;
    el('attack').disabled = !locked || Boolean(fight?.pendingHits.length);
    const pending = fight?.pendingHits[0];
    el('block').disabled = !pending || pending.blockable === false || fight.blocksThisRound >= fight.blockLimit;
    el('take').disabled = !pending;
    el('finish').disabled = !locked;
    el('status').textContent = fight ? (fight.outcome || (pending ? `Incoming damage: ${pending.damage}` : fight.followup ? 'Throw succeeded. Choose a punch or kick follow-up.' : 'Ready for the selected attack.')) : 'Enter current values, then start an encounter.';
    if (fight?.rules.successfulHitsToWin) el('status').textContent += ` Successful blows: ${fight.successfulHits || 0}/${fight.rules.successfulHitsToWin}.`;
    if (fight?.rules.mirrorPlayer) el('status').textContent += ` Double Inner Force: ${fight.opponents[0].innerForce}.`;
    if (fight?.followup?.defense != null) el('attack-defense').value = fight.followup.defense;
    if (fight?.followup?.techniques?.length === 1) el('technique').value = fight.followup.techniques[0];
    el('log').textContent = (fight?.log || []).slice(-100).map(line => line.type === 'attack'
      ? `${line.technique}: ${line.roll} + ${line.modifier} against ${line.defense}. ${line.hit ? `${line.damage} damage.` : 'Miss.'}`
      : line.type === 'adjustment' ? `Endurance adjustment: ${line.change}.`
        : line.type === 'fate' ? `Fate wound roll: ${line.roll}.`
          : line.type === 'mirror-block' ? `Double blocks with ${line.roll}: ${line.blocked ? 'blocked' : 'failed'}.`
        : line.type === 'counter' ? `Counterattack${line.technique ? ` (${line.technique})` : ''}: ${line.roll}${line.modifier ? ` + ${line.modifier}` : ''} against ${line.defense}.`
        : line.block ? `Block ${line.roll}: ${line.blocked ? 'blocked' : `${line.damage} damage`}.` : `${line.damage} damage taken.`).join('\n');
    el('history').textContent = d.history.slice(-30).reverse().map(row => `${row.enemy}: ${row.outcome}`).join('\n');
  }
  function init() {
    if (el('overlay')) return;
    const overlay = document.createElement('div');
    overlay.id = `${id}-overlay`; overlay.className = 'inv-overlay';
    overlay.innerHTML = `<div class="inv-modal bsim-modal"><div class="inv-modal-hdr"><span class="inv-modal-title">Simulator: ${escapeHtml(definition.title)}</span><button class="inv-close-btn" id="${id}-close" aria-label="${escapeHtml(t('btn.close'))}">×</button></div><div class="bsim-body"><div class="bsim-col bsim-col-left"><p>Use the current passage for attack and counterattack defenses, bonuses, and exceptions. Story choices stay in the reader.</p><div id="${id}-setup">${playerFields.map(([key, label, value]) => input(key, label, value, ['punch', 'kick', 'throw', 'fate'].includes(key) ? -100 : 0)).join('')}<label class="inv-edit-check-label"><input type="checkbox" id="${id}-nonlethal" class="inv-edit-check"> Nonlethal trial</label><div id="${id}-opponents"></div>${button('custom', 'Custom opponents')}${button('start', 'Start encounter')}</div><div class="bsim-actions"><label class="inv-edit-row">Target<select class="inv-edit-input" id="${id}-target"></select></label><label class="inv-edit-row">Technique<select class="inv-edit-input" id="${id}-technique">${['punch', 'kick', 'throw', 'shuriken'].map(key => `<option>${key}</option>`).join('')}</select></label>${input('attack-defense', 'Target defense')}${input('attack-modifier', 'Extra attack modifier', 0, -100)}${input('player-defense', 'Your defense against counterattacks')}<label class="inv-edit-check-label"><input class="inv-edit-check" type="checkbox" id="${id}-inner"> Use Inner Force for this attack</label><label class="inv-edit-check-label"><input class="inv-edit-check" type="checkbox" id="${id}-unblockable"> Counterattacks cannot be blocked</label>${button('attack', 'Attack')}${button('block', 'Block')}${button('take', 'Take damage')}${button('finish', 'Finish encounter manually')}</div></div><div class="bsim-col bsim-col-right"><p id="${id}-status"></p><pre class="bsim-log" id="${id}-log"></pre><h3>History</h3><pre class="bsim-log" id="${id}-history"></pre></div></div></div>`;
    document.body.append(overlay);
    overlay.querySelector('.inv-modal-title').textContent = t(definition.i18nPrefix + '.ui.title');
    overlay.querySelector('.bsim-col-left > p').textContent = t(definition.i18nPrefix + '.ui.note');
    const roundLabel = document.createElement('label'); roundLabel.className = 'inv-edit-row';
    roundLabel.innerHTML = `<span>Current printed attack</span><select class="inv-edit-input" id="${id}-round-profile"></select>`;
    el('target').parentElement.before(roundLabel);
    overlay.querySelector('.bsim-col-right h3').classList.add('bsim-side-title');
    for (const label of overlay.querySelectorAll('.inv-edit-check-label')) label.classList.add('bsim-checkbox');
    const note = document.createElement('p');
    note.id = `${id}-profile-note`; note.className = 'bsim-note'; el('setup').prepend(note);
    el('finish').parentElement.insertAdjacentHTML('beforeend',
      input('endurance-change', 'Manual Endurance adjustment', 0, -1000000) + button('adjust', 'Apply Endurance adjustment'));
    const check = (key, label) => `<label class="inv-edit-check-label bsim-checkbox"><input type="checkbox" class="inv-edit-check" id="${id}-${key}"> ${label}</label>`;
    if (supports('holyProtection')) el('opponents').insertAdjacentHTML('beforebegin',
      check('saintLocket', 'Saint’s locket') + check('rubyCirclet', 'Ruby circlet'));
    if (supports('nerveStrike')) el('inner').parentElement.insertAdjacentHTML('afterend', check('nerve-strike', 'Use Nerve-Striking (11 damage, no Inner Force)'));
    if (supports('mirror')) el('attack').insertAdjacentHTML('beforebegin',
      `<div id="${id}-mirror-controls" hidden><label class="inv-edit-row">Double’s throw follow-up<select class="inv-edit-input" id="${id}-mirror-followup"><option value="punch">Punch</option><option value="kick">Kick</option></select></label>${check('mirror-inner', 'Double uses Inner Force on its blow')}</div>`);
    for (const key of ['log', 'history']) {
      el(key).style.whiteSpace = 'pre-wrap';
      el(key).style.overflowWrap = 'anywhere';
      el(key).style.fontFamily = 'inherit';
    }
    if (!ALL_PANEL_OVERLAY_IDS.includes(overlay.id)) ALL_PANEL_OVERLAY_IDS.push(overlay.id);
    const presets = getEncounters().map(entry => ({ ...entry.opponents[0], ...entry, displayName: entry.name }));
    editor = createOpponentEditor({ document, id, t, fields, presets,
      isStatUnavailable: (key, row) => row.counterOnly && ['endurance', 'defense'].includes(key)
        || row.manualCounter === true && ['damageDice', 'damageBonus'].includes(key),
      onSelect(preset) {
      selected = preset; editor.set(preset.opponents); editor.fixCount(true);
      el('technique').value = preset.technique;
      el('attack-defense').value = preset.opponents[0].defense ?? '';
      el('player-defense').value = preset.playerDefense ?? '';
      el('nonlethal').checked = preset.nonlethal === true;
      el('unblockable').checked = preset.rules?.unblockable === true;
      el('profile-note').textContent = preset.note || '';
      renderAttackOptions(preset.rules || {});
    } });
    el('opponents').append(editor.element);
    el('close').addEventListener('click', close);
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && overlay.classList.contains('active')) close();
    });
    overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
    el('custom').addEventListener('click', () => { selected = null; editor.fixCount(false); editor.set([{}]); });
    el('start').addEventListener('click', () => perform(() => {
      const d = data(); if (!d || active()) return;
      d.player = Object.fromEntries(playerFields.map(([key]) => [key, number(key)]));
      for (const key of ['saintLocket', 'rubyCirclet']) if (el(key)) d.player[key] = el(key).checked;
      d.profileNote = selected?.note || '';
      d.roundSection = selected?.section || '';
      d.fight = createFight(d.player, editor.read(), { nonlethal: el('nonlethal').checked, blockLimit: 1, rules: selected?.rules });
      el('attack-defense').value = d.fight.opponents[0].defense;
    }));
    el('target').addEventListener('change', () => {
      const enemy = data()?.fight?.opponents[Number(el('target').value)];
      if (enemy) el('attack-defense').value = enemy.defense;
    });
    el('round-profile').addEventListener('change', () => perform(() => {
      const profile = getEncounters().find(entry => entry.section === el('round-profile').value);
      const d = data();
      if (!profile || !d?.fight) return;
      if (!setRoundProfile(d.fight, profile)) throw new Error('Resolve pending damage before changing the attack.');
      selected = profile; d.roundSection = profile.section; d.profileNote = profile.note || '';
      el('technique').value = profile.technique;
      el('attack-defense').value = d.fight.opponents[Number(el('target').value) || 0].defense ?? '';
      el('player-defense').value = profile.playerDefense ?? '';
      el('unblockable').checked = profile.rules?.unblockable === true;
    }));
    el('technique').addEventListener('change', () => {
      if (selected && !data()?.fight?.rules.mirrorPlayer && !selected.rules?.mirrorPlayer
          && el('technique').value !== selected.technique) el('attack-defense').value = '';
    });
    el('nerve-strike')?.addEventListener('change', () => { if (el('nerve-strike').checked) el('inner').checked = false; });
    el('inner').addEventListener('change', () => { if (el('inner').checked && el('nerve-strike')) el('nerve-strike').checked = false; });
    el('attack').addEventListener('click', () => perform(() => {
      const fight = data()?.fight; if (!fight) return;
      const counterDefense = fight.opponents.some(enemy => !enemy.manualCounter) ? number('player-defense') : 0;
      const accepted = attack(fight, { target: Number(el('target').value), technique: el('technique').value,
        defense: number('attack-defense'), modifier: number('attack-modifier'), innerForce: el('inner').checked,
        nerveStrike: el('nerve-strike')?.checked === true,
        mirrorInnerForce: el('mirror-inner')?.checked === true,
        mirrorFollowupTechnique: el('mirror-followup')?.value,
        counters: fight.opponents.map((enemy, target) => ({ target, defense: counterDefense,
          damageDice: enemy.damageDice, damageBonus: enemy.damageBonus, blockable: !el('unblockable').checked,
          manual: enemy.manualCounter })).filter(profile => !profile.manual) });
      if (!accepted) throw new Error('This attack is unavailable. Check the technique, Inner Force and throw follow-up.');
      el('inner').checked = false; record();
    }));
    for (const [key, block] of [['block', true], ['take', false]]) el(key).addEventListener('click', () => perform(() => { if (data()?.fight) resolveHit(data().fight, block); record(); }));
    el('adjust').addEventListener('click', () => perform(() => {
      const fight = data()?.fight;
      if (!fight || fight.outcome) return;
      if (fight.pendingHits.length) throw new Error('Resolve pending damage first.');
      const change = number('endurance-change');
      fight.player.endurance = Math.max(0, fight.player.endurance + change);
      fight.log.push({ type: 'adjustment', change });
      if (fight.player.endurance === 0) fight.outcome = fight.nonlethal ? 'defeat' : 'loss';
      el('endurance-change').value = 0; record();
    }));
    el('finish').addEventListener('click', () => perform(() => { const d = data(); if (d) { d.player = { ...d.fight.player }; d.fight = null; } }));
    const launcher = document.createElement('button');
    launcher.id = `${id}-btn`; launcher.className = 'btn btn-secondary'; launcher.innerHTML = shortcutLabel(t('battlesim.title'));
    const open = () => { if (!data()) return showAlert(t('battlesim.no_active_playthrough')); render(); overlay.classList.add('active'); };
    launcher.addEventListener('click', open); getPlayBtnRow()?.append(launcher);
    registerPanelShortcut('KeyS', { getButton: () => el('btn'), getOverlay: () => overlay,
      otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(value => value !== overlay.id), open, close,
      extraGuard: () => Number(currentBookId) === definition.id });
  }
  return { init, render, setVisible(value) { if (el('btn')) el('btn').style.display = value ? '' : 'none'; if (!value) close(); } };
}
