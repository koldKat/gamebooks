// Resolve printed escape checks and their complete opportunity-attack sequences atomically.
import {combatSkillCheck} from './attack-context.js';
import {cannotAct} from './effects.js';

export function sourceEscape(source, action, performAttack, random = Math.random) {
  const index = source.groups.findIndex(actor => actor.hp && actor.features?.encounterEscape);
  if (index < 0) return null;
  const rule = source.groups[index].features.encounterEscape;
  const party = [['player',source.player], ...source.companions.map((actor,i)=>['ally'+i,actor])];
  const selected = action.actor ? party.find(([key])=>key===action.actor) : party.find(([,actor])=>actor.hp && !cannotAct(actor));
  if (!selected || !selected[1].hp || cannotAct(selected[1])) throw new RangeError('No combatant can attempt escape');
  const [key, actor] = selected;
  const bonus = skill => actor.skillBonuses?.[skill] ?? actor.abilities[skill === 'athletics' ? 'str' : 'dex'];
  const skill = action.escapeSkill ?? [...rule.skills].sort((a,b)=>bonus(b)-bonus(a))[0];
  if (!rule.skills.includes(skill)) throw new RangeError('Invalid encounter escape skill');
  const check = combatSkillCheck(actor, skill, rule.dc, {dice:action.dice, random});
  let fight = source;
  if (!check.success) for (const attackIndex of rule.failureOpportunitySequence) {
    if (fight.status !== 'fighting') break;
    fight = performAttack(fight, {kind:'attack',expectedRevision:fight.revision,
      actor:'enemy'+index,target:key,attackIndex,distance:5});
  }
  fight = structuredClone(fight);
  if (fight.status === 'fighting') { fight.status = 'fled'; fight.phase = 'complete'; }
  fight.events = [...fight.events.slice(-99),{kind:'sourceEscape',actor:key,round:fight.round,check,skill}];
  fight.revision = source.revision + 1;
  return fight;
}

export function opportunityRetreat(source, action, performAttack) {
  const actorKey = action.actor ?? 'player';
  const actor = actorKey === 'player' ? source.player : /^ally\d+$/.test(actorKey) ? source.companions[Number(actorKey.slice(4))] : null;
  if (!actor?.hp || cannotAct(actor)) throw new RangeError('No combatant can attempt escape');
  const forced = source.groups.findIndex(enemy => enemy.hp && enemy.features?.retreatAttacks?.forced);
  let fight = source, escaped = true, partingStrikeHit = false;
  if (forced >= 0 || action.withinOpportunityReach) {
    const index = forced >= 0 ? forced : /^enemy\d+$/.test(action.target) ? Number(action.target.slice(5)) : -1;
    const enemy = source.groups[index];
    if (!enemy?.hp) throw new RangeError('Choose the nearest opponent that can attack');
    const rule = enemy.features?.retreatAttacks;
    const melee = enemy.attacks.findIndex(attack => attack.kind !== 'save' && !attack.ranged && attack.range == null);
    for (const attackIndex of rule?.indices ?? (melee === -1 ? [] : [melee])) {
      if (fight.status !== 'fighting' || fight.surrenderOffer === 'offered') break;
      fight = performAttack(fight, {kind:'attack',expectedRevision:fight.revision,actor:'enemy'+index,target:actorKey,
        attackIndex,distance:5,opportunity:true});
      partingStrikeHit ||= fight.events.at(-1).check.hit;
    }
    escaped = !(rule?.stopOnHit && partingStrikeHit);
    partingStrikeHit &&= Boolean(rule?.itemLostOnHit);
  }
  fight = structuredClone(fight);
  if (escaped && fight.status === 'fighting' && fight.surrenderOffer !== 'offered') {
    fight.status = 'fled'; fight.phase = 'complete';
  }
  fight.events = [...fight.events.slice(-99),{kind:escaped ? 'retreat' : 'retreatStopped',
    actor:actorKey,round:fight.round,itemLost:partingStrikeHit}];
  fight.revision = source.revision + 1;
  return fight;
}
