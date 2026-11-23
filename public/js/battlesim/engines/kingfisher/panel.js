import { decorateOutcome } from '../../outcome.js';
// Present optional Kingfisher combat, compact opponent groups and run-scoped results.
import {createOpponentEditor} from '../../opponents.js';
import {createQuestState} from '../super-endless-quest/state.js';
import {startKingfisherFight, kingfisherAction, kingfisherIsUnarmed, kingfisherCanTakeWeapon, kingfisherCanThrowFire,
  kingfisherCanRetreat, kingfisherAllyInFight,
  kingfisherUsesSpecialVictory, kingfisherTurnGroup,
  kingfisherWeaponAvailable, validateKingfisherFight} from './core.js';

export function createKingfisherPanel({document, definition, t, getRoster, getRules, getRun, getBookId,
  saveState, getButtonRow, showAlert, showConfirm, registerShortcut = () => {}}) {
  const id = definition.stateKey, tr = (key, values) => t(definition.i18nPrefix + '.' + key, values);
  const store = createQuestState(() => ({run:getRun(), bookId:getBookId(), definition, saveState}), {validateFight:validateKingfisherFight});
  const fields = {}, options = {};
  const tools = () => getRules().combatTools ?? [];
  const weaponModes = () => getRules().playerWeapons ?? ['melee','bow','firearm',
    ...(tools().includes('magicUses') ? ['magic'] : []), ...(tools().includes('heavyBonus') ? ['heavy'] : [])];
  let overlay, launch, left, right, preset, editor, controls, start, cancel, weapon, token, mounted, controlsRun, controlsState;
  const presetValue = row => definition.sectionVariants ? row.key : row.section;
  const selectedPreset = () => getRoster().find(row => presetValue(row) === preset.value);
  const busy = state => state.fight?.status === 'fighting';
  const close = () => overlay?.classList.remove('active');
  function text(parent, value, tag = 'p') { const node = document.createElement(tag); node.textContent = value; parent.append(node); return node; }
  function button(parent, key, action, caption = tr(key)) {
    const node = document.createElement('button'); node.type = 'button'; node.className = 'bsim-action-btn'; node.id = id + '-' + key;
    node.textContent = caption; node.addEventListener('click', action); parent.append(node); return node;
  }
  function number(parent, key, min, max, value = '', step = 1) {
    const row = document.createElement('label'); row.className = 'inv-edit-row'; text(row, tr(key), 'span');
    const input = document.createElement('input'); input.className = 'inv-edit-input'; input.id = id + '-' + key;
    input.type = 'number'; input.min = min; input.max = max; input.step = step; input.autocomplete = 'off'; input.value = value;
    row.append(input); parent.append(row); return input;
  }
  function numeric(input) {
    const value = Number(input.value);
    if (!input.value.trim() || !Number.isFinite(value) || value < Number(input.min) || value > Number(input.max)
        || input.step !== 'any' && !Number.isSafeInteger(value)) throw new RangeError(tr('invalid'));
    return value;
  }
  function select(parent, key, entries) {
    const row = document.createElement('label'); row.className = 'inv-edit-row'; text(row, tr(key), 'span');
    const input = document.createElement('select'); input.className = 'inv-edit-input'; input.id = id + '-' + key;
    for (const [value, label] of entries) { const option = document.createElement('option'); option.value = value; option.textContent = label; input.append(option); }
    row.append(input); parent.append(row); return input;
  }
  function editable(profile) {
    return {...profile, displayName:profile.name, human:profile.human ? 1 : 0, ammo:profile.weapons?.[0]?.ammo ?? 0};
  }
  function lockCounts(locked = false) {
    const entry = selectedPreset();
    [...editor.element.querySelectorAll('[data-stat="count"]')].forEach((input, index) => {
      input.disabled = locked || Boolean(entry && !entry.profiles[index]?.countRequired);
      input.max = entry?.profiles[index]?.countMax ?? 10000;
    });
  }
  function choosePreset() {
    const entry = selectedPreset();
    editor.set(entry ? entry.profiles.map(editable) : [{displayName:'', hp:null, bonus:0, armour:0, count:1, ammo:0, type:'melee', human:0}]);
    editor.fixCount(Boolean(entry));
    lockCounts();
    if (entry?.unarmedOnly || entry?.firstDuelUnarmed) weapon.value = 'melee';
    for (const [key, input] of Object.entries(options)) {
      input.checked = false;
      input.closest('label').hidden = !entry?.contextOptions?.includes(key);
    }
  }
  function change(action, expected = token) {
    try { if (store.update(state => { state.history = state.history.slice(-199); return action(state); }, expected)) render(); }
    catch { showAlert(tr('invalid')); }
  }
  function begin(state) {
    if (busy(state)) return;
    const template = selectedPreset();
    const profiles = editor.read().map((row,index) => {
      const bonus = Number(row.bonus), type = row.type;
      const weapons = row.weapons?.length ? row.weapons.map((item, index) => index ? item
        : {...item, bonus, type, ammo:Number(row.ammo)}) : [{name:row.displayName, bonus, type, ammo:Number(row.ammo)}];
      return {...row, name:row.displayName, hp:row.hp == null ? null : Number(row.hp), bonus, type, armour:Number(row.armour),
        count:template?.profiles[index]?.count ?? Number(row.count), human:Number(row.human) === 1, weapons};
    });
    const player = Object.fromEntries(Object.entries(fields).map(([key, input]) => [key, numeric(input)]));
    player.weapon = weapon.value;
    player.poisonImmune = Boolean(document.getElementById(id + '-poisonImmune')?.checked);
    player.projectileProtection = Boolean(document.getElementById(id + '-projectileProtection')?.checked);
    state.fight = startKingfisherFight(player, {...template, name:template?.name ?? profiles.map(row => row.name).join(' / '), profiles},
      Object.fromEntries(Object.entries(options).map(([key, input]) => [key, input.checked])), getRules());
    return state;
  }
  function actionControls(state, expected) {
    controls.replaceChildren(); if (!busy(state)) return;
    const fight = state.fight, group = kingfisherTurnGroup(fight);
    const act = action => change(next => { next.fight = kingfisherAction(next.fight, {expectedRevision:fight.revision, ...action}); return next; }, expected);
    if (fight.groups.filter(row => row.remaining).length > 1) {
      const target = select(controls, 'activeOpponent', fight.groups.flatMap((row, index) => row.remaining
        ? [[String(index), row.name + ' (' + row.remaining + ')']] : []));
      target.value = fight.active; target.disabled = fight.phase === 'spray' || Boolean(fight.enemyTurn?.length);
      target.addEventListener('change', () => act({kind:'target', index:Number(target.value)}));
    }
    if (fight.phase === 'player') {
      const current = select(controls, 'activeWeapon', (kingfisherIsUnarmed(fight) ? ['melee'] : weaponModes()).map(value => [value, tr('weapon.' + value)]));
      current.value = fight.player.weapon; current.addEventListener('change', () => act({kind:'weapon', weapon:current.value}));
    }
    text(controls, tr(fight.phase === 'player' && fight.opponent.playerWrestlingRoll ? 'phase.wrestling' : 'phase.' + fight.phase,
      {name:group.name}));
    let enemyWeapon;
    if (fight.phase === 'enemy' && group.weapons.length > 1) enemyWeapon = select(controls, 'enemyWeapon',
      group.weapons.flatMap((item, index) => kingfisherWeaponAvailable(item) ? [[String(index), item.name]] : []));
    if (enemyWeapon && group.weaponSequence) {
      enemyWeapon.value = group.weapons.findIndex(item => kingfisherWeaponAvailable(item)
        && (item.type !== 'firearm' || item.remainingAmmo > 0));
      enemyWeapon.disabled = true;
    }
    const ally = kingfisherAllyInFight(fight);
    const enemyTarget = ally && fight.phase === 'enemy'
      ? select(controls, 'enemyTarget', [['player',tr('targetPlayer')], ['ally',fight.ally.name]]) : null;
    const count = fight.phase === 'initiative' ? 1 : 2;
    const canEscape = fight.opponent.escape && !fight.combatStarted && !fight.escapeClosed;
    const die1 = number(controls, 'die1', 1, 6);
    const die2 = count === 2 || canEscape || fight.player.potionUses || ally && fight.player.allyMedicine ? number(controls, 'die2', 1, 6) : null;
    die1.placeholder = tr('automatic'); if (die2) die2.placeholder = tr('automatic');
    const rolled = total => {
      const any = die1.value.trim() || total === 2 && die2?.value.trim();
      return any ? [numeric(die1), ...(total === 2 ? [numeric(die2)] : [])] : undefined;
    };
    const allyAction = kind => {
      try { act({kind, dice:rolled(2)}); }
      catch { showAlert(tr('invalid')); }
    };
    const rollButton = button(controls, 'roll', () => {
      try {
        act({kind:fight.phase === 'initiative' ? 'initiative' : fight.phase === 'spray' ? 'spray' : 'attack', dice:rolled(count),
          weaponIndex:Number(enemyWeapon?.value ?? 0), target:enemyTarget?.value});
      } catch { showAlert(tr('invalid')); }
    });
    rollButton.disabled = fight.phase === 'player' && (fight.player.weapon === 'magic' && !fight.player.magicUses
      || fight.player.weapon === 'heavy' && fight.heavyReady === false);
    if (kingfisherCanTakeWeapon(fight)) button(controls, 'takeWeapon', () => act({kind:'takeWeapon'}));
    if (kingfisherCanThrowFire(fight)) button(controls, 'greekFire', () => act({kind:'greekFire'}));
    if (kingfisherCanRetreat(fight)) button(controls, 'retreat', () => act({kind:'retreat'}));
    if (ally && fight.phase === 'player' && !fight.allyActed) button(controls, 'allyAttack', () => allyAction('allyAttack'));
    if (ally && fight.player.allyHp < fight.ally.maxHp) {
      if (fight.player.allyMedicine) button(controls, 'allyMedicineUse', () => allyAction('allyMedicine'));
      if (fight.player.potionUses) button(controls, 'allyPotion', () => allyAction('allyPotion'));
    }
    if (fight.phase === 'player' && tools().includes('heavyBonus')) button(controls, 'wait', () => act({kind:'wait'}));
    if (fight.phase === 'player' && !fight.opponent.unarmedOnly) {
      if (fight.player.sleepUses) button(controls, 'sleep', () => act({kind:'sleep'}));
      if (fight.player.orbUses) button(controls, 'orb', () => {
        try { act({kind:'orb', ...(die1.value.trim() ? {dice:[numeric(die1)]} : {})}); }
        catch { showAlert(tr('invalid')); }
      });
    }
    if (fight.player.hp < fight.player.maxHp) {
      if (fight.player.potionUses) button(controls, 'potion', () => {
        try { const any = die1.value.trim() || die2?.value.trim(); act({kind:'potion',
          ...(any ? {dice:[numeric(die1), ...(die2 ? [numeric(die2)] : [])]} : {})}); }
        catch { showAlert(tr('invalid')); }
      });
      if (fight.player.fullHealUses) button(controls, 'fullHeal', () => act({kind:'fullHeal'}));
    }
    if (fight.player.spells && group.human && fight.phase === 'player') button(controls, 'spell', () => act({kind:'spell'}));
    if (fight.opponent.escape && !fight.combatStarted && !fight.escapeClosed) button(controls, 'escape', () => {
      try { const any = die1.value.trim() || die2?.value.trim(); act({kind:'escape',
        ...(any ? {dice:[numeric(die1), ...(die2 ? [numeric(die2)] : [])]} : {})}); }
      catch { showAlert(tr('invalid')); }
    });
    if (fight.player.prayers && fight.groups.every(row => !row.remaining || row.cat)) button(controls, 'prayer', () => act({kind:'prayer'}));
    if (fight.player.antidotes && (fight.poisoned || fight.groups.some(row => row.fatalConsecutiveHits && row.hitStreak))) button(controls, 'antidote', () => act({kind:'antidote'}));
    if (group.healingLeft && group.currentHp < group.healBelow) button(controls, 'healEnemy', () => act({kind:'healEnemy'}));
  }
  function report(state) {
    right.replaceChildren(); const fight = state.fight;
    text(right, tr(fight ? 'status.' + fight.status : 'ready'), 'h4').className = 'bsim-side-title';
    decorateOutcome(right.lastElementChild, fight?.status);
    if (fight) {
      text(right, fight.opponent.name); text(right, tr('totals', {...fight.player}));
      text(right, tr('remaining', {count:fight.groups.reduce((sum, row) => sum + row.remaining, 0)}));
      for (const group of fight.groups) {
        const label = !group.hpUnstated ? 'enemyTotals' : kingfisherUsesSpecialVictory(fight.opponent) ? 'enemySpecialVictory' : 'enemyOneHitTotals';
        text(right, tr(label, {name:group.name, hp:group.currentHp, count:group.remaining}));
      }
      if (fight.opponent.playerWrestlingRoll) text(right, tr('wrestlingFalls', {falls:fight.wrestlingFalls ?? 0, goal:fight.opponent.fallsToWin}));
      if (fight.allyPresent) text(right, tr('allyTotals', {name:fight.ally.name, hp:fight.player.allyHp,
        maxHp:fight.ally.maxHp, medicine:fight.player.allyMedicine}));
      if (tools().length) text(right, tr('toolsTotals', {...fight.player}));
      if (fight.poisoned) text(right, tr('poisoned', {amount:fight.poisoned}));
      if (fight.destination) text(right, tr('destination', {section:fight.destination}));
    }
    text(right, tr('manualStory'));
    text(right, tr('log'), 'h4').className = 'bsim-side-title';
    const log = document.createElement('div'); log.className = 'bsim-log'; right.append(log);
    for (const event of (fight?.events ?? []).slice().reverse()) {
      const tone = event.kind === 'attack' || event.kind === 'allyAttack' ? event.hit ? event.actor === 'player' ? 'success' : 'danger' : 'muted'
        : event.kind === 'healEnemy' ? 'danger'
          : ['spell', 'orb', 'sleep', 'potion', 'fullHeal', 'antidote', 'takeWeapon', 'greekFire', 'allyMedicine', 'allyPotion'].includes(event.kind) ? 'success' : 'accent';
      text(log, tr(event.target ? 'eventAllyTarget' : event.singleHitDefeat ? 'eventOneHit' : 'event', {
        action:tr('action.' + event.kind), name:event.opponent, target:event.target, dice:event.dice?.join(' + ') ?? '',
        amount:event.amount ?? 0, hp:event.hp, allyHp:event.allyHp})).className = 'bsim-log-' + tone;
    }
    text(right, tr('history'), 'h4').className = 'bsim-side-title';
    for (const item of state.history.slice(-30).reverse()) decorateOutcome(text(right, item.enemy + ' · ' + tr('status.' + item.outcome)), item.outcome);
  }
  function render() {
    if (!overlay) return; const current = store.snapshot();
    if (!current) { token = mounted = null; close(); return; }
    const state = current.state, locked = busy(state);
    if (mounted !== current.original || token?.run !== current.run) {
      for (const [key, input] of Object.entries(fields)) input.value = state.player?.[key] ?? (['hp','maxHp'].includes(key) ? '' : key === 'heavyBonus' ? getRules().heavyBonus ?? 0 : 0);
      weapon.value = state.player?.weapon ?? 'melee';
      const poison = document.getElementById(id + '-poisonImmune'), projectiles = document.getElementById(id + '-projectileProtection');
      if (poison) poison.checked = Boolean(state.player?.poisonImmune);
      if (projectiles) projectiles.checked = Boolean(state.player?.projectileProtection);
      const savedPreset = state.opponent && getRoster().find(row => presetValue(row) === presetValue(state.opponent));
      preset.value = savedPreset ? presetValue(savedPreset) : '';
      choosePreset(); if (state.opponent?.profiles) editor.set(state.opponent.profiles.map(editable));
      if (locked) for (const [key, input] of Object.entries(options)) input.checked = Boolean(state.fight.options[key]);
      mounted = current.original;
    }
    token = current;
    for (const input of left.querySelectorAll('input,select')) input.disabled = locked;
    editor.lock(locked); preset.disabled = start.disabled = weapon.disabled = locked; cancel.disabled = !locked;
    lockCounts(locked);
    if (controlsRun !== current.run || controlsState !== current.original) {
      actionControls(state, current); controlsRun = current.run; controlsState = current.original;
    }
    report(state);
  }
  function checkbox(parent, key) {
    const row = document.createElement('label'); row.className = 'inv-edit-row';
    const input = document.createElement('input'); input.type = 'checkbox'; input.id = id + '-' + key;
    row.append(input); text(row, tr(key), 'span'); parent.append(row); return input;
  }
  function init() {
    if (overlay) return;
    overlay = document.createElement('div'); overlay.id = id + '-overlay'; overlay.className = 'inv-overlay';
    overlay.innerHTML = '<div class="inv-modal bsim-modal bsim-compact-form"><div class="inv-modal-hdr"><span class="inv-modal-title"></span><button type="button" class="inv-close-btn">&times;</button></div><div class="bsim-body"><div class="bsim-col bsim-col-left"></div><div class="bsim-col bsim-col-right"></div></div></div>';
    overlay.querySelector('.inv-modal-title').textContent = tr('title');
    const closer = overlay.querySelector('.inv-close-btn'); closer.setAttribute('aria-label', t('btn.close')); closer.addEventListener('click', close);
    left = overlay.querySelector('.bsim-col-left'); right = overlay.querySelector('.bsim-col-right'); text(left, tr('rules'));
    fields.maxHp = number(left, 'maxHp', 0, 1000000, '', 'any'); fields.hp = number(left, 'hp', 0, 1000000, '', 'any');
    const legacy = getRules().legacyTools !== false;
    const ranged = weaponModes().some(mode => mode === 'bow' || mode === 'firearm');
    for (const key of ['experience','meleeBonus', ...(ranged ? ['rangedBonus'] : []), 'damageModifier','armour', ...(ranged ? ['ammo'] : []),
      ...(legacy ? ['spells','prayers','antidotes'] : []), ...tools()]) fields[key] = number(left, key,
      ['meleeBonus','rangedBonus','damageModifier','playerRollModifier','enemyRollModifier'].includes(key) ? -1000 : 0, 1000000,
      key === 'heavyBonus' ? getRules().heavyBonus ?? 0 : 0);
    if (getRules().ally) {
      text(left, tr('allySetup'));
      fields.allyHp = number(left, 'allyHp', 0, getRules().ally.maxHp, 0, 'any');
      fields.allyMedicine = number(left, 'allyMedicine', 0, getRules().ally.medicineMax, 0);
    }
    weapon = select(left, 'weapon', weaponModes().map(value => [value, tr('weapon.' + value)]));
    if (legacy) { checkbox(left, 'poisonImmune'); checkbox(left, 'projectileProtection'); }
    preset = select(left, 'preset', [['',tr('custom')], ...getRoster().map(row => [presetValue(row), row.name + ' (' + row.section + ')'])]);
    editor = createOpponentEditor({document, id, t, presets:getRoster().flatMap(row => row.profiles.map(editable)),
      isStatUnavailable:(key,row) => key === 'hp' && (kingfisherUsesSpecialVictory(selectedPreset())
        || row.singleHitDefeat || row.magicDuel && (row.hp == null || row.hp === '') && weapon.value === 'magic'), fields:[
      {key:'hp', label:tr('enemyHp'), min:0, step:'any'}, {key:'count', label:tr('count'), min:1, max:10000},
      {key:'bonus', label:tr('enemyBonus'), min:-1000, max:1000}, {key:'armour', label:tr('armour')},
      {key:'ammo', label:tr('ammo')}, {key:'human', label:tr('human'), min:0, max:1},
      {key:'type', label:tr('enemyWeapon'), options:['melee','bow','firearm','poison','thrown'].map(value => ({value, label:tr('weapon.' + value)}))},
    ]}); left.append(editor.element);
    weapon.addEventListener('change', () => { editor.set(editor.snapshot()); editor.fixCount(Boolean(preset.value)); lockCounts(); });
    for (const key of getRules().contextOptions) options[key] = checkbox(left, 'context.' + key);
    preset.addEventListener('change', choosePreset); choosePreset(); text(left, tr('unknownHp'));
    start = button(left, 'start', () => change(begin)); controls = document.createElement('div'); controls.id = id + '-controls'; left.append(controls);
    cancel = button(left, 'cancel', () => {
      const expected = token; if (!expected || !busy(expected.state)) return;
      showConfirm(tr('cancelConfirm'), () => change(state => { state.fight = kingfisherAction(state.fight,
        {kind:'cancel', expectedRevision:expected.state.fight.revision}); return state; }, expected));
    }); document.body.append(overlay);
    launch = document.createElement('button'); launch.id = id + '-btn'; launch.style.display = 'none';
    getButtonRow().append(launch); launch.addEventListener('click', () => {
      if (!store.snapshot()) { showAlert(t('battlesim.no_active_playthrough')); return; }
      render(); overlay.classList.add('active');
    }); registerShortcut({button:launch, overlay, open:() => launch.click(), close});
    let backdrop = false; overlay.addEventListener('mousedown', event => { backdrop = event.target === overlay; });
    overlay.addEventListener('click', event => { if (backdrop && event.target === overlay) close(); });
    overlay.addEventListener('keydown', event => { if (event.key === 'Escape') { event.stopPropagation(); close(); } });
  }
  return {init, render, setVisible(visible) { if (launch) launch.style.display = visible ? '' : 'none'; if (!visible) close(); }};
}
