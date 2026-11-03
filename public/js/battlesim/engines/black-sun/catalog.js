// Validate database-owned encounter definitions and apply explicit combat variants.
import {blackSunPlayer, blackSunStart, validateBlackSunFight} from './combat.js';

export function validateBlackSunCatalog(entries) {
  if (!Array.isArray(entries) || !entries.length || new Set(entries.map(entry => entry.section)).size !== entries.length) throw new RangeError('Invalid Black Sun catalog');
  for (const entry of entries) {
    if (typeof entry.section !== 'string' || !entry.section || typeof entry.label !== 'string' || !entry.label
        || !Array.isArray(entry.sourcePages) || !entry.sourcePages.length || !entry.sourcePages.every(Number.isSafeInteger)
        || entry.combat?.section !== entry.section || entry.combat?.label !== entry.label) throw new RangeError('Invalid encounter identity');
    validateBlackSunFight(blackSunStart(blackSunPlayer(), entry.combat));
    if (entry.combat.variants && new Set(entry.combat.variants.map(variant => variant.key)).size !== entry.combat.variants.length) throw new RangeError('Duplicate combat variant');
    for (const variant of entry.combat.variants ?? []) prepareBlackSunEncounter(entry, {variants: [variant.key]});
  }
  return entries;
}

export function prepareBlackSunEncounter(entry, options = {}, support = {}) {
  const combat = structuredClone(entry.combat);
  const selected = options.variants ?? [];
  if (!Array.isArray(selected) || new Set(selected).size !== selected.length) throw new RangeError('Invalid combat variants');
  for (const key of selected) {
    const variant = combat.variants?.find(item => item.key === key);
    if (!variant) throw new RangeError('Unknown combat variant');
    const {key: ignored, partAttackModifiers, ...rules} = variant;
    Object.assign(combat, structuredClone(rules));
    if (partAttackModifiers) for (const [part, modifier] of Object.entries(partAttackModifiers)) {
      const enemy = combat.opponents.find(enemy => enemy.key === part);
      if (!enemy || !Number.isSafeInteger(modifier) || !Number.isSafeInteger(enemy.attack)) throw new RangeError('Invalid part modifier');
      enemy.attack += modifier;
    }
  }
  const passiveKeys = options.passives ?? [], effectKeys = options.effects ?? [], groups = new Set();
  if (!Array.isArray(passiveKeys) || !Array.isArray(effectKeys)
      || new Set(passiveKeys).size !== passiveKeys.length || new Set(effectKeys).size !== effectKeys.length) throw new RangeError('Invalid combat gifts');
  for (const key of passiveKeys) {
    const passive = support.passives?.find(passive => passive.id === key);
    if (!passive || passive.sections && !passive.sections.includes(entry.section)) throw new RangeError('Combat gift unavailable');
    if (passive.group && groups.has(passive.group)) throw new RangeError('Conflicting combat gifts');
    if (passive.group) groups.add(passive.group);
    Object.assign(combat, structuredClone(passive.combat ?? {}));
    if (passive.player) combat.playerOverrides = {...combat.playerOverrides, ...structuredClone(passive.player)};
    if (passive.periodicEffect) {
      if (combat.defenseOnly) throw new RangeError('Opponent has no resistance');
      (combat.periodicEffects ??= []).push(structuredClone(passive.periodicEffect));
    }
  }
  for (const key of effectKeys) {
    const effect = support.effects?.find(effect => effect.id === key);
    if (!effect || effect.sections && !effect.sections.includes(entry.section)) throw new RangeError('Combat effect unavailable');
    (combat.effects ??= []).push(structuredClone(effect));
  }
  if (combat.openingDamageFrom === 'rage') {
    if (!Number.isSafeInteger(options.rage) || options.rage < 0 || options.rage > 1000) throw new RangeError('Enter current Rage');
    combat.openingDamage = options.rage;
  }
  if (options.rage != null) combat.rage = options.rage;
  if (combat.entryDamageAndRounds) {
    if (!Number.isSafeInteger(options.extraDamage ?? 0) || (options.extraDamage ?? 0) < 0
        || (options.extraDamage ?? 0) > combat.entryDamageAndRounds.max) throw new RangeError('Invalid printed Extra Damage');
    combat.openingDamage = options.extraDamage ?? 0;
    combat.startRound = options.extraDamage ?? 0;
  }
  if ((options.warfare || combat.warfare) && combat.warfareInstruction) combat.entryEvent = {id: 'warfare', section: combat.warfareInstruction, endEncounter: true};
  if (options.raminTalisman) combat.raminTalisman = true;
  validateBlackSunFight(blackSunStart(blackSunPlayer(), combat));
  return combat;
}
