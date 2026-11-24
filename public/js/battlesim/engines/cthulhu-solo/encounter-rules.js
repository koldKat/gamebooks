import { damageDice, percentileCheck } from './checks.js';
import { classicCheck } from './classic.js';

export function prepareEnemyGroup(spec, enemies, remaining, random = Math.random) {
  const group = spec.rosterRoll;
  if (!group && !spec.enemyHealthRoll) return enemies;
  if (spec.enemyHealthRoll) {
    const hp = damageDice(spec.enemyHealthRoll, random).total;
    return [{ ...enemies[0], hp, maxHp: hp }];
  }
  if (remaining && (!group.allowRemaining || !Number.isInteger(remaining) || remaining < 1 || remaining > group.maximum)) {
    throw new RangeError('Invalid remaining opponents');
  }
  const total = remaining || damageDice(group.dice, random).total;
  const count = Math.floor(total / (group.divide ?? 1));
  return Array.from({ length: count }, (_, index) => ({
    ...enemies[0],
    name: `${enemies[0].name} ${index + 1}`,
  }));
}

export const combatantAvailable = actor => actor.hp > 0 && !actor.fled && !actor.unconscious && !actor.waiting;

export function prepareOpeningFire(fight, random) {
  const opening = fight.spec.openingFireRule;
  if (!opening) return;
  const participants = fight.party.filter((actor, index) => combatantAvailable(actor)
    && (!opening.mainOnly || index === (fight.mainIndex ?? 0)));
  for (const actor of participants) {
    const armed = Boolean(actor.weapons?.rifle && actor.ammo > 0);
    const check = !opening.skill ? null : fight.spec.classicRules
      ? armed ? classicCheck(actor[opening.skill] * (opening.multiplier ?? 1), random) : null
      : percentileCheck(actor[opening.skill], 0, random);
    actor.canFireOpening = Boolean(actor.weapons?.rifle && actor.ammo > 0 && (!check || check.level >= 2));
    if (opening.shots) {
      actor.canFireOpening = armed;
      actor.openingShots = opening.shots + (check?.level >= 2 ? 1 : 0);
    }
    if (check) fight.log.push({ round: 1, side: 'party', index: fight.party.indexOf(actor), openingCheck: check, openingSkill: opening.skill });
  }
  fight.openingFire = participants.some(actor => actor.canFireOpening);
  if (!fight.openingFire && fight.spec.openingOnly) fight.status = 'round-complete';
}

export function admitReinforcements(fight, random) {
  const rule = fight.spec.reinforcements;
  if (!rule || fight.round !== rule.round) return;
  fight.party.forEach((actor, index) => {
    if (!actor.waiting || actor.hp <= 0) return;
    const check = fight.spec.classicRules ? classicCheck(actor[rule.skill], random) : percentileCheck(actor[rule.skill], 0, random);
    actor.waiting = false;
    if (check.level < 2) actor.unconscious = true;
    fight.log.push({ round: fight.round, side: 'party', index, reinforcementCheck: check, reinforcementSkill: rule.skill });
  });
}

export function selectPartyWeapon(fight, index, selection) {
  const actor = fight.party[index];
  if (!fight.spec.expeditionWeapons || !actor.weapons) return;
  const kind = fight.openingFire || fight.spec.riflesOnly ? 'rifle' : selection ?? actor.weaponKind;
  if (!Object.hasOwn(actor.weapons, kind) || kind === 'rifle' && (fight.spec.meleeOnly || fight.spec.openingFireRule && !fight.openingFire)) {
    throw new RangeError('That weapon is unavailable');
  }
  const weapon = actor.weapons[kind];
  actor.weaponKind = kind;
  actor.skill = kind === 'rifle' ? actor.rifle : actor[weapon.skillField ?? 'brawl'];
  actor.damage = weapon.damage;
  if (kind !== 'rifle') actor.counterDamage = weapon.damage;
}

export function resolveManeuver(fight, actor, target, succeeded, round, random) {
  if (fight.spec.maneuver === 'break-hold') {
    if (succeeded) target.fled = true;
    else actor.hp = Math.max(0, actor.hp - damageDice('1D6', random).total);
  } else if (fight.spec.maneuver === 'subdue' && succeeded) {
    if (target.lastManeuverRound === round - 1) target.unconscious = true;
    target.lastManeuverRound = round;
    target.subdued = true;
  }
}

export function distributePartyDamage(fight, target, amount, protectParty) {
  const recipients = fight.party.filter(combatantAvailable);
  const main = fight.party[fight.mainIndex ?? 0];
  if (protectParty && recipients.includes(main)) return [[main, amount]];
  const wounds = new Map();
  for (let point = 0; point < amount; point++) {
    const recipient = recipients.reduce((best, a) => {
      const floor = a === main ? 0 : (fight.spec.companionWoundFloor ?? 0);
      if (a.hp - floor <= (wounds.get(a) ?? 0)) return best;
      const damage = x => (x.startingHp - x.hp) + (wounds.get(x) ?? 0);
      return !best || damage(a) < damage(best) || damage(a) === damage(best) && a === target ? a : best;
    }, null);
    if (!recipient) break;
    wounds.set(recipient, (wounds.get(recipient) ?? 0) + 1);
  }
  return wounds;
}
