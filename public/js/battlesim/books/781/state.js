// Saved-state access and compatibility; UI and persistence callbacks are injected.
export function createState(getContext) {
// BEGIN EXTRACTED RULES
function _data() {
  const { WEAPONS, _defaultAmmo, _enemy, currentPlaythrough } = getContext();

  const pt = currentPlaythrough();
  if (!pt) return null;
  if (!pt.sim781) {
    const first = _enemy('doberman');
    pt.sim781 = {
      enemyId: 'doberman',
      weaponId: 'crowbar',
      player: { life: 40, physique: 1, shooting: 1 },
      enemy: { dmg: first.dmg, life: first.life },
      ammo: _defaultAmmo(),
      started: false,
      rulesVersion: 1,
      log: [],
      history: [],
    };
  }
  const d = pt.sim781;
  if (!d.enemyId) d.enemyId = 'doberman';
  if (!d.weaponId) d.weaponId = 'crowbar';
  if (!d.player) d.player = { life: 40, physique: 1, shooting: 1 };
  if (typeof d.player.life !== 'number') d.player.life = 40;
  if (typeof d.player.physique !== 'number') d.player.physique = 1;
  if (typeof d.player.shooting !== 'number') d.player.shooting = 1;
  if (!d.enemy) d.enemy = { ..._enemy(d.enemyId) };
  if (!d.ammo) d.ammo = _defaultAmmo();
  WEAPONS.forEach(w => { if (w.ammoMax != null && typeof d.ammo[w.id] !== 'number') d.ammo[w.id] = w.ammoMax; });
  if (d.started === undefined) d.started = false;
  if (!d.log) d.log = [];
  if (!d.history) d.history = [];
  return d;
}

function _appendLog(d, line) {

  d.log.push(line);
  if (d.log.length > 200) d.log.shift();
}

function _battleOver(d) {
  const { _playerLost, _playerWon } = getContext();
 return _playerWon(d) || _playerLost(d); }

function _recordOutcome(d, outcome) {
  const { _enemyName } = getContext();

  d.history.push({ enemy: _enemyName(d), outcome, ts: Date.now() });
}
// END EXTRACTED RULES
  return { _data, _appendLog, _battleOver, _recordOutcome };
}
