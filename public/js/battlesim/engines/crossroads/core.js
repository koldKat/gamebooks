// Crossroads Adventures: attack rolls are 3D6 >= threshold; ability checks
// are 3D6 <= ability. Encounter stats and exceptions come from the roster.
const clone = value => structuredClone(value);
import {integer,damageSpec,dice,damage,finish} from './values.js';
import {validateEncounterRules,encounterRound,encounterTargets} from './encounter-rules.js';
export {encounterTargets};

export function startCrossroadsFight(hero, enemies, rules = {}, weaponDamage) {
  if (!hero || !Array.isArray(enemies) || !enemies.length || enemies.length > 100) throw new RangeError('Invalid combatants');
  const player = {
    hp:integer(hero.hp, 1), maxHp:integer(hero.maxHp, 1), constitution:integer(hero.constitution, 0, 100),
    attackBonus:integer(hero.attackBonus ?? 0, -100, 100), defenceBonus:integer(hero.defenceBonus ?? 0, -100, 100),
    damageReduction:integer(hero.damageReduction ?? 0,0,100),
  };
  if (player.hp > player.maxHp) throw new RangeError('Hit points exceed maximum');
  const config = clone(rules);
  if (config.roundLimit !== undefined) integer(config.roundLimit, 1, 1000);
  if (config.nonfatalLossDamage !== undefined) integer(config.nonfatalLossDamage);
  if (config.roundResult && !['compareDamage','survive'].includes(config.roundResult)) throw new RangeError('Unknown round limit');
  if (config.attackGroups && (!Array.isArray(config.attackGroups) || config.attackGroups.some(group =>
    !Array.isArray(group) || !group.length || group.some(i => !Number.isSafeInteger(i) || i < 0 || i >= enemies.length)))) throw new RangeError('Invalid attack groups');
  const opponents = enemies.map((enemy,index) => {
    if (!Array.isArray(enemy.attacks) || !enemy.attacks.length && !config.mechanics?.abilityOutcome && !config.mechanics?.net?.casters.includes(index) || enemy.attacks.length > 10) throw new RangeError('Missing enemy attacks');
    return {
      name:String(enemy.name ?? enemy.displayName ?? '').slice(0,200),
      hp:integer(enemy.hp, 1), maxHp:enemy.hp, toBeHit:integer(enemy.toBeHit, 3, 18),
      attacks:enemy.attacks.map(attack => {
        const result = config.mechanics?.vessel && attack.vesselHit ? {vesselHit:true} : {damage:damageSpec(attack.damage)};
        if (config.mechanics && attack.check === 'constitution') result.check = attack.check;
        else result.toHit = integer(attack.toHit, 3, 18);
        if (config.mechanics && attack.when) {
          if (!['heroMiss','otherwise','previousHit'].includes(attack.when)) throw new RangeError('Unknown attack condition');
          result.when = attack.when;
        }
        if (attack.poison) result.poison = damageSpec(attack.poison);
        return result;
      }),
    };
  });
  if (config.mechanics) {
    if (config.mechanics.grip) player.strength=integer(hero.strength,0,100);
    player.wisdom=integer(hero.wisdom,0,100);
    player.dexterity=integer(hero.dexterity,0,100);
    validateEncounterRules(config.mechanics,enemies.length);
  }
  return {rulesVersion:config.mechanics ? 2 : 1, hero:player, startingHp:player.hp, enemies:opponents, rules:config,
    weaponDamage:config.enemyOnly ? null : damageSpec(config.heroDamage ?? weaponDamage),
    status:'active', round:0, damageDealt:0, damageTaken:0, events:[], destination:null};
}

