import { createRosterLoader } from '../../roster-data.js';
import { FABLED_ABILITIES, newFabledCharacter, validateFabledCharacter,
  fabledInteger, fabledDie, fabledDice } from './character.js';

export const SERPENT_PROFESSIONS = Object.freeze({
  priest: [7,5,6,9,7,2], mage: [5,5,9,1,8,6], rogue: [8,7,7,2,5,9],
  troubadour: [9,6,6,5,5,7], warrior: [6,9,3,7,6,3], wayfarer: [5,8,4,5,9,7],
});
export const SERPENT_DEFAULTS = Object.freeze({
  rank: 7, stamina: 30, shards: 0, armour: 0, professions: SERPENT_PROFESSIONS,
});
export let SERPENT_FIGHTS = [];
export let SERPENT_SEA_CHECKS = Object.freeze({});
export const SERPENT_RULES = {};
export const loadRoster = createRosterLoader(680, 'FIGHTS', rows => {
  const support = rows.find(row => row.support)?.support;
  if (!support?.seaChecks || !support.rules) throw new Error('Incomplete Serpent King settings');
  SERPENT_FIGHTS = rows.map(({support, ...row}) => row);
  SERPENT_SEA_CHECKS = Object.freeze(support.seaChecks);
  Object.assign(SERPENT_RULES, support.rules);
});

function diceSum(count, roll) {
  let total = 0;
  for (let i=0;i<count;i++) total+=fabledDie(roll);
  return total;
}

export function newSerpentCharacter(profession = 'warrior') {
  const character = newFabledCharacter(profession,SERPENT_DEFAULTS);
  for (const ability of FABLED_ABILITIES) character['base'+ability[0].toUpperCase()+ability.slice(1)] = character[ability];
  return {...character,nahual:0,spiritualWeapon:0,spiritualCombatBonus:0,spiritualArmour:0,heatArmour:0,metalArmour:0,
    obfuscation:false,clarity:false,diseaseBlessing:false,periapt:false,guise:false,
    frenziedMight:false,crazedVim:false,shimasCurse:false,pacharaCirclet:false};
}

function base(character, ability) {
  const key = 'base'+ability[0].toUpperCase()+ability.slice(1);
  return fabledInteger(character[key] ?? character[ability],1,12);
}

export function validateSerpentCharacter(character, alive = false) {
  validateFabledCharacter(character,alive);
  for (const ability of FABLED_ABILITIES) base(character,ability);
  for (const key of ['nahual','spiritualWeapon','spiritualCombatBonus','spiritualArmour','heatArmour','metalArmour'])
    fabledInteger(character[key] ?? 0,0,1000);
  for (const key of ['obfuscation','clarity','diseaseBlessing','periapt','guise',
    'frenziedMight','crazedVim','shimasCurse','pacharaCirclet'])
    if (character[key] !== undefined && typeof character[key] !== 'boolean') throw new RangeError('Invalid Serpent King setting');
  if ((character.heatArmour ?? 0)>character.armour || (character.metalArmour ?? 0)>character.armour)
    throw new RangeError('Armour component exceeds total Defence bonus');
  return character;
}

export function serpentDefence(character, spiritual = false, {mentalPenalty = false, mirror = false} = {}) {
  validateSerpentCharacter(character);
  if (typeof spiritual !== 'boolean' || typeof mentalPenalty !== 'boolean' || typeof mirror !== 'boolean')
    throw new RangeError('Invalid Defence setting');
  if (!spiritual) return base(character,'combat')+character.rank+character.armour;
  const penalty = mentalPenalty ? SERPENT_RULES.mentalPenalty.ability : 0;
  return (character.nahual ?? 0)+Math.max(1,base(character,'magic')-penalty,base(character,'sanctity')-penalty)
    +(character.spiritualArmour ?? 0)+(character.pacharaCirclet&&!mirror ? 2 : 0);
}

