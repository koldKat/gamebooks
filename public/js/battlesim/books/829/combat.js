// Combat rules and resolution; UI and persistence callbacks are injected.
export function createCombat(getContext) {
// BEGIN EXTRACTED RULES
function _rangedTypeLabel(key) {
  const { t } = getContext();
 return t(`battlesim829.type.${key}`) || key; }

function _roll() {
 return 1 + Math.floor(Math.random() * 6); }

function _enemyName(d) {
 return d.enemy.name.trim() || 'врагът'; }

function _enemyNameSafe(d) {
  const { _enemyName, escapeHtml } = getContext();
 return escapeHtml(_enemyName(d)); }

function _entryNote(entry) {

  return (entry && typeof entry === 'object') ? (entry.note || '') : '';
}

function _entryLabel(entry) {

  return (entry && typeof entry === 'object') ? (entry.label || '?') : '?';
}

function _entryQty(entry) {

  return (entry && typeof entry === 'object' && entry.qty != null) ? entry.qty : 1;
}

function _statFromNote(note, re) {

  const m = String(note || '').match(re);
  return m ? parseInt(m[1], 10) : 0;
}

function _equipmentBaseStats(pt) {
  const { RE_STAT_A, RE_STAT_D, _entryNote, _statFromNote } = getContext();

  const eq = pt.equipment || {};
  const baseA = _statFromNote(_entryNote(eq.primary), RE_STAT_A);
  let baseD = 0;
  for (const key of Object.keys(eq)) {
    baseD += _statFromNote(_entryNote(eq[key]), RE_STAT_D);
  }
  return { baseA, baseD };
}

function _syncStatFromEquipment(d, pt, stat) {
  const { BASE_HP_MAX, ENDURANCE_HP_BONUS, _equipmentBaseStats } = getContext();

  const { baseA, baseD } = _equipmentBaseStats(pt);
  if (stat === 'a') d.player.a = d.rulesVersion === 1 && baseA === 0 ? 0 : baseA + (d.player.skills.weapon || 0);
  if (stat === 'd') d.player.d = baseD + (d.player.skills.parry  || 0);
  if (stat === 'hpMax') {
    d.player.hpMax = BASE_HP_MAX + (d.player.skills.endurance ? ENDURANCE_HP_BONUS : 0);
    d.player.hp = Math.min(d.player.hp, d.player.hpMax);
  }
}

function _rangedWeaponOptions(pt) {
  const { RE_STAT_A, RE_STAT_T, _entryLabel, _entryNote, _entryQty, _statFromNote, t } = getContext();

  const out = [];
  const eq = pt.equipment || {};
  for (const slot of Object.keys(eq)) {
    const entry = eq[slot];
    const note  = _entryNote(entry);
    if (!RE_STAT_T.test(note)) continue;
    out.push({
      key: 'eq:' + slot,
      label: _entryLabel(entry),
      t: _statFromNote(note, RE_STAT_T),
      a: _statFromNote(note, RE_STAT_A),
      qty: _entryQty(entry),
    });
  }
  (pt.inventory || []).forEach((it, i) => {
    const note = it?.note || '';
    if (!RE_STAT_T.test(note)) return;
    out.push({
      key: 'inv:' + i,
      label: it.label || '?',
      t: _statFromNote(note, RE_STAT_T),
      a: _statFromNote(note, RE_STAT_A),
      qty: it.qty != null ? it.qty : 1,
    });
  });
  return out;
}

function _rangedAccuracy(d, weapon) {
  const { THROWING_ACCURACY_BONUS, t } = getContext();

  const r = d.player.ranged;
  switch (r.type) {
    case 'bow':      return (weapon?.t || 0) + (d.player.skills.archery >= 1 ? 1 : 0);
    case 'musket':   return 4;
    case 'spear':
    case 'shuriken': return (d.rulesVersion === 1 ? (r.type === 'spear' ? 4 : 3) : (weapon?.t || 0)) + (d.player.skills.throwing ? THROWING_ACCURACY_BONUS : 0);
    case 'magic':    return r.magicT || 0;
    default:         return 0;
  }
}

function _rangedDamage(d, weapon, roll) {

  const r  = d.player.ranged;
  const pb = d.enemy.pb || 0;
  switch (r.type) {
    case 'bow':      return Math.max(0, (weapon?.a || 0) + (d.player.skills.archery >= 2 ? 2 : 0) - pb);
    case 'musket':   return Math.max(0, 6 - pb);
    case 'spear':    return 2;
    case 'shuriken': return roll;
    case 'magic':    return r.magicDmg || 0;
    default:         return 0;
  }
}

function _rangedDamageDisplay(d, weapon) {
  const { _rangedDamage, t } = getContext();

  return d.player.ranged.type === 'shuriken' ? t('battlesim829.ranged.dmg_shuriken') : String(_rangedDamage(d, weapon, 0));
}

function _getGroupObj(d, group) {

  return group === 'sim' ? d : group === 'ranged' ? d.player.ranged : d[group];
}

function _resolveFuture(events) {
  const { _appendLog, _data, _recordOutcome, _renderHistory, _renderInputs, _renderLog, escapeHtml, saveState, t } = getContext();

  const d = _data();
  for (const event of events) {
    const values = { ...event, actor: escapeHtml(event.actor || ''), spell: t('battlesim829.spell.' + event.spell) };
    _appendLog(d, t('battlesim829.event.' + event.kind, values));
    if (event.kind === 'win' || event.kind === 'loss') _recordOutcome(d, event.kind);
  }
  saveState();
  _renderInputs();
  _renderLog();
  _renderHistory();
}

function _enemyAttack(d) {
  const { SVG_SKULL, _appendLog, _enemyNameSafe, _recordOutcome, _roll, t } = getContext();

  const eRoll  = _roll();
  const eTotal = d.enemy.a + eRoll;
  if (eTotal > d.player.d) {
    const dmg = eTotal - d.player.d;
    d.player.hp = Math.max(0, d.player.hp - dmg);
    _appendLog(d, t('battlesim829.log.enemy_hit', { enemy: _enemyNameSafe(d), roll: eRoll, a: d.enemy.a, total: eTotal, def: d.player.d, dmg, hp: d.player.hp, hpMax: d.player.hpMax }));
  } else {
    _appendLog(d, t('battlesim829.log.enemy_miss', { enemy: _enemyNameSafe(d), roll: eRoll, a: d.enemy.a, total: eTotal, def: d.player.d }));
  }
  if (d.player.hp <= 0) {
    _appendLog(d, `${SVG_SKULL} ${t('battlesim829.log.player_fallen')}`);
    _recordOutcome(d, 'loss');
  }
}

function _runRound() {
  const { SVG_TROPHY, _appendLog, _data, _enemyAttack, _enemyNameSafe, _recordOutcome, _renderHistory, _renderInputs, _renderLog, _resolveFuture, _roll, quailRound, saveState, t } = getContext();

  const d = _data();
  if (d?.rulesVersion === 1) return _resolveFuture(quailRound(d, _roll));
  if (!d || d.player.hp <= 0 || d.enemy.hp <= 0) return;

  const pRoll  = _roll();
  const pTotal = d.player.a + pRoll;
  if (pTotal > d.enemy.d) {
    const dmg = pTotal - d.enemy.d;
    d.enemy.hp = Math.max(0, d.enemy.hp - dmg);
    _appendLog(d, t('battlesim829.log.player_hit', { roll: pRoll, a: d.player.a, total: pTotal, def: d.enemy.d, enemy: _enemyNameSafe(d), dmg, hp: d.enemy.hp, hpMax: d.enemy.hpMax }));
  } else {
    _appendLog(d, t('battlesim829.log.player_miss', { roll: pRoll, a: d.player.a, total: pTotal, def: d.enemy.d, enemy: _enemyNameSafe(d) }));
  }

  if (d.enemy.hp <= 0) {
    _appendLog(d, `${SVG_TROPHY} ${t('battlesim829.log.enemy_defeated', { enemy: _enemyNameSafe(d) })}`);
    _recordOutcome(d, 'win');
  } else {
    _enemyAttack(d);
  }

  saveState();
  _renderInputs();
  _renderLog();
  _renderHistory();
}

function _rangedAttack() {
  const { SVG_TROPHY, _appendLog, _data, _enemyNameSafe, _rangedAccuracy, _rangedDamage, _rangedTypeLabel, _rangedWeaponOptions, _recordOutcome, _renderHistory, _renderInputs, _renderLog, _resolveFuture, _roll, currentPlaythrough, quailRanged, saveState, t } = getContext();

  const d  = _data();
  const pt = currentPlaythrough();
  if (d?.rulesVersion === 1 && pt) return _resolveFuture(quailRanged(d, _rangedWeaponOptions(pt).find(w => w.key === d.player.ranged.weaponKey), _roll));
  if (!d || !pt || d.player.hp <= 0 || d.enemy.hp <= 0) return;
  const r = d.player.ranged;
  if (r.attempts <= 0) return;

  const weapons = _rangedWeaponOptions(pt);
  const weapon  = weapons.find(w => w.key === r.weaponKey);
  if (r.type !== 'magic' && !weapon) return;

  const acc  = _rangedAccuracy(d, weapon);
  const roll = _roll();
  r.attempts--;

  const typeLabel = _rangedTypeLabel(r.type);
  if (roll <= acc) {
    const dmg = Math.max(0, _rangedDamage(d, weapon, roll));
    d.enemy.hp = Math.max(0, d.enemy.hp - dmg);
    _appendLog(d, t('battlesim829.log.ranged_hit', { type: typeLabel, roll, acc, dmg, enemy: _enemyNameSafe(d), hp: d.enemy.hp, hpMax: d.enemy.hpMax }));
  } else {
    _appendLog(d, t('battlesim829.log.ranged_miss', { type: typeLabel, roll, acc }));
  }

  if (d.enemy.hp <= 0) {
    _appendLog(d, `${SVG_TROPHY} ${t('battlesim829.log.enemy_defeated', { enemy: _enemyNameSafe(d) })}`);
    _recordOutcome(d, 'win');
  }

  saveState();
  _renderInputs();
  _renderLog();
  _renderHistory();
}

function _flee() {
  const { _appendLog, _data, _renderLog, _resolveFuture, _roll, quailFlee, saveState, t } = getContext();

  const d = _data();
  if (d?.rulesVersion === 1) return _resolveFuture(quailFlee(d, _roll));
  if (!d) return;
  const roll = _roll();
  _appendLog(d, t('battlesim829.log.flee', { roll }));
  saveState();
  _renderLog();
}

function _resetBattle() {
  const { _appendLog, _data, _enemyNameSafe, _renderHistory, _renderInputs, _renderLog, quailStart, saveState, t } = getContext();

  const d = _data();
  if (!d) return;
  quailStart(d);
  if (d.log.length) _appendLog(d, t('battlesim829.log.reset_sep'));
  _appendLog(d, t('battlesim829.rules.reset', { enemy: _enemyNameSafe(d) }));
  saveState();
  _renderInputs();
  _renderLog();
  _renderHistory();
}

function _enemyStatLabel(e) {

  const v = x => x == null ? '?' : x;
  return `А:${v(e.attack)} ТЖ:${v(e.hp)} З:${v(e.defense)} ПБ:${v(e.pb)}`;
}
// END EXTRACTED RULES
  return { _rangedTypeLabel, _roll, _enemyName, _enemyNameSafe, _entryNote, _entryLabel, _entryQty, _statFromNote, _equipmentBaseStats, _syncStatFromEquipment, _rangedWeaponOptions, _rangedAccuracy, _rangedDamage, _rangedDamageDisplay, _getGroupObj, _resolveFuture, _enemyAttack, _runRound, _rangedAttack, _flee, _resetBattle, _enemyStatLabel };
}
