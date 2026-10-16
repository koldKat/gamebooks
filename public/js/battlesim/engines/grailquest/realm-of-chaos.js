import { customGrailEncounter } from './opponents.js';
import { REALM_EQUIPMENT, REALM_ASTRAL_KEY, REALM_ENCOUNTERS, REALM_DREAMS } from './realm-of-chaos-roster.js';

const integer = (value, minimum = 0) => Number.isSafeInteger(value) && value >= minimum;
const die = random => 1 + Math.floor(random() * 6);
const dice = random => die(random) + die(random);
const clone = value => JSON.parse(JSON.stringify(value));

export function createRealmCharacter() {
  return { life: 0, maxLife: 0, permanent: 0, experience: 0, gold: 0,
    hit: 4, bonus: 5, armour: 4, weapon: 'ej', potions: 0, salves: 0,
    equipment: [], ghosts: {}, visited: [], fungoidRot: false,
    dreamDisease: false, dragonCalls: 0, madFights: 0, pathwalker: 0,
    incarnationPenalty: 0, companion: null, dreamCompanions: [],
    healingWand: false, horrorgem: false, spookBasher: false, dragonStone: false };
}

export function initialRealmLife(permanent = 0, random = Math.random) {
  if (!integer(permanent)) throw new RangeError('Invalid permanent LIFE');
  const carried = Math.min(10, permanent);
  const rolls = Array.from({ length: 3 }, () => dice(random));
  const life = Math.max(...rolls) * 4 + carried;
  return { life, maxLife: life, permanent: carried, rolls };
}

export function realmStrike(roll, hit = 6, bonus = 0, armour = 0, { fixedDamage = null, fullDice = false } = {}) {
  if (!integer(roll, 2) || roll > 12 || !integer(hit, 1) || hit > 12 || !integer(bonus)
    || !integer(armour) || fixedDamage !== null && !integer(fixedDamage)) {
    throw new RangeError('Invalid strike');
  }
  const landed = roll >= hit;
  const raw = fixedDamage ?? ((fullDice ? roll : roll - hit) + bonus);
  return { hit: landed, damage: landed ? Math.max(0, raw - armour) : 0 };
}

export function realmChooseEquipment(character, chosen) {
  if (!Array.isArray(chosen) || chosen.length > 6 || new Set(chosen).size !== chosen.length
    || chosen.some(id => !REALM_EQUIPMENT.includes(id))) throw new RangeError('Choose up to six distinct items');
  character.equipment = [...chosen];
  return character.equipment;
}

export function realmFriendlyReaction(random = Math.random) {
  const enemy = die(random), player = die(random) + die(random) + die(random);
  return { enemy, player, success: player < enemy };
}

export function realmBribe(character, amount, random = Math.random) {
  if (!integer(amount, 1) || !integer(character.gold) || character.gold < amount) {
    throw new RangeError('Insufficient gold for bribe');
  }
  character.gold -= amount;
  const roll = dice(random);
  return { roll, amount, success: roll >= 8 };
}

export function realmHeal(character, kind, random = Math.random) {
  if (character.life <= 0) return null;
  let healing;
  if (kind === 'potion' && integer(character.potions, 1)) {
    character.potions--; healing = dice(random);
  } else if (kind === 'salve' && integer(character.salves, 1)) {
    character.salves--; healing = 3;
  } else return null;
  const before = character.life;
  character.life = Math.min(character.maxLife, character.life + healing);
  return { kind, healing, restored: character.life - before };
}

export function realmAstralRoll(character, random = Math.random) {
  const roll = dice(random);
  if ([6, 9, 12].includes(roll)) {
    character.pathwalker = 2;
    return { roll, pathwalker: 2, destination: null };
  }
  character.pathwalker = 0;
  return { roll, pathwalker: 0, destination: REALM_ASTRAL_KEY[roll] };
}

export function realmWalkPath(character) {
  if (!integer(character.pathwalker, 1) || character.pathwalker > 2) return false;
  character.pathwalker--;
  return true;
}

export function realmDragonReaction(character, random = Math.random) {
  if (!integer(character.dragonCalls) || character.dragonCalls >= 3) return null;
  character.dragonCalls++;
  const first = die(random), second = die(random);
  return { first, second, friendly: second > first, callsLeft: 3 - character.dragonCalls };
}

export function realmHealingWand(character, random = Math.random) {
  if (character.life <= 0) return null;
  const roll = die(random);
  if (roll === 6) { character.life = 0; return { roll, dead: true }; }
  const healing = dice(random), before = character.life;
  character.life = Math.min(character.maxLife, character.life + healing);
  return { roll, dead: false, healing, restored: character.life - before };
}

