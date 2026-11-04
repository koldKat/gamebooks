// Resolve explicitly advanced Lost Jedi combat actions without controlling the story.
import {integer,rollDie,previewStrike} from './math.js';
import {living,distance,targetCategory,targetMap,legalTargets,attackProfile} from './targeting.js';
import {expandActors,queueRound,advanceTurn,finish} from './rounds.js';
import {prepareEncounter,applyPrintedStrike,printedAction} from './encounter-rules.js';

const copy = value=>structuredClone(value);
function active(fight) {
  if (!fight || fight.rulesVersion!==1 || fight.outcome || fight.pending) throw new RangeError('Choose an active encounter and finish its pending roll.');
  const actor=fight.actors.find(actor=>actor.id===fight.queue[0]);
  if (!actor || !living(actor)) throw new RangeError('No combat turn is available.');
  return actor;
}
const log = (fight,event)=>{fight.events.push(event);fight.events=fight.events.slice(-160);};

export function startFight({encounter,player,range,initiative,woundedFett=false,woundedProfile,variant,opponents,
  oneFewerImperial=false,extraRebels=false,extraRebelSkill}={}) {
  if (!encounter || encounter.rules.modifierOnly || encounter.rules.reinforcements===true) throw new RangeError('Choose a complete encounter.');
  encounter=prepareEncounter(encounter,{variant,oneFewerImperial,extraRebels,extraRebelSkill});
  const rules=copy(encounter.rules);
  if (variant) {
    const selected=rules.storyVariants?.find(item=>item.section===String(variant));
    if (!selected) throw new RangeError('Unknown encounter variant.');
    Object.assign(rules,selected);
  }
  if (rules.extraReinforcementWaves) rules.reinforcementWaves=[...(rules.reinforcementWaves ?? []),...rules.extraReinforcementWaves];
  const initialRange=rules.chooseRange ? range : rules.range ?? range;
  if (!['range','close'].includes(initialRange)) throw new RangeError('Choose the starting range.');
  if (rules.chooseInitiative) {
    if (!['havet','enemy'].includes(initiative)) throw new RangeError('Choose who fires first.');
    rules.enemyFirst=initiative==='enemy';
  }
  const stats={...copy(player),blaster:integer(player.blaster,0,99,'Blaster skill'),
    lightsabre:integer(player.lightsabre,0,99,'Lightsabre skill'),technical:integer(player.technical,0,99,'Technical skill')};
  const points=integer(player.jediPoints,0,999,'Jedi Power Points');
  const maxPoints=integer(player.maxJediPoints,points,999,'Starting Jedi Power Points');
  if (rules.forcedPlayerWeapon) { stats.weapon=rules.forcedPlayerWeapon;stats.ready=true; }
  if (rules.playerMustDraw) stats.ready=false;
  if (!['blaster','lightsabre','unarmed','rifle','redemptor','speeder','force-pike','dart-launcher','eweb'].includes(stats.weapon)) throw new RangeError('Choose a weapon.');
  if (stats.weapon==='redemptor') stats.ammo=integer(player.ammo,0,6,'Remaining Redemptor shots');
  const groups=encounter.section==='custom' ? opponents : encounter.actors;
  if (!Array.isArray(groups) || !groups.length) throw new RangeError('Enter at least one opponent.');
  const actors=[{id:'havet',tag:'havet',name:'Havet',team:'rebels',target:stats.weapon==='speeder'?9:7,defeated:false,turns:0,shots:0},
    ...expandActors(groups,{team:'imperial'}),...expandActors(rules.allies ?? [],{team:'rebels'},'ally')];
  if (actors.length>49) throw new RangeError('Too many combatants.');
  for (const actor of actors.slice(1)) {
    actor.rangedSkill=integer(actor.rangedSkill,0,99,'Combat skill');
    actor.closeSkill=integer(actor.closeSkill,0,99,'Combat skill');
    actor.target=integer(actor.target,1,99,'Target');
    if (woundedFett && rules.optionalWoundedProfile && actor.tag==='fett') {
      actor.rangedSkill=integer(woundedProfile?.rangedSkill,0,99,'Wounded ranged skill');
      actor.closeSkill=integer(woundedProfile?.closeSkill,0,99,'Wounded close skill');
    }
  }
  const fight={rulesVersion:1,section:encounter.section,name:encounter.name,rules,player:stats,
    jediPoints:points,maxJediPoints:maxPoints,range:initialRange,actors,round:1,actions:0,
    pending:null,selectedTargetId:null,outcome:null,events:[]};
  queueRound(fight);return fight;
}

