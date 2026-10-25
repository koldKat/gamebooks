import { createRosterLoader } from '../../roster-data.js';
import { fabledDie, fabledDice, fabledInteger, validateFabledCharacter } from './character.js';
import { startFabledFight, fleeFabledFight } from './core.js';

export const HIDDEN_PROFESSIONS = Object.freeze({ priest: [6,4,5,8,6,2], troubadour: [8,5,5,5,4,6],
  mage: [4,4,8,1,7,5], wayfarer: [4,7,4,4,8,6], warrior: [5,8,3,6,5,3], rogue: [7,6,6,2,4,8] });
export const HIDDEN_DEFAULTS = Object.freeze({ rank: 5, stamina: 23, shards: 65, armour: 3,
  professions: HIDDEN_PROFESSIONS });
export let HIDDEN_FIGHTS = [];
export let HIDDEN_SEA_CHECKS = Object.freeze({});
export const HIDDEN_RULES = {};
export const loadRoster = createRosterLoader(678, 'FIGHTS', rows => {
  const support = rows.find(row => row.support)?.support;
  if (!support?.seaChecks || !support.rules) throw new Error('Incomplete Hidden Faces settings');
  HIDDEN_FIGHTS = rows.map(({support, ...row}) => row);
  HIDDEN_SEA_CHECKS = Object.freeze(support.seaChecks);
  Object.assign(HIDDEN_RULES, support.rules);
});

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
  fight.character.combat = Math.max(HIDDEN_RULES.combatDrain.minimum, old - HIDDEN_RULES.combatDrain.amount);
  fight.defence -= old - fight.character.combat;
  fight.events.push({kind:'abilityDrain',ability:'combat',amount:old-fight.character.combat});
}

export function startHiddenFight(config, character, options = {}, roll) {
  const fight = startFabledFight(config, character, options, roll);
  if (config.special && HIDDEN_RULES.restoreKinds.includes(config.special)) fight.combatBefore = character.combat;
  if (config.special === 'underwater') fight.defence = character.combat + character.rank;
  if (fight.status === 'fighting' && character.defenceThroughFaith) {
    fight.character.defenceThroughFaith = false;
    fight.defence += 3;
    fight.events.push({kind:'defenceBlessing'});
  }
  if (fight.status !== 'fighting' || options.applyEntry === false) return fight;
  if (config.special === 'champion' && !check(fight,HIDDEN_RULES.champion.ability,HIDDEN_RULES.champion.difficulty,roll).success) {
    const reduced = Math.ceil(character.combat / HIDDEN_RULES.champion.divisor);
    fight.defence -= character.combat - reduced;
    fight.character.combat = reduced;
  }
  if (config.special === 'strangling') {
    while (fight.status === 'fighting' && !check(fight,HIDDEN_RULES.strangling.ability,HIDDEN_RULES.strangling.difficulty,roll).success) damage(fight,HIDDEN_RULES.strangling.damage);
  }
  if (config.special === 'underwater' && !check(fight,HIDDEN_RULES.underwater.ability,HIDDEN_RULES.underwater.entryDifficulty,roll,-character.armour).success) {
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
    const result = check(fight,HIDDEN_RULES.choking.ability,HIDDEN_RULES.choking.difficulty,roll);
    if (!result.success) damage(fight,HIDDEN_RULES.choking.difficulty-result.total);
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
    const attacks = fight.config.special === 'tripling' ? HIDDEN_RULES.triplingAttacks : 1;
    for (let i=0;i<attacks && fight.status==='fighting';i++) {
      const amount = attack('enemy',enemy.combat,fight.defence);
      if (!amount) continue;
      fight.wounded = true;
      if (fight.config.special === 'abilityDrain') {
        const ability = HIDDEN_RULES.abilityDrain.abilities[fabledDie(roll)-1];
        const old = fight.character[ability];
        // At zero an ability is fatal; retain the sheet's minimum and record the death.
        fight.character[ability] = Math.max(HIDDEN_RULES.abilityDrain.minimum,old-HIDDEN_RULES.abilityDrain.amount);
        if (ability === 'combat') fight.defence -= old-fight.character.combat;
        fight.events.push({kind:'abilityDrain',ability,amount:HIDDEN_RULES.abilityDrain.amount});
        if (old===HIDDEN_RULES.abilityDrain.fatalAt) damage(fight,fight.character.stamina);
      } else {
        damage(fight,amount);
        if (fight.status==='fighting' && (fight.config.special==='vampires'
          || fight.config.special==='spectre' && !check(fight,HIDDEN_RULES.spectre.ability,HIDDEN_RULES.spectre.difficulty,roll).success)) drainCombat(fight);
      }
    }
  }
  // These checks occur after the round, including the final successful attack.
  if (fight.character.stamina && fight.config.special === 'lightning' && !check(fight,HIDDEN_RULES.lightning.ability,HIDDEN_RULES.lightning.difficulty,roll).success) {
    let amount = 0;
    for (let index=0;index<HIDDEN_RULES.lightning.damageDice;index++) amount+=fabledDie(roll);
    damage(fight,amount);
  }
  if (fight.character.stamina && fight.config.special === 'underwater'
    && !check(fight,HIDDEN_RULES.underwater.ability,HIDDEN_RULES.underwater.roundDifficulty,roll,-fight.character.armour).success) damage(fight,fight.character.stamina);
  return fight;
}

