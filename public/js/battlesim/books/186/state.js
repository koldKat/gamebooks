// Saved-state access and compatibility; UI and persistence callbacks are injected.
export function createState(getContext) {
// BEGIN EXTRACTED RULES
function _data() {
  const { CREW, _freshCrewMember, currentPlaythrough } = getContext();

  const pt = currentPlaythrough();
  if (!pt) return null;
  if (!pt.sim186) {
    pt.sim186 = {
      crew: Object.fromEntries(CREW.map(([key]) => [key, _freshCrewMember()])),
      luck: 0, luckInitial: 0,
      ship: { weapons: 0, weaponsInitial: 0, shields: 0, shieldsInitial: 0 },
      rolled: false,
      shipCombatRulesVersion: 2,
      mode: 'handtohand', // 'handtohand' | 'phaser' | 'ship'
      fighterKey: 'captain',
      hasHelmet: false, // sec 268-269: an advanced alien helmet, +1 SKILL while worn - persistent equipment, not a per-encounter knob
      waiveOfficerPenalty: false, // sec 241 Manslayer Robot arena fight explicitly waives the -3 - can't be worked around by bumping SKILL since the stepper clamps at skillInitial
      attackModifier: 0,
      enemyDamageVariant: 'normal', // 'normal' | 'nerve' (Qualk-Test-style: 1d6, 4-6=4dmg, 1-3=2dmg)
      playerDamageVariant: 'normal', // 'normal' | 'armor' (Manslayer-style: 1d6, 5-6=1dmg, 1-4=0dmg)
      enemyExtraAttack: false, // enemy rolls its Attack Strength twice per round (sec 49/297 guard)
      phaserSetting: 'kill', // 'stun' | 'kill' - informational/log only, no mechanical difference
      enemyFiresFirst: false, // phaser/ship only - "you fire first unless told otherwise" (e.g. the Terryals, sec 54, fire first)
      extraAttacker: false,
      extraTarget: 'enemy', // 'enemy' | 'you'
      extraSkill: 0,
      enemy: { name: '', skill: 0, stamina: 0, staminaMax: 0 },
      enemyShip: { name: '', weapons: 0, shields: 0, shieldsMax: 0 },
      roundsThisBattle: 0,
      log: [],
      history: [],
    };
  }
  const d = pt.sim186;
  if (!d.crew) d.crew = {};
  for (const [key] of CREW) {
    if (!d.crew[key]) d.crew[key] = _freshCrewMember();
    const c = d.crew[key];
    if (c.alive === undefined) c.alive = true;
    if (c.replaced === undefined) c.replaced = false;
  }
  if (d.luck === undefined) d.luck = 0;
  if (d.luckInitial === undefined) d.luckInitial = 0;
  if (!d.ship) d.ship = { weapons: 0, weaponsInitial: 0, shields: 0, shieldsInitial: 0 };
  if (d.rolled === undefined) d.rolled = false;
  if (d.mode === undefined) d.mode = 'handtohand';
  if (d.fighterKey === undefined) d.fighterKey = 'captain';
  if (d.hasHelmet === undefined) d.hasHelmet = false;
  if (d.waiveOfficerPenalty === undefined) d.waiveOfficerPenalty = false;
  if (d.attackModifier === undefined) d.attackModifier = 0;
  if (d.enemyDamageVariant === undefined) d.enemyDamageVariant = 'normal';
  if (d.playerDamageVariant === undefined) d.playerDamageVariant = 'normal';
  if (d.enemyExtraAttack === undefined) d.enemyExtraAttack = false;
  if (d.phaserSetting === undefined) d.phaserSetting = 'kill';
  if (d.enemyFiresFirst === undefined) d.enemyFiresFirst = false;
  if (d.extraAttacker === undefined) d.extraAttacker = false;
  if (d.extraTarget === undefined) d.extraTarget = 'enemy';
  if (d.extraSkill === undefined) d.extraSkill = 0;
  if (!d.enemy) d.enemy = { name: '', skill: 0, stamina: 0, staminaMax: 0 };
  if (!d.enemyShip) d.enemyShip = { name: '', weapons: 0, shields: 0, shieldsMax: 0 };
  if (d.roundsThisBattle === undefined) d.roundsThisBattle = 0;
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
  const { _enemyName, _fighterLabel } = getContext();

  d.history.push({
    enemy: d.mode === 'ship' ? (d.enemyShip.name.trim() || 'the alien ship') : _enemyName(d),
    outcome, mode: d.mode,
    fighter: d.mode === 'ship' ? 'Ship' : _fighterLabel(d),
    ts: Date.now(),
  });
}
// END EXTRACTED RULES
  return { _data, _notReady, _appendLog, _recordOutcome };
}
