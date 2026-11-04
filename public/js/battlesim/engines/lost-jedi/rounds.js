// Advance Lost Jedi combat rounds, timed phases and source reinforcements.
import {living} from './targeting.js';

export function expandActors(groups, defaults = {}, prefix = 'enemy') {
  const actors = [];
  for (const [groupIndex, group] of groups.entries()) {
    const count = Number(group.count ?? 1);
    if (!Number.isInteger(count) || count < 1 || count > 24) throw new RangeError('Invalid combat group size.');
    for (let i=0;i<count;i++) actors.push({...structuredClone(defaults),...structuredClone(group),
      id:`${prefix}-${groupIndex}-${i}`, closeSkill:group.closeSkillOverride ?? group.closeSkill ?? group.rangedSkill,
      defeated:false, turns:0, shots:0});
  }
  return actors;
}

export function queueRound(fight) {
  fight.movingClose=false;
  const active = fight.actors.filter(actor=>living(actor) && !(fight.rules.thirdPartyOnly && actor.id==='havet'));
  const order = fight.rules.order ?? (fight.rules.enemyFirst ? ['enemy','havet','ally'] : ['havet','enemy','ally']);
  const picked = new Set();
  fight.queue = [];
  for (const key of order) for (const actor of active) {
    if (picked.has(actor.id)) continue;
    if (key===actor.id || key===actor.tag || key==='enemy' && actor.team!=='rebels'
        || key==='ally' && actor.team==='rebels' && actor.id!=='havet') {
      fight.queue.push(actor.id);picked.add(actor.id);
    }
  }
  if (!fight.rules.playerOnly) fight.queue.push(...active.filter(actor=>!picked.has(actor.id)).map(actor=>actor.id));
  else fight.queue = fight.queue.filter(id=>id==='havet');
}

export function finish(fight) {
  if (fight.outcome) return;
  if (!fight.rules.thirdPartyOnly && !living(fight.actors.find(actor=>actor.id==='havet'))) fight.outcome='loss';
  const enemies=fight.actors.filter(actor=>actor.team!=='rebels');
  if (!fight.outcome && !fight.rules.thirdPartyOnly && enemies.every(actor=>!living(actor))) fight.outcome='win';
  if (!fight.outcome && fight.rules.thirdPartyOnly && new Set(enemies.filter(living).map(actor=>actor.team)).size<=1) {
    fight.outcome='phase';fight.phaseReason='third-party-result';
  }
  if (!fight.outcome && fight.rules.firstCasualtyEndsPhase && fight.actors.some(actor=>!living(actor))) {
    fight.outcome='phase';fight.phaseReason='first-casualty';
  }
  if (!fight.outcome && fight.rules.endAfterDefeated && enemies.filter(actor=>!living(actor)).length>=fight.rules.endAfterDefeated) {
    fight.outcome='phase';fight.phaseReason='required-opponents-defeated';
  }
}

export function advanceTurn(fight, catalog = []) {
  fight.queue.shift();fight.selectedTargetId=null;
  finish(fight);
  if (fight.outcome) return;
  if (fight.rules.actionLimit && fight.actions>=fight.rules.actionLimit) {
    fight.outcome='phase';fight.phaseReason='action-limit';return;
  }
  const player=fight.actors.find(actor=>actor.id==='havet');
  if (fight.rules.playerShotLimit && player.shots>=fight.rules.playerShotLimit
      || fight.rules.enemyShotLimit && !fight.rules.phaseEndsBeforeEnemySecondShot
        && fight.actors.some(actor=>actor.team!=='rebels' && actor.shots>=fight.rules.enemyShotLimit)) {
    fight.outcome='phase';fight.phaseReason='shot-limit';return;
  }
  fight.queue=fight.queue.filter(id=>living(fight.actors.find(actor=>actor.id===id)));
  if (fight.queue.length) return;
  if (fight.retreatPending) {fight.outcome='phase';fight.phaseReason='retreat';return;}
  if (fight.escapeEndRound && fight.round>=fight.escapeEndRound) {
    fight.outcome='phase';fight.phaseReason='escape-exposure-complete';return;
  }
  if (fight.rules.roundLimit && fight.round>=fight.rules.roundLimit) {
    fight.outcome='phase';fight.phaseReason='round-limit';return;
  }
  if (!fight.reinforcementsAdded && fight.rules.reinforcementAfterRound===fight.round) {
    const next=catalog.find(row=>row.section===fight.rules.reinforcementSection);
    if (!next?.rules.reinforcements) throw new RangeError('Reinforcement data is unavailable.');
    fight.actors.push(...expandActors(next.actors,{team:'imperial'},'reinforcement'));
    fight.reinforcementsAdded=true;
    fight.events.push({kind:'reinforcements',section:next.section});
  }
  for (const [index,wave] of (fight.rules.reinforcementWaves ?? []).entries()) {
    fight.completedWaves ??= [];
    if (wave.afterRound!==fight.round || fight.completedWaves.includes(index)) continue;
    fight.actors.push(...expandActors(wave.actors,{team:'imperial'},'wave-'+index));
    fight.completedWaves.push(index);
    fight.events.push({kind:'reinforcements',round:fight.round+1});
  }
  for (const [index,wave] of (fight.rules.lateCombatants ?? []).entries()) {
    fight.completedLateGroups ??= [];
    if (wave.afterRound!==fight.round || fight.completedLateGroups.includes(index)) continue;
    fight.actors.push(...expandActors(wave.actors,{team:'imperial'},'late-'+index));
    fight.completedLateGroups.push(index);
    fight.events.push({kind:'reinforcements',round:fight.round+1});
  }
  fight.round++;
  if (!fight.reinforcementsAdded && fight.rules.reinforcementsAtRound===fight.round) {
    fight.actors.push(...expandActors(fight.rules.reinforcements,{team:'imperial'},'reinforcement'));
    fight.reinforcementsAdded=true;fight.events.push({kind:'reinforcements',round:fight.round});
  }
  queueRound(fight);
}
