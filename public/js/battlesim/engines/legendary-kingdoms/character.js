export const LEGENDARY_SKILLS = Object.freeze(['fighting', 'stealth', 'lore', 'survival', 'charisma']);

export const VALLEY_PROFILES = Object.freeze({
  jessica: Object.freeze({ name: 'Sar Jessica Dayne', skills: Object.freeze([5, 1, 3, 2, 4]), health: 8 }),
  tiquon: Object.freeze({ name: "Lord Ti'Quon", skills: Object.freeze([1, 2, 5, 1, 2]), health: 6, spellcaster: true }),
  tasha: Object.freeze({ name: 'Tasha', skills: Object.freeze([3, 5, 1, 3, 3]), health: 8 }),
  amelia: Object.freeze({ name: 'Amelia Pass-Dayne', skills: Object.freeze([3, 2, 2, 3, 1]), health: 6, spellcaster: true }),
  akihiro: Object.freeze({ name: 'Akihiro of Chalice', skills: Object.freeze([4, 3, 2, 5, 1]), health: 8 }),
  brash: Object.freeze({ name: 'Brash', skills: Object.freeze([2, 4, 3, 1, 5]), health: 8 }),
});

export const CROWN_PROFILES = Object.freeze({
  jessica: Object.freeze({ name: 'Sar Jessica Dayne', skills: Object.freeze([7, 1, 4, 2, 5]), health: 9 }),
  tiquon: Object.freeze({ name: "Lord Ti'Quon", skills: Object.freeze([1, 3, 7, 2, 2]), health: 7, spellcaster: true }),
  tasha: Object.freeze({ name: 'Tasha', skills: Object.freeze([4, 7, 1, 4, 3]), health: 9 }),
  amelia: Object.freeze({ name: 'Amelia Pass-Dayne', skills: Object.freeze([4, 3, 3, 4, 1]), health: 7, spellcaster: true }),
  akihiro: Object.freeze({ name: 'Akihiro of Chalice', skills: Object.freeze([5, 3, 3, 7, 1]), health: 9 }),
  brash: Object.freeze({ name: 'Brash', skills: Object.freeze([3, 5, 3, 1, 7]), health: 9 }),
});

export function legendaryInteger(value, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum)
    throw new RangeError('Invalid Legendary Kingdoms value');
  return value;
}

export function legendaryDie(roll = () => Math.floor(Math.random() * 6) + 1) {
  return legendaryInteger(roll(), 1, 6);
}

export function legendaryPool(count, threshold, roll) {
  legendaryInteger(count);
  legendaryInteger(threshold, 1);
  const dice = [];
  let successes = 0;
  for (let i = 0; i < count; i++) {
    const value = legendaryDie(roll);
    dice.push(value);
    if (value >= threshold) successes++;
  }
  return { dice, successes };
}

export function newValleyCharacter(profileId) {
  const profile = Object.hasOwn(VALLEY_PROFILES, profileId) && VALLEY_PROFILES[profileId];
  if (!profile) throw new RangeError('Unknown Valley of Bones character');
  return newProfileCharacter(profileId, profile);
}

export function newCrownCharacter(profileId) {
  const profile = Object.hasOwn(CROWN_PROFILES, profileId) && CROWN_PROFILES[profileId];
  if (!profile) throw new RangeError('Unknown Crown & Tower character');
  return newProfileCharacter(profileId, profile);
}

function newProfileCharacter(profileId, profile) {
  return {
    profileId, name: profile.name,
    skills: Object.fromEntries(LEGENDARY_SKILLS.map((key, i) => [key, profile.skills[i]])),
    bonuses: Object.fromEntries(LEGENDARY_SKILLS.map(key => [key, 0])),
    health: profile.health, maxHealth: profile.health, armour: 0, armed: false, weaponBonus: 0,
    spellcaster: !!profile.spellcaster, spells: [],
    skeletonHealth: 0, healingPotions: 0, invulnerabilityPotions: 0, invulnerable: false,
    stonecutterSword: false,
  };
}

export function newLegendaryCustomCharacter(name, skills, spellcaster = false) {
  if (typeof name !== 'string' || !name.trim() || typeof spellcaster !== 'boolean')
    throw new RangeError('Name the new party member and choose their caster type');
  const values=LEGENDARY_SKILLS.map(skill=>legendaryInteger(skills?.[skill],1,5));
  if (values.reduce((sum,value)=>sum+value,0)!==(spellcaster?11:15))
    throw new RangeError('Custom heroes use fifteen skill points, or eleven for a spellcaster');
  return {...newValleyCharacter('brash'),profileId:null,name:name.trim(),skills:{...skills},
    spellcaster,health:spellcaster?6:8,maxHealth:spellcaster?6:8};
}

