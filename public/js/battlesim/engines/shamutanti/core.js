import { SHAMUTANTI_FIGHTS, SHAMUTANTI_NIGHT_ENEMIES, SHAMUTANTI_RULES } from './roster.js';
import { customFightingEncounter } from '../fighting-fantasy/opponents.js';

const clone = value => structuredClone(value);
function integer(value, min = 0, max = 10000) {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new RangeError('Invalid Shamutanti value');
  return value;
}
function die(roll = () => Math.floor(Math.random() * 6) + 1) { return integer(roll(6), 1, 6); }
function dice(roll) { return die(roll) + die(roll); }

export function validateShamutantiCharacter(character, alive = false) {
  if (!character || !['warrior', 'wizard'].includes(character.role)) throw new RangeError('Invalid character');
  for (const key of ['skill', 'stamina', 'luck']) {
    integer(character[key], alive && key === 'stamina' ? 1 : 0);
    integer(character[key + 'Initial'], 1);
  }
  integer(character.provisions);
  integer(character.gold);
  integer(character.attackModifier, -1000, 1000);
  if (!['sword', 'scimitar', 'axe', 'specialSword'].includes(character.weapon)) throw new RangeError('Invalid weapon');
  for (const key of ['ragnarBand', 'cursed', 'libraUsed']) {
    if (typeof character[key] !== 'boolean') throw new RangeError('Invalid character flag');
  }
  for (const key of ['luckCharm', 'janPresent']) {
    if (character[key] !== undefined && typeof character[key] !== 'boolean') throw new RangeError('Invalid character flag');
  }
  return character;
}

export function newShamutantiCharacter(role = 'warrior', roll) {
  if (!['warrior', 'wizard'].includes(role)) throw new RangeError('Invalid class');
  const skill = die(roll) + (role === 'wizard' ? 4 : 6), stamina = dice(roll) + 12, luck = die(roll) + 6;
  return { role, skill, skillInitial: skill, stamina, staminaInitial: stamina, luck, luckInitial: luck,
    provisions: 2, gold: 20, weapon: 'sword', attackModifier: 0, ragnarBand: false, luckCharm: false, janPresent: false, cursed: false, libraUsed: false };
}

export function startShamutantiFight(section, character, options = {}, roll) {
  validateShamutantiCharacter(character, true);
  const spec = SHAMUTANTI_FIGHTS.find(item => item.section === section) ?? customFightingEncounter(section, options.opponents);
  if (!spec || (spec.spell && (character.role !== 'wizard' || character.janPresent))) throw new RangeError('Invalid encounter');
  const { applyEntry = true, summonCount = spec.summon?.multiple ? 0 : 1,
    previousSection = null, nightModifier = 0, nightResult = null, skillOverride = null, carryFrom = null } = options;
  if (typeof applyEntry !== 'boolean') throw new RangeError('Invalid entry setting');
  integer(summonCount, 0, 100);
  if (skillOverride !== null) integer(skillOverride, 0, 1000);
  const fight = { rulesRevision: 1, config: clone(spec), character: clone(character),
    enemies: clone(spec.enemies), allies: [], enemy: 0, ally: 0, rounds: 0,
    status: 'fighting', pending: null, events: [], destination: null, skillOverride,
    enemySkillOverride: null, enemySkillOverrideEnemy: null };
  if (carryFrom) {
    if (carryFrom.rulesRevision !== 1 || carryFrom.status !== 'otherSpell' || !carryFrom.config?.otherSpell
      || carryFrom.pending || currentAlly(carryFrom) || carryFrom.enemies.length !== 1 || fight.enemies.length !== 1
      || carryFrom.enemies[0].name !== fight.enemies[0].name) throw new RangeError('Invalid encounter handoff');
    fight.enemies[0].stamina = integer(carryFrom.enemies[0].stamina, 1, fight.enemies[0].stamina);
    fight.events.push({ kind: 'carriedWounds', stamina: fight.enemies[0].stamina });
  }
  if (spec.night) {
    integer(previousSection, 1, SHAMUTANTI_RULES.night.maxPreviousSection);
    integer(nightModifier, 0, Math.max(...SHAMUTANTI_RULES.night.modifiers));
    if (!SHAMUTANTI_RULES.night.modifiers.includes(nightModifier)) throw new RangeError('Invalid night modifier');
    if (nightResult !== null) integer(nightResult, 1, 6);
    const result = (nightResult ?? die(roll)) + nightModifier;
    const foe = SHAMUTANTI_NIGHT_ENEMIES[result - 1];
    fight.config.win = previousSection;
    fight.events.push({ kind: 'nightRoll', result });
    if (foe) fight.enemies = [clone(foe)];
    else { fight.status = 'noEncounter'; fight.destination = previousSection; return fight; }
  }
  if (spec.shield && applyEntry && character.gold < 1) throw new RangeError('Shield requires a coin');
  if (spec.wax && !['sword', 'specialSword'].includes(character.weapon)) throw new RangeError('Wax requires a sword');
  if (spec.summon) {
    if ((!spec.summon.multiple && summonCount !== 1)
      || (spec.summon.multiple && !spec.missingSummonCost && summonCount === 0)) throw new RangeError('Invalid summon count');
    fight.allies = Array.from({ length: summonCount }, () => ({ ...spec.summon }));
  }
  if (applyEntry) {
    const cost = spec.summon?.multiple ? (summonCount || spec.missingSummonCost || 0) : (spec.entryCost || 0);
    const loss = cost + (!spec.spell && cost > 0 && character.cursed ? 1 : 0);
    fight.character.stamina = Math.max(0, fight.character.stamina - loss);
    if (spec.shield) fight.character.gold--;
    fight.events.push({ kind: 'entry', stamina: loss, gold: spec.shield ? 1 : 0 });
  }
  if (!fight.character.stamina) { fight.status = 'loss'; return fight; }
  if (spec.morale) {
    for (const foe of fight.enemies) {
      const total = dice(roll);
      foe.fled = total >= foe.skill;
      fight.events.push({ kind: 'morale', name: foe.name, total, fled: foe.fled });
    }
    if (fight.enemies.every(foe => foe.fled)) {
      fight.status = 'allFled'; fight.destination = spec.allFled; return fight;
    }
  }
  complete(fight);
  return fight;
}

