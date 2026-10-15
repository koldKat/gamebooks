// Combat rules and resolution; UI and persistence callbacks are injected.
export function createCombat(getContext) {
// BEGIN EXTRACTED RULES
function _emptyEnemy() {

  return { name: '', endurance: 0, enduranceMax: 0, dmgDice: 1, dmgBonus: 0, defHand: 0, defKick: 0, defThrow: 0, defShuriken: 0 };
}

function _roll2d6() {
 return 2 + Math.floor(Math.random() * 6) + Math.floor(Math.random() * 6); }

function _roll1d6() {
 return 1 + Math.floor(Math.random() * 6); }

function _rollNd6(n) {
  const { _roll1d6 } = getContext();
 let s = 0; for (let i = 0; i < n; i++) s += _roll1d6(); return s; }

function _enemyName(d) {
  const { t } = getContext();
 return d.enemy.name.trim() || t('battlesim.default_enemy'); }

function _enemyNameSafe(d) {
  const { _enemyName, escapeHtml } = getContext();
 return escapeHtml(_enemyName(d)); }

function _techLabel(tech) {
  const { t } = getContext();
 return t(`battlesim376.ui.tech_${tech}`); }

function _busy(d) {
 return !!d.pendingEnemyHit || !!d.pendingThrowFollowup; }

function _consumeBlockPenalty(d, tech) {

  if (!d.player.blockPenaltyPending) return 0;
  d.player.blockPenaltyPending = false;
  return tech === 'shuriken' ? 0 : -2;
}

function _enemyCounter(d) {
  const { _appendLog, _enemyNameSafe, _roll2d6, _rollNd6, t } = getContext();

  const enemyRoll = _roll2d6();
  if (enemyRoll > d.player.defense) {
    const dmg = _rollNd6(Math.max(1, d.enemy.dmgDice)) + (d.enemy.dmgBonus || 0);
    d.pendingEnemyHit = { dmg };
    _appendLog(d, t('battlesim376.log.enemy_hits_pending', { enemy: _enemyNameSafe(d), roll: enemyRoll, defense: d.player.defense, dmg }));
  } else {
    _appendLog(d, t('battlesim376.log.enemy_misses', { enemy: _enemyNameSafe(d), roll: enemyRoll, defense: d.player.defense }));
  }
}

function _applyEnemyDefeat(d) {
  const { SVG_TROPHY, _appendLog, _enemyNameSafe, _recordOutcome, t } = getContext();

  if (d.enemy.enduranceMax > 0 && d.enemy.endurance <= 0) {
    _appendLog(d, t('battlesim376.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) }));
    _recordOutcome(d, 'win');
    return true;
  }
  return false;
}

function _applyPlayerFall(d) {
  const { SVG_SKULL, _appendLog, _recordOutcome, t } = getContext();

  if (d.player.endurance <= 0) {
    _appendLog(d, t('battlesim376.log.fallen', { skull: SVG_SKULL }));
    _recordOutcome(d, 'loss');
    return true;
  }
  return false;
}

function _attack() {
  const { DEF_FIELD, _appendLog, _applyEnemyDefeat, _battleOver, _busy, _consumeBlockPenalty, _data, _enemyCounter, _enemyNameSafe, _renderAll, _roll1d6, _roll2d6, _techLabel, saveState, t } = getContext();

  const d = _data();
  if (!d || _busy(d) || _battleOver(d)) return;
  const tech = d.technique;
  d.roundsThisBattle++;

  const useIF = d.useInnerForce && d.player.innerForce > 0;
  if (useIF) d.player.innerForce = Math.max(0, d.player.innerForce - 1);
  d.useInnerForce = false;

  const penalty = _consumeBlockPenalty(d, tech);
  const score = tech === 'shuriken' ? 0 : (d.player[tech] || 0) + penalty;
  const defense = d.enemy[DEF_FIELD[tech]] || 0;
  const raw = _roll2d6();
  const total = raw + score;
  const hit = total > defense;

  _appendLog(d, t('battlesim376.log.attack', { tech: _techLabel(tech), enemy: _enemyNameSafe(d), raw, score, total, defense }));

  if (tech === 'shuriken') d.player.shurikens = Math.max(0, d.player.shurikens - 1);

  if (!hit) {
    _appendLog(d, t('battlesim376.log.miss', { tech: _techLabel(tech) }));
    _enemyCounter(d);
    saveState();
    _renderAll();
    return;
  }

  if (tech === 'throw') {
    _appendLog(d, t('battlesim376.log.throw_lands'));
    d.pendingThrowFollowup = true;
    saveState();
    _renderAll();
    return;
  }

  let dmg = raw + _roll1d6();
  if (tech === 'kick') dmg += 2;
  if (useIF) dmg *= 2;
  d.enemy.endurance = Math.max(0, d.enemy.endurance - dmg);
  _appendLog(d, t('battlesim376.log.you_hit', { tech: _techLabel(tech), enemy: _enemyNameSafe(d), n: dmg, endurance: d.enemy.endurance, enduranceMax: d.enemy.enduranceMax, innerForce: useIF ? t('battlesim376.log.inner_force_tag') : '' }));

  if (!_applyEnemyDefeat(d)) _enemyCounter(d);
  saveState();
  _renderAll();
}

function _throwFollowup(tech) {
  const { DEF_FIELD, _appendLog, _applyEnemyDefeat, _consumeBlockPenalty, _data, _enemyCounter, _enemyNameSafe, _renderAll, _roll1d6, _roll2d6, _techLabel, saveState, t } = getContext();

  const d = _data();
  if (!d || !d.pendingThrowFollowup || tech === 'throw' || tech === 'shuriken') return;
  d.pendingThrowFollowup = false;

  const penalty = _consumeBlockPenalty(d, tech);
  const score = (d.player[tech] || 0) + penalty;
  const defense = d.enemy[DEF_FIELD[tech]] || 0;
  const raw = _roll2d6();
  const total = raw + score;
  const hit = total > defense;

  _appendLog(d, t('battlesim376.log.followup_attack', { tech: _techLabel(tech), enemy: _enemyNameSafe(d), raw, score, total, defense }));

  if (!hit) {
    _appendLog(d, t('battlesim376.log.followup_miss', { tech: _techLabel(tech) }));
    if (d.counterAfterMissedFollowup) _enemyCounter(d);
    saveState();
    _renderAll();
    return;
  }

  let dmg = raw + _roll1d6() + 2;
  if (tech === 'kick') dmg += 2;
  d.enemy.endurance = Math.max(0, d.enemy.endurance - dmg);
  _appendLog(d, t('battlesim376.log.you_hit', { tech: _techLabel(tech), enemy: _enemyNameSafe(d), n: dmg, endurance: d.enemy.endurance, enduranceMax: d.enemy.enduranceMax, innerForce: '' }));

  if (!_applyEnemyDefeat(d)) _enemyCounter(d);
  saveState();
  _renderAll();
}

function _block() {
  const { _appendLog, _applyPlayerFall, _data, _renderAll, _roll2d6, saveState, t } = getContext();

  const d = _data();
  if (!d || !d.pendingEnemyHit) return;
  const { dmg } = d.pendingEnemyHit;
  const roll = _roll2d6();
  const blocked = roll < d.player.defense;
  d.pendingEnemyHit = null;
  d.player.blockPenaltyPending = true;
  if (blocked) {
    _appendLog(d, t('battlesim376.log.block_success', { roll, defense: d.player.defense }));
  } else {
    d.player.endurance = Math.max(0, d.player.endurance - dmg);
    _appendLog(d, t('battlesim376.log.block_fail', { roll, defense: d.player.defense, n: dmg, endurance: d.player.endurance, enduranceMax: d.player.enduranceInitial }));
  }
  _applyPlayerFall(d);
  saveState();
  _renderAll();
}

function _takeHit() {
  const { _appendLog, _applyPlayerFall, _data, _renderAll, saveState, t } = getContext();

  const d = _data();
  if (!d || !d.pendingEnemyHit) return;
  const { dmg } = d.pendingEnemyHit;
  d.pendingEnemyHit = null;
  d.player.endurance = Math.max(0, d.player.endurance - dmg);
  _appendLog(d, t('battlesim376.log.take_hit', { n: dmg, endurance: d.player.endurance, enduranceMax: d.player.enduranceInitial }));
  _applyPlayerFall(d);
  saveState();
  _renderAll();
}

function _resetBattle() {
  const { _appendLog, _data, _enemyNameSafe, _renderAll, saveState, t } = getContext();

  const d = _data();
  if (!d) return;
  d.enemy.endurance = d.enemy.enduranceMax;
  d.player.endurance = d.player.enduranceInitial;
  d.roundsThisBattle = 0;
  d.pendingEnemyHit = null;
  d.pendingThrowFollowup = false;
  d.player.blockPenaltyPending = false;
  if (d.log.length) _appendLog(d, t('battlesim376.log.reset_sep'));
  _appendLog(d, t('battlesim376.log.reset', { enemy: _enemyNameSafe(d) }));
  saveState();
  _renderAll();
}

function _startEnemyFight(d, enemy) {

  d.enemy = {
    ...d.enemy,
    name: enemy.name,
    endurance: enemy.hp ?? 0,
    enduranceMax: enemy.hp ?? 0,
    dmgDice: enemy.pb ?? 1,
    dmgBonus: enemy.defense ?? 0,
    defHand: enemy.attack ?? 0,
    defKick: 0,
    defThrow: 0,
    defShuriken: 0,
  };
  d.player.defense = 0;
  d.roundsThisBattle = 0;
  d.pendingEnemyHit = null;
  d.pendingThrowFollowup = false;
  d.player.blockPenaltyPending = false;
  d.counterAfterMissedFollowup = true;
}

// END EXTRACTED RULES
  return { _emptyEnemy, _roll2d6, _roll1d6, _rollNd6, _enemyName, _enemyNameSafe, _techLabel, _busy, _consumeBlockPenalty, _enemyCounter, _applyEnemyDefeat, _applyPlayerFall, _attack, _throwFollowup, _block, _takeHit, _resetBattle, _startEnemyFight };
}
