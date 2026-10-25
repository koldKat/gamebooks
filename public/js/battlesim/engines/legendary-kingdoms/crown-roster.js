// Installed from the book's database catalog before translations or panels load.
export let CROWN_ROSTER = Object.freeze([]);
export const CROWN_SETTINGS = {};
export function installCrownRoster(rows, settings) {
  CROWN_ROSTER = Object.freeze(rows.map(row => Object.freeze(row)));
  if (settings) Object.assign(CROWN_SETTINGS, settings);
}
