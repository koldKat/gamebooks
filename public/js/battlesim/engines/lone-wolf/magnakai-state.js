// Keep one Magnakai encounter history and character inside its original book/run.
export function createMagnakaiState(definition, getContext) {
  function data() {
    const context = getContext();
    if (Number(context.currentBookId) !== definition.id) return null;
    const run = context.currentPlaythrough();
    if (!run) return null;
    if (!run[definition.stateKey]) run[definition.stateKey] = {
      schemaVersion: 1, combatSkill: 0, combatSkillInitial: 0,
      endurance: 0, enduranceInitial: 0, attackModifier: 0, potions: 0,
      rolled: false, printedRules: 1, combatEffects: {}, ratio: 0,
      enemy: {name: '', skill: 0, endurance: 0, enduranceMax: 0},
      roundsThisBattle: 0, recordedThisBattle: false, log: [], history: [],
    };
    const value = run[definition.stateKey];
    if (value.schemaVersion !== 1) throw new RangeError('Unsupported simulator state');
    return value;
  }
  function appendLog(value, message) {
    value.log.push(message);
    value.log = value.log.slice(-160);
  }
  function recordOutcome(value, outcome) {
    if (value.recordedThisBattle) return;
    value.recordedThisBattle = true;
    value.history.push({enemy: value.enemy.name, outcome,
      ts: Math.max(Date.now(), (value.history.at(-1)?.ts ?? 0) + 1)});
    value.history = value.history.slice(-200);
  }
  function battleOver(value) {
    const {health} = getContext();
    return !value.rolled || health(value) <= 0 || value.enemy.endurance <= 0 || !!value.combatEffects?.finished;
  }
  function potion(value) {
    if (!battleOver(value) || value.roundsThisBattle === 0 || value.endurance <= 0 || value.potions < 1) throw new RangeError('Potion unavailable');
    const restored = Math.min(4, value.enduranceInitial - value.endurance);
    if (restored <= 0) throw new RangeError('Endurance already full');
    value.endurance += restored;
    value.potions--;
    return restored;
  }
  return {data, appendLog, recordOutcome, battleOver, potion};
}
