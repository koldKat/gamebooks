// Combat rules and resolution; UI and persistence callbacks are injected.
export function createCombat(getContext) {
// BEGIN EXTRACTED RULES
function _roll() {
 return 1 + Math.floor(Math.random() * 6); }

function _playerAtaka(d)    {
 return d.player.sila + (d.player.atakaStat === 'barzina' ? d.player.barzina : d.player.lovkost); }

function _playerZashtita(d) {
 return d.player.reflekt + (d.player.atakaStat === 'barzina' ? d.player.lovkost : d.player.barzina); }

function _enemyName(d) {
  const { t } = getContext();
 return d.enemy.name.trim() || t('battlesim.default_enemy'); }

function _enemyNameSafe(d) {
  const { _enemyName, escapeHtml } = getContext();
 return escapeHtml(_enemyName(d)); }

function _ready(d) {
 return !!d && !d.battleOutcome && d.enemy.name.trim() !== '' && d.player.izdr > 0 && d.enemy.izdr > 0; }

function _firstBloodLimit(d) {

  return d.combatRulesVersion === 2 && d.enemy.nonlethal ? Math.max(0, d.startEndurance - 10) : 0;
}

function _runRound() {
  const { _appendLog, _checkBattleEnd, _data, _enemyNameSafe, _firstBloodLimit, _playerAtaka, _playerZashtita, _ready, _renderAll, _roll, saveState, t } = getContext();

  const d = _data();
  if (!d || !_ready(d)) return;
  if (d.combatRulesVersion === 2 && d.roundsThisBattle === 0) d.startEndurance = d.player.izdr;
  d.roundsThisBattle++;

  const pAtaka = _playerAtaka(d);
  const pZashtita = _playerZashtita(d);

  for (let i = 0; i < Math.max(1, d.player.bm); i++) {
    if (d.enemy.izdr <= 0) break;
    const roll = _roll();
    const dmg = Math.max(0, (pAtaka + roll) - d.enemy.zashtita);
    if (dmg > 0) d.enemy.izdr = Math.max(0, d.enemy.izdr - dmg);
    _appendLog(d, t('battlesim716.log.player_hit', { roll, total: pAtaka + roll, zashtita: d.enemy.zashtita, dmg, enemy: _enemyNameSafe(d), izdr: d.enemy.izdr }));
  }
  for (let i = 0; i < Math.max(1, d.enemy.bm); i++) {
    if (d.player.izdr <= _firstBloodLimit(d) || d.enemy.izdr <= 0) break;
    const roll = _roll();
    const dmg = Math.max(0, (d.enemy.ataka + roll) - pZashtita);
    if (dmg > 0) d.player.izdr = Math.max(_firstBloodLimit(d), d.player.izdr - dmg);
    _appendLog(d, t('battlesim716.log.enemy_hit', { enemy: _enemyNameSafe(d), roll, total: d.enemy.ataka + roll, zashtita: pZashtita, dmg, izdr: d.player.izdr }));
  }

  _checkBattleEnd(d);
  saveState();
  _renderAll();
}

function _checkBattleEnd(d) {
  const { SVG_SKULL, SVG_TROPHY, _appendLog, _enemyNameSafe, _firstBloodLimit, _recordOutcome, t } = getContext();

  if (d.combatRulesVersion === 2) {
    if (d.battleOutcome) return;
    const outcome = d.player.izdr <= _firstBloodLimit(d) ? 'loss' : d.enemy.izdr <= 0 ? 'win' : null;
    if (!outcome) return;
    d.battleOutcome = outcome;
    const recover = d.enemy.nonlethal ? Math.floor((d.startEndurance - d.player.izdr) / 2) : 0;
    d.player.izdr = Math.min(d.player.izdrMax, d.player.izdr + recover);
    const key = outcome === 'win' ? 'defeated' : 'fallen';
    _appendLog(d, t(`battlesim716.log.${key}${d.enemy.nonlethal ? '_nonlethal' : ''}`, { trophy: SVG_TROPHY, skull: SVG_SKULL, enemy: _enemyNameSafe(d), recover }));
    _recordOutcome(d, outcome);
    return;
  }
  if (d.enemy.izdr <= 0) {
    if (d.enemy.nonlethal) {
      const recover = Math.floor((d.player.izdrMax - d.player.izdr) / 2);
      d.player.izdr = Math.min(d.player.izdrMax, d.player.izdr + recover);
      _appendLog(d, t('battlesim716.log.defeated_nonlethal', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d), recover }));
    } else {
      _appendLog(d, t('battlesim716.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) }));
    }
    _recordOutcome(d, 'win');
  } else if (d.player.izdr <= 0) {
    if (d.enemy.nonlethal) {
      const recover = Math.floor((d.player.izdrMax - d.player.izdr) / 2);
      d.player.izdr = Math.min(d.player.izdrMax, d.player.izdr + recover);
      _appendLog(d, t('battlesim716.log.fallen_nonlethal', { skull: SVG_SKULL, recover }));
    } else {
      _appendLog(d, t('battlesim716.log.fallen', { skull: SVG_SKULL }));
    }
    _recordOutcome(d, 'loss');
  }
}

function _resetBattle() {
  const { _appendLog, _data, _enemyNameSafe, _renderAll, saveState, t } = getContext();

  const d = _data();
  if (!d) return;
  d.roundsThisBattle = 0;
  d.combatRulesVersion = 2;
  d.battleOutcome = null;
  d.enemy.izdr = d.enemy.izdrMax;
  d.player.izdr = d.player.izdrMax;
  if (d.log.length) _appendLog(d, t('battlesim716.log.reset_sep'));
  _appendLog(d, t('battlesim716.log.reset', { enemy: _enemyNameSafe(d) }));
  saveState();
  _renderAll();
}


// END EXTRACTED RULES
  return { _roll, _playerAtaka, _playerZashtita, _enemyName, _enemyNameSafe, _ready, _firstBloodLimit, _runRound, _checkBattleEnd, _resetBattle };
}