function requireFight(fight) {
  if (!fight || fight.rulesRevision !== 1 || fight.status !== 'fighting') throw new RangeError('No active fight');
  validateShamutantiCharacter(fight.character, true);
}
function currentAlly(fight) { return fight.allies[fight.ally] || null; }
function complete(fight) {
  if (fight.pending) return;
  if (!fight.character.stamina) { fight.status = 'loss'; return; }
  while (fight.allies[fight.ally]?.stamina === 0) fight.ally++;
  while (fight.enemy < fight.enemies.length &&
    (fight.enemies[fight.enemy].stamina === 0 || fight.enemies[fight.enemy].fled)) fight.enemy++;
  if (fight.enemy === fight.enemies.length) {
    fight.status = 'win'; fight.destination = fight.config.win;
  }
}
function playerSkill(fight) {
  if (fight.skillOverride !== null) return fight.skillOverride;
  const c = fight.character;
  return c.skill * (fight.config.playerSkillMultiplier || 1);
}
function weaponModifier(character) {
  return (character.weapon === 'scimitar' ? 1 : character.weapon === 'axe' ? -1 : 0)
    + (character.ragnarBand && ['sword', 'specialSword'].includes(character.weapon) ? 2 : 0);
}
function applyHit(fight, hit, lucky = null) {
  let amount = hit.damage;
  if (lucky !== null) {
    if (hit.direction === 'outgoing') amount += lucky ? 2 : -1;
    else amount = hit.poison && lucky ? SHAMUTANTI_RULES.sting.luckyDamage : amount + (lucky ? -1 : 1);
  }
  if (hit.direction === 'outgoing') {
    if (!hit.ally && fight.config.wax) amount *= 2;
    fight.enemies[fight.enemy].stamina = Math.max(0, fight.enemies[fight.enemy].stamina - amount);
  } else if (hit.ally) {
    const ally = currentAlly(fight);
    ally.stamina = hit.fatal ? 0 : Math.max(0, ally.stamina - amount);
  } else {
    if (amount > 0 && fight.character.cursed) amount++;
    fight.character.stamina = Math.max(0, fight.character.stamina - amount);
  }
  fight.events.push({ kind: 'damage', ...hit, amount });
  complete(fight);
}

