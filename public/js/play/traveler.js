// Copy the traveling character's possessions without copying book-local fights or paths.
const carriedFields = ['inventory', 'equipment', 'equipmentVisible'];

export function captureTraveler(run) {
  if (!run) return null;
  const result = { inventory: [], equipment: {}, equipmentVisible: {} };
  for (const key of carriedFields) {
    if (Object.hasOwn(run, key)) result[key] = structuredClone(run[key]);
  }
  return result;
}

export function applyTraveler(run, traveler) {
  if (!run || !traveler) return;
  // Older versions kept a separate loadout in each book. Preserve that first
  // local loadout before adopting the traveling one, including customized items.
  if (!Object.hasOwn(run, 'openWorldLocalLoadout')) run.openWorldLocalLoadout = captureTraveler(run);
  for (const key of carriedFields) {
    if (Object.hasOwn(traveler, key)) run[key] = structuredClone(traveler[key]);
  }
  if (Object.hasOwn(traveler, 'openWorldCharacters')) {
    run.openWorldCharacters = { ...(run.openWorldCharacters || {}), ...structuredClone(traveler.openWorldCharacters) };
    run.openWorldPendingCharacter = structuredClone(traveler.openWorldPendingCharacter);
  }
}