// Pure transitions make an invalid roll/action harmless to the saved run.
export function crossroadsRound(original, {target = 0, allyTarget = null, healing = null, action = 'attack', roll = () => Math.floor(Math.random()*6)+1} = {}) {
  if (original?.rulesVersion === 2) return encounterRound(original,{target,allyTarget,healing,action,roll});
  if (action!=='attack') throw new RangeError('Unsupported action');
  if (original?.status !== 'active' || original.rulesVersion !== 1) throw new RangeError('No active fight');
  const fight = clone(original);
  fight.events = [];
  const rule = fight.rules;
  const live = fight.enemies.map((enemy,i) => enemy.hp > 0 ? i : -1).filter(i => i >= 0);
  if (!rule.enemyOnly && healing === null && !live.includes(target)) throw new RangeError('Choose a living target');
  if (healing !== null && rule.enemyOnly) throw new RangeError('No player action during this attack sequence');
  if (healing !== null) {
    integer(healing, 1);
    if (fight.hero.hp >= fight.hero.maxHp) throw new RangeError('Already at maximum hit points');
  }
  fight.round++;
  if (!rule.enemyOnly) {
    if (healing !== null) {
      const restored = Math.min(healing, fight.hero.maxHp - fight.hero.hp);
      fight.hero.hp += restored;
      fight.events.push({kind:'healing', amount:restored});
    } else {
      const values = dice(3, roll), total = values.reduce((a,b) => a+b, fight.hero.attackBonus);
      const enemy = fight.enemies[target], hit = total >= enemy.toBeHit;
      const result = hit ? damage(fight.weaponDamage, roll) : {dice:[], amount:0};
      const lost = Math.min(enemy.hp, result.amount);
      enemy.hp -= lost; fight.damageDealt += lost;
      fight.events.push({kind:'attack', side:'hero', target, name:enemy.name, dice:values, total, hit, damageDice:result.dice, damage:lost});
      if (!fight.enemies.some(enemy => enemy.hp > 0)) { finish(fight,'win'); return fight; }
    }
  }
  const attackers = rule.attackGroups
    ? rule.attackGroups.map(group => group.find(i => fight.enemies[i].hp > 0)).filter(i => i !== undefined)
    : fight.enemies.map((enemy,i) => enemy.hp > 0 ? i : -1).filter(i => i >= 0);
  for (const index of attackers) {
    const enemy = fight.enemies[index];
    for (const attack of enemy.attacks) {
      const values = dice(3, roll), total = values.reduce((a,b) => a+b, -fight.hero.defenceBonus);
      const hit = total >= attack.toHit;
      const result = hit ? damage(attack.damage, roll) : {dice:[], amount:0};
      const lost = Math.min(fight.hero.hp, Math.max(0,result.amount-(fight.hero.damageReduction??0)));
      fight.hero.hp -= lost; fight.damageTaken += lost;
      fight.events.push({kind:'attack', side:'enemy', target:index, name:enemy.name, dice:values, total, hit, damageDice:result.dice, damage:lost});
      if (hit && attack.poison && fight.hero.hp > 0) {
        const check = dice(3, roll), passed = check.reduce((a,b) => a+b,0) <= fight.hero.constitution;
        const poison = passed ? {dice:[],amount:0} : damage(attack.poison,roll);
        const poisonLost = Math.min(fight.hero.hp,poison.amount);
        fight.hero.hp -= poisonLost; fight.damageTaken += poisonLost;
        fight.events.push({kind:'poison', dice:check, passed, damageDice:poison.dice, damage:poisonLost});
      }
      if (!fight.hero.hp) { finish(fight,'loss'); return fight; }
    }
  }
  if (rule.roundLimit && fight.round >= rule.roundLimit) {
    finish(fight, rule.roundResult === 'compareDamage'
      ? fight.damageDealt > fight.damageTaken ? 'win' : fight.damageDealt < fight.damageTaken ? 'loss' : 'draw'
      : 'win');
  }
  return fight;
}

export function crossroadsAbilityCheck(ability, roll = () => Math.floor(Math.random()*6)+1) {
  integer(ability,0,100);
  const values = dice(3,roll), total = values.reduce((a,b) => a+b,0);
  return {dice:values, total, passed:total <= ability};
}
