import { createRosterLoader } from '../../roster-data.js';
import { fabledDie, fabledDice, fabledInteger, validateFabledCharacter } from './character.js';
import { startFabledFight, fleeFabledFight } from './core.js';

export const HIDDEN_PROFESSIONS = Object.freeze({ priest: [6,4,5,8,6,2], troubadour: [8,5,5,5,4,6],
  mage: [4,4,8,1,7,5], wayfarer: [4,7,4,4,8,6], warrior: [5,8,3,6,5,3], rogue: [7,6,6,2,4,8] });
export const HIDDEN_DEFAULTS = Object.freeze({ rank: 5, stamina: 23, shards: 65, armour: 3,
  professions: HIDDEN_PROFESSIONS });
export let HIDDEN_FIGHTS = [];
export const loadRoster = createRosterLoader(678, 'FIGHTS', rows => { HIDDEN_FIGHTS = rows; });

function check(fight, ability, difficulty, roll, modifier = 0) {
  const total = fabledDice(roll) + fight.character[ability] + modifier;
  fight.events.push({kind:'abilityCheck',ability,total,difficulty});
  return { total, success: total > difficulty };
}
function damage(fight, amount) {
  fight.character.stamina = Math.max(0, fight.character.stamina - amount);
  fight.events.push({kind:'entry',damage:amount});
  if (!fight.character.stamina) end(fight,'loss');
}
function restore(fight) {
  if (fight.combatBefore !== undefined) fight.character.combat = fight.combatBefore;
  return fight;
}
function end(fight, status) {
  fight.status = status;
  fight.destination = status === 'win' ? fight.config.win : fight.config.loss;
  if (status === 'loss' && fight.config.lossStamina) fight.character.stamina = fight.config.lossStamina;
  restore(fight);
}
function drainCombat(fight) {
  const old = fight.character.combat;
  fight.character.combat = Math.max(1, old - 1);
  fight.defence -= old - fight.character.combat;
  fight.events.push({kind:'abilityDrain',ability:'combat',amount:old-fight.character.combat});
}

export function startHiddenFight(config, character, options = {}, roll) {
  const fight = startFabledFight(config, character, options, roll);
  if (['champion','vampires','spectre'].includes(config.special)) fight.combatBefore = character.combat;
  if (config.special === 'underwater') fight.defence = character.combat + character.rank;
  if (fight.status === 'fighting' && character.defenceThroughFaith) {
    fight.character.defenceThroughFaith = false;
    fight.defence += 3;
    fight.events.push({kind:'defenceBlessing'});
  }
  if (fight.status !== 'fighting' || options.applyEntry === false) return fight;
  if (config.special === 'champion' && !check(fight,'magic',13,roll).success) {
    const reduced = Math.ceil(character.combat / 2);
    fight.defence -= character.combat - reduced;
    fight.character.combat = reduced;
  }
  if (config.special === 'strangling') {
    while (fight.status === 'fighting' && !check(fight,'combat',12,roll).success) damage(fight,3);
  }
  if (config.special === 'underwater' && !check(fight,'scouting',10,roll,-character.armour).success) {
    damage(fight,fight.character.stamina);
  }
  return fight;
}

