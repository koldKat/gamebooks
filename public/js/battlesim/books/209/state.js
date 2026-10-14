// Saved-state access and compatibility; UI and persistence callbacks are injected.
export function createState(getContext) {
// BEGIN EXTRACTED RULES
function _data() {
  const { MAX_MEDKIT, MAX_OIL, MAX_ROCKETS, MAX_SPIKES, currentPlaythrough } = getContext();

  const pt = currentPlaythrough();
  if (!pt) return null;
  if (!pt.sim209) {
    pt.sim209 = {
      player: { skill: 0, skillInitial: 0, stamina: 0, staminaInitial: 0, luck: 0, luckInitial: 0, medKitLeft: MAX_MEDKIT },
      car: { firepower: 0, firepowerInitial: 0, armour: 0, armourInitial: 0, rockets: MAX_ROCKETS, spikes: MAX_SPIKES, oil: MAX_OIL },
      mode: 'hand',
      handDmg: 1,
      playerHandLoss: 0, enemyHandLoss: 0,
      enemy: { name: '', skill: 0, stamina: 0, staminaMax: 0 },
      enemyCar: { name: '', firepower: 0, armour: 0, armourMax: 0 },
      rolled: false,
      roundsPerson: 0,
      roundsVehicle: 0,
      log: [],
      history: [],
    };
  }
  const d = pt.sim209;
  if (d.rolled === undefined) d.rolled = false;
  // Track combat separately for person and vehicle pools so mode switches preserve in-progress guards.
  if (d.roundsPerson === undefined) d.roundsPerson = d.roundsThisBattle ?? 0;
  if (d.roundsVehicle === undefined) d.roundsVehicle = 0;
  delete d.roundsThisBattle;
  if (!d.log) d.log = [];
  if (!d.history) d.history = [];
  if (!d.mode) d.mode = 'hand';
  if (d.handDmg === undefined) d.handDmg = 1;
  if (d.playerHandLoss === undefined) d.playerHandLoss = 0;
  if (d.enemyHandLoss === undefined) d.enemyHandLoss = 0;
  if (d.player.medKitLeft === undefined) d.player.medKitLeft = MAX_MEDKIT;
  if (!d.car) d.car = { firepower: 0, firepowerInitial: 0, armour: 0, armourInitial: 0, rockets: MAX_ROCKETS, spikes: MAX_SPIKES, oil: MAX_OIL };
  if (d.car.rockets === undefined) d.car.rockets = MAX_ROCKETS;
  if (d.car.spikes === undefined) d.car.spikes = MAX_SPIKES;
  if (d.car.oil === undefined) d.car.oil = MAX_OIL;
  if (!d.enemyCar) d.enemyCar = { name: '', firepower: 0, armour: 0, armourMax: 0 };
  return d;
}

function _notReady(d) {
 return !d.rolled; }

function _appendLog(d, line) {

  d.log.push(line);
  if (d.log.length > 200) d.log.shift();
}

function _recordOutcome(d, side, outcome, note) {
  const { MODES, _foeName, t } = getContext();

  d.history.push({
    enemy: `${_foeName(d)} (${t(MODES.find(m => m[0] === d.mode)[1])}${note ? `, ${note}` : ''})`,
    outcome,
    statLabel: side.selfHp.toUpperCase(),
    statValue: side.self[side.selfHp], statMax: side.self[side.selfHpMax],
    ts: Date.now(),
  });
}
// END EXTRACTED RULES
  return { _data, _notReady, _appendLog, _recordOutcome };
}
