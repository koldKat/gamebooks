// Resolve the book's chosen 7+/9+ attacks and independent enemy round limits.
const integer = (n,min,max=10000) => {
  if (!Number.isSafeInteger(n) || n<min || n>max) throw new RangeError('Invalid combat value');
  return n;
};
export function startFight(hp, opponents, config = {}, modifier = 0, unarmed = false) {
  integer(hp,1,12); integer(modifier,-100,100);
  if (!Array.isArray(opponents) || !opponents.length || opponents.length>100) throw new RangeError('Missing opponents');
  return {rulesVersion:1, hp, modifier, unarmed:Boolean(unarmed), config:structuredClone(config),
    enemies:opponents.map(e=>({name:String(e.displayName??e.name??'').slice(0,200),
      hp:integer(e.hp,1), rounds:integer(e.rounds,1), injury:integer(e.injury,0)})),
    advantage:Boolean(config.bonusUntilMiss), restrained:Boolean(config.penaltyUntilHit),
    rounds:0, outcome:null, destination:null, events:[]};
}
export function round(original, target, attack, roll = () => Math.floor(Math.random()*6)+1) {
  if (original?.rulesVersion!==1 || original.outcome) throw new RangeError('No active fight');
  integer(target,0,original.enemies.length-1);
  if (![7,9].includes(attack) || original.enemies[target].hp<=0) throw new RangeError('Invalid attack');
  const fight=structuredClone(original), enemy=fight.enemies[target], dice=[roll(),roll()];
  dice.forEach(value=>integer(value,1,6));
  const modifier=fight.modifier+(fight.config.rollModifier??0)+(fight.advantage?1:0)-(fight.restrained?1:0);
  const total=dice[0]+dice[1]+modifier, hit=total>=attack;
  // Page 7 charges health when unarmed; the specific guard encounter instead
  // explicitly subtracts one from attack rolls. Preserve that printed exception.
  const unarmedLoss=fight.unarmed&&!fight.config.unarmedRollPenalty ? 1 : 0;
  const enemyLoss=hit?Math.min(enemy.hp,attack===7?1:3):0;
  const playerLoss=(hit?0:enemy.injury)+unarmedLoss;
  enemy.hp-=enemyLoss; enemy.rounds--; fight.rounds++;
  fight.hp=Math.max(0,fight.hp-playerLoss);
  if (!hit) fight.advantage=false;
  if (hit) fight.restrained=false;
  fight.events=[{name:enemy.name,dice,total,attack,enemyLoss,playerLoss,hit}];
  // The last permitted attack can win; a time limit is a defeat, not a death.
  if (!fight.hp) fight.outcome='loss';
  else if (fight.enemies.every(e=>e.hp===0)) fight.outcome='win';
  else if (enemy.hp>0 && enemy.rounds<=0) fight.outcome='loss';
  if (fight.outcome) fight.destination=fight.config[fight.outcome]??null;
  return fight;
}