export function realmSleep(character, random = Math.random) {
  if (character.life <= 0) return null;
  const roll=die(random);
  if(roll<=4)return {roll,dream:true};
  const healing=dice(random),before=character.life;
  character.life=Math.min(character.maxLife,character.life+healing);
  return {roll,dream:false,healing,restored:character.life-before};
}

export function realmDreamScore(random = Math.random) { return dice(random); }

export function realmStrengthContest(character, random = Math.random) {
  if(character.life<=0)return null;
  const player=dice(random),enemy=dice(random);
  if(player<enemy)character.life=0;
  return {player,enemy,outcome:player<enemy?'loss':player>enemy?'win':'unspecified-tie'};
}

export function realmVisit(character, section) {
  const number=Number(section);
  if(!integer(number,1)||number>221)return false;
  if(character.dreamDisease && character.life>0)character.life--;
  if(!character.visited.includes(number))character.visited.push(number);
  return true;
}

export function realmReincarnate(character, random = Math.random) {
  const rolled=initialRealmLife(character.permanent,random);
  const penalty=character.incarnationPenalty;
  Object.assign(character,rolled);
  character.life-=penalty;character.maxLife-=penalty;character.incarnationPenalty=0;
  character.gold=0;
  return {...rolled,life:character.life,maxLife:character.maxLife,penalty};
}

export function realmDream(character, number, random = Math.random) {
  if (!integer(number, 2) || number > 12) throw new RangeError('Invalid Dreamtime score');
  if (character.life <= 0) return null;
  const result = { number };
  switch (number) {
    case 2: result.loss = dice(random); character.life -= result.loss; break;
    case 3: {
      result.roll = die(random); result.amount = dice(random);
      character.life += result.roll > 3 ? result.amount : -result.amount; break;
    }
    case 4: result.roll = dice(random); result.wake = result.roll === 12; break;
    case 5:
      character.life -= 10;
      if (character.life > 0) character.life *= 2;
      break;
    case 6: result.encounter = 'dream6'; break;
    case 7: {
      result.roll = die(random);
      character.life *= result.roll <= 3 ? 0.5 : 1.5; break;
    }
    case 8: result.redream = true; break;
    case 9:
      result.rolls = [];
      for (let index = 0; index < 3; index++) {
        const roll = die(random); result.rolls.push(roll);
        if (roll <= 2) { character.life = 0; break; }
        character.life += roll;
      }
      break;
    case 10: result.wake = true; break;
    case 11: character.dreamDisease = true; break;
    case 12: result.optionalEncounter = 'dream12'; break;
  }
  result.dead = character.life <= 0;
  return result;
}

export function realmTargets(fight) {
  return fight.foes.map((foe, index) => ({ foe, index })).filter(({ foe }) => {
    if (foe.bypassed) return false;
    if (fight.spec.winByHealing) return foe.life > 0 && foe.life < fight.spec.winByHealing;
    const stop = fight.spec.enemyStop ?? (fight.spec.deathRequired || fight.options.killEnemies ? 0 : 5);
    return fight.spec.enemyStopStrict ? foe.life >= stop : foe.life > stop;
  });
}

function settle(fight) {
  if (fight.status !== 'fighting') return;
  const stop = fight.spec.playerStop ?? 5;
  if (fight.player.life <= 0 || (fight.spec.playerStopStrict ? fight.player.life < stop : fight.player.life <= stop)) {
    fight.status = fight.spec.nonlethal && fight.player.life > 0 ? 'knockout' : 'loss';
  } else if (!realmTargets(fight).length) {
    fight.status = 'win';
  }
  if (fight.status === 'win' && !fight.rewarded && !fight.spec.dream) {
    fight.player.experience++;
    if (fight.player.experience % 20 === 0) {
      fight.player.permanent++; fight.player.maxLife++; fight.player.life++;
    }
    fight.rewarded = true;
  }
  if (fight.status === 'win' && fight.spec.cureDreamDisease) fight.player.dreamDisease = false;
}

export function rerollRealmInitiative(fight, random = Math.random) {
  if (fight.status !== 'fighting' || fight.first) return null;
  const player = dice(random), enemy = dice(random);
  fight.first = player === enemy ? null : player > enemy ? 'player' : 'enemy';
  return { player, enemy, first: fight.first };
}

