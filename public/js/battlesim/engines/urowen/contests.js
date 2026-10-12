import {rollUrowenDie,urowenDamage,urowenCombatOutcome} from './core.js';

const copy=value=>structuredClone(value);
function integer(value,min,max=Number.MAX_SAFE_INTEGER) {
  if(!Number.isSafeInteger(value)||value<min||value>max)throw new RangeError('Invalid value');
  return value;
}
export function urowenBetPayout({section,stake,winner,selected,thief=false}) {
  integer(stake,0);
  if(![53,56,72,129,262,391].includes(section))throw new RangeError('Invalid wager');
  if([53,72].includes(section)&&stake>15)throw new RangeError('Invalid wager');
  if([56,129].includes(section)&&(stake>20||stake%2))throw new RangeError('Invalid wager');
  let profit=stake;
  if(section===56) {
    if(!['Hurg','Grinkot'].includes(selected))throw new RangeError('Invalid selection');
    if(selected==='Grinkot')profit=stake/2;
  }
  if(section===391)profit=stake*2;
  return {returned:winner===selected?stake+profit:0,
    extra:section===56&&thief?5:0};
}
export function createUrowenPointContest(section) {
  if(![53,72].includes(section))throw new RangeError('Invalid points contest');
  return {section,playerPoints:0,enemyPoints:0,round:0,status:'fighting'};
}
export function resolveUrowenPointRound(contest,roll) {
  if(![53,72].includes(contest.section)||contest.status!=='fighting')throw new RangeError('Contest finished');
  const next=copy(contest),rolls=[];
  const die=()=>{const raw=rollUrowenDie(roll).raw;rolls.push(raw);return raw;};
  const player=next.section===53?die():die()+die();
  const enemy=next.section===53?die():die()+die();
  const playerScore=next.section===53?-player:player>9?0:player;
  const enemyScore=next.section===53?-enemy:enemy>9?0:enemy;
  next.round++;
  if(playerScore>enemyScore)next.playerPoints++;
  if(enemyScore>playerScore)next.enemyPoints++;
  if(next.playerPoints>=5||next.enemyPoints>=5) {
    next.status='finished';next.winner=next.playerPoints>=5?'player':'enemy';
  }
  return {contest:next,rolls};
}
export function createUrowenAnimalContest(section,animals) {
  if(![56,129].includes(section)||!Array.isArray(animals)||animals.length!==2)throw new RangeError('Invalid contest');
  for(const animal of animals){integer(animal.life,1);integer(animal.attributeValue,0);}
  return {section,animals:copy(animals),round:0,status:'fighting',winner:null,stopAt:section===56?3:0};
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
  return {playerResistance:baseLife*2,enemyResistance:54,round:0,status:'fighting'};
}
export function resolveUrowenDrinkingRound(contest,roll) {
  if(contest.status!=='fighting')throw new RangeError('Contest finished');
  const next=copy(contest),playerDie=rollUrowenDie(roll).raw,enemyDie=rollUrowenDie(roll).raw;
  next.playerResistance-=playerDie;next.enemyResistance-=enemyDie;next.round++;
  next.status=urowenCombatOutcome(next.playerResistance,next.enemyResistance);
  return {contest:next,rolls:[playerDie,enemyDie]};
}