export function fleeHiddenFight(input, roll) { return restore(fleeFabledFight(input,roll)); }
export function cancelHiddenFight(input) {
  const fight = structuredClone(input);
  fight.status = 'cancelled';
  return restore(fight);
}

export function hiddenSeaCheck(section, input, options={}, roll) {
  validateFabledCharacter(input,true);
  if (!Object.hasOwn(HIDDEN_SEA_CHECKS,section)) throw new RangeError('Invalid sea check');
  const spec=HIDDEN_SEA_CHECKS[section];
  const {ship='barque',crew='average',safetyFromStorms=false}=options;
  if (!['barque','brigantine','galleon'].includes(ship) || !['poor','average','good','excellent'].includes(crew)
    || typeof safetyFromStorms!=='boolean' || safetyFromStorms&&!input.stormsBlessing) throw new RangeError('Invalid ship settings');
  const character=structuredClone(input);
  const rules=HIDDEN_RULES.sea;
  let total=rules.singleDieKinds.includes(spec.kind)?fabledDie(roll):fabledDice(roll);
  let destination,usedBlessing=false,status='story';
  if (spec.kind==='storm' || spec.kind==='boarding') {
    total+=rules.shipModifiers[ship]+rules.crewModifiers[crew];
    if(spec.kind==='storm'&&character.rank>=rules.storm.rankMinimum)total+=rules.storm.rankBonus;
    if(spec.kind==='boarding')total+=character.combat;
  }
  if (spec.kind==='shipwreck') {
    total-=rules.shipwreck.penalty;
    if(total>character.rank) { character.stamina=0;destination=rules.shipwreck.death;status='loss'; }
    else destination=rules.shipwreck.destinations[Math.floor((fabledDie(roll)-1)/rules.shipwreck.bucketSize)];
  } else if(spec.kind==='storm') destination=rules.storm.destinations[total<=rules.storm.threshold?0:1];
  else if(spec.kind==='boarding') { const won=total>rules.boarding.threshold;destination=won?rules.boarding.win:rules.boarding.loss;status=won?'win':'loss'; }
  else if(spec.kind==='harbour') destination=rules.harbour.destinations[total<=rules.harbour.threshold?0:1];
  else if(spec.kind==='drift') destination=rules.drift.destinations[Math.floor((total-1)/rules.drift.bucketSize)];
  else {
    const storm=spec.kind==='rescue'?total===rules.rescue.stormRoll:total>=rules.travel.stormMinimum;
    if(storm&&safetyFromStorms) {
      usedBlessing=true;character.stormsBlessing=false;
      if(spec.kind==='coastal') destination=spec.arrival;
      else total=spec.kind==='rescue'?fabledDie(roll):fabledDice(roll);
    }
    if(destination===undefined) {
      if(spec.kind==='rescue') {
        const index=rules.rescue.bounds.findIndex(bound=>total<=bound);
        destination=rules.rescue.destinations[index<0?rules.rescue.bounds.length:index];
      } else {
        const route=spec.kind==='coastal'?rules.travel.coastal:rules.travel.passage;
        destination=total<=rules.travel.low?route.low:total<=rules.travel.high?spec.arrival:route.high;
      }
    }
  }
  return {character,total,damage:input.stamina-character.stamina,destination,status,kind:spec.kind,usedBlessing};
}
