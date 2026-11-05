// Resolve independent Kingfisher-style encounters using database-defined opponents and exceptions.
const LIMIT = 1000000;
const modes = ['melee', 'bow', 'firearm', 'poison', 'thrown'];
const states = ['fighting', 'win', 'loss', 'fled', 'ended', 'cancelled'];
function number(value, min = 0, max = LIMIT, whole = true) {
  if (!Number.isFinite(value) || value < min || value > max || whole && !Number.isSafeInteger(value)) throw new RangeError('Invalid combat value');
  return value;
}
function name(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 200) throw new RangeError('Invalid opponent name');
  return value.trim();
}
export function normalizeKingfisherEncounter(source) {
  if (!source || !Array.isArray(source.profiles) || !source.profiles.length || source.profiles.length > 100) throw new RangeError('Invalid encounter');
  const result = structuredClone(source);
  result.name = name(source.displayName ?? source.name);
  if (source.section != null && !/^[1-9]\d{0,5}$/.test(String(source.section))) throw new RangeError('Invalid encounter reference');
  result.section = source.section == null ? null : String(source.section);
  result.profiles = source.profiles.map(profile => {
    const row = {...structuredClone(profile), name:name(profile.displayName ?? profile.name)};
    row.count = profile.count == null && profile.countRequired ? null : number(profile.count ?? 1, 1, profile.countMax ?? 10000);
    row.hp = profile.hp == null ? null : number(profile.hp, Number.MIN_VALUE, LIMIT, false);
    row.bonus = profile.bonus == null && profile.bonusRequired ? null : number(profile.bonus ?? 0, -1000, 1000);
    row.armour = number(profile.armour ?? 0, 0, 1000);
    row.type = profile.type ?? 'melee';
    if (!modes.includes(row.type)) throw new RangeError('Invalid attack type');
    row.weapons = (profile.weapons ?? [{name:row.name, bonus:row.bonus, type:row.type}]).map(weapon => {
      if (!modes.includes(weapon.type)) throw new RangeError('Invalid attack type');
      return {...weapon, name:name(weapon.name), bonus:weapon.bonus == null && profile.bonusRequired ? null : number(weapon.bonus, -1000, 1000), type:weapon.type,
        ammo:number(weapon.ammo ?? 0), ...(weapon.fixedDamage != null ? {fixedDamage:number(weapon.fixedDamage)} : {})};
    });
    if (!row.weapons.length || row.weapons.length > 8) throw new RangeError('Invalid weapons');
    for (const key of ['healingDoses','poisonTick','fatalConsecutiveHits','halveAt']) if (row[key] != null) number(row[key], 1);
    if (row.scoreMultiplier != null) number(row.scoreMultiplier, 1, 10);
    for (const key of ['replacementCount','fixedDamage','fatalNaturalScore']) if (row[key] != null) number(row[key], 1);
    return row;
  });
  if (source.captureBelow != null) number(source.captureBelow, 1);
  if (source.captureAbove != null) number(source.captureAbove);
  for (const key of ['stopBelow','captureAfterRounds']) if (source[key] != null) number(source[key], 1);
  if (source.firstAttack != null && !['roll','player','enemy'].includes(source.firstAttack)) throw new RangeError('Invalid initiative');
  return result;
}
function playerInput(input) {
  const result = {...input};
  result.maxHp = number(input.maxHp, Number.MIN_VALUE, LIMIT, false);
  result.hp = number(input.hp, Number.MIN_VALUE, result.maxHp, false);
  for (const key of ['experience','ammo','spells','prayers','antidotes','magicUses','potionUses','fullHealUses','sleepUses','orbUses','heavyBonus']) result[key] = number(input[key] ?? 0);
  for (const key of ['meleeBonus','rangedBonus','damageModifier','playerRollModifier','enemyRollModifier']) result[key] = number(input[key] ?? 0, -1000, 1000);
  result.armour = number(input.armour ?? 0, 0, 1000);
  result.weapon = input.weapon ?? 'melee';
  if (!['melee','bow','firearm','magic','heavy'].includes(result.weapon)) throw new RangeError('Invalid player weapon');
  result.poisonImmune = Boolean(input.poisonImmune); result.projectileProtection = Boolean(input.projectileProtection);
  return result;
}
const active = fight => fight.groups[fight.active];
function firstPhase(fight) {
  const rule = fight.opponent;
  const opening = !fight.duelsStarted;
  let first = opening || rule.firstAttackEach ? rule.firstAttack ?? 'roll' : 'roll';
  fight.duelsStarted = (fight.duelsStarted ?? 0) + 1;
  if (opening && rule.firstAttackOption && fight.options[rule.firstAttackOption]) first = 'player';
  if (rule.surpriseOption && fight.options[rule.surpriseOption] && !fight.surpriseUsed) first = 'enemy';
  if (first === 'roll' && fight.bowInitiativeAdvantage !== false && fight.player.weapon === 'bow' && fight.player.ammo && !active(fight).weapons.some(w => w.type === 'bow')) first = 'player';
  fight.phase = first === 'roll' ? 'initiative' : first;
  if (first === 'enemy' && active(fight).spray) fight.phase = 'spray';
  fight.guaranteedHit = first === 'enemy' && Boolean(rule.enemyFirstHit);
  if (first === 'enemy' && rule.surpriseOption && fight.options[rule.surpriseOption]) fight.surpriseUsed = true;
}
export function startKingfisherFight(input, encounter, options = {}, rules = {}) {
  const opponent = normalizeKingfisherEncounter(encounter), player = playerInput(input);
  if (opponent.unarmedOnly) player.weapon = 'melee';
  const fight = {family:'kingfisher', rulesVersion:1, opponent, player, options:structuredClone(options),
    hitMinimum:number(rules.hitMinimum, 2, 12), initiativeMinimum:number(rules.initiativeMinimum, 1, 6),
    groups:opponent.profiles.map(profile => {
      const hitCounter = profile.hp == null && (profile.singleHitDefeat || profile.magicDuel && player.weapon === 'magic' && player.magicUses);
      if (profile.hp == null && !hitCounter) throw new RangeError('Enter the opponent Life Points');
      if (profile.count == null || profile.bonus == null || profile.weapons.some(weapon => weapon.bonus == null)) throw new RangeError('Enter the unprinted combat stats');
      return {...profile, hp:hitCounter ? 1 : profile.hp, hpUnstated:Boolean(hitCounter), remaining:profile.count, currentHp:hitCounter ? 1 : profile.hp, healingLeft:profile.healingDoses ?? 0, hitStreak:0,
        weapons:profile.weapons.map(weapon => ({...weapon, remainingAmmo:weapon.ammo}))};
    }), active:0, status:'fighting', phase:'initiative', round:0, revision:0, events:[], poisoned:0,
    consecutiveHits:0, surpriseUsed:false, destination:null, combatStarted:false, escapeAttempts:0, escapeClosed:false, heavyReady:true,
    bowInitiativeAdvantage:rules.bowInitiativeAdvantage !== false, bowSuppressesMelee:rules.bowSuppressesMelee !== false};
  for (const pair of opponent.contextExclusions ?? []) if (pair.every(key => fight.options[key])) throw new RangeError('Incompatible encounter options');
  fight.contextDamage = 0;
  for (const modifier of opponent.contextModifiers ?? []) if (fight.options[modifier.option]) fight.contextDamage += number(modifier.amount, -1000, 1000);
  firstPhase(fight); thresholdResult(fight); return validateKingfisherFight(fight);
}
export function validateKingfisherFight(fight) {
  if (!fight || fight.family !== 'kingfisher' || fight.rulesVersion !== 1 || !states.includes(fight.status)) throw new RangeError('Invalid saved fight');
  number(fight.revision); number(fight.round); number(fight.active, 0, fight.groups.length - 1);
  if (!Array.isArray(fight.events) || fight.events.length > 100 || !Array.isArray(fight.groups) || fight.groups.length > 100) throw new RangeError('Invalid saved log');
  normalizeKingfisherEncounter(fight.opponent);
  number(fight.player.hp, 0, fight.player.maxHp, false); playerInput({...fight.player, hp:Math.max(Number.MIN_VALUE, fight.player.hp)});
  number(fight.hitMinimum, 2, 12); number(fight.initiativeMinimum, 1, 6); number(fight.poisoned);
  number(fight.contextDamage, -10000, 10000);
  for (const group of fight.groups) {
    number(group.remaining, 0, group.count); number(group.currentHp, 0, group.hp, false); number(group.healingLeft, 0, group.healingDoses ?? 0); number(group.hitStreak);
    for (const weapon of group.weapons) number(weapon.remainingAmmo, 0, weapon.ammo);
  }
  if (fight.status === 'fighting' && (!active(fight).remaining || !['initiative','player','enemy','spray'].includes(fight.phase))) throw new RangeError('Invalid active opponent');
  return fight;
}
function dice(values, count, random) {
  if (values === undefined) values = Array.from({length:count}, () => {
    const value = random(); if (!Number.isFinite(value) || value < 0 || value >= 1) throw new RangeError('Invalid random roll');
    return Math.floor(value * 6) + 1;
  });
  if (!Array.isArray(values) || values.length !== count) throw new RangeError('Wrong number of dice');
  return values.map(v => number(v, 1, 6));
}
function finish(fight, status, destination) {
  fight.status = status; fight.phase = 'complete'; fight.destination = destination == null ? null : String(destination);
  if (status === 'win') fight.player.experience++;
}
function hurtPlayer(fight, amount) {
  fight.player.hp = Math.max(0, fight.player.hp - amount);
  if (!fight.player.hp) finish(fight, 'loss', fight.opponent.defeatSection);
  else if (fight.opponent.captureBelow != null && fight.player.hp < fight.opponent.captureBelow
      && fight.player.hp > (fight.opponent.captureAbove ?? 0)) finish(fight, 'loss', fight.opponent.captureSection);
}
function defeated(fight, killed = true) {
  const group = active(fight); group.remaining--;
  if (killed && group.replacementCount) {
    group.remaining += group.replacementCount;
    group.count = number(group.count + group.replacementCount);
  }
  if (!fight.groups.some(row => row.remaining)) { finish(fight, fight.opponent.cannotWin ? 'ended' : 'win', fight.opponent.winSection); return; }
  if (group.remaining) {
    group.currentHp = group.hp; group.healingLeft = group.healingDoses ?? 0; group.hitStreak = 0;
    for (const weapon of group.weapons) weapon.remainingAmmo = weapon.ammo;
  } else fight.active = fight.groups.findIndex(row => row.remaining);
  fight.consecutiveHits = 0; firstPhase(fight);
}
function thresholdResult(fight) {
  const threshold = fight.opponent.stopBelow;
  if (threshold == null || fight.status !== 'fighting') return;
  const enemyHp = active(fight).currentHp;
  if (fight.player.hp >= threshold && enemyHp >= threshold) return;
  finish(fight, fight.player.hp > enemyHp ? 'win' : fight.player.hp < enemyHp ? 'loss' : 'ended', fight.opponent.stopSection);
}
export function kingfisherAction(source, action, random = Math.random) {
  validateKingfisherFight(source);
  if (source.status !== 'fighting' || action.expectedRevision !== source.revision) throw new RangeError('Stale combat action');
  const fight = structuredClone(source), group = active(fight), event = {kind:action.kind, actor:fight.phase, opponent:group.name};
  if (action.kind === 'cancel') finish(fight, 'cancelled');
  else if (action.kind === 'target') {
    const index = number(action.index, 0, fight.groups.length - 1);
    if (!fight.groups[index].remaining || fight.phase === 'spray') throw new RangeError('Unavailable opponent');
    fight.active = index;
  } else if (action.kind === 'weapon') {
    if (fight.phase !== 'player' || !['melee','bow','firearm','magic','heavy'].includes(action.weapon)
        || fight.opponent.unarmedOnly && action.weapon !== 'melee') throw new RangeError('Unavailable weapon change');
    fight.player.weapon = action.weapon;
  } else if (action.kind === 'wait') {
    if (fight.phase !== 'player') throw new RangeError('Wait for your turn');
    fight.round++; fight.heavyReady = true; fight.phase = 'enemy'; fight.combatStarted = true;
  } else if (action.kind === 'potion' || action.kind === 'fullHeal') {
    const key = action.kind === 'potion' ? 'potionUses' : 'fullHealUses';
    if (!fight.player[key] || fight.player.hp >= fight.player.maxHp) throw new RangeError('No healing available');
    if (action.kind === 'potion') event.dice = dice(action.dice, 2, random);
    event.amount = action.kind === 'potion' ? Math.max(0, event.dice[0] + event.dice[1] + (fight.player.playerRollModifier ?? 0)) : fight.player.maxHp - fight.player.hp;
    fight.player[key]--; fight.player.hp = Math.min(fight.player.maxHp, fight.player.hp + event.amount);
  } else if (action.kind === 'sleep' || action.kind === 'orb') {
    const key = action.kind === 'sleep' ? 'sleepUses' : 'orbUses';
    if (fight.phase !== 'player' || !fight.player[key] || fight.opponent.unarmedOnly) throw new RangeError('No combat magic available');
    let count = 1;
    if (action.kind === 'orb') { event.dice = dice(action.dice, 1, random); count = Math.max(0, event.dice[0] + (fight.player.playerRollModifier ?? 0)); }
    fight.player[key]--; fight.round++; fight.heavyReady = true; fight.combatStarted = true;
    while (count-- > 0 && fight.status === 'fighting') { active(fight).currentHp = 0; defeated(fight, false); }
    if (fight.status === 'fighting') fight.phase = 'enemy';
  } else if (action.kind === 'healEnemy') {
    if (!group.healingLeft || group.currentHp >= group.healBelow || !group.currentHp) throw new RangeError('No enemy recovery available');
    event.dice = dice(action.dice, 1, random); event.amount = event.dice[0]; group.healingLeft--;
    group.currentHp = Math.min(group.hp, group.currentHp + event.amount);
  } else if (action.kind === 'antidote') {
    if (!fight.player.antidotes || !fight.poisoned && !fight.groups.some(row => row.fatalConsecutiveHits && row.hitStreak)) throw new RangeError('No antidote available');
    fight.player.antidotes--; fight.poisoned = 0;
    for (const row of fight.groups) row.hitStreak = 0;
  } else if (action.kind === 'prayer') {
    if (!fight.player.prayers || fight.groups.some(row => row.remaining && !row.cat)) throw new RangeError('Prayer does not apply');
    fight.player.prayers--; finish(fight, 'fled', fight.opponent.prayerSection);
  } else if (action.kind === 'spell') {
    if (!fight.player.spells || !group.human || fight.phase !== 'player' || fight.opponent.unarmedOnly) throw new RangeError('Spell needs a human opponent on your turn');
    fight.combatStarted = true; fight.player.spells--; group.currentHp = 0; event.defeated = true; defeated(fight);
  } else if (action.kind === 'escape') {
    if (!fight.opponent.escape || fight.combatStarted || fight.escapeClosed) throw new RangeError('No escape attempt available');
    event.dice = dice(action.dice, 2, random); const score = event.dice[0] + event.dice[1]; fight.escapeAttempts++;
    if (score === 2) { fight.player.hp = 0; finish(fight, 'loss', fight.opponent.defeatSection); }
    else if (score >= 10) finish(fight, 'fled', fight.opponent.escapeSection);
    else if (score <= 5 || fight.escapeAttempts >= 2) fight.escapeClosed = true;
  } else if (action.kind === 'initiative') {
    if (fight.phase !== 'initiative') throw new RangeError('No initiative roll available');
    event.dice = dice(action.dice, 1, random); event.score = event.dice[0] + (fight.player.playerRollModifier ?? 0); fight.phase = event.score >= fight.initiativeMinimum ? 'player' : 'enemy';
    if (fight.phase === 'enemy' && group.spray) fight.phase = 'spray';
  } else if (action.kind === 'attack') {
    if (!['player','enemy'].includes(fight.phase)) throw new RangeError('No attack available');
    const playerTurn = fight.phase === 'player';
    const magic = playerTurn && fight.player.weapon === 'magic' && !fight.opponent.unarmedOnly;
    const heavy = playerTurn && fight.player.weapon === 'heavy' && !fight.opponent.unarmedOnly;
    if (magic && !fight.player.magicUses || heavy && fight.heavyReady === false) throw new RangeError('Weapon is not ready');
    if (playerTurn && group.hpUnstated && !group.singleHitDefeat && !magic) throw new RangeError('Opponent Life Points are not printed');
    fight.combatStarted = true;
    if (playerTurn && fight.player.weapon === 'bow' && !fight.player.ammo) throw new RangeError('No arrows available');
    const weaponIndex = group.weaponSequence ? group.weapons.findIndex(weapon => weapon.type !== 'firearm' || weapon.remainingAmmo > 0) : action.weaponIndex ?? 0;
    const weapon = playerTurn ? null : group.weapons[number(weaponIndex, 0, group.weapons.length - 1)];
    if (weapon?.type === 'bow' && !weapon.remainingAmmo) throw new RangeError('No enemy arrows available');
    if (playerTurn) fight.round++;
    if (fight.status === 'fighting') {
      event.dice = dice(action.dice, 2, random); event.naturalScore = event.dice.reduce((a,b) => a + b, 0);
      event.score = event.naturalScore * (playerTurn ? 1 : group.scoreMultiplier ?? 1) + (playerTurn ? fight.player.playerRollModifier ?? 0 : fight.player.enemyRollModifier ?? 0);
      event.hit = !playerTurn && fight.guaranteedHit || event.score >= fight.hitMinimum;
      if (!playerTurn && group.fatalNaturalScore && event.naturalScore === group.fatalNaturalScore) event.hit = true;
      if (playerTurn) {
        const ranged = ['bow','firearm'].includes(fight.player.weapon), loaded = fight.player.ammo > 0;
        const bonus = fight.opponent.unarmedOnly ? 0 : heavy ? fight.player.heavyBonus : ranged ? loaded ? fight.player.rangedBonus : 0 : fight.player.meleeBonus;
        if (ranged && loaded) fight.player.ammo--;
        if (magic) fight.player.magicUses--;
        fight.heavyReady = !heavy;
        event.amount = event.hit ? Math.max(0, event.score + bonus + fight.player.damageModifier + fight.contextDamage - group.armour) : 0;
        if (event.hit && (magic || group.singleHitDefeat)) { event.amount = group.currentHp; event.singleHitDefeat = true; }
        group.currentHp = Math.max(0, group.currentHp - event.amount);
        if (!group.currentHp) { event.defeated = true; defeated(fight); }
        else {
          fight.phase = fight.bowSuppressesMelee !== false && fight.player.weapon === 'bow' && !group.weapons.some(w => w.type === 'bow') ? 'player' : 'enemy';
          if (fight.phase === 'player' && fight.poisoned) { event.poisonDamage = fight.poisoned; hurtPlayer(fight, fight.poisoned); }
        }
      } else {
        const loaded = weapon.remainingAmmo > 0;
        let bonus = weapon.bonus;
        if (weapon.type === 'firearm' && !loaded || weapon.type === 'poison' && fight.player.poisonImmune
            || ['bow','thrown'].includes(weapon.type) && fight.player.projectileProtection) bonus = 0;
        if (['bow','firearm'].includes(weapon.type) && loaded) weapon.remainingAmmo--;
        if (event.hit && group.halveAt && event.score >= group.halveAt) {
          event.amount = fight.player.hp / 2; hurtPlayer(fight, event.amount);
        } else {
          const fixed = weapon.fixedDamage ?? group.fixedDamage;
          event.amount = event.hit ? Math.max(0, (fixed ?? event.score + bonus) - (group.ignoreArmour ? 0 : fight.player.armour)) : 0;
          if (event.hit && (group.lethalHit && !(group.type === 'poison' && fight.player.poisonImmune)
              || group.fatalNaturalScore && event.naturalScore === group.fatalNaturalScore)) event.amount = fight.player.hp;
          hurtPlayer(fight, event.amount);
        }
        group.hitStreak = event.hit ? group.hitStreak + 1 : 0;
        if (event.hit && !fight.player.poisonImmune) {
          fight.poisoned = group.poisonTick ?? fight.poisoned;
          if (group.fatalConsecutiveHits && group.hitStreak >= group.fatalConsecutiveHits) hurtPlayer(fight, fight.player.hp);
        }
        fight.guaranteedHit = false;
        if (fight.status === 'fighting') {
          fight.phase = group.spray && event.hit ? 'spray' : 'player';
          if (fight.phase === 'player' && fight.poisoned) { event.poisonDamage = fight.poisoned; hurtPlayer(fight, fight.poisoned); }
        }
        if (fight.status === 'fighting' && fight.opponent.captureAfterRounds && fight.round >= fight.opponent.captureAfterRounds) finish(fight, 'loss', fight.opponent.captureSection);
      }
    }
  } else if (action.kind === 'spray') {
    if (fight.phase !== 'spray') throw new RangeError('No spray roll available');
    event.dice = dice(action.dice, 2, random); const score = event.dice[0] + event.dice[1];
    const route = group.spray.find(row => score <= row.max);
    if (!route) throw new RangeError('Missing spray outcome');
    if (route.fatal) { fight.player.hp = 0; finish(fight, 'loss', route.section); }
    else finish(fight, 'ended', route.section);
  } else throw new RangeError('Unknown combat action');
  thresholdResult(fight);
  fight.revision++; event.hp = fight.player.hp; event.enemyHp = event.defeated ? 0 : active(fight).currentHp; event.status = fight.status;
  fight.events.push(event); fight.events = fight.events.slice(-100);
  return validateKingfisherFight(fight);
}
