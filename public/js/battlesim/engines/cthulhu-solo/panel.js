import { decorateOutcome, decorateHistory } from '../../outcome.js';
// Present encounter setup and combat actions while preserving the reader's story decisions.
import { currentBookId, currentPlaythrough, saveState } from '../../run-context.js';
import { getPlayBtnRow } from '../../../play/charsheet.js';
import { t } from '../../../i18n.js';
import { escapeHtml, registerPanelShortcut, shortcutLabel, ALL_PANEL_OVERLAY_IDS } from '../../../core/util.js';
import { showAlert, showConfirm } from '../../../ui-helpers/confirm.js';
import { createOpponentEditor } from '../../opponents.js';
import { createFight, attackTurn, canAdvanceRound, nextRound, ghostDuel, prepareSkillRoll, resolveSkillRoll } from './combat.js';
import { changePhase, hypnosis, recoverWeapon, retreat, surrender, useBrawl } from './effects.js';
import { isDodgingThisRound, pendingCombatTurns, requireTurn } from './targets.js';
import { prepareEnemyGroup } from './encounter-rules.js';
export function createCthulhuPanel({ definition, getEncounters, createState, translationPrefix = definition.i18nPrefix,
  getInvestigators = () => [], printedPercentile = false, brawlWeapons = false, expedition = false,
  getEncounterParty = () => null, classicRules = false }) {
  const ID = definition.stateKey, tk = (key, params) => t(`${translationPrefix}.${key}`, params);
  const el = key => document.getElementById(`${ID}-${key}`);
  const data = createState(() => ({ currentBookId, currentPlaythrough }));
  let partyEditor, enemyEditor, renderedRun, carriedFight;
  const classicSkills = ['knifeSkill', 'hatchetSkill', 'clubSkill', 'kickSkill', 'headButtSkill', 'grapple'];
  const defaults = { displayName: '', hp: 10, maxHp: 10, dex: 50, dodge: 25, brawl: 25, pow: 50,
    str: 50, con: 50, skill: 25, armor: 0, damageDice: 1, damageSides: 6, damageBonus: 0,
    dbDice: 0, dbSides: 4, dbBonus: 0, luck: 0, moveSpeed: 0, app: 0, siz: 0,
    driver: 'no', braced: 'no', temporaryInsanity: 'no', weaponKind: brawlWeapons || expedition ? 'unarmed' : 'melee', material: 'ordinary',
    ...(expedition ? { rifle: 25, ammo: 0, sanity: 50, psychology: 10 } : {}),
    ...(classicRules ? { dex: 12, str: 12, pow: 12, con: 12, brawl: 50, skill: 50, rifle: 10,
      knifeSkill: 25, hatchetSkill: 20, clubSkill: 25, kickSkill: 25, headButtSkill: 10, grapple: 25 } : {}) };
  const option = (value, label) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`;
  const select = (key, choices) => `<label class="inv-edit-row">${tk(key)}<select id="${ID}-${key}" class="inv-edit-input">${choices.map(v => option(v, tk(v))).join('')}</select></label>`;
  const button = key => `<button id="${ID}-${key}" class="inv-add-btn" type="button">${tk(key)}</button>`;
  const formula = (n, sides, bonus) => `${n ? `${n}D${sides}` : '0'}${bonus ? `${bonus > 0 ? '+' : ''}${bonus}` : ''}`;
  function compactEditor(editor) {
    for (const row of editor.element.querySelectorAll('.bsim-opponent-row')) {
      if (row.querySelector('[data-advanced-combat]')) continue;
      const details = document.createElement('details'); details.dataset.advancedCombat = '';
      const summary = document.createElement('summary'); summary.textContent = tk('advanced'); details.append(summary);
      for (const key of ['dex', 'dodge', 'brawl', 'pow', 'str', 'con', 'dbDice', 'dbSides', 'dbBonus', 'weaponKind', 'material', 'luck', 'moveSpeed', 'app', 'siz', 'driver', 'braced', 'temporaryInsanity', 'rifle', 'ammo', 'sanity', 'psychology', ...classicSkills]) {
        if (brawlWeapons && key === 'weaponKind') continue;
        const label = row.querySelector(`[data-stat="${key}"]`)?.closest('label');
        if (label) details.append(label);
      }
      row.insertBefore(details, row.querySelector('button'));
    }
  }
  function combatant(row, enemy = false) {
    const actor = { ...row, name: row.displayName.trim(), damage: row.presetDamage ?? formula(row.damageDice, row.damageSides, row.damageBonus),
      db: row.presetDb ?? formula(row.dbDice, row.dbSides, row.dbBonus) };
    if (enemy && row.healthMode && row.healthMode !== 'damage-goal') {
      actor.hp = row.presetHealth; actor.maxHp = row.presetHealth;
    }
    if (!enemy && ['melee', 'axe'].includes(row.weaponKind)) actor.damage += '+DB';
    if (!enemy && brawlWeapons) {
      actor.skill = actor.brawl;
      actor.damage = row.weaponKind === 'knife' ? '1D4+DB' : '1D3+DB';
      actor.unarmedBrawl = row.weaponKind !== 'knife';
    }
    if (!enemy && expedition && row.weaponChoices) {
      actor.weapons = row.weaponChoices;
      actor.counterDamage = actor.weapons[row.weaponKind === 'rifle' ? 'unarmed' : row.weaponKind]?.damage;
    }
    if (!enemy && row.weaponKind === 'castillo') {
      actor.damage = '1D8+1+DB'; actor.material = 'magic'; actor.ignoresArmor = true; actor.attackBonus = 1;
    }
    for (const key of ['driver', 'braced', 'temporaryInsanity']) actor[key] = row[key] === 'yes' || row[key] === true;
    if (enemy && !row.moves) actor.moves = [{ name: actor.name, skill: row.skill, damage: actor.damage }];
    return actor;
  }
  const presetForm = actor => ({ ...defaults, ...actor, displayName: actor.name, preset: true,
    presetDamage: actor.damage ?? '0', presetDb: actor.db ?? '0', presetHealth: actor.maxHp });
  const partyForms = (d, f) => f.party.map((actor, index) => ({ ...defaults, ...d.setup?.party?.[index], ...actor, displayName: actor.name,
    str: index === (f.mainIndex ?? 0) && f.spec.halveLeadStrength ? f.originalLeadStrength ?? actor.str : actor.str,
    driver: actor.driver ? 'yes' : 'no', braced: actor.braced ? 'yes' : 'no', temporaryInsanity: actor.temporaryInsanity ? 'yes' : 'no' }));
  const partyPreset = profile => ({ ...defaults, ...profile, displayName: profile.name });
  function logText(f, r) {
    const parts = [`${tk('round_number', { round: r.round })}: ${f[r.side][r.index]?.name ?? ''}`];
    if (r.attack) parts.push(`${r.attack.roll ?? tk('automatic')} (${tk('level_' + r.attack.level)})`);
    if (r.defense?.roll != null && printedPercentile) parts.push(`${tk('defense')}: ${r.defense.roll} (${tk('level_' + r.defense.level)})`);
    if (r.luckSpent) parts.push(tk('luck_spent', { amount: r.luckSpent }));
    if (r.wound) parts.push(`${tk('damage')}: ${r.wound.amount}`);
    if (r.counter) parts.push(`${tk('counter')}: ${r.counter.amount}`);
    if (r.powerLost) parts.push(`${tk('power_lost')}: ${r.powerLost}`);
    if (r.rescueWound) parts.push(`${tk('rescue_damage')}: ${r.rescueWound.amount}`);
    for (const hit of [r.wound, r.counter]) {
      if (hit?.effects.includes('major-wound')) parts.push(tk('major_wound'));
      if (hit?.constitution) parts.push(tk('constitution_check', { roll: hit.constitution.roll, level: tk('level_' + hit.constitution.level) }));
    }
    if (r.retreatCounter) parts.push(tk('retreat_counter'));
    if (expedition) {
      const check = r.openingCheck ?? r.reinforcementCheck;
      if (check) parts.push(tk(r.openingSkill ?? r.reinforcementSkill), check.roll, tk('level_' + check.level));
      if (r.friendlyFire) parts.push(tk('friendly_fire', { damage: r.friendlyFire.amount }));
      if (r.maneuver) parts.push(tk(r.maneuver.succeeded ? 'maneuver_passed' : 'maneuver_failed', { damage: r.maneuver.damage }));
      if (r.startingDamage != null) parts.push(tk('starting_damage', { damage: r.startingDamage }));
      if (r.volley) parts.push(tk('volley_result', r.volley));
      for (const injury of r.wound?.distributed ?? []) parts.push(`${f.party[injury.index].name}: ${injury.damage}`);
    }
    for (const key of ['skipped', 'fled', 'recovered', 'unresolvedHit']) if (r[key]) parts.push(tk('log_' + key));
    for (const key of ['hypnosis', 'retreat']) if (r[key]) {
      parts.push(tk('log_' + key));
      r[key].forEach((check, index) => { if (check) parts.push(`${f.party[index].name}: ${tk('level_' + check.level)}`); });
    }
    if (r.wound?.effects.includes('luck-saved')) parts.push(tk('luck_saved'));
    return parts.join(' · ');
  }
  function close() { el('overlay')?.classList.remove('active'); }
  function open() {
    if (!data()) return;
    render(); el('overlay').classList.add('active');
  }
  function persist() {
    const d = data(); if (!d) return;
    const f = d.fight;
    if (f && f.status !== 'fighting' && carriedFight !== f) {
      carriedFight = f; d.setup ??= {}; d.setup.party = partyForms(d, f); partyEditor.set(d.setup.party);
    }
    if (f && ['win', 'loss'].includes(f.status) && !f.recorded) {
      f.recorded = true;
      d.history.push({ enemy: f.spec.name, outcome: f.status, ts: Math.max(Date.now(), (d.history.at(-1)?.ts ?? 0) + 1) });
    }
    d.history = d.history.slice(-100); saveState(); render();
  }
  function actions() {
    const f = data()?.fight; if (!f) return;
    const turn = brawlWeapons && f.spec.requireFullRound
      ? pendingCombatTurns(f).sort((a, b) => b.actor.dex - a.actor.dex)[0] : null;
    const choices = expedition && f.spec.requireFullRound ? pendingCombatTurns(f).filter(row => {
      try { requireTurn(f, row.side, row.index); return true; } catch { return false; }
    }) : [];
    const chosen = choices.find(row => row.side === el('side').value && row.index === Number(el('actor').value)) ?? choices[0] ?? turn;
    if (chosen) el('side').value = chosen.side;
    const side = el('side').value, actors = f[side], other = f[side === 'party' ? 'enemies' : 'party'];
    const fill = (key, rows) => {
      const previous = el(key).value;
      el(key).innerHTML = rows.map((row, index) => option(index, `${row.name} (${row.hp} HP)`)).join('');
      if ([...el(key).options].some(o => o.value === previous)) el(key).value = previous;
    };
    fill('actor', actors); fill('target', other);
    if (chosen) el('actor').value = String(chosen.index);
    const actor = actors[Number(el('actor').value)];
    const moves = side === 'party' ? [{ name: tk('weapon') }] : actor?.moves ?? [];
    const scriptedMove = actor?.roundMoves?.[f.round - 1]?.[actor.used];
    el('attack').innerHTML = (scriptedMove == null ? moves : [moves[scriptedMove]])
      .map((move, i) => option(scriptedMove ?? i, move.name ?? tk('attack'))).join('');
    if (brawlWeapons && f.spec.requireFullRound) {
      el('side').disabled = true;
      el('actor').disabled = true;
      el('target').disabled = true;
      el('attack').disabled = true;
      el('defense').disabled ||= !turn || side === 'party' || f.spec.allowPartyAttack === false;
      el('resolve').disabled ||= !turn;
    }
    if (expedition) {
      const input = el('combat-weapon');
      const available = side === 'party' && f.spec.expeditionWeapons ? Object.entries(actor?.weapons ?? {}).filter(([kind]) => {
        if (f.openingFire || f.spec.riflesOnly) return kind === 'rifle';
        return kind !== 'rifle' || actor.ammo > 0 && !f.spec.meleeOnly && !f.spec.openingFireRule;
      }) : [];
      const previous = input.value;
      input.innerHTML = available.map(([kind, weapon]) => option(kind, weapon.name)).join('');
      if (available.some(([kind]) => kind === previous)) input.value = previous;
      else if (available.some(([kind]) => kind === actor?.weaponKind)) input.value = actor.weaponKind;
      input.closest('label').hidden = !available.length;
      input.disabled = f.status !== 'fighting' || Boolean(data()?.pendingAttack);
      el('protect-party').closest('label').hidden = side !== 'enemies' || !f.spec.shareDamage;
      el('protect-party').disabled = f.status !== 'fighting' || Boolean(data()?.pendingAttack);
      if (f.spec.requireFullRound && !choices.length) el('resolve').disabled = true;
    }
  }
  function render() {
    const d = data(); if (!d || !el('overlay')) { close(); return; }
    if (renderedRun !== currentPlaythrough()) {
      renderedRun = currentPlaythrough();
      const initialParty = expedition && getInvestigators().length ? [partyPreset(getInvestigators()[0])] : [{ ...defaults, displayName: tk('investigator') }];
      const finished = d.fight && d.fight.status !== 'fighting';
      partyEditor.set(d.setup?.party ?? (finished ? partyForms(d, d.fight) : initialParty));
      if (finished) carriedFight = d.fight;
      enemyEditor.set(d.setup?.enemies ?? [{ ...defaults, displayName: tk('opponent') }]);
      el('encounter').value = d.setup?.encounter ?? '0';
      el('mode').value = d.fight?.mode ?? d.setup?.mode ?? 'percentile';
      el('pulpy').checked = d.setup?.pulpy ?? false;
      el('ambush').checked = d.fight?.ambush ?? d.setup?.ambush ?? false;
      if (expedition) el('remaining').value = d.setup?.remaining ?? 0;
    }
    const f = d.fight, active = f?.status === 'fighting', pending = active && d.pendingAttack;
    const preset = getEncounters().find(e => String(e.id) === el('encounter').value);
    compactEditor(partyEditor); compactEditor(enemyEditor);
    partyEditor.lock(active); enemyEditor.lock(active); enemyEditor.fixCount(Boolean(preset && !preset.variableOpponents));
    el('encounter').disabled = active; el('start').disabled = active;
    for (const key of ['resolve', 'round', 'stop', 'side', 'actor', 'target', 'attack', 'defense', 'recover', 'unarmed', 'hypnosis', 'retreat']) el(key).disabled = !active;
    el('round').disabled = !canAdvanceRound(f);
    if (classicRules) el('defense').disabled ||= Boolean(f?.spec.classicManeuver && el('side').value === 'party');
    for (const key of ['mode', 'pulpy', 'ambush']) el(key).disabled = active;
    if (printedPercentile) {
      el('investigator-preset').disabled = active;
      el('use-luck').disabled = !active || Boolean(pending);
      el('luck-choice').hidden = !pending;
      if (pending) {
        el('luck-amount').max = pending.entry.luckAvailable;
        el('luck-prompt').textContent = tk('luck_prompt', { roll: pending.entry.playerRoll, skill: pending.entry.skill });
        for (const key of ['round', 'side', 'actor', 'target', 'attack', 'defense', 'recover', 'unarmed', 'hypnosis', 'retreat']) el(key).disabled = true;
      }
      el('ambush').closest('label').hidden = !['ready', 'ambush'].includes(preset?.openingOrder);
    }
    if (brawlWeapons) {
      el('recover').hidden = true;
      el('unarmed').hidden = true;
      el('retreat').disabled = !active || Boolean(pending) || f.round < (f.spec.retreat?.fromRound ?? 1)
        || f.lastRetreatRound === f.round;
    }
    if (expedition) {
      el('remaining').closest('label').hidden = !preset?.rosterRoll?.allowRemaining;
      el('remaining').disabled = active;
      el('surrender').hidden = !f?.spec.allowSurrender;
      el('surrender').disabled = !active || Boolean(pending);
      el('round').textContent = tk(f?.openingFire ? 'finish_opening' : 'round');
      el('retreat').disabled = !active || Boolean(pending) || !f.enemies.every(a => a.maxHp - a.hp >= (f.spec.retreat?.opponentDamage ?? 0));
      el('recover').hidden = true;
      el('unarmed').hidden = true;
    }
    el('hypnosis').hidden = !f?.spec.hypnosis || f.hypnosisResolved;
    el('retreat').hidden = !f?.spec.retreat;
    const phases = getEncounters().filter(e => f?.spec.group && e.group === f.spec.group && (e.enemies.length === f.enemies.length || e.enemyCount && e.enemyCount === f.spec.enemyCount));
    el('phase').innerHTML = phases.map(e => option(e.id, e.name)).join('');
    if (f) el('phase').value = f.spec.id;
    el('apply_phase').disabled = !f || !['fighting', 'round-complete'].includes(f.status) || phases.length < 2;
    el('phase').disabled = el('apply_phase').disabled;
    if (f?.spec.kind === 'ghost-power') { el('side').value = 'party'; el('side').disabled = true; }
    el('status').textContent = f ? `${tk(f.status)} · ${tk('round_number', { round: f.round })}` : tk('setup');
    el('summary').innerHTML = f ? [...f.party, ...f.enemies].map(a => `<div>${escapeHtml(a.name)}: ${a.healthMode === 'power' ? `${a.pow} POW` : ['damage-goal', 'hit-count'].includes(a.healthMode) ? tk(a.healthMode, { amount: a.hp }) : a.healthMode ? tk(a.hp > 0 && !a.unconscious ? 'active' : 'defeated') : `${a.hp}/${a.maxHp} HP`}${a.immobilized ? ` · ${tk('immobilized')}` : ''}${a.hypnotized ? ` · ${tk('hypnotized')}` : ''}${a.stunned ? ` · ${tk('stunned')}` : ''}${a.majorWound ? ` · ${tk('major_wound')}` : ''}${active && a.stanceRoll ? ` · ${tk(isDodgingThisRound(a) ? 'stance_dodge' : 'stance_attack', { roll: a.stanceRoll })}` : ''}</div>`).join('') : '';
    el('log').innerHTML = (f?.log ?? []).slice().reverse().map(r => `<div>${escapeHtml(logText(f, r))}</div>`).join('');
    el('history').innerHTML = d.history.slice().reverse().map(h => `<div class="bsim-history-row">${escapeHtml(h.enemy)}: ${tk(h.outcome)}</div>`).join('');
    decorateOutcome(el('status'), f?.status);
    decorateHistory(el('history'), d.history.slice().reverse());
    el('rules').textContent = (active && f?.spec.notes) || preset?.notes || tk('custom_note');
    actions();
  }
  function setVisible(visible) {
    if (el('btn')) el('btn').style.display = visible ? '' : 'none';
    if (!visible) close();
  }
  function init() {
    if (el('overlay')) return;
    const overlay = document.createElement('div'); overlay.id = `${ID}-overlay`; overlay.className = 'inv-overlay';
    overlay.innerHTML = `<div class="inv-modal bsim-modal bsim-compact-form"><div class="inv-modal-hdr"><span class="inv-modal-title">${escapeHtml(definition.title)}</span><button id="${ID}-close" class="inv-close-btn" aria-label="${t('btn.close')}">&times;</button></div><div class="bsim-body"><div class="bsim-col bsim-col-left"><label class="inv-edit-row">${tk('encounter')}<select id="${ID}-encounter" class="inv-edit-input">${option('0', tk('custom'))}${getEncounters().map(e => option(e.id, e.name)).join('')}</select></label><div id="${ID}-party"></div><div id="${ID}-enemies"></div>${button('start')}<p id="${ID}-rules"></p>${select('side', ['party', 'enemies'])}${select('actor', [])}${select('target', [])}${select('attack', [])}${select('defense', ['dodge', 'fight', 'none'])}${button('resolve')}${button('round')}${button('stop')}<p>${tk('note')}</p></div><div class="bsim-col bsim-col-right"><div id="${ID}-status" class="bsim-status"></div><div id="${ID}-summary" class="bsim-report"></div><details class="bsim-history"><summary>${tk('history')}</summary><div id="${ID}-history"></div></details><div id="${ID}-log" class="bsim-log"></div></div></div></div>`;
    document.body.append(overlay);
    el('start').insertAdjacentHTML('beforebegin', `${select('mode', ['percentile', 'coin'])}<label class="inv-edit-row"><input id="${ID}-pulpy" type="checkbox">${tk('pulpy')}</label><label class="inv-edit-row"><input id="${ID}-ambush" type="checkbox">${tk(printedPercentile ? 'ready' : 'ambush')}</label>`);
    el('round').insertAdjacentHTML('afterend', `${button('recover')}${button('unarmed')}${button('hypnosis')}${button('retreat')}`);
    el('rules').insertAdjacentHTML('afterend', `${select('phase', [])}${button('apply_phase')}`);
    if (printedPercentile) {
      for (const key of ['mode', 'pulpy', 'phase']) el(key).closest('label').hidden = true;
      el('apply_phase').hidden = true;
      const presets = getInvestigators().flatMap(({ weapons = [], ...profile }) => [
        { label: profile.name, profile },
        ...weapons.map(({ label, ...weapon }) => ({ label: `${profile.name} · ${label}`, profile: { ...profile, ...weapon } })),
      ]);
      el('party').insertAdjacentHTML('beforebegin', `<label class="inv-edit-row">${tk('investigator_preset')}<select id="${ID}-investigator-preset" class="inv-edit-input">${option('0', tk('custom'))}${presets.map((p, index) => option(index + 1, p.label)).join('')}</select></label>`);
      el('resolve').insertAdjacentHTML('beforebegin', `<label class="inv-edit-row"><input id="${ID}-use-luck" type="checkbox">${tk('use_luck')}</label><div id="${ID}-luck-choice" hidden><p id="${ID}-luck-prompt"></p><label class="inv-edit-row">${tk('luck')}<input id="${ID}-luck-amount" type="number" class="inv-edit-input" min="0" value="0" step="1" autocomplete="off"></label></div>`);
      if (classicRules) el('use-luck').closest('label').hidden = true;
      el('investigator-preset').addEventListener('change', () => {
        const d = data(), preset = presets[Number(el('investigator-preset').value) - 1];
        if (!preset || !d || d.fight?.status === 'fighting') return;
        const party = expedition ? partyEditor.snapshot().filter(a => a.role !== preset.profile.role) : [];
        partyEditor.set([...party, partyPreset(preset.profile)]);
        d.setup ??= {};
        d.setup.party = partyEditor.snapshot();
        persist();
      });
      if (brawlWeapons) el('investigator-preset').closest('label').hidden = true;
    }
    if (expedition) {
      el('encounter').closest('label').insertAdjacentHTML('afterend', `<label class="inv-edit-row">${tk('remaining')}<input id="${ID}-remaining" class="inv-edit-input" type="number" min="0" max="12" value="0" step="1" autocomplete="off"></label>`);
      el('resolve').insertAdjacentHTML('beforebegin', `${select('combat-weapon', [])}<label class="inv-edit-row"><input id="${ID}-protect-party" type="checkbox">${tk('protect_party')}</label>`);
      el('stop').insertAdjacentHTML('beforebegin', button('surrender'));
      for (const key of ['combat-weapon', 'protect-party']) el(key).closest('label').hidden = true;
      el('surrender').hidden = true;
    }
    const fields = ['hp', 'maxHp', 'dex', 'dodge', 'brawl', 'pow', 'str', 'con', 'skill', 'armor', 'damageDice', 'damageSides', 'damageBonus', 'dbDice', 'dbSides', 'dbBonus'].map(key => ({ key, label: tk(key), min: key.endsWith('Bonus') ? -100 : key.endsWith('Sides') ? 2 : 0, max: key.endsWith('Sides') ? 100 : key.endsWith('Dice') ? 24 : 1000 }));
    const weapons = expedition ? ['unarmed', 'axe', 'club', 'knife', 'rifle'] : brawlWeapons
      ? ['unarmed', 'knife'] : ['melee', 'firearm', 'pistol', 'rifle', 'smg', 'shotgun', 'axe', 'castillo'];
    if (classicRules) weapons.push('kick', 'headButt');
    fields.push({ key: 'weaponKind', label: tk('weapon'), options: weapons.map(value => ({ value, label: tk(value) })) },
      { key: 'material', label: tk('material'), options: ['ordinary', 'silver', 'magic', 'fire', 'explosive'].map(value => ({ value, label: tk(value) })) });
    fields.push({ key: 'luck', label: tk('luck'), min: 0, max: 1000 });
    if (expedition) for (const key of ['rifle', 'ammo', 'sanity', 'psychology']) fields.push({ key, label: tk(key), min: 0, max: key === 'ammo' ? 1000 : 100 });
    if (classicRules) for (const key of classicSkills) fields.push({ key, label: tk(key), min: 0, max: 100 });
    for (const key of ['moveSpeed', 'app', 'siz']) fields.push({ key, label: tk(key), min: 0, max: 1000 });
    for (const key of ['driver', 'braced', 'temporaryInsanity']) fields.push({ key, label: tk(key), options: ['no', 'yes'].map(value => ({ value, label: tk(value) })) });
    const partyT = key => key === 'battlesim.editor.name' ? tk('name') : key === 'battlesim.editor.add' ? tk('add_investigator') : t(key);
    partyEditor = createOpponentEditor({ document, id: ID + '-party', t: partyT, fields });
    partyEditor.element.querySelector('summary').textContent = tk('party'); el('party').append(partyEditor.element);
    enemyEditor = createOpponentEditor({ document, id: ID + '-enemies', t, fields,
      presets: getEncounters().flatMap(e => e.enemies).map(presetForm),
      isStatUnavailable: (key, row) => row.unavailableStats?.includes(key) || row.preset && (
        ['skill', 'damageDice', 'damageSides', 'damageBonus', 'dbDice', 'dbSides', 'dbBonus'].includes(key)
        || row.healthMode && row.healthMode !== 'damage-goal' && ['hp', 'maxHp'].includes(key)) });
    el('enemies').append(enemyEditor.element);
    for (const editor of [partyEditor, enemyEditor]) editor.element.addEventListener('click', () => compactEditor(editor));
    const btn = document.createElement('button'); btn.id = `${ID}-btn`; btn.innerHTML = shortcutLabel(t('battlesim.title')); btn.style.display = 'none';
    getPlayBtnRow().append(btn); btn.addEventListener('click', open); el('close').addEventListener('click', close);
    let backdrop = false;
    overlay.addEventListener('mousedown', event => { backdrop = event.target === overlay; });
    overlay.addEventListener('click', event => { if (event.target === overlay && backdrop) close(); });
    registerPanelShortcut('KeyS', { getButton: () => btn, getOverlay: () => overlay, otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== `${ID}-overlay`), open, close });
    el('encounter').addEventListener('change', () => {
      const d = data(); if (!d || d.fight?.status === 'fighting') return;
      carriedFight = d.fight;
      const preset = getEncounters().find(e => String(e.id) === el('encounter').value);
      enemyEditor.set(preset ? preset.enemies.map(presetForm) : [{ ...defaults, displayName: tk('opponent') }]);
      const rebuilt = getEncounterParty(preset, partyEditor.snapshot());
      if (rebuilt) partyEditor.set(rebuilt.map(partyPreset));
      if (expedition) el('remaining').value = 0;
      d.setup = { encounter: el('encounter').value, party: partyEditor.snapshot(), enemies: enemyEditor.snapshot() }; persist();
    });
    el('start').addEventListener('click', () => {
      const d = data(); if (!d || d.fight?.status === 'fighting') return;
      try {
        const preset = getEncounters().find(e => String(e.id) === el('encounter').value);
        const spec = preset ?? { name: tk('custom'), custom: true, spendSkillLuck: printedPercentile && !classicRules,
          ...(classicRules ? { classicRules, playerFumble: 'none' } : {}) };
        const party = partyEditor.read().map(r => combatant(r));
        let enemies = enemyEditor.read().map(r => combatant(r, true));
        const remaining = expedition ? Number(el('remaining').value) : 0;
        enemies = prepareEnemyGroup(spec, enemies, remaining);
        if (!enemies.length) { showAlert(tk('no_assigned_enemies')); return; }
        if (spec.enemyCount) enemies = Array.from({ length: party.length * (spec.enemyCount === 'double-party' ? 2 : 1) }, (_, index) => ({ ...structuredClone(enemies[0]), name: `${enemies[0].name} ${index + 1}` }));
        d.fight = createFight(spec, party, enemies, { mode: el('mode').value, pulpy: el('pulpy').checked, ambush: el('ambush').checked });
        delete d.pendingAttack;
        partyEditor.element.open = false; enemyEditor.element.open = false;
        d.setup = { encounter: el('encounter').value, party: partyEditor.snapshot(), enemies: enemyEditor.snapshot(), mode: el('mode').value, pulpy: el('pulpy').checked, ambush: el('ambush').checked,
          ...(expedition ? { remaining } : {}) }; persist();
      } catch { showAlert(tk('invalid')); }
    });
    for (const key of ['side', 'actor']) el(key).addEventListener('change', actions);
    el('resolve').addEventListener('click', () => {
      const d = data(), f = d?.fight; if (!f) return;
      try {
        if (f.spec.kind === 'ghost-power') ghostDuel(f, Number(el('actor').value));
        else if (d.pendingAttack) {
          resolveSkillRoll(f, d.pendingAttack, Number(el('luck-amount').value));
          delete d.pendingAttack;
        } else {
          const options = { side: el('side').value, index: Number(el('actor').value), target: Number(el('target').value), move: Number(el('attack').value), defense: el('defense').value };
          if (expedition) {
            options.weapon = el('combat-weapon').value || undefined;
            options.protectParty = el('protect-party').checked;
          }
          if (printedPercentile && el('use-luck').checked) {
            const pending = prepareSkillRoll(f, options);
            if (pending) {
              d.pendingAttack = pending;
              el('luck-amount').value = '0';
            }
          } else attackTurn(f, options);
        }
        persist();
      } catch { showAlert(tk('invalid_action')); }
    });
    el('round').addEventListener('click', () => { if (nextRound(data()?.fight)) persist(); });
    for (const [key, apply] of [['recover', recoverWeapon], ['unarmed', useBrawl], ['hypnosis', hypnosis]]) el(key).addEventListener('click', () => {
      try { apply(data()?.fight, Number(el('actor').value)); persist(); } catch { showAlert(tk('invalid_action')); }
    });
    el('retreat').addEventListener('click', () => {
      try { retreat(data()?.fight); persist(); } catch { showAlert(tk('invalid_action')); }
    });
    if (expedition) el('surrender').addEventListener('click', () => { if (surrender(data()?.fight)) persist(); });
    el('apply_phase').addEventListener('click', () => {
      try { changePhase(data()?.fight, getEncounters().find(e => String(e.id) === el('phase').value)); persist(); }
      catch { showAlert(tk('invalid_action')); }
    });
    el('stop').addEventListener('click', () => {
      const d = data(), run = currentPlaythrough(), prior = d?.fight; if (!prior || prior.status !== 'fighting') return;
      showConfirm(tk('stop_confirm'), () => {
        if (data() !== d || currentPlaythrough() !== run || d.fight !== prior) return;
        prior.status = 'unresolved'; delete d.pendingAttack; persist();
      });
    });
  }
  return { init, render, setVisible };
}
