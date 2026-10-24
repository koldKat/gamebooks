// Installed from the book's database catalog before translations or panels load.
export let CROWN_ROSTER = Object.freeze([]);
export function installCrownRoster(rows) {
  CROWN_ROSTER = Object.freeze(rows.map(row => Object.freeze(row)));
}
