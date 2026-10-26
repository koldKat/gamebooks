import { damageDestinyHero, destinyStrike, addDestinyStatEffect, isDestinyOpponentActive, destinyImmuneToAbility,applyDestinyAcceptedHeroRoll,destinyHeroHasStatus,destinyStat } from './effects.js';
import { destinyDie, applyDestinyDamage } from './damage.js';
import { queueDestinyEncounterEvent } from './encounter-events.js';

export function prepareDestinyGridRound(fight,options,roll){
  const grid=fight.encounter?.gridHazard;if(!grid)return;
  const position=options.gridPosition;
  if(!Array.isArray(position)||position.length!==2||position.some((value,index)=>!Number.isSafeInteger(value)||value<1||value>(index===0?grid.columns:grid.rows)))throw new RangeError('Choose a valid clear grid square');
  if(grid.occupied.some(cell=>cell[0]===position[0]&&cell[1]===position[1]))throw new RangeError('Choose a clear grid square');
  grid.hero=[...position];
  queueDestinyEncounterEvent(fight,{kind:'persistent-grid-hazard',name:grid.name,dice:2},'speed',roll);
}

export function applyDestinyScheduledTransitions(fight,round,target){
  let chosen=target;
  for(const rule of fight.encounter?.scheduledTransitions||[]){
    if(rule.used||round<rule.round||rule.requiresAlive?.some(index=>!isDestinyOpponentActive(fight,index)))continue;
    rule.used=true;
    if(rule.set)Object.assign(fight.encounter,structuredClone(rule.set));
    for(const change of rule.setStats||[]){
      fight.effects=fight.effects.filter(effect=>!(effect.kind==='stat'&&effect.target===change.target&&effect.attribute===change.attribute));
      fight.opponents[change.target][change.attribute]=change.value;
    }
    fight.encounter.inactiveTargets=[...new Set([...(fight.encounter.inactiveTargets||[]).filter(index=>!rule.activate?.includes(index)),...(rule.suspend||[])])];
    fight.effects=fight.effects.filter(effect=>!rule.clearTargetEffects?.some(clear=>effect.target===clear.target&&clear.kinds.includes(effect.kind)));
    if(rule.suspend?.includes(chosen))chosen=rule.defaultTarget;
    fight.history.push({type:'encounter-transition',round,name:rule.name});
  }
  return chosen;
}

export function applyDestinyOpponentForm(fight, form) {
  const rule=fight.encounter.roundForms;
  Object.assign(fight.opponents[rule.target],structuredClone(form.stats));
  for(const key of new Set(rule.profiles.flatMap(profile=>Object.keys(profile.rules||{}))))delete fight.encounter[key];
  Object.assign(fight.encounter,structuredClone(form.rules||{}));
  rule.current=form.id;
}

export function advanceDestinyAspectCycle(fight, round) {
  const cycle=fight.encounter?.aspectCycle;
  if(!cycle||cycle.activeAspect!==null||fight.opponents[cycle.main].health<=0)return;
  if(cycle.nextAspect<cycle.aspects.length&&cycle.mainRounds>=cycle.roundsBetween){
    const target=cycle.aspects[cycle.nextAspect++];cycle.activeAspect=target;cycle.mainRounds=0;
    fight.encounter.inactiveTargets=[...new Set([...(fight.encounter.inactiveTargets||[]).filter(index=>index!==target),cycle.main])];
    fight.history.push({type:'aspect-enter',round,target});
  }else cycle.mainRounds++;
}

export function reformDestinyOpponent(fight, round) {
  const cycle = fight.encounter?.formCycle;
  if (!cycle || cycle.reformRound === undefined || round < cycle.reformRound || !cycle.parts.some(target => fight.opponents[target].health > 0)) return;
  fight.opponents[cycle.shell].health = cycle.shellHealth;
  fight.encounter.inactiveTargets = [...new Set([...(fight.encounter.inactiveTargets || []).filter(target => target !== cycle.shell), ...cycle.parts])];
  fight.defeated = (fight.defeated || []).filter(target => target !== cycle.shell);
  delete cycle.reformRound;
  fight.history.push({ type: 'form-rejoin', round, target: cycle.shell, health: cycle.shellHealth });
}

export function spawnDestinyRoundOpponents(fight, round, createOpponent) {
  for (const rule of fight.encounter?.spawnAtRoundStart || []) {
    if (round < rule.fromRound || rule.source !== undefined && !isDestinyOpponentActive(fight, rule.source)) continue;
    spawnDestinyOpponents(fight, rule, round, createOpponent);
  }
}

export function spawnDestinyOpponents(fight, rule, round, createOpponent) {
  if (!Number.isSafeInteger(rule.count) || rule.count < 1) throw new RangeError('Invalid spawned opponent count');
  for (let i = 0; i < rule.count; i++) {
    const target = fight.opponents.length;
    fight.opponents.push(createOpponent(rule.opponent));
    if (rule.group) (fight.encounter.opponentGroups[rule.group] ??= []).push(target);
    for (const effect of rule.statWhileAlive || []) (fight.encounter.statWhileAlive ??= []).push({ ...effect, target });
    if (rule.endDamage) (fight.encounter.endEffects ??= []).push({ target: 'hero', amount: rule.endDamage, requiresAlive: [target] });
    fight.history.push({ type: 'spawn', round, source: rule.source, target });
  }
}