export function serpentAbilityCheck(input, ability, difficulty, {spiritual = false, spiritWeapon = false,mentalPenalty = false} = {}, roll) {
  validateSerpentCharacter(input,true);
  if (!FABLED_ABILITIES.includes(ability) || typeof spiritual !== 'boolean' || typeof spiritWeapon !== 'boolean'
    || typeof mentalPenalty!=='boolean')
    throw new RangeError('Invalid ability check');
  fabledInteger(difficulty);
  const character = structuredClone(input);
  const score = spiritual ? Math.max(1,base(character,ability)-(mentalPenalty&&['magic','sanctity'].includes(ability)?SERPENT_RULES.mentalPenalty.ability:0))
    +(spiritWeapon&&ability==='combat' ? character.spiritualCombatBonus ?? 0 : 0) : character[ability];
  const modifier = character.shimasCurse ? -2 : 0;
  character.shimasCurse = false;
  const dice = fabledDice(roll),total = dice+score+modifier;
  return {character,dice,total,success:total>difficulty,usedCurse:modifier!==0};
}

export function burnedHordeCheck(input, {applyEntry = false} = {}, roll) {
  validateSerpentCharacter(input,true);
  if (typeof applyEntry !== 'boolean') throw new RangeError('Invalid entry setting');
  const character = structuredClone(input);
  const rules = SERPENT_RULES.hazards.horde;
  let damage = applyEntry&&!character.guise ? rules.entryDamage : 0;
  character.stamina = Math.max(0,character.stamina-damage);
  if (!character.stamina) return {character,damage,total:null,status:'loss',destination:rules.death};
  const check = serpentAbilityCheck(character,rules.ability,rules.difficulty,{spiritual:true,spiritWeapon:true},roll);
  Object.assign(character,check.character);
  if (!check.success && !character.guise) {
    const injury = diceSum(rules.injuryDice,roll);
    damage += injury;
    character.stamina = Math.max(0,character.stamina-injury);
  }
  return {character,damage,total:check.total,status:!character.stamina?'loss':check.success?'win':'continue',
    destination:!character.stamina?rules.death:check.success?rules.win:null};
}

function finishSerpent(fight, status, destination) {
  fight.status = status;
  fight.destination = destination ?? (status==='win' ? fight.config.win : fight.config.loss);
  fight.pendingAction = null;
  if (status==='loss' && fight.config.lossStamina) fight.character.stamina = fight.config.lossStamina;
}

function hurtSerpent(fight, amount, {attack = false, combat = true} = {}) {
  fabledInteger(amount);
  if (fight.character.guise) amount = 0;
  else if (combat && !fight.config.spiritual && fight.character.crazedVim) amount *= 2;
  if (amount && attack && fight.obfuscationReady) {
    fight.obfuscationReady = false;
    fight.events.push({kind:'obfuscation',prevented:amount});
    amount = 0;
  }
  fight.character.stamina = Math.max(0,fight.character.stamina-amount);
  fight.wounded ||= amount>0;
  if (!fight.character.stamina) finishSerpent(fight,'loss');
  return amount;
}

function poisonProtected(fight) {
  if (fight.character.periapt) return true;
  if (!fight.character.diseaseBlessing) return false;
  fight.character.diseaseBlessing = false;
  fight.events.push({kind:'diseaseBlessing'});
  return true;
}

function validateSerpentFight(fight) {
  if (!fight || fight.family!=='serpent' || fight.rulesRevision!==1 || fight.status!=='fighting'
    || !fight.config || !Array.isArray(fight.enemies) || !fight.enemies.length || !Array.isArray(fight.events))
    throw new RangeError('No active Serpent King fight');
  validateSerpentCharacter(fight.character,true);
  fabledInteger(fight.target,0,fight.enemies.length-1);
  fabledInteger(fight.rounds); fabledInteger(fight.defence,1);
  fabledInteger(fight.attackModifier,-1000,1000); fabledInteger(fight.combatPenalty,0,1000);
  if (!fight.enemies[fight.target].stamina) throw new RangeError('Enemy already defeated');
  for (const foe of fight.enemies) {
    fabledInteger(foe.combat); fabledInteger(foe.defence,1); fabledInteger(foe.stamina);
    fabledInteger(foe.staminaInitial,1);
  }
}

