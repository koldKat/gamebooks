// Prepare explicit player setup for database-owned formation presets or a standalone custom fight.
import { formationUnits } from './formation-rules.js';

export function prepareFormationEncounter(entry, {player, enemies, chartChoices = {}} = {}) {
  if (!entry || entry.combatMode !== 'formation') throw new RangeError('Choose a formation encounter');
  const config = structuredClone(entry);
  delete config.charts;
  delete config.playerDefaults;
  delete config.sourceUnitProfiles;
  const forces = {player:structuredClone(player ?? entry.playerUnits),enemy:structuredClone(enemies ?? entry.enemies)};
  if (!Array.isArray(forces.player) || !Array.isArray(forces.enemy)) throw new RangeError('Enter the combat forces');
  for (const side of ['player','enemy']) {
    const printed = side === 'player' ? entry.playerUnits : entry.enemies;
    if (forces[side].length !== printed.length || forces[side].some((unit,index) => unit.key !== printed[index].key)) {
      throw new RangeError('Keep the printed formation groups for this encounter');
    }
    forces[side] = forces[side].map((input,index) => {
      const unit = {...structuredClone(printed[index]),name:input.name};
      for (const field of ['count','ordnance','melee','morale','initialCount','casualtyRemainder']) {
        if (Object.hasOwn(input,field)) unit[field] = input[field];
      }
      if (input.retired !== undefined && input.retired !== 'routed') throw new RangeError('Invalid current rout status');
      if (input.retired) unit.retired = input.retired;
      else delete unit.retired;
      return unit;
    });
  }
  for (const requirement of config.requiredInputs ?? []) {
    const unit = forces[requirement.side]?.find(candidate => candidate.key === requirement.key);
    for (const field of requirement.fields) {
      if (!unit || !Number.isSafeInteger(unit[field]) || unit[field] < (field === 'count' ? 1 : 0)) {
        throw new RangeError('Enter ' + field + ' for ' + (unit?.name ?? requirement.key));
      }
    }
  }
  const keys = new Set((config.chartInputs ?? []).map(input => input.key));
  if (Object.keys(chartChoices).some(key => !keys.has(key))) throw new RangeError('Unknown combat chart choice');
  for (const input of config.chartInputs ?? []) {
    if (!/^[A-G]$/.test(chartChoices[input.key])) throw new RangeError('Choose ' + input.label.toLowerCase());
  }
  for (const attack of [...(config.opening ?? []), ...config.rounds.flatMap(sequence => sequence.attacks)]) {
    if (attack.chartInput) {
      if (!keys.has(attack.chartInput)) throw new RangeError('Unknown preset chart input');
      attack.chart = chartChoices[attack.chartInput];
    }
  }
  config.enemies = formationUnits(forces.enemy);
  return {player:formationUnits(forces.player),config};
}

export function customFormationEncounter(player, enemies, {
  playerChart, enemyChart, playerStat = 'melee', enemyStat = 'melee', initiative = 'player',
} = {}) {
  if (!['player','enemy'].includes(initiative) || !['melee','ordnance'].includes(playerStat)
      || !['melee','ordnance'].includes(enemyStat) || !/^[A-G]$/.test(playerChart)
      || !/^[A-G]$/.test(enemyChart)) throw new RangeError('Choose combat values, charts and initiative');
  const force = formationUnits(player), opposition = formationUnits(enemies);
  if (!force.length || !opposition.length) throw new RangeError('Enter both combat forces');
  const attack = (side,units,targets,stat,chart) => ({side,chart,actors:units.map(unit => ({key:unit.key,stat})),
    targets:targets.map(unit => unit.key),casualties:'manual'});
  const turns = {player:attack('player',force,opposition,playerStat,playerChart),enemy:attack('enemy',opposition,force,enemyStat,enemyChart)};
  return {player:force,config:{section:'custom',label:'Custom formation fight',combatMode:'formation',
    enemies:opposition,rounds:[{from:1,attacks:initiative === 'player' ? [turns.player,turns.enemy] : [turns.enemy,turns.player]}]}};
}