export function startRealmFight(character, encounterId, options = {}, random = Math.random) {
  const original = [...REALM_ENCOUNTERS, ...REALM_DREAMS].find(row => row.id === encounterId) ?? customGrailEncounter(encounterId, options.opponents);
  if (!original) throw new RangeError('Unknown encounter');
  if (!(Number.isFinite(character.life) && character.life > 5 && Number.isFinite(character.maxLife)
    && character.maxLife > 5)) throw new RangeError('A conscious character is required');
  const spec = clone(original), player = clone(character), settings = clone(options);
  if (spec.manualStats) {
    const stats = settings.manualStats;
    if (!stats || !integer(stats.life, 16) || !integer(stats.hit, 1) || stats.hit > 12 || !integer(stats.bonus)) {
      throw new RangeError('Enter the missing opponent LIFE, hit score and damage bonus');
    }
    Object.assign(spec.enemies[0], stats);
  }
  if (spec.manualBonus) {
    if (!integer(settings.enemyBonus)) throw new RangeError('Enter the missing printed damage bonus');
    spec.enemies[0].bonus = settings.enemyBonus;
  }
  const count = spec.countRoll ? die(random) : spec.count || 1;
  const enemies = spec.count || spec.countRoll ? Array.from({length:count},()=>spec.enemies[0]) : spec.enemies;
  const foes = enemies.map((foe, index) => ({ ...foe, life:foe.life, maxLife:foe.life,
    bypassed: !spec.astral && !spec.dream && !!player.ghosts?.[spec.id]?.[index] }));
  const fight = { rulesVersion:1, spec, options:settings, player, foes, status:'fighting',
    first:null, rounds:0, events:[], rewarded:false, consecutiveMisses:0, spawned:false,
    poison:0, paralysis:0, enemyStrikes:0, playerStrikes:0, target:0,
    playerHit:spec.playerHit ?? (spec.unarmed ? 6 : player.hit),
    playerBonus:spec.unarmed ? 0 : player.bonus,
    playerArmour:spec.dream ? 0 : player.armour,
    playerAttacks:spec.playerAttacks || 1, madActive:false, friendlyAttempts:[], bribeAttempts:[] };
  if (foes.every(foe=>foe.bypassed)) { fight.status='avoided'; return fight; }
  if (spec.dream) { fight.playerHit=6; fight.playerBonus=0; }
  if (!spec.dream && player.fungoidRot) {
    if (player.permanent > 0) {
      player.permanent--; player.maxLife--; player.life--;
    } else player.life--;
  }
  if (!settings.openingApplied) {
    player.life -= spec.openingPlayerLoss || 0;
    if (spec.openingEnemyLoss) foes[0].life -= spec.openingEnemyLoss;
  }
  if (settings.stake && spec.stake && player.equipment.includes('stake')) {
    fight.stake=true; fight.playerHit=6; fight.playerBonus=0;
  }
  settle(fight);
  if (fight.status==='fighting') rerollRealmInitiative(fight,random);
  return fight;
}

function recordDeath(fight, foe, index) {
  if (foe.life > 0) return;
  if (fight.spec.killingForbidden) {
    fight.player.life=0; fight.status='loss'; return;
  }
  if (!fight.spec.astral && !fight.spec.dream && !foe.summoned) {
    (fight.player.ghosts[fight.spec.id] ||= {})[index]=true;
  }
  if (fight.spec.recruitKilled && !foe.recruited) {
    fight.player.dreamCompanions.push({name:foe.name,life:foe.maxLife,hit:foe.hit,bonus:foe.bonus});
    foe.recruited=true;
  }
}

function playerBlow(fight, target, random) {
  if (fight.status!=='fighting') return null;
  const foe = realmTargets(fight).find(row=>row.index===target)?.foe;
  if (!foe) return null;
  const roll=dice(random);
  if (fight.spec.playerFatalRolls?.includes(roll)) {
    fight.player.life=0; fight.status='loss'; return {kind:'fall',roll,dead:true};
  }
  let bonus=fight.playerBonus;
  if (fight.madActive && !fight.madUsed) { bonus+=5; fight.madUsed=true; }
  const strike=realmStrike(roll,fight.playerHit,bonus,foe.armour,
    { fullDice: !!fight.options.ghastFullDice && fight.spec.id===137 });
  fight.playerStrikes++;
  if (strike.hit) {
    fight.consecutiveMisses=0;
    if (fight.spec.winByHealing) foe.life+=strike.damage;
    else if (fight.stake) foe.life=0;
    else foe.life-=strike.damage;
    recordDeath(fight,foe,target);
  } else {
    fight.consecutiveMisses++;
    if (!fight.spawned && fight.spec.spawnAfterMisses && fight.consecutiveMisses>=fight.spec.spawnAfterMisses) {
      const hatched=clone(fight.spec.enemies[0]);
      fight.foes.push({...hatched,maxLife:hatched.life,bypassed:false}); fight.spawned=true;
    }
  }
  settle(fight);
  return {kind:'player',target,roll,...strike};
}

