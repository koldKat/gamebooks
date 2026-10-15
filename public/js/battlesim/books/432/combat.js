// Combat rules and resolution; UI and persistence callbacks are injected.
export function createCombat(getContext) {
// BEGIN EXTRACTED RULES
function _ratioCol(ratio) {

  if (ratio <= -11) return 0;
  if (ratio <= -9) return 1;
  if (ratio <= -7) return 2;
  if (ratio <= -5) return 3;
  if (ratio <= -3) return 4;
  if (ratio <= -1) return 5;
  if (ratio === 0) return 6;
  if (ratio <= 2) return 7;
  if (ratio <= 4) return 8;
  if (ratio <= 6) return 9;
  if (ratio <= 8) return 10;
  if (ratio <= 10) return 11;
  return 12;
}

function _pickRow(pick) {
 return pick === 0 ? 9 : pick - 1; }

function _pick10() {
 return Math.floor(Math.random() * 10); }

function _enemyName(d) {
  const { t } = getContext();
 return d.enemy.name.trim() || t('battlesim.default_enemy'); }

function _enemyNameSafe(d) {
  const { _enemyName, escapeHtml } = getContext();
 return escapeHtml(_enemyName(d)); }

function _effectiveSkill(d) {
 return d.combatSkill + (d.attackModifier || 0); }

function _captureFightEffects(d) {

  d.printedDeathRules = 1;
  d.combatEffects = {
    section: Number(d.enemy.name.match(/§(\d+)/)?.[1]) || 0,
    mindblast: !!d.nextMindblast,
    mindshield: !!d.nextMindshield,
  };
}

function _roundRatio(d) {

  const effects = d.combatEffects || {};
  let ratio = d.ratio;
  if (effects.mindblast && ![26, 77, 88, 122, 325].includes(effects.section)) ratio += 2;
  if (effects.section === 62 && d.roundsThisBattle <= 3) ratio -= 2;
  if (effects.section === 153 && d.roundsThisBattle <= 2) ratio -= 4;
  if (effects.section === 316) ratio -= 2;
  if (effects.section === 122 && !effects.mindshield) ratio -= 4;
  return ratio;
}

function _runRound() {
  const { COMBAT_TABLE, _appendLog, _checkBattleEnd, _data, _enemyNameSafe, _pick10, _pickRow, _ratioCol, _renderAll, _roundRatio, saveState, t } = getContext();

  const d = _data();
  if (!d || !d.rolled || d.endurance <= 0 || d.enemy.endurance <= 0) return;
  d.roundsThisBattle++;

  const pick = _pick10();
  const ratio = _roundRatio(d);
  const col = _ratioCol(ratio);
  let [enemyLoss, lwLoss] = COMBAT_TABLE[_pickRow(pick)][col];
  const effects = d.combatEffects || {};
  if (effects.section === 147 && d.roundsThisBattle === 1) lwLoss = 0;
  if (effects.section === 77 && !effects.mindshield && lwLoss !== 'K') lwLoss += 1;
  _appendLog(d, t('battlesim432.log.round', { round: d.roundsThisBattle, ratio, pick }));

  if (enemyLoss === 'K') d.enemy.endurance = 0;
  else d.enemy.endurance = Math.max(0, d.enemy.endurance - enemyLoss);
  if (lwLoss === 'K') d.endurance = 0;
  else d.endurance = Math.max(0, d.endurance - lwLoss);

  _appendLog(d, t('battlesim432.log.result', {
    enemy: _enemyNameSafe(d),
    enemyLoss: enemyLoss === 'K' ? t('battlesim432.log.k_word') : enemyLoss,
    enemyEndurance: d.enemy.endurance, enemyEnduranceMax: d.enemy.enduranceMax,
    lwLoss: lwLoss === 'K' ? t('battlesim432.log.k_word') : lwLoss,
    endurance: d.endurance, enduranceMax: d.enduranceInitial,
  }));

  _checkBattleEnd(d);
  saveState();
  _renderAll();
}

function _checkBattleEnd(d) {
  const { SVG_SKULL, SVG_TROPHY, _appendLog, _enemyNameSafe, _recordOutcome, t } = getContext();

  if (d.printedDeathRules && d.endurance <= 0) {
    _appendLog(d, t('battlesim432.log.fallen', { skull: SVG_SKULL }));
    _recordOutcome(d, 'loss');
  } else if (d.enemy.endurance <= 0) {
    _appendLog(d, t('battlesim432.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) }));
    _recordOutcome(d, 'win');
  } else if (d.endurance <= 0) {
    _appendLog(d, t('battlesim432.log.fallen', { skull: SVG_SKULL }));
    _recordOutcome(d, 'loss');
  }
}

function _resetBattle() {
  const { _appendLog, _captureFightEffects, _data, _enemyNameSafe, _renderAll, saveState, t } = getContext();

  const d = _data();
  if (!d) return;
  d.roundsThisBattle = 0;
  _captureFightEffects(d);
  d.enemy.endurance = d.enemy.enduranceMax;
  d.endurance = d.enduranceInitial;
  if (d.log.length) _appendLog(d, t('battlesim432.log.reset_sep'));
  _appendLog(d, t('battlesim432.log.reset', { enemy: _enemyNameSafe(d) }));
  saveState();
  _renderAll();
}

// END EXTRACTED RULES
  return { _ratioCol, _pickRow, _pick10, _enemyName, _enemyNameSafe, _effectiveSkill, _captureFightEffects, _roundRatio, _runRound, _checkBattleEnd, _resetBattle };
}
