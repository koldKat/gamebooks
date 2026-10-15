// Combat rules and resolution; UI and persistence callbacks are injected.
export function createCombat(getContext) {
// BEGIN EXTRACTED RULES
function _roll2d6() {
 return 2 + Math.floor(Math.random() * 6) + Math.floor(Math.random() * 6); }

function _enemyName(d) {
  const { t } = getContext();
 return d.enemy.name.trim() || t('battlesim.default_enemy'); }

function _enemyNameSafe(d) {
  const { _enemyName, escapeHtml } = getContext();
 return escapeHtml(_enemyName(d)); }

function _playerWon(d) {
 return d.enemy.hitsNeeded > 0 && d.enemy.hitsLanded >= d.enemy.hitsNeeded; }

function _playerLost(d) {
  const { DAMAGE_CAP } = getContext();
 return d.player.damage >= DAMAGE_CAP; }

function _resetEncounterKnobs(d) {

  d.enemy.strikesPerRound = 1;
  d.kobaldiMode = false;
}

function _runRound() {
  const { DAMAGE_CAP, SVG_SKULL, SVG_TROPHY, _appendLog, _battleOver, _data, _enemyNameSafe, _playerLost, _playerWon, _recordOutcome, _renderAll, _roll2d6, saveState, t, tetivaRound } = getContext();

  const d = _data();
  if (!d || _battleOver(d) || !d.enemy.hitsNeeded) return;
  if (d.printedRules === 1) {
    d.roundsThisBattle++;
    for (const event of tetivaRound(d, _roll2d6)) {
      if (event.side === 'player') {
        _appendLog(d, t(event.hit ? 'battlesim753.log.you_hit' : 'battlesim753.log.you_miss', {
          round:d.roundsThisBattle, playerAS:event.attack, enemy:_enemyNameSafe(d), n:d.enemy.hitsLanded, needed:d.enemy.hitsNeeded,
        }));
      } else {
        _appendLog(d, t(event.damage ? 'battlesim753.log.enemy_hits' : 'battlesim753.log.enemy_miss', {
          enemy:_enemyNameSafe(d), enemyAS:event.attack, n:event.damage, damage:event.total, cap:DAMAGE_CAP,
        }));
      }
    }
    if (_playerLost(d) || _playerWon(d)) {
      const lost = _playerLost(d);
      _appendLog(d, t(lost ? 'battlesim753.log.fallen' : 'battlesim753.log.defeated', {skull:SVG_SKULL, trophy:SVG_TROPHY, enemy:_enemyNameSafe(d)}));
      _recordOutcome(d, lost ? 'loss' : 'win');
    }
    saveState();
    _renderAll();
    return;
  }
  d.roundsThisBattle++;

  // Троловият удар: binary hit counter, not variable damage.
  const playerAS = d.player.attack + _roll2d6();
  if (playerAS > d.enemy.defense) {
    d.enemy.hitsLanded++;
    _appendLog(d, t('battlesim753.log.you_hit', { round: d.roundsThisBattle, playerAS, enemy: _enemyNameSafe(d), n: d.enemy.hitsLanded, needed: d.enemy.hitsNeeded }));
  } else {
    _appendLog(d, t('battlesim753.log.you_miss', { round: d.roundsThisBattle, playerAS, enemy: _enemyNameSafe(d) }));
  }

  if (_playerWon(d)) {
    _appendLog(d, t('battlesim753.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyNameSafe(d) }));
    _recordOutcome(d, 'win');
    saveState();
    _renderAll();
    return;
  }

  // Enemy damage accumulates toward 24; Kobaldi mode derives strike count from dice differences.
  const strikes = d.kobaldiMode
    ? Math.abs(_roll2d6() - _roll2d6())
    : Math.max(1, d.enemy.strikesPerRound || 1);

  for (let i = 0; i < strikes && !_playerLost(d); i++) {
    const enemyAS = d.enemy.attack + _roll2d6();
    const dmg = Math.max(0, enemyAS - d.player.defense);
    if (dmg > 0) {
      d.player.damage = Math.min(DAMAGE_CAP, d.player.damage + dmg);
      _appendLog(d, t('battlesim753.log.enemy_hits', { enemy: _enemyNameSafe(d), enemyAS, n: dmg, damage: d.player.damage, cap: DAMAGE_CAP }));
    } else {
      _appendLog(d, t('battlesim753.log.enemy_miss', { enemy: _enemyNameSafe(d), enemyAS }));
    }
  }

  if (_playerLost(d)) {
    _appendLog(d, t('battlesim753.log.fallen', { skull: SVG_SKULL }));
    _recordOutcome(d, 'loss');
  }

  saveState();
  _renderAll();
}

function _resetBattle() {
  const { _appendLog, _data, _enemyNameSafe, _renderAll, saveState, t, tetivaEncounter } = getContext();

  const d = _data();
  if (!d) return;
  d.enemy.hitsLanded = 0;
  d.player.damage = 0;
  d.roundsThisBattle = 0;
  d.printedRules = 1;
  d.encounterSection = Number(d.enemy.name.match(/§(\d+)/)?.[1]) || d.encounterSection || 0;
  d.combatEffects = tetivaEncounter(d.encounterSection || 0);
  delete d.initiativeEnemyFirst;
  if (d.combatEffects.kobaldi) d.kobaldiMode = true;
  if (d.log.length) _appendLog(d, t('battlesim753.log.reset_sep'));
  _appendLog(d, t('battlesim753.log.reset', { enemy: _enemyNameSafe(d) }));
  saveState();
  _renderAll();
}

// END EXTRACTED RULES
  return { _roll2d6, _enemyName, _enemyNameSafe, _playerWon, _playerLost, _resetEncounterKnobs, _runRound, _resetBattle };
}
