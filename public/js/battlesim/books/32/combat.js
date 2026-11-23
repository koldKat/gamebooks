export const statKeys = ['strength', 'speed', 'skill', 'sense', 'armor', 'hp'];
const die = () => Math.floor(Math.random() * 6) + 1;
const hasItems = (items, required) => required.every(item => items.includes(item));

export function makePlayer(hero) {
  const values = hero.attributes ?? [4, 3, 3, 3, 1, 20];
  return {
    hero: hero.section,
    ...Object.fromEntries(statKeys.map((key, index) => [key, values[index]])),
    initialGear: true,
    choices: hero.selections.map(() => []),
    items: [...hero.fixedItems],
  };
}

export function validatePlayer(player, setup) {
  const hero = setup.heroes.find(entry => entry.section === player.hero);
  if (!hero || statKeys.some(key => !Number.isSafeInteger(player[key]) || player[key] < (key === 'armor' ? 0 : 1) || player[key] > 1000)) return false;
  if (!player.initialGear) return true;
  if (!hero.attributes) {
    const {total, minimum, maximum, armorMinimum, armorMaximum} = setup.allocation;
    const attributes = statKeys.slice(0, 4).map(key => player[key]);
    if (attributes.some(value => value < minimum || value > maximum) ||
      player.armor < armorMinimum || player.armor > armorMaximum ||
      attributes.reduce((sum, value) => sum + value, player.armor) !== total) return false;
  }
  return hero.selections.every(({pick, options}, index) => {
    const chosen = player.choices[index];
    return chosen?.length === pick && new Set(chosen).size === pick && chosen.every(choice => options[choice]);
  });
}

export function meleeOptions(setup, items, encounter) {
  return setup.weapons.filter(weapon => !weapon.special && hasItems(items, weapon.items) &&
    !weapon.items.some(item => encounter?.prohibited?.includes(item)));
}

export function openingAvailable(setup, opening, items, encounter) {
  const weapon = setup.weapons.find(row => row.id === opening.weapon);
  return (!opening.weapon || (weapon && hasItems(items, weapon.items))) &&
    (!opening.discard || meleeOptions(setup, items.filter(item => item !== opening.discard), encounter).length > 0);
}

export function automaticOpenings(setup, encounter, items) {
  const groups = new Map();
  for (const opening of encounter?.openings ?? []) {
    if (opening.automatic && !groups.has(opening.group) && openingAvailable(setup, opening, items, encounter)) {
      groups.set(opening.group, {id:opening.id});
    }
  }
  return [...groups.values()];
}

const attackValue = (player, weapon) => weapon.formula.reduce((total, key) => total + player[key], 0);
const firstLiving = opponents => opponents.findIndex(enemy => enemy.hp > 0);
const hasAny = (items, keys) => keys?.some(key => items.includes(key)) ?? false;

