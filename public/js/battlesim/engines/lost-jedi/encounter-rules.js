// Apply explicitly printed encounter exceptions without advancing the story.
import {integer} from './math.js';

export function prepareEncounter(encounter, options) {
  const next=structuredClone(encounter),rules=next.rules;
  if (rules.requireVariant && !options.variant) throw new RangeError('Choose the current encounter variant.');
  if (options.oneFewerImperial && rules.oneFewerImperialOption) {
    const group=next.actors[0];
    if (Number(group.count ?? 1)>1) group.count--; else next.actors.shift();
  }
  if (options.extraRebels && rules.optionalAllies) {
    const allies=structuredClone(rules.optionalAllies);
    for (const ally of allies) if (ally.skillRequired) {
      ally.rangedSkill=ally.closeSkill=integer(options.extraRebelSkill,0,99,'Additional Rebels Combat Skill');
    }
    rules.allies=[...(rules.allies ?? []),...allies];
  }
  return next;
}

export function applyPrintedStrike(fight,actor,target,result,expandActors) {
  if (actor.id==='havet' && fight.rules.playerScorePhase?.scores.includes(result.total)) {
    fight.outcome='phase';fight.phaseReason='printed-score';
    fight.readerSection=fight.rules.playerScorePhase.readerSection;
    return true;
  }
  if (!result.hit) return false;
  const weapon=actor.id==='havet' ? fight.player.weapon : actor.weapon;
  if (fight.rules.captureWeaponsOnUnarmedHit && weapon==='unarmed') {
    if (target.weapon==='unarmed' || target.id==='havet' && fight.player.weapon==='unarmed') return true;
    if (actor.id==='havet') { fight.player.weapon='blaster';fight.player.ready=true; }
    else {actor.weapon='blaster';actor.rangedSkill=actor.closeSkill=actor.armedSkill ?? actor.rangedSkill;}
    if (target.id==='havet') {fight.player.weapon='unarmed';fight.player.ready=true;}
    else {target.weapon='unarmed';target.rangedSkill=target.closeSkill=1;}
    fight.events.push({kind:'captureWeapon',actor:actor.id,target:target.id});
    const join=fight.rules.prisonerJoinOnPlayerCapture;
    if (actor.id==='havet' && join && !fight.prisonersJoined) {
      const enemies=expandActors(join.enemies,{team:'imperial'},'prison-guard');
      const allies=expandActors(join.allies,{team:'rebels'},'prison-ally');
      fight.actors.push(...enemies,...allies);
      fight.queue.push(...enemies.map(a=>a.id),...allies.map(a=>a.id));
      fight.prisonersJoined=true;fight.events.push({kind:'reinforcements'});
    }
    return true;
  }
  if (actor.nonLethalHitProfile && target.id==='havet') {
    const profile=structuredClone(actor.nonLethalHitProfile);
    for (const crew of fight.actors.filter(a=>a.tag===actor.tag)) {
      Object.assign(crew,profile);delete crew.nonLethalHitProfile;
    }
    fight.events.push({kind:'dislodged',actor:actor.id});
    return true;
  }
  if (fight.rules.endOnAllyHit && target.tag===fight.rules.endOnAllyHit) {
    target.defeated=true;fight.outcome='phase';fight.phaseReason='ally-hit';return true;
  }
  return false;
}

export function printedAction(fight,actor,action) {
  if (action==='eweb') {
    if (!fight.rules.ewebAvailable || fight.player.weapon==='eweb') throw new RangeError('The E-Web is unavailable.');
    fight.player.weapon='eweb';fight.player.ready=true;
  } else if (action==='blockGunRack') {
    if (!fight.rules.blockGunRackAvailable || fight.round>2 || fight.gunRackBlocked) throw new RangeError('The gun rack can only be blocked on your first or second turn.');
    fight.range='close';fight.gunRackBlocked=true;
    for (const crew of fight.actors.filter(a=>a.tag==='gun-crew')) {
      crew.nonLethalHitProfile={rangedSkill:2,closeSkill:2,weapon:'blaster'};
      crew.weapon='unarmed';crew.rangedSkill=crew.closeSkill=1;crew.skipFirstTurn=false;
    }
  } else if (action==='retreat') {
    if (!fight.rules.retreat) throw new RangeError('Retreat is unavailable in this encounter.');
    if (fight.rules.enemyLastShotOnRetreat) {
      fight.retreatPending=true;
      fight.queue=fight.queue.filter(id=>id===actor.id || fight.actors.find(a=>a.id===id)?.team!=='rebels');
    } else {fight.outcome='phase';fight.phaseReason='retreat';}
  } else return false;
  return true;
}
