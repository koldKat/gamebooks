// Saved-state access and compatibility; UI and persistence callbacks are injected.
export function createState(getContext) {
// BEGIN EXTRACTED RULES
function _data() {
  const { DEFAULT_MISSILE_DAMAGE, MAX_ENERGY_TABLETS, MAX_SMART_MISSILES, currentPlaythrough } = getContext();

  const pt = currentPlaythrough();
  if (!pt) return null;
  if (!pt.sim211) {
    pt.sim211 = {
      player: { skill: 0, skillInitial: 0, stamina: 0, staminaInitial: 0, luck: 0, luckInitial: 0, energyTabletsLeft: MAX_ENERGY_TABLETS, money: 5000 },
      ship: { weaponsStrength: 0, weaponsStrengthInitial: 0, shields: 0, shieldsInitial: 0, smartMissiles: MAX_SMART_MISSILES },
      mode: 'handtohand',
      missileDamage: DEFAULT_MISSILE_DAMAGE,
      roundsPerson: 0,
      roundsShip: 0,
      enemy: { name: '', skill: 0, stamina: 0, staminaMax: 0 },
      enemyShip: { name: '', weaponsStrength: 0, shields: 0, shieldsMax: 0 },
      rolled: false,
      log: [],
      history: [],
    };
  }
  const d = pt.sim211;
  if (d.rolled === undefined) d.rolled = false;
  if (d.roundsPerson === undefined) d.roundsPerson = 0;
  if (d.roundsShip === undefined) d.roundsShip = 0;
  if (!d.log) d.log = [];
  if (!d.history) d.history = [];
  if (!d.mode) d.mode = 'handtohand';
  if (d.missileDamage === undefined) d.missileDamage = DEFAULT_MISSILE_DAMAGE;
  if (d.player.energyTabletsLeft === undefined) d.player.energyTabletsLeft = MAX_ENERGY_TABLETS;
  if (d.player.money === undefined) d.player.money = 5000;
  if (!d.ship) d.ship = { weaponsStrength: 0, weaponsStrengthInitial: 0, shields: 0, shieldsInitial: 0, smartMissiles: MAX_SMART_MISSILES };
  if (d.ship.smartMissiles === undefined) d.ship.smartMissiles = MAX_SMART_MISSILES;
  if (!d.enemyShip) d.enemyShip = { name: '', weaponsStrength: 0, shields: 0, shieldsMax: 0 };
  return d;
}

function _notReady(d) {
 return !d.rolled; }

function _appendLog(d, line) {

  d.log.push(line);
  if (d.log.length > 200) d.log.shift();
}

function _recordOutcome(d, side, outcome) {
  const { MODES, _foeName, _selfMaxHp, t } = getContext();

  d.history.push({
    enemy: `${_foeName(d)} (${t(MODES.find(m => m[0] === d.mode)[1])})`,
    outcome,
    statLabel: side.selfHp.toUpperCase(),
    statValue: side.self[side.selfHp], statMax: _selfMaxHp(d, side),
    ts: Date.now(),
  });
}
// END EXTRACTED RULES
  return { _data, _notReady, _appendLog, _recordOutcome };
}