export function startFight({player, setup, encounter, enemies, weaponId, shield, openings = []}, roll = die) {
  if (!validatePlayer(player, setup) || !enemies.length || enemies.some(enemy =>
    ![enemy.hp, enemy.attack, enemy.damageDice, enemy.damageBonus].every(Number.isSafeInteger) ||
    enemy.hp < 0 || enemy.attack < 0 || enemy.damageDice < 1 || enemy.damageDice > 2 ||
    enemy.damageBonus < 0 || !enemy.name.trim())) throw new RangeError('Invalid combat setup');
  const fight = {
    player: structuredClone(player),
    opponent: {name: encounter?.name ?? enemies.map(enemy => enemy.name).join(', '), section: encounter?.section ?? null},
    opponents: structuredClone(enemies),
    round: 0,
    log: [],
    status: 'fighting',
    effects: encounter?.effects ?? {},
  };
  let items = [...player.items];
  const used = new Set();
  for (const action of [...automaticOpenings(setup, encounter, items), ...openings]) {
    if (firstLiving(fight.opponents) < 0) break;
    const opening = encounter?.openings?.find(option => option.id === action.id);
    if (!opening || used.has(opening.group) || !openingAvailable(setup, opening, items, encounter)) throw new RangeError('Invalid opening attack');
    used.add(opening.group);
    const target = fight.opponents[opening.targeted ? action.target : firstLiving(fight.opponents)];
    if (!target || target.hp === 0) throw new RangeError('Invalid opening target');
    const weapon = setup.weapons.find(row => row.id === opening.weapon);
    const score = opening.threshold ? attackValue(player, weapon) + roll() : null;
    let damage = score === null || score >= opening.threshold ? opening.damage : 0;
    if (opening.removeAt !== undefined && score >= opening.removeAt) damage = target.hp;
    damage = Math.min(target.hp, damage);
    target.hp -= damage;
    if (opening.discard) items = items.filter(item => item !== opening.discard);
    fight.log.push({kind:'opening', name:target.name, weapon:weapon?.name, score, damage});
  }
  const weapon = meleeOptions(setup, items, encounter).find(option => option.id === weaponId);
  if (!weapon) throw new RangeError('Select valid melee equipment');
  fight.weapon = weapon;
  fight.shield = Boolean(shield && weapon.shield && items.includes(setup.shield));
  fight.cursor = firstLiving(fight.opponents);
  fight.startingGroupSize = fight.opponents.filter(enemy => enemy.hp > 0).length;
  if (fight.cursor < 0) fight.status = 'won';
  return fight;
}

export function advanceFight(fight, roll = die) {
  if (fight.status !== 'fighting') return fight;
  const {player, weapon, effects} = fight;
  const enemy = fight.opponents[fight.cursor];
  const penalty = hasAny(weapon.items, effects.groupPenaltyExempt) ? 0 : effects.groupPenalty?.[fight.startingGroupSize] ?? 0;
  const playerAttack = attackValue(player, weapon) - penalty -
    Number(hasAny(weapon.items, effects.attackDown)) + Number(hasAny(weapon.items, effects.attackUp));
  const enemyAttack = enemy.attack - Number(fight.shield) - Number(hasAny(weapon.items, effects.enemyAttackDown));
  const playerScore = playerAttack + roll();
  const enemyScore = enemyAttack + roll();
  let damage = 0;
  let kind = 'tie';
  if (playerScore > enemyScore) {
    kind = 'hit';
    const doubleDamage = hasAny(weapon.items, effects.doubleDamage) ||
      effects.heroDoubleDamage?.[player.hero] === weapon.id ||
      (weapon.items.length === 2 && effects.cuttingWeapons && hasItems(effects.cuttingWeapons, weapon.items));
    damage = Math.min(enemy.hp, doubleDamage ? 2 : 1);
    enemy.hp -= damage;
  }
  if (playerScore < enemyScore) {
    kind = 'hurt';
    const bonus = effects.damageByLife?.find(([maximum]) => enemy.hp <= maximum)?.[1] ?? enemy.damageBonus;
    const rolledDamage = Array.from({length:enemy.damageDice}, roll).reduce((sum, value) => sum + value, bonus);
    damage = Math.min(player.hp, Math.max(0, rolledDamage - player.armor));
    player.hp -= damage;
  }
  fight.round++;
  fight.log.push({kind, name:enemy.name, playerScore, enemyScore, damage});
  if (fight.log.length > 100) fight.log.shift();
  if (player.hp === 0) fight.status = 'lost';
  else if (firstLiving(fight.opponents) < 0) fight.status = 'won';
  else {
    do {
      fight.cursor = (fight.cursor + 1) % fight.opponents.length;
    } while (fight.opponents[fight.cursor].hp === 0);
  }
  return fight;
}

export function validateFight(fight) {
  if (!fight || !['fighting', 'won', 'lost'].includes(fight.status) || !Array.isArray(fight.log) ||
    !fight.opponent?.name || !Number.isSafeInteger(fight.player?.hp) || fight.player.hp < 0 ||
    !Number.isSafeInteger(fight.round) || !fight.opponents?.length) throw new RangeError('Invalid saved battle');
  return fight;
}
