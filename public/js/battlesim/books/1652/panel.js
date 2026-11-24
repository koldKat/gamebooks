import { apiFetch } from '../../run-context.js';
import { createCthulhuPanel } from '../../engines/cthulhu-solo/panel.js';
import { definition, encounters, investigators, loadRoster } from './definition.js';

function createState(getContext) {
  return () => {
    const { currentBookId, currentPlaythrough } = getContext();
    const run = Number(currentBookId) === definition.id ? currentPlaythrough() : null;
    return run ? run[definition.stateKey] ??= { fight: null, history: [], setup: null } : null;
  };
}

function getEncounterParty(encounter, previous) {
  if (!encounter?.partyRoles) return null;
  return encounter.partyRoles.map(role => {
    const profile = investigators.find(actor => actor.role === role);
    const prior = previous.find(actor => actor.role === role);
    const actor = { ...profile, ...prior, name: prior?.displayName || profile.name,
      weaponChoices: { ...profile.weaponChoices, ...encounter.extraWeapons } };
    for (const key of ['fled', 'waiting', 'unconscious', 'canFireOpening']) delete actor[key];
    const startingDamage = encounter.startingDamage?.[role];
    if (startingDamage) actor.hp = Math.min(Number(actor.hp), actor.maxHp - startingDamage);
    return actor;
  });
}

export { definition };
export const loadData = () => loadRoster(apiFetch);
export const { init, render, setVisible } = createCthulhuPanel({
  definition,
  createState,
  getEncounters: () => encounters,
  getInvestigators: () => investigators,
  getEncounterParty,
  printedPercentile: true,
  expedition: true,
});
export { init as initSim1652, render as renderSim1652, setVisible as setSim1652Visible };
