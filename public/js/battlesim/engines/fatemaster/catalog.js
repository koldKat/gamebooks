// Validate database-owned Fatemaster groups and prepare optional encounter presets.
import {combatant, integer} from './rules.js';
import {startFatemasterFight} from './battle.js';

export function expandFatemasterGroups(groups) {
  if (!Array.isArray(groups) || !groups.length) throw new Error('Missing Fatemaster opponent groups');
  const units = [], keys = new Set();
  for (const group of groups) {
    const key = String(group.key);
    if (keys.has(key)) throw new Error('Duplicate opponent group');
    keys.add(key);
    const count = integer(group.count, 'group size', 1, 50);
    const checked = combatant(group.each);
    for (let i = 0; i < count; i++) units.push({...structuredClone(checked),group:key});
    if (units.length > 50) throw new Error('Too many opponents');
  }
  return units;
}

export function validateFatemasterCatalog(entries) {
  if (!Array.isArray(entries) || !entries.length || new Set(entries.map(e=>e.section)).size !== entries.length) throw new Error('Invalid Fatemaster catalog');
  const defaults = entries.find(entry=>entry.playerDefaults)?.playerDefaults;
  if (!defaults || !Array.isArray(defaults.weapons) || !Array.isArray(defaults.armour)) throw new Error('Missing Fatemaster player setup');
  combatant(defaults.player,true);
  combatant(defaults.customEnemy);
  for (const entry of entries) {
    if (!entry.section || typeof entry.label !== 'string' || !entry.rules || !Array.isArray(entry.sourcePages)) throw new Error('Invalid Fatemaster encounter');
    expandFatemasterGroups(entry.groups);
    if (entry.variants && (!Array.isArray(entry.variants) || new Set(entry.variants.map(v=>v.key)).size !== entry.variants.length)) throw new Error('Invalid encounter variants');
  }
  return defaults;
}

export function prepareFatemasterEncounter(entry, options = {}) {
  const config = structuredClone(entry);
  if (options.variant) {
    const variant = config.variants?.find(variant=>variant.key === options.variant);
    if (!variant) throw new Error('Unknown encounter variant');
    Object.assign(config.rules,variant.rules ?? {});
    if (variant.enemyAttackBonus !== undefined) {
      const bonus = integer(variant.enemyAttackBonus,'variant attack modifier',-100,100);
      for (const group of config.groups) group.each.attackBonus += bonus;
    }
    if (variant.enemyDefenceBonus !== undefined) {
      const bonus = integer(variant.enemyDefenceBonus,'variant defence modifier',-100,100);
      for (const group of config.groups) group.each.defenceBonus += bonus;
    }
  }
  if (config.rules.response === 'miss-bolt') config.rules.counterBoltDice = integer(options.counterBoltDice,'explicit counter-bolt dice',1,3);
  if (config.rules.disarm && options.disarmInterpretation !== undefined) {
    const interpretations = {
      'raw-hit': {basis:'raw',requiresHit:true},
      'raw-special': {basis:'raw',requiresHit:false},
      'score-hit': {basis:'score',requiresHit:true}
    };
    if (!Object.hasOwn(interpretations,options.disarmInterpretation)) throw new Error('Choose a weapon-swap roll interpretation');
    Object.assign(config.rules.disarm,interpretations[options.disarmInterpretation]);
  }
  if (config.rules.survivingCastBonusMode && options.furyMode !== undefined) {
    if (!['once','per-cast'].includes(options.furyMode)) throw new Error('Choose a casting fury interpretation');
    config.rules.survivingCastBonusMode = options.furyMode;
  }
  return config;
}

export function startFatemasterEncounter(player, config, options = {}) {
  const fight = startFatemasterFight(player,expandFatemasterGroups(config.groups),config.rules,options);
  fight.section = config.section;
  fight.label = config.label;
  return fight;
}
