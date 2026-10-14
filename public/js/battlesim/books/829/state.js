// Saved-state access and compatibility; UI and persistence callbacks are injected.
export function createState(getContext) {
// BEGIN EXTRACTED RULES
function _data() {
  const { _equipmentBaseStats, currentPlaythrough, quailStart } = getContext();

  const pt = currentPlaythrough();
  if (!pt) return null;
  if (!pt.sim829) {
    // Seed А/З from equipped weapon/armor as a starting point - like an
    // enemy autocomplete fill, the fields stay fully editable afterward.
    const { baseA, baseD } = _equipmentBaseStats(pt);
    pt.sim829 = {
      player: {
        a: baseA, d: baseD, hp: 12, hpMax: 12,
        skills: { weapon: 0, parry: 0, endurance: false, archery: 0, throwing: false },
        ranged: { weaponKey: '', type: 'bow', attempts: 0, magicT: 0, magicDmg: 0 },
      },
      enemy:  { name: '', a: 0, d: 0, hp: 12, hpMax: 12, pb: 0 },
      log: [],
      history: [],
    };
    quailStart(pt.sim829);
  }
  if (!pt.sim829.history) pt.sim829.history = [];
  if (pt.sim829.enemy.pb === undefined) pt.sim829.enemy.pb = 0;
  if (pt.sim829.player.hp === undefined) pt.sim829.player.hp = 12;
  if (!pt.sim829.player.skills) {
    pt.sim829.player.skills = { weapon: 0, parry: 0, endurance: false, archery: 0, throwing: false };
  }
  if (!pt.sim829.player.ranged) {
    pt.sim829.player.ranged = { weaponKey: '', type: 'bow', attempts: 0, magicT: 0, magicDmg: 0 };
  }
  return pt.sim829;
}

function _appendLog(d, line) {

  d.log.push(line);
  if (d.log.length > 200) d.log.shift();
}

function _recordOutcome(d, outcome) {
  const { _enemyName } = getContext();

  d.history.push({
    enemy: _enemyName(d),
    outcome, // 'win' | 'loss'
    enemyA: d.enemy.a, enemyD: d.enemy.d, enemyHpMax: d.enemy.hpMax, enemyPb: d.enemy.pb,
    playerHp: d.player.hp, playerHpMax: d.player.hpMax,
    ts: Date.now(),
  });
}
// END EXTRACTED RULES
  return { _data, _appendLog, _recordOutcome };
}
