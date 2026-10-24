import { readFileSync } from 'node:fs';
import { createWinterFight as create } from '../../../public/js/battlesim/engines/destinyquest/winters-fury.js';
import { decodeDestinyRoster, winterRosterFor as find } from '../../../public/js/battlesim/engines/destinyquest/winters-fury-roster.js';
const seed = JSON.parse(readFileSync(new URL('../../../data/simulator-rosters/1285.json', import.meta.url), 'utf8'));
export const WINTER_ENCOUNTERS = decodeDestinyRoster(seed.enemies);
export const winterRosterFor = section => find(WINTER_ENCOUNTERS, section);
export const createWinterFight = (hero, section, options = {}) => create(hero, section, { ...options, roster: WINTER_ENCOUNTERS });