export function startSerpentFight(config, input, options = {}, roll) {
  validateSerpentCharacter(input,true);
  if (!config || !(config.custom === true && config.section === 0) && !SERPENT_FIGHTS.some(spec=>spec.section===config.section)
    || !options || typeof options!=='object' || Array.isArray(options)) throw new RangeError('Invalid encounter');
  const {applyEntry = true,attackModifier = 0,enemyDamage = 0,mentalPenalty = false,
    soldierAmbush = false,obfuscationUse = false,ratPoison = false,flintKnife = false,
    goldenWeapon = false,nyarDisarmed = false,nyarNut = false} = options;
  for (const flag of [applyEntry,mentalPenalty,soldierAmbush,obfuscationUse,ratPoison,flintKnife,goldenWeapon,nyarDisarmed,nyarNut])
    if (typeof flag!=='boolean') throw new RangeError('Invalid encounter setting');
  fabledInteger(attackModifier,-1000,1000);
  const sectionFor = special => SERPENT_FIGHTS.find(spec=>spec.special===special)?.section;
  if (mentalPenalty && config.section!==sectionFor('grimEscape') || soldierAmbush && config.section!==sectionFor('soldiers')
    || (nyarDisarmed||nyarNut) && config.section!==sectionFor('nyarContinuation')) throw new RangeError('Setting does not apply to encounter');
  if (obfuscationUse&&!input.obfuscation || ratPoison&&(!config.ratPoison||!input.ratPoison))
    throw new RangeError('Protection unavailable');
  const character = structuredClone(input),enemies = structuredClone(config.enemies);
  const defence = options.defence ?? serpentDefence(character,!!config.spiritual,{mentalPenalty});
  fabledInteger(defence,1);
  if (config.special==='mirror') {
    Object.assign(enemies[0],{combat:(character.nahual??0)+(character.spiritualWeapon??0),
      defence:serpentDefence(character,true,{mirror:true}),stamina:character.staminaInitial});
  }
  for (const foe of enemies) foe.staminaInitial = foe.stamina;
  fabledInteger(enemyDamage,0,enemies[0].stamina-1);
  enemies[0].stamina -= enemyDamage;
  if (nyarNut) enemies[0].combat+=SERPENT_RULES.nyarNutBonus;
  const fight = {family:'serpent',rulesRevision:1,config:structuredClone(config),character,enemies,
    target:0,rounds:0,status:'fighting',destination:null,events:[],wounded:false,
    defence,attackModifier:attackModifier+(config.attackModifier??0)+(ratPoison?3:0),combatPenalty:0,
    mentalPenalty,obfuscationReady:obfuscationUse,negateNextHit:false,unarmed:!!config.unarmed||nyarDisarmed,
    flintKnife,goldenWeapon,pendingAction:null,grimEscapeOffered:false,nyarActionResolved:false};
  if (obfuscationUse) character.obfuscation = false;
  // Skabb's printed poison bonus does not consume the poison.
  if (ratPoison) fight.events.push({kind:'ratPoison',modifier:3});
  if (config.special==='lightning') fight.defence -= character.metalArmour??0;
  if (config.heat) fight.attackModifier -= character.heatArmour??0;
  if (config.mildHeat && character.heatArmour) fight.attackModifier-=SERPENT_RULES.mildHeatPenalty;
  if (soldierAmbush) { enemies[0].combat-=SERPENT_RULES.soldierAmbush.combat; enemies[0].stamina=Math.max(0,enemies[0].stamina-SERPENT_RULES.soldierAmbush.stamina); }
  if (applyEntry && mentalPenalty && !character.guise) character.stamina=Math.ceil(character.stamina/SERPENT_RULES.mentalPenalty.staminaDivisor);
  if (applyEntry && config.special==='brokenFingers') {
    const before = base(character,'combat');
    character.baseCombat = Math.max(1,before-SERPENT_RULES.brokenFingersLoss);
    character.combat = Math.max(1,character.combat-(before-character.baseCombat));
    fight.defence -= before-character.baseCombat;
    fight.events.push({kind:'abilityDrain',ability:'combat',amount:before-character.baseCombat});
  }
  if (applyEntry && config.entryDamage) {
    const damage = hurtSerpent(fight,config.entryDamage,{combat:false});
    fight.events.push({kind:'entry',damage});
  }
  if (fight.status==='fighting' && applyEntry && config.special==='ghouls') {
    const rules=SERPENT_RULES.ghouls;
    const check = serpentAbilityCheck(character,rules.ability,rules.difficulty,{},roll);
    fight.character = check.character;
    if (!check.success && character.profession!==rules.immuneProfession) fight.combatPenalty=rules.combatPenalty;
    fight.events.push({kind:'abilityCheck',ability:rules.ability,total:check.total,difficulty:rules.difficulty,success:check.success});
  }
  if (!enemies[0].stamina && fight.status==='fighting') fight.target++;
  if (fight.status==='fighting' && config.special==='grimEscape' && character.stamina<=SERPENT_RULES.grimEscape.stamina) {
    fight.grimEscapeOffered=true; fight.pendingAction='grimEscape';
  }
  if (fight.status==='fighting') validateSerpentFight(fight);
  return fight;
}

