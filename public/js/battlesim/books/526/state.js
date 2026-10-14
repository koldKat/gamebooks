// Saved-state access and compatibility; UI and persistence callbacks are injected.
export function createState(getContext) {
// BEGIN EXTRACTED RULES
function _data() {
  const { DEFAULT_HIT_REQ, currentPlaythrough } = getContext();

  const pt = currentPlaythrough();
  if (!pt) return null;
  if (!pt.sim526) {
    pt.sim526 = {
      life: 0, lifeInitial: 0,
      hitReq: DEFAULT_HIT_REQ,
      damageBonus: 0,
      armour: 0,
      rolled: false,
      enemy: { name: '', hitReq: DEFAULT_HIT_REQ, damageBonus: 0, armour: 0, life: 0, lifeMax: 0 },
      roundsThisBattle: 0,
      log: [],
      history: [],
    };
  }
  const d = pt.sim526;
  if (d.life === undefined) d.life = 0;
  if (d.lifeInitial === undefined) d.lifeInitial = 0;
  if (d.hitReq === undefined) d.hitReq = DEFAULT_HIT_REQ;
  if (d.damageBonus === undefined) d.damageBonus = 0;
  if (d.armour === undefined) d.armour = 0;
  if (d.rolled === undefined) d.rolled = false;
  if (!d.enemy) d.enemy = { name: '', hitReq: DEFAULT_HIT_REQ, damageBonus: 0, armour: 0, life: 0, lifeMax: 0 };
  if (d.enemy.hitReq === undefined) d.enemy.hitReq = DEFAULT_HIT_REQ;
  if (d.enemy.damageBonus === undefined) d.enemy.damageBonus = 0;
  if (d.enemy.armour === undefined) d.enemy.armour = 0;
  if (d.roundsThisBattle === undefined) d.roundsThisBattle = 0;
  if (!d.log) d.log = [];
  if (!d.history) d.history = [];
  return d;
}

function _appendLog(d, line) {

  d.log.push(line);
  if (d.log.length > 200) d.log.shift();
}

function _recordOutcome(d, outcome) {
  const { _enemyName } = getContext();

  d.history.push({ enemy: _enemyName(d), outcome, ts: Date.now() });
}
// END EXTRACTED RULES
  return { _data, _appendLog, _recordOutcome };
}
