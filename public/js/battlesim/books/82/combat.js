// Combat rules and resolution; UI and persistence callbacks are injected.
export function createCombat(getContext) {
// BEGIN EXTRACTED RULES
function _levelFromLife(life) {

  if (life >= 41) return 1;
  if (life >= 16) return 2;
  if (life >= 1) return 3;
  return 4;
}

function _playerStrength(d) {
  const { LEVEL_BONUS, SKILL_TIER, _levelFromLife } = getContext();

  const lvl = _levelFromLife(d.life);
  return LEVEL_BONUS[lvl] + SKILL_TIER[d.skill][lvl];
}

function _pick12() {
 return 1 + Math.floor(Math.random() * 12); }

function _enemyName(d) {
  const { t } = getContext();
 return d.enemy.name.trim() || t('battlesim.default_enemy'); }

function _enemyNameSafe(d) {
  const { _enemyName, escapeHtml } = getContext();
 return escapeHtml(_enemyName(d)); }

function _ready(d) {
 return !!d && d.enemy.name.trim() !== '' && d.life > 0 && d.enemy.hp > 0; }

function _runRound() {
  const { _appendLog, _checkBattleEnd, _data, _enemyNameSafe, _pick12, _playerStrength, _ready, _renderAll, saveState, t } = getContext();

  const d = _data();
  if (!d || !_ready(d)) return;
  d.roundsThisBattle++;

  const pick = _pick12();
  const strength = _playerStrength(d);
  const total = pick + strength;

  _appendLog(d, t('battlesim82.log.round', { round: d.roundsThisBattle, pick, strength, total, enemyStrength: d.enemy.strength }));

  if (total > d.enemy.strength) {
    d.enemy.hp = Math.max(0, d.enemy.hp - 2);
    _appendLog(d, t('battlesim82.log.win', { enemy: _enemyNameSafe(d), hp: d.enemy.hp, hpMax: d.enemy.hpMax }));
  } else if (total < d.enemy.strength) {
    d.life = Math.max(0, d.life - 2);
    _appendLog(d, t('battlesim82.log.lose', { life: d.life, lifeMax: d.lifeInitial }));
  } else {
    d.enemy.hp = Math.max(0, d.enemy.hp - 1);
    d.life = Math.max(0, d.life - 1);
    _appendLog(d, t('battlesim82.log.tie', { enemy: _enemyNameSafe(d), hp: d.enemy.hp, hpMax: d.enemy.hpMax, life: d.life, lifeMax: d.lifeInitial }));
  }

  _checkBattleEnd(d);
  saveState();
  _renderAll();
}

function _checkBattleEnd(d) {
  const { SVG_SKULL, SVG_TROPHY, _appendLog, _enemyNameSafe, _recordOutcome, t } = getContext();

  if (d.enemy.hp <= 0) {
    _appendLog(d, t('battlesim82.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) }));
    _recordOutcome(d, 'win');
  } else if (d.life <= 0) {
    _appendLog(d, t('battlesim82.log.fallen', { skull: SVG_SKULL }));
    _recordOutcome(d, 'loss');
  }
}

function _resetBattle() {
  const { _appendLog, _data, _enemyNameSafe, _renderAll, saveState, t } = getContext();

  const d = _data();
  if (!d) return;
  d.roundsThisBattle = 0;
  d.enemy.hp = d.enemy.hpMax;
  d.life = d.lifeInitial;
  if (d.log.length) _appendLog(d, t('battlesim82.log.reset_sep'));
  _appendLog(d, t('battlesim82.log.reset', { enemy: _enemyNameSafe(d) }));
  saveState();
  _renderAll();
}


// END EXTRACTED RULES
  return { _levelFromLife, _playerStrength, _pick12, _enemyName, _enemyNameSafe, _ready, _runRound, _checkBattleEnd, _resetBattle };
}