function attackSerpent(fight, direction, options, roll) {
  const foe = fight.enemies[fight.target],player = direction==='player';
  const spiritual = !!fight.config.spiritual;
  const clarity = options.clarity===direction;
  const count = clarity ? player?3:1 : 2;
  let curse = player && fight.character.shimasCurse ? -2 : 0;
  if (curse) fight.character.shimasCurse=false;
  if (clarity) { fight.character.clarity=false; fight.events.push({kind:'clarity',direction}); }
  const score = player ? (spiritual ? (fight.character.nahual??0)+(fight.character.spiritualWeapon??0)
    : fight.unarmed ? base(fight.character,'combat') : fight.character.combat+(fight.character.frenziedMight?1:0))
      +fight.attackModifier-fight.combatPenalty : foe.combat;
  const defence = player?foe.defence:fight.defence;
  const throwDice = () => Array.from({length:count},()=>fabledDie(roll)).reduce((sum,value)=>sum+value,0);
  let dice = throwDice();
  const blessing = options.luckReroll===direction ? 'luckBlessing'
    : player && options.combatBlessing && dice+score+curse<=defence ? 'combatBlessing' : null;
  if (blessing) {
    fight.character[blessing]=false;
    fight.events.push({kind:'reroll',direction,blessing,previous:dice});
    dice=throwDice(); curse=0;
  }
  const total = dice+score+curse;
  let damage = Math.max(0,total-defence);
  if (player) {
    if (fight.config.special==='goldenWeapon' && !fight.goldenWeapon) damage=0;
    if (damage && fight.negateNextHit) { damage=0; fight.negateNextHit=false; fight.events.push({kind:'negatedHit'}); }
    foe.stamina=Math.max(0,foe.stamina-damage);
  } else {
    if (fight.config.special==='ghouls') damage+=SERPENT_RULES.ghouls.damageBonus;
    if (fight.config.special==='lightning' && fabledDie(roll)>=SERPENT_RULES.lightning.minimum) damage+=SERPENT_RULES.lightning.damage;
    damage=hurtSerpent(fight,damage,{attack:true});
  }
  fight.events.push({kind:'attack',direction,enemy:foe.name,dice,total,defence,damage,
    ...(foe.displayName?{enemyDisplayName:foe.displayName}:{})});
  return player && foe.stamina<=(fight.config.threshold??0);
}