export function hiddenRound(input, options = {}, roll) {
  if (!input || input.rulesRevision !== 1 || input.status !== 'fighting') throw new RangeError('No active fight');
  validateFabledCharacter(input.character,true);
  fabledInteger(input.target,0,input.enemies.length-1);
  fabledInteger(input.rounds); fabledInteger(input.defence,1);
  fabledInteger(input.attackModifier,-1000,1000);
  for (const enemy of input.enemies) {
    fabledInteger(enemy.combat); fabledInteger(enemy.defence,1); fabledInteger(enemy.stamina);
  }
  const {combatBlessing=false,luckReroll=null} = options;
  if (typeof combatBlessing !== 'boolean' || ![null,'player','enemy'].includes(luckReroll)
    || combatBlessing && !input.character.combatBlessing || luckReroll && !input.character.luckBlessing) {
    throw new RangeError('Invalid blessing');
  }
  const fight = structuredClone(input), enemy = fight.enemies[fight.target];
  fight.rounds++;
  if (fight.config.special === 'choking') {
    const result = check(fight,'sanctity',17,roll);
    if (!result.success) damage(fight,17-result.total);
    if (fight.status !== 'fighting') return fight;
  }
  let luckUsed = false;
  function attack(direction, combat, defence) {
    let dice = fabledDice(roll);
    const useLuck = !luckUsed && luckReroll === direction;
    if (useLuck || direction === 'player' && combatBlessing && dice+combat<=defence) {
      const blessing = useLuck ? 'luckBlessing' : 'combatBlessing';
      fight.character[blessing] = false;
      if (useLuck) luckUsed = true;
      fight.events.push({kind:'reroll',direction,blessing,previous:dice});
      dice = fabledDice(roll);
    }
    const total = dice+combat, amount = Math.max(0,total-defence);
    fight.events.push({kind:'attack',direction,dice,total,defence,damage:amount,
      ...(enemy.displayName?{enemyDisplayName:enemy.displayName}:{})});
    return amount;
  }
  enemy.stamina = Math.max(0,enemy.stamina-attack('player',fight.character.combat+fight.attackModifier,enemy.defence));
  if (enemy.stamina <= (fight.config.threshold ?? 0)) {
    if (fight.config.threshold !== undefined || fight.target === fight.enemies.length-1) end(fight,'win');
    else fight.target++;
  } else {
    const attacks = fight.config.special === 'tripling' ? 3 : 1;
    for (let i=0;i<attacks && fight.status==='fighting';i++) {
      const amount = attack('enemy',enemy.combat,fight.defence);
      if (!amount) continue;
      fight.wounded = true;
      if (fight.config.special === 'abilityDrain') {
        const ability = ['charisma','combat','magic','scouting','sanctity','thievery'][fabledDie(roll)-1];
        const old = fight.character[ability];
        // At zero an ability is fatal; retain the sheet's minimum and record the death.
        fight.character[ability] = Math.max(1,old-1);
        if (ability === 'combat') fight.defence -= old-fight.character.combat;
        fight.events.push({kind:'abilityDrain',ability,amount:1});
        if (old===1) damage(fight,fight.character.stamina);
      } else {
        damage(fight,amount);
        if (fight.status==='fighting' && (fight.config.special==='vampires'
          || fight.config.special==='spectre' && !check(fight,'sanctity',11,roll).success)) drainCombat(fight);
      }
    }
  }
  // These checks occur after the round, including the final successful attack.
  if (fight.character.stamina && fight.config.special === 'lightning' && !check(fight,'magic',12,roll).success) {
    damage(fight,fabledDie(roll));
  }
  if (fight.character.stamina && fight.config.special === 'underwater'
    && !check(fight,'scouting',9,roll,-fight.character.armour).success) damage(fight,fight.character.stamina);
  return fight;
}

export function fleeHiddenFight(input, roll) { return restore(fleeFabledFight(input,roll)); }
export function cancelHiddenFight(input) {
  const fight = structuredClone(input);
  fight.status = 'cancelled';
  return restore(fight);
}

export const HIDDEN_SEA_CHECKS = Object.freeze({
  60:{kind:'coastal',arrival:133},200:{kind:'coastal',arrival:619},250:{kind:'coastal',arrival:81},
  232:{kind:'passage',arrival:100},502:{kind:'passage',arrival:444},716:{kind:'rescue'},
  178:{kind:'harbour'},527:{kind:'storm'},510:{kind:'shipwreck'},660:{kind:'drift'},600:{kind:'boarding'},
});
export function hiddenSeaCheck(section, input, options={}, roll) {
  validateFabledCharacter(input,true);
  const spec=HIDDEN_SEA_CHECKS[section];
  if (!spec) throw new RangeError('Invalid sea check');
  const {ship='barque',crew='average',safetyFromStorms=false}=options;
  if (!['barque','brigantine','galleon'].includes(ship) || !['poor','average','good','excellent'].includes(crew)
    || typeof safetyFromStorms!=='boolean' || safetyFromStorms&&!input.stormsBlessing) throw new RangeError('Invalid ship settings');
  const character=structuredClone(input);
  let total=['rescue','drift'].includes(spec.kind)?fabledDie(roll):fabledDice(roll);
  let destination,usedBlessing=false,status='story';
  if (spec.kind==='storm' || spec.kind==='boarding') {
    total+=({barque:-1,brigantine:0,galleon:1})[ship]+({poor:-1,average:0,good:0,excellent:1})[crew];
    if(spec.kind==='storm'&&character.rank>=6)total++;
    if(spec.kind==='boarding')total+=character.combat;
  }
  if (spec.kind==='shipwreck') {
    total-=2;
    if(total>character.rank) { character.stamina=0;destination=7;status='loss'; }
    else destination=[539,334,569][Math.floor((fabledDie(roll)-1)/2)];
  } else if(spec.kind==='storm') destination=total<=4?510:660;
  else if(spec.kind==='boarding') { destination=total>13?460:540;status=total>13?'win':'loss'; }
  else if(spec.kind==='harbour') destination=total<=10?480:634;
  else if(spec.kind==='drift') destination=[400,26,95][Math.floor((total-1)/2)];
  else {
    const storm=spec.kind==='rescue'?total===6:total>=11;
    if(storm&&safetyFromStorms) {
      usedBlessing=true;character.stormsBlessing=false;
      if(spec.kind==='coastal') destination=spec.arrival;
      else total=spec.kind==='rescue'?fabledDie(roll):fabledDice(roll);
    }
    if(destination===undefined) {
      if(spec.kind==='rescue') destination=total===1?321:total<=3?100:total<=5?88:510;
      else destination=total<=3?(spec.kind==='coastal'?600:321):total<=10?spec.arrival:spec.kind==='coastal'?527:510;
    }
  }
  return {character,total,damage:input.stamina-character.stamina,destination,status,kind:spec.kind,usedBlessing};
}
