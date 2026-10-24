import { createRosterLoader } from '../../roster-data.js';
import { fabledDie, fabledDice, fabledInteger, validateFabledCharacter } from './character.js';
import { startFabledFight, fleeFabledFight } from './core.js';

export const RISING_PROFESSIONS = Object.freeze({ priest: [6,4,5,8,6,2], troubadour: [8,5,5,5,4,6],
  mage: [4,4,8,1,7,5], wayfarer: [4,7,4,4,8,6], warrior: [5,8,3,6,5,3], rogue: [7,6,6,2,4,8] });
export const RISING_DEFAULTS = Object.freeze({ rank: 6, stamina: 27, shards: 0, armour: 0,
  professions: RISING_PROFESSIONS });
export let RISING_FIGHTS = [];
export const loadRoster = createRosterLoader(679, 'FIGHTS', rows => { RISING_FIGHTS = rows; });

function end(fight, status) {
  fight.status = status;
  fight.destination = status === 'win' ? fight.config.win : fight.config.loss;
  if (fight.config.special === 'meditation') fight.character.stamina = fight.character.staminaInitial;
  if (fight.config.special === 'poisonSpider' && status === 'win' && fight.wounded) {
    if (fight.character.diseaseBlessing) {
      fight.character.diseaseBlessing = false;
      fight.events.push({kind:'diseaseBlessing'});
    } else {
      fight.character.stamina = 0;
      fight.status = 'loss';
      fight.destination = 140;
    }
  }
}

function damage(fight, amount, permanent = false) {
  fight.character.stamina = Math.max(0,fight.character.stamina-amount);
  fight.wounded ||= amount > 0;
  if (permanent) {
    fight.character.staminaInitial = Math.max(1,fight.character.staminaInitial-amount);
    fight.events.push({kind:'permanentWound',damage:amount});
  }
  if (!fight.character.stamina) end(fight,'loss');
}

function validate(fight) {
  if (!fight || fight.rulesRevision !== 1 || fight.status !== 'fighting' || !fight.config
    || !Array.isArray(fight.enemies) || !fight.enemies.length || !Array.isArray(fight.events)) {
    throw new RangeError('No active Rising Sun fight');
  }
  validateFabledCharacter(fight.character,true);
  fabledInteger(fight.target,0,fight.enemies.length-1);
  fabledInteger(fight.rounds); fabledInteger(fight.defence,1);
  fabledInteger(fight.attackModifier,-1000,1000);
  if (!fight.enemies[fight.target].stamina) throw new RangeError('Target already defeated');
  for (const foe of fight.enemies) {
    fabledInteger(foe.combat); fabledInteger(foe.defence,1); fabledInteger(foe.stamina);
  }
}

export function startRisingFight(config, character, options = {}, roll) {
  const { light = false, subdue = false, weaponBonus = 0, exchangedWeaponBonus = 0,
    crimsonArrow = false, divineWrath = options.divineWrathUse ?? false, enemyDamage = 0 } = options;
  for (const value of [light,subdue,crimsonArrow,divineWrath]) {
    if (typeof value !== 'boolean') throw new RangeError('Invalid encounter option');
  }
  fabledInteger(weaponBonus,0,12); fabledInteger(exchangedWeaponBonus,-2,12);
  fabledInteger(enemyDamage,0,config.enemies[0].stamina-1);
  const fight = startFabledFight(config,character,options,roll);
  if (fight.status !== 'fighting') return fight;
  if (config.unarmoured) fight.defence = character.combat+character.rank;
  if (config.special==='sanctityDefence') fight.defence = character.sanctity;
  if (config.special==='magicDefence') fight.defence = character.magic+character.rank;
  if (config.special==='darkness' && !light) fight.attackModifier -= 2;
  if (config.special==='subdue' && subdue) {
    fight.attackModifier -= weaponBonus+1;
    fight.defence = Math.max(1,fight.defence-weaponBonus);
    fight.config.win = 463;
  }
  if (config.special==='exchangedWeapon') {
    fight.enemies[0].combat += exchangedWeaponBonus;
    fight.enemies[0].defence += exchangedWeaponBonus;
  }
  const carried = config.special==='morituriOutside' ? (character.morituriDamage ?? 0) : 0;
  fabledInteger(carried,0,config.enemies[0].stamina);
  fight.enemies[0].stamina = Math.max(0,fight.enemies[0].stamina-Math.max(carried,enemyDamage));
  if (options.applyEntry!==false && crimsonArrow && config.special==='poisonSpider') {
    let amount = 0;
    for (let i=0;i<3;i++) amount += fabledDie(roll);
    fight.enemies[0].stamina = Math.max(0,fight.enemies[0].stamina-amount);
    fight.events.push({kind:'enemyEntry',damage:amount});
  }
  if (divineWrath) {
    if (!character.divineWrath) throw new RangeError('Divine Wrath unavailable');
    fight.character.divineWrath = false;
    const amount = fabledDie(roll);
    fight.enemies[0].stamina = Math.max(0,fight.enemies[0].stamina-amount);
    fight.events.push({kind:'enemyEntry',damage:amount});
  }
  if (!fight.enemies[0].stamina) {
    if (fight.enemies.length===1) end(fight,'win');
    else fight.target = fight.enemies.findIndex(e=>e.stamina>0);
  }
  return fight;
}