function baronMagic(fight, roll) {
  const foe = fight.enemies[fight.target],die = fabledDie(roll),returned=fight.config.special==='baronReturned';
  const rules=SERPENT_RULES.baron,outcome=(returned?rules.returnedOutcomes:rules.outcomes)[die-1];
  if (outcome==='penalty') { fight.combatPenalty+=rules.penalty; fight.events.push({kind:'combatPenalty',amount:rules.penalty}); }
  else if (outcome==='negate') fight.negateNextHit=true;
  else if (outcome==='heal') {
    const before=foe.stamina;
    foe.stamina=Math.min(foe.staminaInitial,foe.stamina+diceSum(rules.healingDice,roll));
    fight.events.push({kind:'enemyHealing',amount:foe.stamina-before});
  } else if (outcome==='damage') {
    const damage=hurtSerpent(fight,diceSum(rules.damageDice,roll),{attack:true});
    fight.events.push({kind:'sorcery',damage});
  }
}

export function serpentRound(input, options = {}, roll) {
  validateSerpentFight(input);
  if (input.pendingAction) throw new RangeError('Resolve the pending action first');
  const {combatBlessing=false,luckReroll=null,clarity=null}=options;
  if (typeof combatBlessing!=='boolean' || ![null,'player','enemy'].includes(luckReroll)
    || ![null,'player','enemy'].includes(clarity)) throw new RangeError('Invalid round setting');
  if (combatBlessing&&!input.character.combatBlessing || luckReroll&&!input.character.luckBlessing
    || clarity&&(!input.config.spiritual||!input.character.clarity)) throw new RangeError('Blessing unavailable');
  const fight=structuredClone(input);
  fight.rounds++;
  let defeated=false;
  const player = () => {
    const count=!fight.config.spiritual&&fight.character.crazedVim?2:1;
    for (let i=0;i<count && !defeated;i++) {
      const current={...options,combatBlessing:combatBlessing&&fight.character.combatBlessing,
        luckReroll:luckReroll&&fight.character.luckBlessing?luckReroll:null,
        clarity:clarity&&fight.character.clarity?clarity:null};
      defeated=attackSerpent(fight,'player',current,roll);
    }
  };
  const opponent = () => {
    attackSerpent(fight,'enemy',{...options,clarity:clarity&&fight.character.clarity?clarity:null},roll);
    if (fight.status==='fighting' && ['baron','baronReturned'].includes(fight.config.special)) baronMagic(fight,roll);
  };
  if (fight.config.playerFirst===false) { opponent(); if (fight.status==='fighting') player(); }
  else { player(); if (!defeated) opponent(); }
  if (fight.status==='fighting' && fight.config.special==='blowgun') {
    const shot=fabledDice(roll),damage=shot<=SERPENT_RULES.blowgunMaximum?hurtSerpent(fight,shot,{attack:true}):0;
    fight.events.push({kind:'blowgun',dice:shot,damage});
  }
  if (fight.status!=='fighting') return fight;
  if (defeated) {
    if (fight.target<fight.enemies.length-1) fight.target++;
    else if (fight.config.special==='lightning') {
      if (fight.flintKnife) finishSerpent(fight,'win',SERPENT_RULES.lightning.knifeWin);
      else {
        const injury=diceSum(SERPENT_RULES.lightning.escapeDice,roll);
        const damage=hurtSerpent(fight,injury,{attack:true});
        fight.events.push({kind:'forcedEscape',damage});
        if (fight.status==='fighting') finishSerpent(fight,'fled',SERPENT_RULES.lightning.escapeDestination);
      }
    } else finishSerpent(fight,'win');
  } else if (fight.config.special==='constables' && fight.rounds>=SERPENT_RULES.constableRounds) finishSerpent(fight,'win');
  if (fight.status==='fighting') {
    if (!fight.nyarActionResolved && fight.config.special==='nyarTrackers' && fight.rounds===SERPENT_RULES.nyarTrackers.round)
      fight.pendingAction='nyarTrackers';
    if (!fight.nyarActionResolved && fight.config.special==='nyarWarrior' && fight.rounds===SERPENT_RULES.nyarWarrior.round)
      fight.pendingAction='nyarWarrior';
    if (fight.config.special==='grimEscape' && fight.character.stamina<=SERPENT_RULES.grimEscape.stamina && !fight.grimEscapeOffered) {
      fight.grimEscapeOffered=true; fight.pendingAction='grimEscape';
    }
  }
  return fight;
}