export function shamutantiRound(input, roll) {
  requireFight(input);
  if (input.pending) throw new RangeError('Resolve pending damage');
  const fight = clone(input), spec = fight.config, ally = currentAlly(fight), foe = fight.enemies[fight.enemy];
  fight.events = []; fight.rounds++;
  let enemySkill = foe.skill;
  const manualEnemy = fight.enemySkillOverride != null && fight.enemySkillOverrideEnemy === fight.enemy;
  if (spec.temporaryEnemySkill && fight.rounds <= spec.temporaryEnemySkill.rounds) enemySkill = spec.temporaryEnemySkill.skill;
  if (spec.recoveringWeapon && fight.rounds > SHAMUTANTI_RULES.recovery.afterRound && !manualEnemy) {
    const recovery = die(roll);
    enemySkill = recovery % 2 ? SHAMUTANTI_RULES.recovery.oddSkill : SHAMUTANTI_RULES.recovery.evenSkill;
    fight.events.push({ kind: 'weaponRecovery', roll: recovery, skill: enemySkill });
  }
  if (manualEnemy) enemySkill = fight.enemySkillOverride;
  const playerAttack = dice(roll) + (ally ? ally.skill : playerSkill(fight) + weaponModifier(fight.character)
    + fight.character.attackModifier + (spec.playerAttack || 0));
  const enemyAttack = dice(roll) + enemySkill + (spec.enemyAttack || 0) - (spec.shield ? 2 : 0);
  fight.events.push({ kind: 'attack', playerAttack, enemyAttack, enemySkill, ally: !!ally });
  if (playerAttack === enemyAttack) return fight;
  const outgoing = playerAttack > enemyAttack;
  const hit = { direction: outgoing ? 'outgoing' : 'incoming', ally: !!ally,
    damage: outgoing && !ally && fight.character.weapon === 'specialSword' ? 3 : 2 };
  if (!outgoing && spec.sting) {
    const sting = die(roll);
    hit.poison = sting >= SHAMUTANTI_RULES.sting.minRoll;
    if (hit.poison) {
      hit.damage = SHAMUTANTI_RULES.sting.damage;
      hit.fatal = !!ally && !!spec.goblinStingFatal;
    }
    fight.events.push({ kind: 'sting', roll: sting, poison: hit.poison });
  }
  if (!ally && fight.character.luck > 0) fight.pending = hit;
  else applyHit(fight, hit);
  return fight;
}

export function setShamutantiEnemySkill(input, skill) {
  requireFight(input);
  if (input.pending) throw new RangeError('Resolve pending damage');
  if (skill !== null) integer(skill, 0, 1000);
  const fight = clone(input);
  fight.enemySkillOverride = skill;
  fight.enemySkillOverrideEnemy = skill === null ? null : fight.enemy;
  fight.events = [{ kind: 'enemyOverride', skill }];
  return fight;
}

export function resolveShamutantiLuck(input, useLuck, roll) {
  requireFight(input);
  if (!input.pending || typeof useLuck !== 'boolean') throw new RangeError('No pending damage');
  if (useLuck && input.character.luck === 0) throw new RangeError('No Luck');
  const fight = clone(input), hit = fight.pending;
  fight.pending = null; fight.events = [];
  let lucky = null;
  if (useLuck) {
    const rawRoll = dice(roll), modifier = fight.character.luckCharm ? -1 : 0, total = rawRoll + modifier;
    lucky = total <= fight.character.luck;
    fight.character.luck--;
    fight.events.push({ kind: 'luck', roll: total, rawRoll, modifier, lucky });
  }
  applyHit(fight, hit, lucky);
  return fight;
}

export function canSpareShamutanti(fight) {
  const mercy = fight?.config?.mercy;
  return !!mercy && fight.status === 'fighting' && !fight.pending
    && fight.enemies[fight.enemy].stamina <= mercy.enemyMaximum && fight.character.stamina >= mercy.playerMinimum;
}
export function spareShamutanti(input) {
  requireFight(input);
  if (!canSpareShamutanti(input)) throw new RangeError('Cannot spare opponent');
  const fight = clone(input);
  fight.status = 'spared'; fight.destination = fight.config.mercy.section;
  return fight;
}
export function shamutantiOtherSpell(input) {
  requireFight(input);
  if (input.pending || currentAlly(input) || !input.config.otherSpell) throw new RangeError('Cannot change spell');
  const fight = clone(input);
  fight.status = 'otherSpell'; fight.destination = fight.config.otherSpell;
  return fight;
}
export function healShamutantiCharacter(character, method, amount = 2) {
  validateShamutantiCharacter(character, true);
  const next = clone(character);
  if (method === 'meal') {
    integer(amount, 1, 3);
    if (!next.provisions || next.stamina >= next.staminaInitial) throw new RangeError('Cannot eat');
    next.provisions--;
    next.stamina = Math.min(next.staminaInitial, next.stamina + amount);
  } else if (method === 'libra') {
    if (next.libraUsed) throw new RangeError('Libra already used');
    next.libraUsed = true;
    for (const key of ['skill', 'stamina', 'luck']) next[key] = next[key + 'Initial'];
  } else throw new RangeError('Invalid healing method');
  return next;
}
