// Build and retain manually entered ship, force and crew values for declared Sagard combat types.
export function sagardExtraSetupMarkup(id, rules) {
  if (!rules.maxShipHp && !rules.forceCombatEnabled) return '';
  const number = (key, label, value, min, max) => `<label class="inv-edit-row" id="${id}-${key}-row"><span>${label}</span><input class="inv-edit-input" id="${id}-${key}" type="number" step="1" min="${min}" max="${max}" value="${value}"></label>`;
  const forces = number('alliesRemaining', 'Allied force remaining', 0, 0, 1000)
    + number('enemiesRemaining', 'Enemy force remaining', 1, 1, 1000);
  if (!rules.maxShipHp) return forces;
  return number('shipHp', 'Current ship strength', rules.maxShipHp, 1, rules.maxShipHp) + forces
    + number('crewRemaining', 'Surviving crewmen', 10, 0, 10)
    + number('plundered', 'Previously plundered ships', 0, 0, 4)
    + `<label class="inv-edit-row" id="${id}-opponentIndex-row"><span>Galleon record</span><select class="inv-edit-input" id="${id}-opponentIndex"></select></label>`;
}

export function createSagardExtraSetup(el, rules, selected) {
  const enabled = Boolean(rules.maxShipHp || rules.forceCombatEnabled);
  const keys = rules.maxShipHp ? ['shipHp', 'alliesRemaining', 'enemiesRemaining', 'crewRemaining', 'plundered', 'opponentIndex']
    : ['alliesRemaining', 'enemiesRemaining'];
  function restore(setup = {}) {
    if (!enabled) return;
    const spec = selected();
    const defaults = {shipHp: rules.maxShipHp, alliesRemaining: spec?.forces?.allies ?? 0,
      enemiesRemaining: spec?.forces?.enemies ?? 1, crewRemaining: spec?.beast?.crew ?? 10, plundered: 0, opponentIndex: 0};
    el('opponentIndex')?.replaceChildren();
    for (const [index, row] of (spec?.naval?.singleOpponent ? spec.opponents : []).entries()) {
      const option = el('opponentIndex').ownerDocument.createElement('option'); option.value = index;
      option.textContent = row.name; el('opponentIndex').append(option);
    }
    for (const key of keys) el(key).value = setup[key] ?? defaults[key];
  }
  const snapshot = () => enabled ? Object.fromEntries(keys.map(key => [key, el(key).value])) : {};
  function options() {
    if (!enabled) return {};
    const spec = selected(), result = {};
    if (spec?.naval) {
      result.ship = {hp: el('shipHp').value, maxHp: rules.maxShipHp};
      if (spec.naval.singleOpponent) result.opponentIndex = Number(el('opponentIndex').value);
    }
    if (spec?.forces) Object.assign(result, {alliesRemaining: el('alliesRemaining').value, enemiesRemaining: el('enemiesRemaining').value});
    if (spec?.beast) result.crewRemaining = el('crewRemaining').value;
    if (spec?.opponentsRemovedPerPlunder) result.plundered = Number(el('plundered').value);
    return result;
  }
  function refresh() {
    if (!enabled) return;
    const spec = selected();
    for (const [key, visible] of Object.entries({shipHp: spec?.naval, alliesRemaining: spec?.forces,
      enemiesRemaining: spec?.forces, crewRemaining: spec?.beast, plundered: spec?.opponentsRemovedPerPlunder,
      opponentIndex: spec?.naval?.singleOpponent})) {
      const row = el(key + '-row'); if (row) row.hidden = !visible;
    }
  }
  return {restore, snapshot, options, refresh};
}
