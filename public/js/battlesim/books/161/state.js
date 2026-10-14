// Saved-state access and compatibility; UI and persistence callbacks are injected.
export function createState(getContext) {
// BEGIN EXTRACTED RULES
function _data() {
  const { currentPlaythrough } = getContext();

  const pt = currentPlaythrough();
  if (!pt) return null;
  if (!pt.sim161) {
    pt.sim161 = {
      mode: 'horde', // 'horde' | 'duel'
      playerStamina: 27, playerStaminaMax: 27,
      weaponId: 'handgun', diceN: 1, diceSides: 6, diceMod: 2,
      enemyCount: 10, retaliation: 1,
      duelEnemyStamina: 7, duelEnemyStaminaMax: 7,
      duelPlayerDiceN: 1, duelPlayerDiceSides: 6, duelPlayerDiceMod: -3,
      duelEnemyDiceN: 1, duelEnemyDiceSides: 6, duelEnemyDiceMod: -3,
      medkitAmount: 4,
      over: false, winner: null, started: false, log: [], history: [],
    };
  }
  const d = pt.sim161;
  if (d.mode !== 'horde' && d.mode !== 'duel') d.mode = 'horde';
  if (typeof d.playerStamina !== 'number') d.playerStamina = 27;
  if (typeof d.playerStaminaMax !== 'number') d.playerStaminaMax = 27;
  if (!d.weaponId) d.weaponId = 'handgun';
  if (typeof d.diceN !== 'number') d.diceN = 1;
  if (typeof d.diceSides !== 'number') d.diceSides = 6;
  if (typeof d.diceMod !== 'number') d.diceMod = 2;
  if (typeof d.enemyCount !== 'number') d.enemyCount = 10;
  if (typeof d.retaliation !== 'number') d.retaliation = 1;
  if (typeof d.duelEnemyStamina !== 'number') d.duelEnemyStamina = 7;
  if (typeof d.duelEnemyStaminaMax !== 'number') d.duelEnemyStaminaMax = 7;
  if (typeof d.duelPlayerDiceN !== 'number') d.duelPlayerDiceN = 1;
  if (typeof d.duelPlayerDiceSides !== 'number') d.duelPlayerDiceSides = 6;
  if (typeof d.duelPlayerDiceMod !== 'number') d.duelPlayerDiceMod = -3;
  if (typeof d.duelEnemyDiceN !== 'number') d.duelEnemyDiceN = 1;
  if (typeof d.duelEnemyDiceSides !== 'number') d.duelEnemyDiceSides = 6;
  if (typeof d.duelEnemyDiceMod !== 'number') d.duelEnemyDiceMod = -3;
  if (typeof d.medkitAmount !== 'number') d.medkitAmount = 4;
  if (d.over === undefined) d.over = false;
  if (d.started === undefined) d.started = false;
  if (!d.log) d.log = [];
  if (!d.history) d.history = [];
  return d;
}

function _appendLog(d, line) {
 d.log.push(line); if (d.log.length > 300) d.log.shift(); }

function _recordOutcome(d, outcome) {
 d.history.push({ mode: d.mode, outcome, ts: Date.now() }); }
// END EXTRACTED RULES
  return { _data, _appendLog, _recordOutcome };
}