export function currentTurn(fight) {
  if (!fight || fight.outcome) return null;
  const actor=fight.actors.find(item=>item.id===fight.queue[0]);
  return actor ? {actor,targets:legalTargets(fight,actor),requiresTargetRoll:!!targetMap(fight,actor) && !fight.selectedTargetId} : null;
}

export function beginTargetRoll(original,die=rollDie()) {
  const fight=copy(original),actor=active(fight),map=targetMap(fight,actor);
  if (!map || fight.selectedTargetId) throw new RangeError('A target roll is not required.');
  fight.pending={kind:'target',actorId:actor.id,die:integer(die,1,6,'Die'),map};return fight;
}

export function confirmTarget(original,adjustment=0,targetId) {
  const fight=copy(original),pending=fight.pending;
  if (pending?.kind!=='target') throw new RangeError('Roll for the target first.');
  const change=integer(adjustment,-999,999,'Die adjustment'),cost=Math.abs(change);
  if (cost>fight.jediPoints) throw new RangeError('Not enough Jedi Power Points.');
  const number=integer(pending.die+change,1,6,'Target die');
  const category=Object.keys(pending.map).find(key=>pending.map[key].includes(number));
  const actor=fight.actors.find(item=>item.id===pending.actorId),all=legalTargets(fight,actor);
  const matching=all.filter(item=>targetCategory(item)===category);
  const targets=matching.length ? matching : all;
  const selected=targets.find(item=>item.id===targetId) ?? (targets.length===1 ? targets[0] : null);
  if (!selected) throw new RangeError('Choose a surviving combatant from the rolled target group.');
  fight.jediPoints-=cost;fight.selectedTargetId=selected.id;fight.pending=null;
  log(fight,{kind:'target',actor:actor.id,target:selected.id,die:pending.die,adjustment:change,cost});return fight;
}

export function beginAttack(original,targetId,die=rollDie()) {
  const fight=copy(original),actor=active(fight);
  if (targetMap(fight,actor) && !fight.selectedTargetId) throw new RangeError('Roll for the target first.');
  if (fight.selectedTargetId && targetId!==fight.selectedTargetId) throw new RangeError('Use the rolled target.');
  const target=legalTargets(fight,actor).find(item=>item.id===targetId);
  if (!target) throw new RangeError('Choose a living opponent.');
  if (actor.id==='havet' && !fight.player.ready && fight.player.weapon!=='unarmed') throw new RangeError('Retrieve the weapon first.');
  if (actor.id==='havet' && fight.escapeEndRound) throw new RangeError('You cannot shoot while escaping into the building.');
  if (actor.id==='havet' && fight.player.weapon==='redemptor' && integer(fight.player.ammo,0,6,'Remaining Redemptor shots')<1) throw new RangeError('The Redemptor has no shots left.');
  if (actor.id!=='havet' && (fight.round<=(fight.rules.enemySkipRounds ?? 0)
      || actor.skipFirstTurn && !actor.turns
      || actor.skipFirstRangedTurn && !actor.turns && distance(fight,actor,target)==='range'
      || actor.mountAfterRound && !actor.turns)) throw new RangeError('This combatant must spend this turn without attacking.');
  if (actor.tag==='diamond' && fight.rules.diamondMovesCloseOnSecondTurnIfFirstMiss && actor.turns===1) {
    throw new RangeError('Diamond must move Up Close this turn.');
  }
  fight.pending={kind:'strike',actorId:actor.id,targetId:target.id,die:integer(die,1,6,'Die'),...attackProfile(fight,actor,target)};
  return fight;
}

