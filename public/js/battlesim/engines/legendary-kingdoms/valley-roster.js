// Installed from the book's database catalog before translations or panels load.
export let VALLEY_ROSTER = Object.freeze([]);
export const VALLEY_SETTINGS = {};
export function installValleyRoster(rows, settings) {
  VALLEY_ROSTER = Object.freeze(rows.map(row => Object.freeze(row)));
  if (settings) Object.assign(VALLEY_SETTINGS, settings);
}
