// Retain editable combat survivors across optional encounters without tracking story progress.
export function combatCommandPlayerSetup(state, preset, defaults, preserve = false) {
  const templates = preset?.playerUnits ?? state.custom?.player ?? defaults.playerUnits ?? [defaults.customPlayer];
  if (!preserve) return structuredClone(templates);
  const saved = new Map((state.playerForce ?? []).map(unit => [unit.key, unit]));
  return templates.map(unit => structuredClone({...unit, ...saved.get(unit.key), ...(preset ? {type:unit.type} : {})}));
}

export function rememberCombatCommandForce(state, force) {
  const saved = new Map((state.playerForce ?? []).map(unit => [unit.key, unit]));
  for (const unit of force) saved.set(unit.key, structuredClone(unit));
  state.playerForce = [...saved.values()];
}
