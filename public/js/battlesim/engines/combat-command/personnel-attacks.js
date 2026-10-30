// Resolve one saved personnel attack or its follow-up hit check without rerolling.
import { personnelAt, personnelChart, personnelDamage, personnelHits, personnelInteger,
  personnelLiving } from './personnel-rules.js';

export function personnelAttackInfo(fight, task) {
  const rules = fight.config.rules, player = task.side === 'player';
  const units = player ? fight.player : fight.enemies;
  const unit = units.find(u => u.key === task.key);
  const target = player ? fight.enemies.find(u => u.key === task.target) : personnelLiving(fight.player)[0];
  if (!target || !target.count || target.retired || unit && (!unit.count || unit.retired)) return null;
  if (player && fight.roundOptions.blocked?.includes(task.key)) return null;
  const fixed = task.fixed;
  let strength, chart;
  if (fixed) { strength = fixed.strength; chart = fixed.chart; }
  else {
    if (!unit) throw new RangeError('Missing combat unit');
    const melee = fight.melee || rules.meleeOnly;
    const value = melee ? unit.melee : unit.ordnance;
    if (value === null) throw new RangeError('Melee is not applicable to this opponent');
    let count = unit.count, power = value;
    if (!player && !melee && fight.setup.suppliesDestroyed && rules.supplyOrdnanceReduction !== undefined) {
      power = Math.max(0, power - rules.supplyOrdnanceReduction);
    }
    if (player) {
      if (!melee) power = Math.max(0, power - (fight.roundOptions.ordnanceReduction ?? 0));
      if (task.key === fight.player[0].key) count = Math.max(0, count - (fight.roundOptions.excluded ?? 0));
    }
    strength = count * power;
    chart = player ? personnelAt(rules.playerChartRounds, fight.config.playerChart ?? unit.chart, fight.round) : unit.chart;
    if (!player && fight.searchlightDestroyed) chart = rules.searchlight.enemyChart;
    chart = personnelChart(chart, rules[player ? 'playerChartShift' : 'enemyChartShift'] ?? 0);
  }
  return { strength, chart: personnelChart(chart), unit, target };
}

export function personnelResolveAttack(fight, task, result) {
  const info = personnelAttackInfo(fight, task);
  if (!info) return;
  const rules = fight.config.rules, player = task.side === 'player';
  const event = fight.history.at(-1);
  const bonus = player && rules.bonusHits && result.total >= rules.bonusHits.minimumRoll ? rules.bonusHits.hits : 0;
  const attack = { side: task.side, key: task.key ?? null, target: info.target.key,
    kind: task.attackKind ?? 'ordinary', strength: info.strength, chart: info.chart,
    ...result, hits: personnelHits(fight.charts, info.chart, info.strength, result.total) + bonus,
    bonusHits: bonus, losses: [] };
  event.attacks.push(attack);
  if (task.attackKind === 'charge') {
    personnelInteger(info.unit.charges, 1);
    info.unit.charges--;
  }
  if (!player) fight.enemyReplies++;
  if (player && rules.hitSave && attack.hits > 0) {
    fight.queue.unshift({ kind: 'hit-save', dice: 2, label: 'Confirm hit on the floaters',
      attackIndex: event.attacks.length - 1, minimumRoll: rules.hitSave.minimumRoll });
  } else personnelDamage(fight, player ? 'enemy' : 'player', attack.hits, attack);
}

export function personnelResolveHitSave(fight, task, result) {
  const event = fight.history.at(-1), attack = event.attacks[task.attackIndex];
  if (!attack || attack.side !== 'player' || attack.hitCheck) throw new RangeError('Invalid pending hit check');
  attack.hitCheck = result;
  if (result.total >= task.minimumRoll) personnelDamage(fight, 'enemy', attack.hits, attack);
  else attack.ignoredHits = attack.hits;
}
