// Resolve alternating two-dice attacks against SKILL until the first hit.
const statuses=new Set(['fighting','win','loss','cancelled']);
const integer=(value,min,max)=>{
  if(!Number.isSafeInteger(value)||value<min||value>max)throw RangeError('Invalid combat value');
  return value;
};
export function normalizeFirstHitActor(source){
  if(!source||typeof source.name!=='string'||!source.name.trim()||source.name.length>200)throw RangeError('Invalid combatant');
  return {...structuredClone(source),name:source.name.trim(),skill:integer(source.skill,1,1000)};
}
export function validateFirstHitFight(fight){
  if(!fight||fight.rulesVersion!==1||!statuses.has(fight.status))throw RangeError('Invalid saved encounter');
  normalizeFirstHitActor(fight.player);normalizeFirstHitActor(fight.opponent);
  integer(fight.revision,0,Number.MAX_SAFE_INTEGER-1);integer(fight.round,1,Number.MAX_SAFE_INTEGER-1);
  if(!Array.isArray(fight.events)||fight.events.length>100)throw RangeError('Invalid combat log');
  for(const event of fight.events){
    integer(event.round,1,fight.round);
    if(event.kind==='cancel')continue;
    if(event.kind!=='attack'||!['player','enemy'].includes(event.actor)||!Array.isArray(event.dice)||event.dice.length!==2)throw RangeError('Invalid attack log');
    event.dice.forEach(value=>integer(value,1,6));integer(event.threshold,1,1000);
    if(event.total!==event.dice[0]+event.dice[1]||event.hit!==(event.total>=event.threshold))throw RangeError('Invalid attack result');
  }
  if(fight.status==='fighting'?!['player','enemy'].includes(fight.phase):fight.phase!=='complete')throw RangeError('Invalid combat phase');
  return fight;
}
export function startFirstHitFight(player,opponent){
  return {rulesVersion:1,player:normalizeFirstHitActor(player),opponent:normalizeFirstHitActor(opponent),
    phase:'player',status:'fighting',round:1,revision:0,events:[]};
}
export function firstHitAction(source,action,random=Math.random){
  validateFirstHitFight(source);
  if(source.status!=='fighting'||action.expectedRevision!==source.revision)throw RangeError('Stale combat action');
  const fight=structuredClone(source);
  if(action.kind==='cancel'){
    fight.status='cancelled';fight.phase='complete';fight.events=[...fight.events.slice(-99),{kind:'cancel',round:fight.round}];
  }else if(action.kind==='attack'){
    let dice=action.dice;
    if(dice!==undefined){
      if(!Array.isArray(dice)||dice.length!==2)throw RangeError('Enter two dice');
      dice=dice.map(value=>integer(value,1,6));
    }else dice=Array.from({length:2},()=>{
      const value=random();if(!Number.isFinite(value)||value<0||value>=1)throw RangeError('Invalid dice source');
      return Math.floor(value*6)+1;
    });
    const actor=fight.phase,total=dice[0]+dice[1],target=actor==='player'?fight.opponent:fight.player,hit=total>=target.skill;
    fight.events=[...fight.events.slice(-99),{kind:'attack',actor,round:fight.round,dice,total,threshold:target.skill,hit}];
    if(hit){fight.status=actor==='player'?'win':'loss';fight.phase='complete';}
    else {fight.phase=actor==='player'?'enemy':'player';if(actor==='enemy')fight.round++;}
  }else throw RangeError('Unknown combat action');
  fight.revision++;return validateFirstHitFight(fight);
}
