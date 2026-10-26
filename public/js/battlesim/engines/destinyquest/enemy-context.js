import {createDestinyTurn,settleDestinyFight} from './core.js';
import {useDestinyAbility} from './abilities.js';
import {resolveDestinyAbilityRoll} from './ability-rolls.js';
import {destinyStat} from './effects.js';
import {destinyEnemyAbilityCatalog,consumeDestinyAbsorbedAbility} from './enemy-absorption.js';
import {captureDestinyEnemyBaseline,rebaseDestinyEnemyPending,mirrorDestinyEnemyEffect} from './enemy-rebase.js';

const clone=value=>structuredClone(value);
const actorFields=['abilities','used','combatStance','sustainedDamage','chargedAttacks','sacrificedSummons','lastHealthHitRound','scoreRerollAbility','nextHeroSpeedDice'];
const proxyFields=['hero','abilities','used','equipment','abilityCatalog','bookRules','character','abilityQuota','abilityGrantSources','portableShieldHealth','phantomHealth','crystalArmour','clearedCurses','sweetSpot','opponentFaceCounts'];
const flip=winner=>winner==='hero'?'opponent':winner==='opponent'?'hero':winner;

export function destinyEnemyTurn(fight){
  const actor=fight.enemyAbilityState?.actor;
  return actor?.round===fight.round?actor.turn:null;
}

export function createDestinyEnemyContext(fight){
  const settings=fight.encounter.enemyAbsorption,index=settings.target,enemy=fight.opponents[index];
  const actor=fight.enemyAbilityState?.actor||{};
  const view={rulesVersion:1,status:'active',phase:fight.phase,round:fight.round,target:0,restoreOnVictory:false,history:[],effects:[],used:{},abilities:{},equipment:{},
    bookRules:{deathMoves:false,deathPenalties:false},abilityCatalog:destinyEnemyAbilityCatalog(fight.abilityCatalog,settings),
    encounter:{heroDamageStat:enemy.damageStat},hero:clone(enemy),opponents:[clone(fight.hero)]};
  for(const attribute of ['speed','brawn','magic','armour']){
    view.hero[attribute]??=0;view.hero.normal[attribute]??=0;
    view.opponents[0][attribute]=destinyStat(fight,'hero',attribute);
  }
  view.opponents[0].damageStat=fight.hero.brawn>=fight.hero.magic?'brawn':'magic';
  for(const key of actorFields)if(actor[key]!==undefined)view[key]=clone(actor[key]);
  view.turn=actor.round===fight.round?clone(actor.turn):createDestinyTurn();
  view.turn.winner=flip(fight.turn?.winner);view.turn.heroSpeedDice=clone(fight.turn?.opponentSpeedDice??null);view.turn.opponentSpeedDice=clone(fight.turn?.heroSpeedDice??null);
  view.turn.healthDamage=fight.turn?.healthDamage||0;
  if(fight.turn?.damageDice)view.turn.damageDice=clone(fight.turn.damageDice);
  view.effects=clone(actor.effects||[]);
  fight.effects.forEach((effect,origin)=>{
    const copy=mirrorDestinyEnemyEffect(effect,origin,index);
    if(copy)view.effects.push(copy);
  });
  const proxy={rulesVersion:1,status:'active',round:fight.round,phase:fight.phase,target:0,turn:clone(fight.turn),history:[],effects:fight.effects.map((effect,enemyOrigin)=>({...clone(effect),enemyOrigin})),
    encounter:clone(fight.encounter)};
  delete proxy.encounter.enemyAbsorption;
  for(const key of proxyFields)if(fight[key]!==undefined)proxy[key]=clone(fight[key]);
  proxy.opponents=[view.hero];view.opponentProxies={0:proxy};
  return view;
}

export function linkDestinyEnemyContext(view){
  // JSON saves duplicate aliases; restore this transient link before resuming.
  view.opponentProxies[0].opponents=[view.hero];return view;
}

