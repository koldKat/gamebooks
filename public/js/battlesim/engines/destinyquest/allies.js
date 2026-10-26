import {addDestinyStatEffect,healDestinyHero} from './effects.js';

// Allies are combat snapshots, never references to another run or to the app's
// shared inventory. Attaching one cannot migrate an existing saved fight.
export function attachDestinyAlly(fight,ally){
  if([fight,ally].some(value=>value?.rulesVersion!==1||value.status!=='active'||value.round!==0||value.phase!=='start'||Object.keys(value.used||{}).length))throw new RangeError('Attach an ally before combat');
  const next=structuredClone(fight);
  const snapshot=Object.fromEntries(['hero','abilities','equipment','used','effects','abilityCatalog','bookRules','character','abilityQuota','abilityGrantSources'].filter(key=>ally[key]!==undefined).map(key=>[key,structuredClone(ally[key])]));
  snapshot.encounter={};
  (next.allies??=[]).push(snapshot);
  return next;
}

// Called on the copy owned by an action. An absent ally index means self;
// healing never silently switches to self when an ally index is invalid.
export function destinyHeroRecipient(fight,options={},allowDead=false){
  if(options.ally===undefined)return fight;
  const index=options.ally,ally=fight.allies?.[index];
  if(!Number.isInteger(index)||index<0||!ally?.hero)throw new RangeError('Choose an available ally');
  if(ally.hero.health<=0&&!allowDead)throw new RangeError('Choose a living ally');
  return ally;
}

export function addDestinyRecipientStat(fight,recipient,attribute,amount,duration,source,delay=0){
  addDestinyStatEffect(recipient===fight?fight:{...recipient,round:fight.round},'hero',attribute,amount,duration,source,delay);
}

export function healDestinyRecipient(fight,recipient,amount){
  if(recipient===fight)return healDestinyHero(fight,amount);
  if(recipient.hero.health<=0)return 0;
  const restored=Math.min(amount,recipient.hero.maxHealth-recipient.hero.health);
  recipient.hero.health+=restored;
  return restored;
}