export function resolveSerpentAction(input, {escape = false,ability = 'magic',luckReroll = false} = {}, roll) {
  validateSerpentFight(input);
  if (!input.pendingAction || typeof escape!=='boolean' || escape&&input.character.frenziedMight
    || !SERPENT_RULES.grimEscape.abilities.includes(ability)
    || typeof luckReroll!=='boolean' || luckReroll&&!input.character.luckBlessing) throw new RangeError('Invalid special action');
  const fight=structuredClone(input),action=fight.pendingAction;
  fight.pendingAction=null;
  const check = (stat,difficulty,spiritual=false) => {
    const settings={spiritual,mentalPenalty:spiritual&&fight.mentalPenalty};
    let result=serpentAbilityCheck(fight.character,stat,difficulty,settings,roll);
    fight.character=result.character;
    if (luckReroll && !result.success) {
      fight.character.luckBlessing=false;
      fight.events.push({kind:'reroll',direction:'player',blessing:'luckBlessing',previous:result.dice});
      result=serpentAbilityCheck(fight.character,stat,difficulty,settings,roll);
      fight.character=result.character;
    }
    fight.events.push({kind:'abilityCheck',ability:stat,total:result.total,difficulty,success:result.success});
    return result.success;
  };
  if (action==='grimEscape') {
    if (escape && check(ability,SERPENT_RULES.grimEscape.difficulty,true)) finishSerpent(fight,'fled',SERPENT_RULES.grimEscape.destination);
  } else {
    fight.nyarActionResolved=true;
    const die=fabledDie(roll);
    fight.events.push({kind:'nyarTactic',action,die});
    if (action==='nyarTrackers') {
      const rules=SERPENT_RULES.nyarTrackers;
      if (die<=rules.penaltyMaximum) fight.combatPenalty+=rules.penalty;
      else if (!check(rules.ability,rules.difficulty) && !poisonProtected(fight)) {
        const injury=diceSum(rules.poisonDice,roll);
        const damage=hurtSerpent(fight,injury,{attack:true});
        fight.events.push({kind:'poison',damage});
      }
    } else if (action==='nyarWarrior') {
      const rules=SERPENT_RULES.nyarWarrior;
      if (die<=rules.poisonMaximum) {
        if (!poisonProtected(fight)) { fight.character.stamina=0; finishSerpent(fight,'loss'); }
      } else if (die<=rules.healingMaximum) {
        fight.enemies[fight.target].combat+=rules.combatBonus;
        fight.enemies[fight.target].stamina=Math.min(fight.enemies[fight.target].staminaInitial,fight.enemies[fight.target].stamina+rules.healing);
      } else fight.unarmed=true;
    } else throw new RangeError('Unknown special action');
  }
  return fight;
}

export function fleeSerpentFight(input, roll) {
  validateSerpentFight(input);
  if (!input.config.flee || input.pendingAction || input.character.frenziedMight) throw new RangeError('Fleeing unavailable');
  const fight=structuredClone(input);
  if (fight.config.flee.special==='spider') {
    const dice=fabledDice(roll),damage=dice<=SERPENT_RULES.spiderEscapeMaximum?hurtSerpent(fight,dice,{attack:true}):0;
    fight.events.push({kind:'entry',damage});
  }
  if (fight.status==='fighting') finishSerpent(fight,'fled',fight.config.flee.destination);
  return fight;
}

export function cancelSerpentFight(input) {
  validateSerpentFight(input);
  const fight=structuredClone(input);
  finishSerpent(fight,'cancelled',null);
  fight.destination=null;
  return fight;
}

