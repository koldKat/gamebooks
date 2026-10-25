// Combat rules and resolution; UI and persistence callbacks are injected.
export function createCombat(getContext) {
// BEGIN EXTRACTED RULES
function _crCol(ratio) {

  if (ratio <= -11) return 0;
  if (ratio <= -9)  return 1;
  if (ratio <= -7)  return 2;
  if (ratio <= -5)  return 3;
  if (ratio <= -3)  return 4;
  if (ratio <= -1)  return 5;
  if (ratio === 0)  return 6;
  if (ratio <= 2)   return 7;
  if (ratio <= 4)   return 8;
  if (ratio <= 6)   return 9;
  if (ratio <= 8)   return 10;
  if (ratio <= 10)  return 11;
  return 12;
}

function _rollRandomNumber() {
 return Math.floor(Math.random() * 10); }

function _rulesFor(section) {
  const { ENCOUNTER_RULES } = getContext();
  return ENCOUNTER_RULES[section] ?? {};
}

function _playerCS(d) {
  const { _rulesFor } = getContext();

  const effects = d.combatEffects;
  if (effects?.captured) {
    let cs = effects.baseCS;
    const rules = _rulesFor(effects.section);
    if (effects.mindBlast && !rules.mindblastImmune) cs += rules.mindblastBonus ?? 2;
    for (const adjustment of rules.skillAdjustments ?? []) {
      if (adjustment.maxRounds !== undefined && d.roundsThisBattle > adjustment.maxRounds
          || adjustment.whenTrue && !effects[adjustment.whenTrue]
          || adjustment.whenFalse && effects[adjustment.whenFalse]) continue;
      cs += adjustment.amount;
    }
    return cs;
  }
  let cs = d.player.csBase;
  if (d.player.weaponBonus) cs += 2;
  if (d.player.mindBlast) cs += 2;
  return cs;
}

function _enemyName(d) {
  const { t } = getContext();
 return d.enemy.name.trim() || t('battlesim.default_enemy'); }

function _enemyNameSafe(d) {
  const { _enemyName, escapeHtml } = getContext();
 return escapeHtml(_enemyName(d)); }

function _playerLost(d) {
 return d.rolled && d.player.ep <= 0; }

function _playerWon(d)  {
 return d.enemy.epMax > 0 && d.enemy.ep <= 0; }

function _captureFightEffects(d) {

  d.printedRules = 1;
  d.combatEffects = {
    captured: true,
    section: Number(d.enemy.name.match(/§(\d+)/)?.[1]) || 0,
    baseCS: d.player.csBase + (d.player.weaponBonus ? 2 : 0),
    mindBlast: !!d.player.mindBlast,
    mindshield: !!d.nextMindshield,
    previousElix: !!d.nextPreviousElix,
    magicMace: !!d.nextMagicMace,
    protectedEntry: !!d.nextProtectedEntry,
    lostEP: 0,
  };
}

function _setRoute(d, section) {
  const { _appendLog, t } = getContext();

  d.combatEffects.finished = true;
  d.combatEffects.route = section;
  _appendLog(d, t('battlesim433.log.continue', { section }));
}

function _recoverCombatLoss(d) {
  const { _appendLog, _rulesFor, t } = getContext();

  const effects = d.combatEffects;
  const fraction = effects && _rulesFor(effects.section).recoverLossFraction;
  if (!fraction) return;
  const recovered = Math.min(Math.floor(effects.lostEP * fraction), d.player.epInitial - d.player.ep);
  if (recovered > 0) {
    d.player.ep += recovered;
    _appendLog(d, t('battlesim433.log.recovered', { n: recovered }));
  }
}

function _runRound() {
  const { CRT, SVG_SKULL, SVG_TROPHY, _appendLog, _battleOver, _crCol, _data, _enemyNameSafe, _playerCS, _playerLost, _playerWon, _recordOutcome, _recoverCombatLoss, _renderAll, _rollRandomNumber, _setRoute, _rulesFor, saveState, t } = getContext();

  const d = _data();
  if (!d || _battleOver(d)) return;
  const effects = d.combatEffects || {};
  const rules = _rulesFor(effects.section), stop = rules.stop;
  if (stop && d.roundsThisBattle >= stop.rounds) {
    _setRoute(d, stop.route);
    saveState();
    _renderAll();
    return;
  }
  d.roundsThisBattle++;

  const ratio = _playerCS(d) - d.enemy.cs;
  const rn = _rollRandomNumber();
  let [enemyLoss, selfLoss] = CRT[rn][_crCol(ratio)];
  if (rules.noEnemyDamageRound === d.roundsThisBattle) enemyLoss = 0;
  const protection = rules.protection;
  if (protection && d.roundsThisBattle <= protection.rounds && (!protection.whenTrue || effects[protection.whenTrue])) selfLoss = 0;
  if (rules.playerLossMultiplier && selfLoss !== 'K') selfLoss *= rules.playerLossMultiplier;
  if (rules.fatalPick && rn === rules.fatalPick.pick) {
    d.player.ep = 0;
    _appendLog(d, t('battlesim433.log.fallen'));
    _recordOutcome(d, 'loss');
    _setRoute(d, rules.fatalPick.route);
    saveState();
    _renderAll();
    return;
  }

  const enemyDied  = enemyLoss === 'K';
  const playerDied = selfLoss === 'K';
  if (!enemyDied) d.enemy.ep = Math.max(0, d.enemy.ep - enemyLoss);
  else d.enemy.ep = 0;
  if (!playerDied) d.player.ep = Math.max(0, d.player.ep - selfLoss);
  else d.player.ep = 0;
  if (effects.captured) effects.lostEP += playerDied ? 0 : selfLoss;

  _appendLog(d, t('battlesim433.log.round', {
    round: d.roundsThisBattle, ratio, rn,
    enemy: _enemyNameSafe(d),
    enemyLoss: enemyDied ? t('battlesim433.log.killed') : enemyLoss,
    selfLoss: playerDied ? t('battlesim433.log.killed') : selfLoss,
    ep: d.player.ep, epMax: d.player.epInitial,
    enemyEp: d.enemy.ep, enemyEpMax: d.enemy.epMax,
  }));

  if (d.printedRules && _playerLost(d)) {
    const nonfatal = rules.nonfatalLossRoute;
    _appendLog(d, `${SVG_SKULL} ${t(nonfatal ? 'battlesim433.log.knocked_out' : 'battlesim433.log.fallen')}`);
    _recordOutcome(d, 'loss');
    if (nonfatal) _setRoute(d, nonfatal);
  } else if (_playerWon(d)) {
    _recoverCombatLoss(d);
    _appendLog(d, `${SVG_TROPHY} ${t('battlesim433.log.defeated', { enemy: _enemyNameSafe(d) })}`);
    _recordOutcome(d, 'win');
    const victory = rules.victory;
    if (victory) _setRoute(d, d.roundsThisBattle <= victory.rounds ? victory.early : victory.late);
  } else if (_playerLost(d)) {
    _appendLog(d, `${SVG_SKULL} ${t('battlesim433.log.fallen')}`);
    _recordOutcome(d, 'loss');
  }
  if (rules.exchangeRoutes && !_playerLost(d)) {
    _setRoute(d, selfLoss > enemyLoss ? rules.exchangeRoutes.greaterPlayerLoss : enemyLoss > selfLoss || enemyDied ? rules.exchangeRoutes.greaterEnemyLoss : rules.exchangeRoutes.tie);
  }
  if (stop && d.roundsThisBattle >= stop.rounds && !_playerLost(d) && !_playerWon(d)) _setRoute(d, stop.route);

  saveState();
  _renderAll();
}

function _resetBattle() {
  const { _appendLog, _captureFightEffects, _data, _enemyNameSafe, _renderAll, saveState, t } = getContext();

  const d = _data();
  if (!d) return;
  d.enemy.ep = d.enemy.epMax;
  d.player.ep = d.player.epInitial;
  d.roundsThisBattle = 0;
  _captureFightEffects(d);
  if (d.log.length) _appendLog(d, t('battlesim433.log.reset_sep'));
  _appendLog(d, t('battlesim433.log.reset', { enemy: _enemyNameSafe(d) }));
  saveState();
  _renderAll();
}

// END EXTRACTED RULES
  return { _rulesFor, _crCol, _rollRandomNumber, _playerCS, _enemyName, _enemyNameSafe, _playerLost, _playerWon, _captureFightEffects, _setRoute, _recoverCombatLoss, _runRound, _resetBattle };
}
