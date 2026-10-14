// Saved-state access and compatibility; UI and persistence callbacks are injected.
export function createState(getContext) {
// BEGIN EXTRACTED RULES
function _data() {
  const { currentPlaythrough } = getContext();

  const pt = currentPlaythrough();
  if (!pt) return null;
  if (!pt.sim208) {
    pt.sim208 = {
      skill: 0, skillInitial: 0,
      stamina: 0, staminaInitial: 0,
      luck: 0, luckInitial: 0,
      armour: 0, armourInitial: 0,
      rolled: false,
      mode: 'handtohand', // 'handtohand' | 'gunfire'
      weapon: 'lash', // 'lash' | 'blaster' | 'unarmed' - your gunfire weapon
      enemyWeapon: 'blaster', // enemy's gunfire weapon - defaults to assault blaster per rules p.1
      enemyExtraAttack: false, // §211 Guard Robot fires twice per round
      deityMode: false, // §308 - random weapon table instead of fixed enemy SKILL/weapon
      enemy: { name: '', skill: 0, stamina: 0, staminaMax: 0 },
      roundsThisBattle: 0,
      log: [],
      history: [],
    };
  }
  const d = pt.sim208;
  if (d.skill === undefined) d.skill = 0;
  if (d.skillInitial === undefined) d.skillInitial = 0;
  if (d.stamina === undefined) d.stamina = 0;
  if (d.staminaInitial === undefined) d.staminaInitial = 0;
  if (d.luck === undefined) d.luck = 0;
  if (d.luckInitial === undefined) d.luckInitial = 0;
  if (d.armour === undefined) d.armour = 0;
  if (d.armourInitial === undefined) d.armourInitial = 0;
  if (d.rolled === undefined) d.rolled = false;
  if (d.mode === undefined) d.mode = 'handtohand';
  if (d.weapon === undefined) d.weapon = 'lash';
  if (d.enemyWeapon === undefined) d.enemyWeapon = 'blaster';
  if (d.enemyExtraAttack === undefined) d.enemyExtraAttack = false;
  if (d.deityMode === undefined) d.deityMode = false;
  if (!d.enemy) d.enemy = { name: '', skill: 0, stamina: 0, staminaMax: 0 };
  if (d.roundsThisBattle === undefined) d.roundsThisBattle = 0;
  if (!d.log) d.log = [];
  if (!d.history) d.history = [];
  return d;
}

function _notReady(d) {
 return !d.rolled; }

function _appendLog(d, line) {

  d.log.push(line);
  if (d.log.length > 200) d.log.shift();
}

function _recordOutcome(d, outcome) {
  const { _enemyName } = getContext();

  d.history.push({ enemy: _enemyName(d), outcome, mode: d.mode, ts: Date.now() });
}
// END EXTRACTED RULES
  return { _data, _notReady, _appendLog, _recordOutcome };
}