export function projectDestinyEnemyContext(fight,view,{projectTurn=true}={}){
  const next=clone(fight),index=next.encounter.enemyAbsorption.target,enemy=next.opponents[index],proxy=view.opponentProxies[0];
  enemy.health=view.hero.health;enemy.maxHealth=view.hero.maxHealth;
  for(const attribute of ['speed','brawn','magic','armour']){
    if(enemy[attribute]!==null||view.hero[attribute]!==0)enemy[attribute]=view.hero[attribute];
    if(enemy.normal[attribute]!==null||view.hero.normal[attribute]!==0)enemy.normal[attribute]=view.hero.normal[attribute];
  }
  // The proxy applies the player's real shields, passives and Health-hit hooks.
  for(const key of proxyFields)if(proxy[key]!==undefined)next[key]=clone(proxy[key]);
  next.hero.health=view.opponents[0].health;
  next.encounter={...next.encounter,...proxy.encounter};
  const retained=new Map(view.effects.filter(effect=>effect.enemyOrigin!==undefined).map(effect=>[effect.enemyOrigin,effect]));
  next.effects=proxy.effects.filter(effect=>effect.enemyOrigin===undefined||!(effect.target===index||effect.target==='hero'&&effect.kind!=='stat'||effect.hero===false)||retained.has(effect.enemyOrigin)).map(effect=>{const copy=clone(effect);delete copy.enemyOrigin;return copy;});
  const own=[];
  for(const effect of view.effects){
    if(effect.enemyOrigin!==undefined)continue;
    const copy=clone(effect);
    if(effect.target==='hero')copy.target=index;
    else if(effect.target===0){copy.target='hero';if(copy.dispelOnDoubles)copy.dispelBy='opponent';}
    else if(effect.hero===false)copy.hero=true;
    else{own.push(copy);continue;}
    next.effects.push(copy);
  }
  const actor={round:fight.round,turn:clone(view.turn),effects:own};
  for(const key of actorFields)if(view[key]!==undefined)actor[key]=clone(view[key]);
  next.enemyAbilityState.actor=actor;
  if(projectTurn){
    next.turn.winner=flip(view.turn.winner);
    if(view.phase==='damage-rolled')next.turn.damageDice=clone(view.turn.damageDice);
    next.phase=view.status!=='active'?'end':view.phase;
  }
  for(const entry of proxy.history)next.history.push({...clone(entry),owner:'hero'});
  for(const entry of view.history)next.history.push({...clone(entry),type:entry.type==='outcome'?'enemy-context-outcome':entry.type,owner:'opponent',actor:index});
  settleDestinyFight(next);return next;
}

export function defaultDestinyEnemyOptions(view,spec){
  const attribute=view.opponents[0].brawn>=view.opponents[0].magic?'brawn':'magic';
  const options={target:0,deferDamage:true};
  if(spec.weaken)options.attribute=attribute;
  if(spec.chooseAttribute)options.attribute=spec.chooseAttribute[0];
  if(spec.advanced&&spec.replacement){
    const magic=destinyStat(view,'hero','magic');
    options.allocations=[Math.ceil(magic/2)];
  }
  return options;
}

export function playDestinyEnemyAbility(fight,entry,roll){
  const view=createDestinyEnemyContext(fight),spec=view.abilityCatalog[entry.name];
  view.abilities[entry.name]=(view.abilities[entry.name]||0)+1;view.used[entry.name]=0;
  const played=useDestinyAbility(view,entry.name,defaultDestinyEnemyOptions(view,spec),roll);
  const claimed=clone(fight);consumeDestinyAbsorbedAbility(claimed,entry.id);
  if(played.phase==='ability-rolled'){
    claimed.enemyAbilityState.pending={view:played,returnPhase:fight.phase,baseline:captureDestinyEnemyBaseline(fight)};claimed.phase='enemy-ability';return claimed;
  }
  return projectDestinyEnemyContext(claimed,played);
}

export function resolveDestinyEnemyAbility(fight,roll){
  if(fight.phase!=='enemy-ability'||!fight.enemyAbilityState?.pending)throw new RangeError('No opponent ability roll is pending');
  const next=clone(fight),pending=next.enemyAbilityState.pending;
  rebaseDestinyEnemyPending(next,pending,Object.fromEntries(['speed','brawn','magic','armour'].map(key=>[key,destinyStat(next,'hero',key)])));
  const view=resolveDestinyAbilityRoll(linkDestinyEnemyContext(clone(pending.view)),roll);
  if(view.phase==='ability-rolled'){
    next.enemyAbilityState.pending={...pending,view};return next;
  }
  delete next.enemyAbilityState.pending;
  return projectDestinyEnemyContext(next,view);
}
