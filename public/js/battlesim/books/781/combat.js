// Combat rules and resolution; UI and persistence callbacks are injected.
export function createCombat(getContext) {
// BEGIN EXTRACTED RULES
function _weapon(id) {
  const { WEAPONS } = getContext();
 return WEAPONS.find(w => w.id === id) || WEAPONS[0]; }

function _enemy(id) {
  const { ROSTER } = getContext();
 return ROSTER.find(e => e.id === id) || ROSTER[0]; }

function _defaultAmmo() {
  const { WEAPONS } = getContext();

  const a = {};
  WEAPONS.forEach(w => { if (w.ammoMax != null) a[w.id] = w.ammoMax; });
  return a;
}

function _roll1d6() {
 return 1 + Math.floor(Math.random() * 6); }

function _enemyName(d) {
  const { _enemy } = getContext();
 return _enemy(d.enemyId).name; }

function _playerWon(d) {
  const { mutatedFleshWon, FLESH_RULES } = getContext();
 return mutatedFleshWon(d, FLESH_RULES.victoryFloors); }

function _playerLost(d) {
 return d.player.life <= 0; }

function _enemyStrike(d) {
  const { _appendLog, _enemyName, t } = getContext();

  const dmg = Math.max(0, d.enemy.dmg);
  d.player.life = Math.max(0, d.player.life - dmg);
  _appendLog(d, t('battlesim781.log.enemy_hit', { name: _enemyName(d), dmg, life: d.player.life }));
}

function _attack(weaponId) {
  const { _appendLog, _battleOver, _data, _enemyName, _enemyStrike, _finishRound, _printedRound, _roll1d6, _weapon, t } = getContext();

  const d = _data();
  if (!d || _battleOver(d)) return;
  const w = _weapon(weaponId);
  if (d.rulesVersion === 1) { _printedRound(d, w, false); return; }
  if (w.ammoMax != null && d.ammo[w.id] <= 0) return;
  d.started = true;
  d.weaponId = w.id;
  if (w.ammoMax != null) d.ammo[w.id] -= 1;

  const roll = _roll1d6();
  const stat = w.stat === 'physique' ? d.player.physique : d.player.shooting;
  const dmg = roll + w.bonus + stat;
  d.enemy.life = Math.max(0, d.enemy.life - dmg);
  _appendLog(d, t('battlesim781.log.player_attack', { weapon: w.name, roll, dmg, name: _enemyName(d), life: d.enemy.life }));

  if (!_battleOver(d)) _enemyStrike(d);

  _finishRound(d);
}

function _defend() {
  const { _appendLog, _battleOver, _data, _enemyName, _finishRound, _printedRound, _weapon, t } = getContext();

  const d = _data();
  if (!d || _battleOver(d)) return;
  if (d.rulesVersion === 1) { _printedRound(d, _weapon(d.weaponId), true); return; }
  d.started = true;
  const reduction = Math.max(0, d.player.physique);
  const dmg = Math.max(0, d.enemy.dmg - reduction);
  d.player.life = Math.max(0, d.player.life - dmg);
  _appendLog(d, t('battlesim781.log.defend', { name: _enemyName(d), reduction, dmg, life: d.player.life }));
  _finishRound(d);
}

function _printedRound(d, weapon, defend) {
  const { _appendLog, _enemyName, _finishRound, _roll1d6, mutatedFleshRound, FLESH_RULES, t } = getContext();

  const events = mutatedFleshRound(d, weapon, defend, _roll1d6, FLESH_RULES.victoryFloors);
  if (!events.length) return;
  for (const event of events) {
    const key = event.side === 'player' ? 'battlesim781.log.player_attack' : 'battlesim781.log.enemy_hit';
    _appendLog(d, t(key, {weapon:event.weapon, roll:event.die, dmg:event.damage, name:_enemyName(d), life:event.life}));
  }
  _finishRound(d);
}

function _finishRound(d) {
  const { SVG_SKULL, SVG_TROPHY, _appendLog, _enemyName, _playerLost, _playerWon, _recordOutcome, _renderAll, saveState, t, FLESH_RULES } = getContext();

  if (_playerWon(d)) {
    _appendLog(d, t(d.rulesVersion === 1 && FLESH_RULES.victoryFloors[d.enemyId] > 0 ? 'battlesim781.log.lenova_stop' : 'battlesim781.log.defeated', { trophy: SVG_TROPHY, enemy: _enemyName(d) }));
    _recordOutcome(d, 'win');
  } else if (_playerLost(d)) {
    _appendLog(d, t('battlesim781.log.fallen', { skull: SVG_SKULL, enemy: _enemyName(d) }));
    _recordOutcome(d, 'loss');
  }
  saveState();
  _renderAll();
}

function _resetBattle() {
  const { _appendLog, _data, _enemy, _enemyName, _renderAll, saveState, t } = getContext();

  const d = _data();
  if (!d) return;
  d.enemy = { ..._enemy(d.enemyId) };
  d.rulesVersion = 1;
  d.openingFreeHit = false;
  d.started = false;
  if (d.log.length) _appendLog(d, t('battlesim781.log.reset_sep'));
  _appendLog(d, t('battlesim781.log.reset', { enemy: _enemyName(d) }));
  saveState();
  _renderAll();
}

function _pickEnemy(id) {
  const { _data, _resetBattle } = getContext();

  const d = _data();
  if (!d) return;
  d.enemyId = id;
  _resetBattle();
}

// END EXTRACTED RULES
  return { _weapon, _enemy, _defaultAmmo, _roll1d6, _enemyName, _playerWon, _playerLost, _enemyStrike, _attack, _defend, _printedRound, _finishRound, _resetBattle, _pickEnemy };
}
