import {rollUrowenDie,urowenDamage,urowenCombatOutcome} from './core.js';
import {UROWEN_RULES} from './roster.js';

const copy=value=>structuredClone(value);
function integer(value,min,max=Number.MAX_SAFE_INTEGER) {
  if(!Number.isSafeInteger(value)||value<min||value>max)throw new RangeError('Invalid value');
  return value;
}
export function urowenBetPayout({section,stake,winner,selected,thief=false}) {
  integer(stake,0);
  const {point,animal,drinking,fight}=UROWEN_RULES.contests;
  if(![...point.sections,...animal.sections,fight.section,drinking.section].includes(section))throw new RangeError('Invalid wager');
  if(point.sections.includes(section)&&stake>point.maxStake)throw new RangeError('Invalid wager');
  if(animal.sections.includes(section)&&(stake>animal.maxStake||stake%animal.stakeMultiple))throw new RangeError('Invalid wager');
  let profit=stake;
  if(section===animal.sections[0]) {
    if(!Object.keys(animal.profitDivisors).includes(selected))throw new RangeError('Invalid selection');
    profit=stake/animal.profitDivisors[selected];
  }
  if(section===drinking.section)profit=stake*drinking.profitMultiplier;
  return {returned:winner===selected?stake+profit:0,
    extra:section===animal.sections[0]&&thief?animal.thiefExtra:0};
}
export function createUrowenPointContest(section) {
  if(!UROWEN_RULES.contests.point.sections.includes(section))throw new RangeError('Invalid points contest');
  return {section,playerPoints:0,enemyPoints:0,round:0,status:'fighting'};
}
export function resolveUrowenPointRound(contest,roll) {
  const rules=UROWEN_RULES.contests.point;
  if(!rules.sections.includes(contest.section)||contest.status!=='fighting')throw new RangeError('Contest finished');
  const next=copy(contest),rolls=[];
  const die=()=>{const raw=rollUrowenDie(roll).raw;rolls.push(raw);return raw;};
  const player=next.section===rules.sections[0]?die():die()+die();
  const enemy=next.section===rules.sections[0]?die():die()+die();
  const playerScore=next.section===rules.sections[0]?-player:player>rules.bustAbove?0:player;
  const enemyScore=next.section===rules.sections[0]?-enemy:enemy>rules.bustAbove?0:enemy;
  next.round++;
  if(playerScore>enemyScore)next.playerPoints++;
  if(enemyScore>playerScore)next.enemyPoints++;
  if(next.playerPoints>=rules.winPoints||next.enemyPoints>=rules.winPoints) {
    next.status='finished';next.winner=next.playerPoints>=rules.winPoints?'player':'enemy';
  }
  return {contest:next,rolls};
}
export function createUrowenAnimalContest(section,animals) {
  const rules=UROWEN_RULES.contests.animal;
  if(!rules.sections.includes(section)||!Array.isArray(animals)||animals.length!==rules.count)throw new RangeError('Invalid contest');
  for(const animal of animals){integer(animal.life,1);integer(animal.attributeValue,0);}
  return {section,animals:copy(animals),round:0,status:'fighting',winner:null,stopAt:rules.stopAt[section]};
}
export function resolveUrowenAnimalRound(contest,roll) {
  if(contest.status!=='fighting')throw new RangeError('Contest finished');
  const next=copy(contest),results=[];
  const dice=()=>{const raw=rollUrowenDie(roll).raw;results.push(raw);return raw;};
  const attackA=dice()+next.animals[0].attributeValue,attackB=dice()+next.animals[1].attributeValue;
  next.round++;
  let damage=0;
  if(attackA!==attackB) {
    const index=attackA>attackB?0:1,target=1-index,location=dice(),rawDamage=dice();
    damage=urowenDamage({rawDamage,location,bonus:next.animals[index].damageBonus,
      armor:next.animals[target].armorByLocation[location-1]});
    next.animals[target].life-=damage;
    if(next.animals[target].life<=next.stopAt){next.status='finished';next.winner=next.animals[index].name;}
  }
  return {contest:next,rolls:results,damage};
}
export function createUrowenDrinkingContest(baseLife) {
  integer(baseLife,1);
  const rules=UROWEN_RULES.contests.drinking;
  return {playerResistance:baseLife*rules.playerMultiplier,enemyResistance:rules.resistance,round:0,status:'fighting'};
}
export function resolveUrowenDrinkingRound(contest,roll) {
  if(contest.status!=='fighting')throw new RangeError('Contest finished');
  const next=copy(contest),playerDie=rollUrowenDie(roll).raw,enemyDie=rollUrowenDie(roll).raw;
  next.playerResistance-=playerDie;next.enemyResistance-=enemyDie;next.round++;
  next.status=urowenCombatOutcome(next.playerResistance,next.enemyResistance);
  return {contest:next,rolls:[playerDie,enemyDie]};
}
