// Collect current fleet strengths and explicit encounter deployment choices.
import { createOpponentEditor } from '../../opponents.js';
import { fleetPanelForce } from './fleet-state.js';
import { fleetNumber, fleetSelect, fleetButton, fleetDistribution } from './fleet-form.js';

const types = ['battlecruiser', 'destroyer', 'fortress'].map(value => ({ value,
  label: { battlecruiser: 'Battlecruiser', destroyer: 'Destroyer', fortress: 'Fortress' }[value] }));
const playerFields = [{ key: 'type', label: 'Ship type', options: types },
  { key: 'count', label: 'Surviving ships', min: 0 }, { key: 'ordnance', label: 'Ordnance per ship', min: 0 },
  { key: 'hitsPerShip', label: 'Hits to destroy one ship', min: 1 },
  { key: 'damage', label: 'Damage already on one surviving ship', min: 0 }];

export function createFleetSetupPanel({ document, holder, id, t, getRoster, getPlayerDefaults }) {
  let playerEditor, enemyEditor, fields, playerChart, enemyChart, initial, distribution, preset;
  const paragraph = text => { const p = document.createElement('p'); p.textContent = text; holder.appendChild(p); };
  function editor(suffix, title, values, fields, presets = []) {
    const instance = createOpponentEditor({ document, id: `${id}-${suffix}`, t, fields, presets });
    instance.element.querySelector('summary').textContent = title;
    instance.set(values.map(value => ({ ...value, displayName: value.name, damage: value.damage ?? 0 })));
    holder.appendChild(instance.element); return instance;
  }
  function readPlayers() {
    return playerEditor.read().map((row, index) => ({ ...row, key: row.key ?? `player-${index}`,
      name: row.displayName || 'Legion ships', finishDamagedTypeFirst: row.type === 'battlecruiser' }));
  }
  function mount(state, selected) {
    holder.replaceChildren(); preset = selected; distribution = null; fields = {};
    const defaults = getPlayerDefaults(), custom = state.custom ?? {};
    paragraph('Enter the ships currently engaged. Partial damage reduces neither ship count nor firepower. It is repaired after the encounter.');
    if (preset?.sourceWarning) paragraph(preset.sourceWarning);
    if (preset?.retreat?.sourceAmbiguity) paragraph(preset.retreat.sourceAmbiguity);
    const players = fleetPanelForce(state, preset, defaults);
    playerEditor = editor('player', 'Your fleet', players, playerFields);
    playerEditor.fixCount(Boolean(preset));
    const chartOptions = [{ value: '', label: 'Choose chart' }, ...'ABCDEFG'.split('').map(value => ({ value, label: value }))];
    playerChart = fleetSelect(document, holder, 'Your firing chart', chartOptions, custom.playerChart ?? '');
    playerChart.closest('label').hidden = Boolean(preset);
    enemyChart = fleetSelect(document, holder, 'Enemy firing chart', chartOptions, preset?.enemyChart ?? custom.enemyChart ?? '');
    enemyChart.disabled = Boolean(preset?.enemyChart);
    let enemies;
    if (preset?.enemySectors) enemies = preset.enemySectors.map((count, index) => ({ key: String(index + 1), name: `Sector ${index + 1}`, count }));
    else if (preset?.enemyDivisions) enemies = preset.enemyDivisions.map((count, index) => ({ key: String(index + 1), name: `Division ${index + 1}`, count }));
    else enemies = preset ? [{ key: 'enemy', name: preset.name, count: preset.enemyInitial }]
      : custom.enemies ?? [{ key: 'enemy-0', name: '', type: 'enemy', count: 1, ordnance: 3, hitsPerShip: 1 }];
    enemyEditor = editor('enemy', preset?.enemySectors ? 'Remaining enemies in each sector' : 'Enemy ships', enemies,
      [{ key: 'count', label: 'Surviving ships', min: 0 }, ...(!preset ? [{ key: 'ordnance', label: 'Ordnance per ship', min: 0 }] : [])],
      !preset ? getRoster().filter(entry => entry.enemyInitial != null).map(entry => ({ name: entry.name,
        count: entry.enemyInitial, ordnance: entry.enemyOrdnance, type: 'enemy', hitsPerShip: 1 })) : []);
    enemyEditor.fixCount(Boolean(preset));
    if (preset) fields.enemyOrdnance = fleetNumber(document, holder, 'Enemy ordnance per ship', { value: preset.enemyOrdnance });
    if (preset?.enemyPoolTotal !== undefined) {
      fields.enemyPoolTotal = fleetNumber(document, holder, 'Enemy total (including reserves, before prior losses)', { value: preset.enemyPoolTotal });
      fields.priorEnemyLosses = fleetNumber(document, holder, 'Earlier enemy losses from this pool', { value: 0 });
    }
    fields.morale = fleetNumber(document, holder, 'Morale', { value: state.morale });
    fields.stealth = fleetNumber(document, holder, 'Stealth', { value: state.stealth });
    if (preset?.retreat?.forcedWhen === 'total-player-ship-losses-exceed-total-enemy-ship-losses') {
      fields.priorPlayerShipLosses = fleetNumber(document, holder, 'Earlier player ship losses (Morale comparison)', { value: 0 });
      fields.priorEnemyShipLosses = fleetNumber(document, holder, 'Earlier enemy ship losses (Morale comparison)', { value: 0 });
    }
    fields.enemyStrengthOverride = fleetNumber(document, holder, 'Enemy total firing strength override (optional)', { optional: true });
    initial = null;
    if (preset?.enemyDivisions) initial = fleetSelect(document, holder, 'Initial enemy division',
      [{ value: '', label: 'Choose division' }, ...preset.enemyDivisions.map((_, i) => ({ value: i + 1, label: `Division ${i + 1}` }))]);
    if (preset?.enemySectors && preset.initialSector !== 'all-six') initial = fleetSelect(document, holder, 'Initial enemy sector',
      [{ value: '', label: preset.initialSector === 'random-d6' ? 'Roll randomly at start' : 'Choose sector' },
        ...preset.enemySectors.map((_, i) => ({ value: i + 1, label: `Sector ${i + 1}` }))]);
    if (preset?.firingOrder === 'each-sector-in-order') {
      const allocation = document.createElement('div'); holder.appendChild(allocation);
      fleetButton(document, holder, 'Set sector deployment from current fleet', () => {
        // This is a setup action only; the enclosing panel handles validation errors.
        try {
          const current = readPlayers(), counts = enemyEditor.read(); allocation.replaceChildren();
          distribution = fleetDistribution(document, allocation, current,
            counts.filter(row => row.count).map(row => ({ value: row.key, label: row.name })));
        } catch (error) {
          allocation.textContent = error.message; distribution = null;
        }
      });
    }
  }
  function read() {
    const player = readPlayers(), enemies = enemyEditor.read().map((row, index) => ({ ...row,
      key: preset ? row.key : `enemy-${index}`, type: 'enemy', name: row.displayName || 'Enemy ships', hitsPerShip: 1, damage: 0 }));
    const setup = Object.fromEntries(Object.entries(fields).map(([key, field]) => [key, field.read()])
      .filter(([, value]) => value !== undefined));
    setup.enemyChart = enemyChart.value;
    let config;
    if (preset) {
      config = structuredClone(preset);
      if (preset.enemySectors) setup.enemySectors = enemies.map(row => row.count);
      else if (preset.enemyDivisions) setup.enemyDivisions = enemies.map(row => row.count);
      else setup.enemyInitial = enemies[0].count;
      if (initial?.value) setup[preset.enemyDivisions ? 'initialDivision' : 'initialSector'] = Number(initial.value);
      if (preset.firingOrder === 'each-sector-in-order') {
        if (!distribution) throw new RangeError('Set the sector deployment before starting.');
        Object.assign(setup, distribution.read());
      }
    } else config = { name: enemies.map(row => row.name).join(', '), enemies, playerChart: playerChart.value,
      enemyChart: enemyChart.value, retreat: { kind: 'manual-stop' } };
    return { player, config, setup, custom: { player, enemies, playerChart: playerChart.value, enemyChart: enemyChart.value } };
  }
  function lock(value) {
    playerEditor.lock(value); enemyEditor.lock(value);
    for (const input of holder.querySelectorAll('input,select,button')) input.disabled = value;
    playerEditor.fixCount(Boolean(preset)); enemyEditor.fixCount(Boolean(preset));
    if (preset) {
      enemyChart.disabled = value || Boolean(preset.enemyChart);
      for (const input of playerEditor.element.querySelectorAll('[data-stat="type"]')) input.disabled = true;
    }
  }
  return { mount, read, lock };
}