export function confirmAttack(original,adjustment=0,catalog=[]) {
  const fight=copy(original),pending=fight.pending;
  if (pending?.kind!=='strike') throw new RangeError('Roll an attack first.');
  const result=previewStrike(pending,adjustment,fight.jediPoints);
  const actor=fight.actors.find(item=>item.id===pending.actorId),target=fight.actors.find(item=>item.id===pending.targetId);
  fight.jediPoints=result.remainingPoints;actor.turns++;actor.shots++;fight.actions++;
  if (actor.id==='havet' && fight.player.weapon==='redemptor') fight.player.ammo--;
  const handled=applyPrintedStrike(fight,actor,target,result,expandActors);
  if (result.hit && !handled) target.defeated=true;
  log(fight,{kind:'strike',...result,actor:actor.id,target:target.id,threshold:result.target});fight.pending=null;
  if (result.hit && fight.rules.firstHitEndsPhase) {
    fight.outcome=target.id==='havet'?'loss':'phase';fight.phaseReason='first-hit';return fight;
  }
  if (actor.id==='havet' && fight.player.weapon==='eweb') {
    fight.ewebShotsThisTurn=(fight.ewebShotsThisTurn ?? 0)+1;
    finish(fight);
    if (!fight.outcome && fight.ewebShotsThisTurn<3) return fight;
  }
  fight.ewebShotsThisTurn=0;
  advanceTurn(fight,catalog);return fight;
}

export function spendTurn(original,action,options={},catalog=[]) {
  const fight=copy(original),actor=active(fight);
  if (actor.id==='havet') {
    fight.ewebShotsThisTurn=0;
    if (printedAction(fight,actor,action)) {
      // Source-specific actions consume the same exposed turn as drawing.
    } else if (action==='draw') {
      if (fight.player.ready || fight.player.weapon==='unarmed') throw new RangeError('The weapon is already ready.');
      fight.player.ready=true;
    } else if (action==='move') {
      if (fight.rules.rangeLocked) throw new RangeError('The source prevents changing this range.');
      const next=options.range;
      const target=fight.rules.mixedRanges ? legalTargets(fight,actor).find(item=>item.id===options.targetId) : null;
      if (fight.rules.mixedRanges && (!target || target.rangeLocked)) throw new RangeError('Choose an opponent whose range can change.');
      if (!['range','close'].includes(next) || next===(target?.range ?? fight.range)) throw new RangeError('Choose a different range.');
      if (target) target.range=next;else fight.range=next;
      if (options.weapon) {
        if (!['blaster','lightsabre','unarmed','rifle','redemptor','speeder','force-pike','dart-launcher','eweb'].includes(options.weapon)) throw new RangeError('Choose a weapon.');
        if (options.weapon==='redemptor') fight.player.ammo=integer(fight.player.ammo,0,6,'Remaining Redemptor shots');
        fight.player.weapon=options.weapon;fight.player.ready=options.ready===true;
      }
      if (next==='close' && fight.rules.fettHeavyWeapons) fight.movingClose=true;
    } else if (action==='escape') {
      if (!fight.rules.escapeIndoors || fight.escapeEndRound) throw new RangeError('This escape is unavailable.');
      fight.escapeEndRound=fight.round+integer(fight.rules.escapeIndoors.exposedRounds,1,99,'Exposed rounds')-1;
    } else if (action!=='wait') throw new RangeError('Choose a combat action.');
  } else if (actor.mountAfterRound && !actor.turns) {
    if (action!=='mount') throw new RangeError('The scout mounts his bike.');
    Object.assign(actor,copy(actor.mountedProfile));
  } else if (actor.tag==='diamond' && fight.rules.diamondMovesCloseOnSecondTurnIfFirstMiss && actor.turns===1) {
    if (action!=='move') throw new RangeError('Diamond moves Up Close.');
    fight.range='close';
  } else if (action!=='wait' || !(fight.round<=(fight.rules.enemySkipRounds ?? 0)
      || actor.skipFirstTurn && !actor.turns
      || actor.skipFirstRangedTurn && !actor.turns && fight.range==='range')) {
    throw new RangeError('This combatant must attack.');
  }
  actor.turns++;fight.actions++;log(fight,{kind:action,actor:actor.id,round:fight.round});advanceTurn(fight,catalog);return fight;
}
