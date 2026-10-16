import { fabledDie, fabledDice, fabledInteger, validateFabledCharacter } from './character.js';
import { startFabledFight, fleeFabledFight } from './core.js';

export const RISING_PROFESSIONS = Object.freeze({ priest: [6,4,5,8,6,2], troubadour: [8,5,5,5,4,6],
  mage: [4,4,8,1,7,5], wayfarer: [4,7,4,4,8,6], warrior: [5,8,3,6,5,3], rogue: [7,6,6,2,4,8] });
export const RISING_DEFAULTS = Object.freeze({ rank: 6, stamina: 27, shards: 0, armour: 0,
  professions: RISING_PROFESSIONS });
const enemy = (name, combat, defence, stamina) => ({ name, combat, defence, stamina });
const encounter = (section, win, name, combat, defence, stamina, extra = {}) => ({ section, win, loss: 140,
  enemies: [enemy(name,combat,defence,stamina)], ...extra });
export const RISING_FIGHTS = Object.freeze([
  encounter(55,79,'Imperial Guard',7,11,14),
  { section:116,win:91,loss:140,enemies:['First','Second','Third','Fourth','Fifth'].map(n=>enemy(n+' Vampire',6,10,14)) },
  encounter(145,218,'Wacko',12,22,29,{surrender:52}),
  encounter(183,551,'Thunder Beast',15,20,20,{special:'thunder'}),
  { section:186,win:243,loss:140,enemies:[enemy('First Knight',7,13,14),enemy('Second Knight',8,14,17)] },
  { section:192,win:280,loss:140,simultaneous:true,enemies:[enemy('First Spider',8,12,17),enemy('Second Spider',8,12,13),enemy('Third Spider',12,12,12)] },
  { section:273,win:661,loss:140,simultaneous:true,unarmoured:true,enemies:['First','Second','Third'].map(n=>enemy(n+' Flying Head',8,18,5)) },
  { section:291,win:499,loss:140,simultaneous:true,flee:{destination:745},enemies:[enemy('First Shrine Warden',9,15,22),enemy('Second Shrine Warden',9,15,21),enemy('Third Shrine Warden',9,15,20)] },
  encounter(305,326,'Hairy arms',9,18,12,{flee:{destination:181,dice:1}}),
  encounter(306,86,'Skeleton Spectre',13,20,21,{flee:{destination:416,dice:2,armour:true}}),
  encounter(348,275,'King Tiger',12,22,44),
  encounter(374,277,'Mujina',8,13,15),
  encounter(411,430,'The Enemy',12,22,35,{special:'meditation',unarmoured:true,loss:479,flee:{destination:371}}),
  encounter(460,489,'Dawatsu Morituri',10,20,38,{special:'morituriOutside'}),
  encounter(473,423,'Chimerical Beast',8,9,20,{special:'sanctityDefence'}),
  encounter(481,331,'Spider Creature',10,20,33,{special:'poisonSpider',preCheck:true,flee:{destination:140,fatal:true}}),
  encounter(490,316,'Ridiculous Rogue',4,16,30,{special:'subdue'}),
  encounter(527,544,'Ghoul',7,12,15,{flee:{destination:506,freeAttack:true}}),
  encounter(563,null,'Haniwa Warrior',8,20,21,{special:'oneDie',winChoices:[583,604]}),
  { section:618,win:738,loss:140,simultaneous:true,surrender:452,enemies:[enemy('Jiro',10,13,10),enemy('Nunobiki',9,13,14),enemy('Yoshio',9,13,13)] },
  encounter(623,458,'Giant',15,22,51,{special:'permanentWounds',entryDice:1}),
  encounter(624,529,'Bear',7,11,17,{special:'darkness'}),
  encounter(656,746,'Warrior Maid',8,16,18,{special:'exchangedWeapon',surrender:36}),
  encounter(680,728,'Tadachika',11,17,21,{flee:{destination:696,dice:3,armour:true}}),
  encounter(712,458,'Big Boy',15,22,51,{special:'permanentWounds',flee:{destination:642,dice:2}}),
  encounter(716,null,'Dragon',9,19,27,{winChoices:[461,488]}),
  encounter(718,312,'Talanexor',11,17,17,{special:'magicDefence'}),
  encounter(742,489,'Dawatsu Morituri',15,25,38,{special:'morituriInside',flee:{destination:460,freeAttack:true}}),
  encounter(743,null,'Dragon',13,25,27,{winChoices:[461,488]}),
]);

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