export function applyDestinyRoundEvents(fight, options, roll) {
  for(const rule of fight.encounter?.startAttributeDamage||[]){
    if(rule.every&&fight.round%rule.every!==0||rule.requiresAlive?.some(target=>!isDestinyOpponentActive(fight,target)))continue;
    const damage=damageDestinyHero(fight,destinyStat(fight,rule.actor,rule.attribute));
    fight.history.push({type:'attribute-damage',name:rule.name,round:fight.round,damage});
    if(fight.hero.health<=0)return;
  }
  for(const rule of fight.encounter?.roundStatCycles||[])if(isDestinyOpponentActive(fight,rule.target))fight.opponents[rule.target][rule.attribute]=rule.values[(fight.round-1)%rule.values.length];
  for(const rule of fight.encounter?.statusAttributeGrowth||[])if(isDestinyOpponentActive(fight,rule.target)&&destinyHeroHasStatus(fight,rule.status)){
    const opponent=fight.opponents[rule.target];opponent[rule.attribute]=Math.min(rule.maximum,opponent[rule.attribute]+rule.amount);
  }
  for(const rule of fight.encounter?.startResourceDamage||[]){
    if(rule.requiresAlive?.some(target=>!isDestinyOpponentActive(fight,target)))continue;
    const amount=(fight.encounter.resources?.[rule.resource]||0)*rule.amount;
    if(amount){
      const lost=damageDestinyHero(fight,amount);
      fight.history.push({type:'resource-damage',round:fight.round,resource:rule.resource,damage:lost,source:rule.name});
    }
    if(fight.hero.health<=0)return;
  }
  const forms=fight.encounter?.roundForms;
  if(forms&&fight.round>=forms.fromRound&&isDestinyOpponentActive(fight,forms.target))queueDestinyEncounterEvent(fight,
    {kind:'opponent-form',name:forms.name,dice:1},'speed',roll);
  for(const rule of fight.encounter?.roundSettings||[])if(rule.round===fight.round)Object.assign(fight.encounter,structuredClone(rule.set));
  for(const rule of fight.encounter?.startFullRecovery||[]){
    if(rule.round===fight.round&&isDestinyOpponentActive(fight,rule.target))fight.opponents[rule.target].health=fight.opponents[rule.target].maxHealth;
  }
  for(const rule of fight.encounter?.startRegeneration||[]){
    if(!isDestinyOpponentActive(fight,rule.target))continue;
    const opponent=fight.opponents[rule.target];opponent.health=Math.min(opponent.maxHealth,opponent.health+rule.amount);
  }
  const ranged = fight.encounter?.rangedCombat;
  if (ranged) {
    fight.encounter.disableHeroAbilities = fight.round <= ranged.throughRound;
    fight.encounter.outnumbered = fight.round > ranged.throughRound && ranged.outnumberedAfter;
  }
  for (const rule of fight.encounter?.roundRampingDamage || []) {
    rule.current = rule.stoppedRound !== undefined && fight.round > rule.stoppedRound
      ? Math.max(0, (rule.current ?? rule.initial) - rule.decay)
      : Math.min(rule.maximum, rule.initial + Math.max(0, fight.round - rule.fromRound) * rule.growth);
  }
  for (const effect of fight.encounter?.startStats || []) {
    if (effect.round !== fight.round) continue;
    if (destinyImmuneToAbility(fight,effect.ability)) continue;
    for (const [attribute, amount] of Object.entries(effect.changes)) addDestinyStatEffect(fight, effect.target, attribute, amount, null, 'encounter-start');
  }
  let trapTargets = null;
  if (fight.trap && !fight.trap.fired && fight.trap.trigger === fight.round) {
    trapTargets = options.trapTargets;
    const maximum = fight.trap.kind === 'snap-jack' ? 1 : fight.trap.trigger;
    if (!Array.isArray(trapTargets) || !trapTargets.length || trapTargets.length > maximum ||
        new Set(trapTargets).size !== trapTargets.length || trapTargets.some(target =>
          !Number.isInteger(target) || !isDestinyOpponentActive(fight, target))) {
      throw new RangeError('Choose the opponents affected by the triggered trap');
    }
  }
  for (const effect of fight.effects) {
    if (!['vortex', 'dry-ice'].includes(effect.kind) || fight.round < effect.from) continue;
    const result = destinyDie(roll);
    applyDestinyAcceptedHeroRoll(fight,[result],'ability');
    if(fight.encounter?.forcedLoss||fight.encounter?.forcedVictory)return;
    fight.history.push({ type: 'round-event', name: effect.kind, round: fight.round, result, unmodifiable: effect.kind === 'vortex' });
    if (effect.kind === 'vortex') {
      if (result <= 2) damageDestinyHero(fight,2);
      else fight.opponents.forEach((opponent, target) => {
        if (isDestinyOpponentActive(fight, target)) destinyStrike(fight, target, 2, 'vortex', 'passive');
      });
    } else if (result <= 2) addDestinyStatEffect(fight, 'hero', 'speed', -1, 1, 'dry-ice');
    else if (result >= 5) fight.opponents.forEach((opponent, target) => {
      if (isDestinyOpponentActive(fight, target)) addDestinyStatEffect(fight, target, 'speed', -2, 1, 'dry-ice');
    });
  }
  if (trapTargets) {
    fight.trap.fired = true;
    // Another round-start event may already have defeated a selected victim.
    const targets = trapTargets.filter(target => isDestinyOpponentActive(fight, target));
    if (fight.trap.kind === 'snap-jack') {
      targets.forEach(target => destinyStrike(fight, target, 10, 'snap-jack', 'passive'));
    } else if (targets.length) {
      const pending = { type: 'damage', name: 'cluster-mine', returnPhase: 'speed', options: {},
        spec: { category: 'pa', armourLoss: 1, passive: true },
        groups: targets.map(target => ({ targets: [target], dice: [destinyDie(roll)], bonuses: {} })) };
      if (options.deferTrapDamage && fight.hero.health > 0) {
        fight.turn.pendingAbility = pending;
        fight.phase = 'ability-rolled';
      } else applyDestinyDamage(fight, pending);
    }
  }
}