function enemyBlow(fight, index, random) {
  if (fight.status!=='fighting') return null;
  const foe=realmTargets(fight).find(row=>row.index===index)?.foe;
  if (!foe) return null;
  const roll=dice(random);
  fight.enemyStrikes++;
  const hitsAlly=!!fight.ally && fight.ally.life>5 && !!fight.options.allyTakesHits;
  if (foe.fatalRolls?.includes(roll)) {
    if(hitsAlly)fight.ally.life=0;
    else{
      fight.player.life=0;
      if (foe.incarnationPenalty) fight.player.incarnationPenalty=foe.incarnationPenalty;
    }
    settle(fight);
    return {kind:'enemy',target:index,roll,dead:true};
  }
  const strike=realmStrike(roll,foe.hit,foe.bonus,hitsAlly?(fight.ally.armour||0):fight.playerArmour,
    {fixedDamage:foe.fixedDamage ?? null});
  if (strike.hit) {
    if(hitsAlly) {
      fight.ally.life-=strike.damage;
    } else fight.player.life-=strike.damage;
    if (foe.poison && !hitsAlly) fight.poison=foe.poison;
    if (foe.poison && hitsAlly) fight.allyPoison=foe.poison;
    if (foe.paralyseRoll===roll && !hitsAlly) fight.paralysis=1;
    if (foe.paralyseRoll===roll && hitsAlly) fight.allyParalysis=1;
  }
  settle(fight);
  return {kind:'enemy',target:index,roll,...strike};
}

export function rollRealmRound(fight, target = 0, random = Math.random) {
  if (fight.status!=='fighting' || !fight.first || !realmTargets(fight).some(row=>row.index===target)) return null;
  fight.rounds++;
  const events=[];
  if(fight.allyPoison && fight.ally?.life>0){
    fight.ally.life-=fight.allyPoison;events.push({kind:'allyPoison',damage:fight.allyPoison});
  }
  if (fight.poison) {
    fight.player.life-=fight.poison; events.push({kind:'poison',damage:fight.poison}); settle(fight);
  }
  if (fight.status==='fighting' && fight.spec.lossEvery && fight.rounds%fight.spec.lossEvery===0) {
    fight.player.life-=fight.spec.periodicLoss;
    events.push({kind:'breath',damage:fight.spec.periodicLoss}); settle(fight);
  }
  if (!fight.spec.dream && fight.rounds===1 && fight.player.madFights>0) {
    fight.madActive=true; fight.player.madFights--;
  }
  const playerTurn=()=>{
    if (fight.paralysis) { fight.paralysis--; events.push({kind:'paralysed'}); }
    else {
      for (let attack=0;attack<fight.playerAttacks && fight.status==='fighting';attack++) {
        const current=realmTargets(fight).some(row=>row.index===target) ? target : realmTargets(fight)[0]?.index;
        if (current===undefined) break;
        const result=playerBlow(fight,current,random); if(result)events.push(result);
      }
    }
    for(const ally of [fight.ally,...(fight.extraAllies||[])].filter(Boolean)){
      const current=realmTargets(fight).some(row=>row.index===target) ? target : realmTargets(fight)[0]?.index;
      if(ally===fight.ally && fight.allyParalysis){fight.allyParalysis--;events.push({kind:'allyParalysed'});continue;}
      if(ally.life<=5 || fight.status!=='fighting' || current===undefined)continue;
      const foe=fight.foes[current],roll=dice(random);
      if(ally.fatalRolls?.includes(roll))foe.life=0;
      const strike=realmStrike(roll,ally.hit,ally.bonus,foe.armour,
        {fixedDamage:ally.fixedDamage??null});
      if(strike.hit){
        if(fight.spec.winByHealing && foe.life>0)foe.life+=strike.damage;
        else foe.life-=strike.damage;
      }
      recordDeath(fight,foe,current);settle(fight);
      events.push({kind:'ally',name:ally.name,target:current,roll,...strike});
    }
  };
  const enemyTurn=()=>{
    for (const {index} of [...realmTargets(fight)]) {
      const result=enemyBlow(fight,index,random); if(result)events.push(result);
      if(fight.status!=='fighting')break;
    }
  };
  if(fight.first==='player'){playerTurn();enemyTurn();}else{enemyTurn();playerTurn();}
  fight.events.push(...events);
  for(const ally of [fight.ally,...(fight.extraAllies||[])].filter(Boolean)){
    if(ally.source==='mastiff')fight.player.companion=clone(ally);
    if(ally.source==='dream')fight.player.dreamCompanions[ally.sourceIndex]=clone(ally);
  }
  if(fight.ally?.source==='dragon' && fight.ally.life<=5)fight.ally=null;
  return events;
}

