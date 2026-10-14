// Saved-state access and compatibility; UI and persistence callbacks are injected.
export function createState(getContext) {
// BEGIN EXTRACTED RULES
function _data() {
  const { currentPlaythrough } = getContext();

  const pt = currentPlaythrough();
  if (!pt) return null;
  if (!pt.sim8) {
    pt.sim8 = {
      player:   { skill: 2, life: 18, lifeMax: 18 },
      enemy:    { name: '', skill: 3, life: 6, lifeMax: 6, foeFirst: false },
      round:    1,
      log:      [],
      history:  [],
      items:    { bow: false, arrows: 0, axe: false, potion: false, chainmail: false },
      bowFired: false,
      sixWins:  false,
    };
  }
  if (pt.sim8.round    == null) pt.sim8.round    = 1;
  if (!pt.sim8.items)           pt.sim8.items    = { bow: false, arrows: 0, axe: false, potion: false };
  if (pt.sim8.bowFired == null) pt.sim8.bowFired = false;
  return pt.sim8;
}

function _appendLog(d, html) {

  d.log.push(html);
  if (d.log.length > 200) d.log.shift();
}

function _recordOutcome(d, outcome) {
  const { _enemyName } = getContext();

  d.history.push({
    enemy: _enemyName(d), outcome,
    playerLife: d.player.life, playerLifeMax: d.player.lifeMax,
    ts: Date.now(),
  });
}
// END EXTRACTED RULES
  return { _data, _appendLog, _recordOutcome };
}
