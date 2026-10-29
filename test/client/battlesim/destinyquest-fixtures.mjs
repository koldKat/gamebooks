import { readRosterDocument } from '../../helpers/roster-db.cjs';
import { resolveDestinyAbilityRoll as resolve } from '../../../public/js/battlesim/engines/destinyquest/ability-rolls.js';
import { readFileSync } from 'node:fs';
import { createWinterFight as create, configureWinterEncounter as configure, useWinterAction as action, winterChallenge as challenge } from '../../../public/js/battlesim/engines/destinyquest/winters-fury.js';
import { decodeDestinyRoster, winterRosterFor as find } from '../../../public/js/battlesim/engines/destinyquest/winters-fury-roster.js';
const seed = readRosterDocument(1285);
export const WINTER_ENCOUNTERS = decodeDestinyRoster(seed.enemies);
export const winterRosterFor = section => find(WINTER_ENCOUNTERS, section);
export const createWinterFight = (hero, section, options = {}) => create(hero, section, { ...options, roster: WINTER_ENCOUNTERS });

export const configureWinterEncounter = (fight, section, options = {}) => configure(fight, section, { ...options, roster: WINTER_ENCOUNTERS });

export const useWinterAction = (fight, name, options = {}, roll) => action(fight, name, { ...options, roster: WINTER_ENCOUNTERS }, roll);
export const winterChallenge = (fight, section, options = {}) => challenge(fight, section, { ...options, roster: WINTER_ENCOUNTERS });

export const resolveDestinyAbilityRoll = (fight, roll) => resolve(fight, roll, { roster: WINTER_ENCOUNTERS });