export function realmUseCompanion(fight, source, index = 0) {
  if(fight.status!=='fighting' || fight.spec.dream || fight.rounds)return false;
  if([fight.ally,...(fight.extraAllies||[])].some(ally=>ally?.source===source && (source==='mastiff' || ally.sourceIndex===index)))return false;
  const companion=source==='mastiff'?fight.player.companion
    :source==='dream'?fight.player.dreamCompanions[index]:null;
  if(!companion || companion.life<=5 || fight.spec.enemies.some(foe=>foe.name===companion.forbiddenOpponent))return false;
  const ally={...clone(companion),source,sourceIndex:index};
  if(fight.ally)(fight.extraAllies||=[]).push(ally);else fight.ally=ally;
  return true;
}

export function realmCallDragon(fight, random = Math.random) {
  if(fight.status!=='fighting' || fight.spec.dream || !fight.player.dragonStone || fight.ally
    || fight.options.oneUseStone && fight.player.dragonCalls>=1)return null;
  const reaction=realmDragonReaction(fight.player,random);
  if(!reaction)return null;
  const dragon=clone(REALM_ENCOUNTERS.find(spec=>spec.id===12).enemies[0]);
  dragon.maxLife=dragon.life;
  if(reaction.friendly)fight.ally={...dragon,source:'dragon'};
  else fight.foes.push({...dragon,summoned:true,bypassed:false});
  const result={kind:'dragon',...reaction};fight.events.push(result);
  return result;
}

export function settleRealmFight(fight) { settle(fight); }

export function realmUseSpookBasher(fight, random = Math.random) {
  if(fight.status!=='fighting' || !fight.spec.spookBasher || !fight.player.spookBasher || fight.rounds || fight.spookBasherTried)return null;
  fight.spookBasherTried=true;
  const roll=dice(random);
  if(roll>=6){
    for(const {foe,index} of realmTargets(fight)){foe.life=0;recordDeath(fight,foe,index);}
    settle(fight);
  }
  const result={kind:'spookBasher',roll,success:roll>=6};fight.events.push(result);
  return result;
}

export function realmUseHorrorgem(fight, target, random = Math.random) {
  if(fight.status!=='fighting' || fight.spec.dream || !fight.player.horrorgem || fight.rounds)return null;
  const foe=realmTargets(fight).find(row=>row.index===target)?.foe;
  if(!foe)return null;
  const roll=die(random);
  if(roll<5){fight.player.life=0;fight.player.horrorgem=false;}
  else{foe.life=0;recordDeath(fight,foe,target);}
  settle(fight);
  const result={kind:'horrorgem',roll,success:roll>=5};fight.events.push(result);
  return result;
}

export function realmTryFriendly(fight, target, random = Math.random) {
  if(fight.status!=='fighting' || fight.rounds || fight.friendlyAttempts.includes(target)) return null;
  const foe=realmTargets(fight).find(row=>row.index===target)?.foe;
  if(!foe)return null;
  fight.friendlyAttempts.push(target);
  const result=realmFriendlyReaction(random);
  if(result.success){foe.bypassed=true;settle(fight);}
  fight.events.push({kind:'friendly',target,...result});
  return result;
}

export function realmTryBribe(fight, target, random = Math.random) {
  if(fight.status!=='fighting' || fight.rounds || !fight.spec.bribe || fight.bribeAttempts.includes(target))return null;
  const foe=realmTargets(fight).find(row=>row.index===target)?.foe;
  if(!foe)return null;
  const result=realmBribe(fight.player,fight.spec.bribe,random);
  fight.bribeAttempts.push(target);
  if(result.success){
    if(fight.spec.bribeRetreat){fight.status='avoided';fight.redirect=fight.spec.bribeRetreat;}
    else{foe.bypassed=true;settle(fight);}
  }
  fight.events.push({kind:'bribe',target,...result});
  return result;
}