export function serpentSeaCheck(section, input, options = {}, roll) {
  validateSerpentCharacter(input,true);
  if (!Object.hasOwn(SERPENT_SEA_CHECKS,section)) throw new RangeError('Invalid sea check');
  const {ship='barque',crew='average',safetyFromStorms=false,emptyCargo=false}=options;
  if (!['barque','brigantine','galleon'].includes(ship) || !['poor','average','good','excellent'].includes(crew)
    || typeof safetyFromStorms!=='boolean' || typeof emptyCargo!=='boolean') throw new RangeError('Invalid ship settings');
  const spec=SERPENT_SEA_CHECKS[section],character=structuredClone(input),rules=SERPENT_RULES.sea;
  const result={character,kind:spec.kind,total:null,damage:0,status:'story',usedBlessing:false};
  if (safetyFromStorms) {
    if (spec.kind!=='storm'||!character.stormsBlessing) throw new RangeError('Storm blessing unavailable');
    character.stormsBlessing=false;
    return {...result,destination:spec.safe,usedBlessing:true};
  }
  let count=rules.baseDice,modifier=0;
  if (spec.kind==='storm') {
    count=rules.shipDice[ship];
    modifier=rules.stormCrew[crew];
  } else if (spec.kind==='tempest') modifier=(ship==='galleon'?rules.tempestGalleonBonus:0)+(rules.stormCrew[crew]);
  else if (spec.kind==='boarding') modifier=(character.profession==='warrior'?rules.boardingWarriorBonus:0)
    +(character.rank>=spec.rankBonus?rules.boardingRankBonus:0)+rules.boardingCrew[crew];
  else if (spec.kind==='naval') {
    count=rules.navalDice[character.profession==='warrior'?'warrior':'other'];
    modifier=character.rank+rules.navalCrew[crew];
  } else if (spec.kind==='escape') modifier=(crew==='excellent'?rules.escapeExcellentBonus:0)+(emptyCargo?rules.emptyCargoBonus:0);
  result.total=modifier;
  for (let i=0;i<count;i++) result.total+=fabledDie(roll);
  if (spec.kind==='shipwreck') {
    if (result.total>character.rank) {character.stamina=0;result.status='loss';result.destination=rules.death;}
    else {
      if (spec.injury&&!character.guise) {
        result.damage=diceSum(rules.wreckInjuryDice,roll);
        character.stamina=Math.max(0,character.stamina-result.damage);
      }
      result.destination=character.stamina?spec.safe:rules.death;
      if (!character.stamina) result.status='loss';
    }
  } else if (spec.kind==='escape') result.destination=spec.destinations[result.total>=rules.escapeMinimum?1:0];
  else {
    const outcome=result.total<=spec.thresholds[0]?0:result.total<=spec.thresholds[1]?1:2;
    result.destination=spec.destinations[outcome];
    if (result.destination===rules.death) {character.stamina=0;result.status='loss';}
    else if (outcome===2&&(spec.victory||spec.kind==='naval')) result.status='win';
  }
  return result;
}

export function javelinSnakesCheck(input, {obfuscationUse=false,luckReroll=false} = {}, roll) {
  validateSerpentCharacter(input,true);
  if (typeof obfuscationUse!=='boolean'||typeof luckReroll!=='boolean'
    || obfuscationUse&&!input.obfuscation || luckReroll&&!input.luckBlessing)
    throw new RangeError('Protection unavailable');
  const character=structuredClone(input);
  if (obfuscationUse) character.obfuscation=false;
  let dice=fabledDice(roll);
  if (luckReroll) {character.luckBlessing=false;dice=fabledDice(roll);}
  const rules=SERPENT_RULES.hazards.snakes;
  const defence=serpentDefence(character)-(character.heatArmour??0),total=dice+rules.combat;
  let damage=Math.max(0,total-defence);
  if (character.guise||obfuscationUse) damage=0;
  else if (character.crazedVim) damage*=2;
  character.stamina=Math.max(0,character.stamina-damage);
  return {character,dice,total,defence,damage,status:character.stamina?'story':'loss',
    destination:!character.stamina?rules.death:damage?rules.wounded:rules.safe};
}
