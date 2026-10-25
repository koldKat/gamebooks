import { createRosterLoader } from '../../roster-data.js';

export const definition = Object.freeze({
  id: 724, title: 'Кралската корона', family: 'fighting-fantasy',
  stateKey: 'sim724', i18nPrefix: 'battlesim724',
});

export const RULES_REVISION = 1;
export const DARTS_BOARD = '/api/books/724/reading-images/546273587eca60abe45196d707200147f7fec8ef8f650d870aaab530e8794c71.png';
export const CHARACTER_DEFAULTS = Object.freeze({
  goblinTeeth: 0, giantTeeth: 0, pebbles: 0, medicines: 0, fruits: 0, dartsGames: 0,
  armed: true, unarmedPenalty: 3, weaponPenalty: 0, chainmail: false, sharpened: false,
  nextFightSkillLoss: 0, nextFightDoubleDamage: false,
  insideFortress: false, horn: false, twoWeapons: false, forgottenMagic: false,
  reptileFear: false, disguised: false, nosePlugs: false, wax: false, skullcap: false,
  mirror: false, greenRing: false, pearlRing: false, sunJewel: false, goldJewel: false,
  firewater: false, holyWater: false, sand: false, rockDust: false, yellowPowder: false,
  oakStaff: false, boneBracelet: false, greenWig: false, pendulum: false, flute: false,
  amulet: false, glue: false, blackMask: false,
});

export let ENCOUNTERS = Object.freeze([]);
export let SPELL_ENCOUNTERS = Object.freeze([]);
export let SPELL_LABELS = Object.freeze({});
export let SUMMONED_ALLIES = Object.freeze({});
export let NPC_RULES = Object.freeze({});
export const loadRoster = createRosterLoader(724, 'CATALOG', entries => {
  NPC_RULES = Object.freeze(Object.assign({}, ...entries.map(entry => entry.npcRules ?? {})));
  ENCOUNTERS = Object.freeze(entries.map(entry => entry.encounter));
  const variants = entries.flatMap(entry => entry.variants).sort((a, b) => a.order - b.order);
  SPELL_ENCOUNTERS = Object.freeze(variants.map(variant => variant.spec));
  SPELL_LABELS = Object.freeze(Object.fromEntries(variants.map(variant => [variant.spec.section, variant.label])));
  SUMMONED_ALLIES = Object.freeze(Object.fromEntries(entries.flatMap(entry => entry.supportProfiles ?? [])
    .map(profile => [profile.key, Object.freeze(profile)])));
});

export function encounterFor(section) {
  const variant = SPELL_ENCOUNTERS.find(value => value.section === section);
  const original = ENCOUNTERS.find(value => value.section === (variant?.base ?? section));
  if (!original) throw new RangeError('Unknown Crown of Kings encounter');
  return structuredClone(variant ? { ...original, ...variant, spell: true, sourceSection: original.section } : original);
}