export function risingRound(input, options = {}, roll) {
  validate(input);
  const { combatBlessing = false, luckReroll = null, target = input.target } = options;
  if (typeof combatBlessing!=='boolean' || ![null,'player','enemy'].includes(luckReroll)
    || combatBlessing&&!input.character.combatBlessing || luckReroll&&!input.character.luckBlessing) {
    throw new RangeError('Invalid blessing');
  }
  fabledInteger(target,0,input.enemies.length-1);
  if (!input.enemies[target].stamina || !input.config.simultaneous && target!==input.target) {
    throw new RangeError('Invalid target');
  }
  const fight = structuredClone(input);
  fight.target = target;
  fight.rounds++;
  let luckUsed = false;
  const attack = (direction, foe) => {
    const diceRoll = () => direction==='player' && fight.config.special==='oneDie' ? fabledDie(roll) : fabledDice(roll);
    let dice = diceRoll();
    const combat = direction==='player' ? fight.character.combat+fight.attackModifier : foe.combat;
    const defence = direction==='player' ? foe.defence : fight.defence;
    const useLuck = !luckUsed && luckReroll===direction;
    if (useLuck || direction==='player' && combatBlessing && dice+combat<=defence) {
      const blessing = useLuck ? 'luckBlessing' : 'combatBlessing';
      fight.character[blessing] = false;
      luckUsed ||= useLuck;
      fight.events.push({kind:'reroll',direction,blessing,previous:dice});
      dice = diceRoll();
    }
    const total = dice+combat;
    let amount = Math.max(0,total-defence);
    if (direction==='enemy' && fight.config.special==='thunder') amount = Math.max(0,amount-Math.floor(fight.character.shards/1000));
    fight.events.push({kind:'attack',direction,enemy:foe.name,dice,total,defence,damage:amount,
      ...(foe.displayName?{enemyDisplayName:foe.displayName}:{})});
    return amount;
  };
  const foe = fight.enemies[target];
  foe.stamina = Math.max(0,foe.stamina-attack('player',foe));
  if (fight.enemies.every(e=>!e.stamina)) end(fight,'win');
  else if (fight.config.simultaneous) {
    for (const other of fight.enemies) {
      if (other.stamina && fight.status==='fighting') damage(fight,attack('enemy',other));
    }
    if (!foe.stamina) fight.target = fight.enemies.findIndex(e=>e.stamina>0);
  } else if (!foe.stamina) fight.target++;
  else damage(fight,attack('enemy',foe),fight.config.special==='permanentWounds');
  return fight;
}

export function fleeRisingFight(input, roll) {
  validate(input);
  const escape = input.config.flee;
  if (!escape) throw new RangeError('Fleeing unavailable');
  if (!escape.freeAttack && !escape.fatal) return fleeFabledFight(input,roll);
  const fight = structuredClone(input);
  if (escape.fatal) damage(fight,fight.character.stamina);
  else {
    const foe = fight.enemies[fight.target], dice = fabledDice(roll);
    const amount = Math.max(0,dice+foe.combat-fight.defence);
    fight.events.push({kind:'attack',direction:'enemy',enemy:foe.name,dice,total:dice+foe.combat,defence:fight.defence,damage:amount,
      ...(foe.displayName?{enemyDisplayName:foe.displayName}:{})});
    damage(fight,amount);
  }
  if (fight.status==='fighting') {
    fight.status = 'fled';
    fight.destination = escape.destination;
    if (fight.config.special==='morituriInside') fight.character.morituriDamage = fight.config.enemies[0].stamina-fight.enemies[0].stamina;
  }
  return fight;
}

export const RISING_SEA_CHECKS = Object.freeze({27:{kind:'passage'},52:{kind:'shipwreck'},126:{kind:'shipwreck'},222:{kind:'storm'}});
export function risingSeaCheck(section, input, options = {}, roll) {
  validateFabledCharacter(input,true);
  if (!RISING_SEA_CHECKS[section]) throw new RangeError('Invalid sea check');
  const {ship='barque',crew='average',safetyFromStorms=false} = options;
  if (!['barque','brigantine','galleon'].includes(ship) || !['poor','average','good','excellent'].includes(crew)
    || typeof safetyFromStorms!=='boolean' || safetyFromStorms&&!input.stormsBlessing&&!input.permanentStorms) throw new RangeError('Invalid ship setting');
  const character = structuredClone(input);
  let total = 0, destination, status = 'story', usedBlessing = false;
  if (section===27) {
    total = fabledDie(roll);
    destination = total===1 ? 241 : 612;
    if (total===2) {
      if (character.diseaseBlessing) character.diseaseBlessing = false;
      else {
        character.staminaInitial = Math.max(1,character.staminaInitial-2);
        character.stamina = Math.max(0,character.stamina-2);
        if (!character.stamina) {status='loss';destination=140;}
      }
    }
  } else if (section===222) {
    if (safetyFromStorms) {
      usedBlessing = true;
      if (!character.permanentStorms) character.stormsBlessing = false;
      destination = 580;
    } else {
      for (let i=0;i<({barque:1,brigantine:2,galleon:3})[ship];i++) total += fabledDie(roll);
      total += ({poor:0,average:0,good:1,excellent:2})[crew];
      destination = total<=3 ? 126 : 6;
    }
  } else {
    total = fabledDice(roll)+character.scouting;
    const success = total>(section===52?15:14);
    destination = success ? 241 : 140;
    if (!success) {character.stamina=0;status='loss';}
  }
  return {character,total,destination,status,kind:RISING_SEA_CHECKS[section].kind,
    damage:input.stamina-character.stamina,usedBlessing};
}
