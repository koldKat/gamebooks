// Installed from the book's database catalog before translations or panels load.
export let VALLEY_ROSTER = Object.freeze([]);
export function installValleyRoster(rows) {
  VALLEY_ROSTER = Object.freeze(rows.map(row => Object.freeze(row)));
}