export function newCrownCustomCharacter(name, skills, spellcaster = false) {
  if (typeof name !== 'string' || !name.trim() || typeof spellcaster !== 'boolean')
    throw new RangeError('Name the new party member and choose their caster type');
  const values = LEGENDARY_SKILLS.map(skill => legendaryInteger(skills?.[skill], 1, 7));
  if (values.reduce((sum, value) => sum + value, 0) !== (spellcaster ? 15 : 19))
    throw new RangeError('Custom heroes use nineteen skill points, or fifteen for a spellcaster');
  return { ...newCrownCharacter('brash'), profileId: null, name: name.trim(),
    skills: Object.fromEntries(LEGENDARY_SKILLS.map((skill, index) => [skill, values[index]])),
    spellcaster, health: spellcaster ? 7 : 9, maxHealth: spellcaster ? 7 : 9 };
}

export function newValleySkullcracker() {
  return {...newValleyCharacter('brash'), profileId:'skullcracker', name:'Skullcracker',
    skills:{fighting:8,stealth:1,lore:1,survival:3,charisma:2}, health:12,maxHealth:12,armed:true};
}

export function validateLegendaryCharacter(character, alive = false) {
  if (!character || typeof character.name !== 'string' || !character.name.trim())
    throw new RangeError('Invalid party member');
  for (const key of LEGENDARY_SKILLS) {
    legendaryInteger(character.skills?.[key]);
    legendaryInteger(character.bonuses?.[key] ?? 0);
  }
  legendaryInteger(character.maxHealth, 1);
  legendaryInteger(character.health, alive ? 1 : 0, character.maxHealth);
  legendaryInteger(character.armour);
  legendaryInteger(character.weaponBonus ?? 0);
  legendaryInteger(character.skeletonHealth ?? 0, 0, 6);
  legendaryInteger(character.healingPotions ?? 0);
  legendaryInteger(character.invulnerabilityPotions ?? 0);
  if (character.invulnerable !== undefined && typeof character.invulnerable !== 'boolean')
    throw new RangeError('Invalid potion protection');
  if (character.stonecutterSword !== undefined && typeof character.stonecutterSword !== 'boolean')
    throw new RangeError('Invalid stonecutter sword selection');
  if (typeof character.armed !== 'boolean' || typeof character.spellcaster !== 'boolean')
    throw new RangeError('Invalid party equipment or caster state');
  return character;
}

export function legendarySkill(character, skill, { excludeWeapon = false } = {}) {
  validateLegendaryCharacter(character);
  if (!LEGENDARY_SKILLS.includes(skill)) throw new RangeError('Unknown party skill');
  const gear = character.bonuses[skill] ?? 0;
  const bonus = skill === 'fighting' && character.armed && !excludeWeapon
    ? Math.max(gear, character.stonecutterSword ? 2 : character.weaponBonus ?? 0) : gear;
  return legendaryInteger(character.skills[skill] + bonus + (skill === 'fighting' && character.skeletonHealth > 0 ? 2 : 0));
}

export function legendarySkillCheck(members, skill, threshold, required, { focus = 0, automatic = 0 } = {}, roll) {
  if (!Array.isArray(members) || members.length < 1 || members.length > 2 || new Set(members).size !== members.length)
    throw new RangeError('Choose one or two distinct party members');
  legendaryInteger(threshold, 1);
  legendaryInteger(required);
  legendaryInteger(focus);
  legendaryInteger(automatic);
  let pool = 0;
  for (const character of members) {
    validateLegendaryCharacter(character, true);
    const available = legendarySkill(character, skill);
    if (focus > Math.floor(available / 5)) throw new RangeError('Insufficient dice to focus');
    pool += available - focus * 5;
  }
  const result = legendaryPool(Math.min(20, pool), Math.max(1, threshold - focus), roll);
  const successes = result.successes + automatic;
  return { ...result, successes, automatic, passed: successes >= required };
}

export function legendaryAttack(character, defence, { focus = 0, excludeWeapon = false, unarmed = !character.armed } = {}, roll) {
  validateLegendaryCharacter(character, true);
  legendaryInteger(defence, 1);
  legendaryInteger(focus);
  const available = Math.max(0, legendarySkill(character, 'fighting', { excludeWeapon }) - (unarmed ? 1 : 0));
  if (focus > Math.floor(available / 5)) throw new RangeError('Insufficient attack dice to focus');
  // The twenty-dice limit applies to skill checks, not combat attacks.
  return legendaryPool(available - focus * 5, Math.max(1, defence - focus), roll);
}

export function legendaryDamage(character, damage, { armour = true, floor = 0 } = {}, roll) {
  validateLegendaryCharacter(character, true);
  legendaryInteger(damage);
  legendaryInteger(floor, 0, character.health);
  const save = legendaryPool(armour ? Math.min(character.armour, damage) : 0, 4, roll);
  const health = Math.max(floor, character.health - (damage - save.successes));
  return { character: { ...character, health }, dice: save.dice, prevented: save.successes,
    lost: character.health - health, dead: health === 0 };
}

export function legendaryHeal(character, amount) {
  validateLegendaryCharacter(character, true);
  legendaryInteger(amount);
  return { ...character, health: Math.min(character.maxHealth, character.health + amount) };
}
