// Edit current combat statistics, owned equipment and optional database encounter presets.
import {createOpponentEditor} from '../../opponents.js';
import {prepareTwoFistedEncounter} from './catalog.js';
import {configureTwoFistedLoadout} from './effects.js';
import {spacePlayer} from './space.js';
import {twoFistedFields} from './panel-fields.js';

const heroKeys = ['expertise', 'energy', 'maxEnergy', 'fists', 'injuries'];
const crewKeys = ['combat', 'weapons', 'manoeuvre', 'shields', 'fists', 'injuries'];
const shipKeys = ['hull', 'maxHull', 'power', 'maxPower', 'shieldGenerators'];

export function createTwoFistedSetup({document, root, id, t, getRoster, getSupport}) {
  const ui = twoFistedFields(document, id), fields = {}, crewFields = {}, shipFields = {}, quantities = {}, equipment = {};
  const support = getSupport(); let editor, locked = false;
  const preset = ui.select(root, 'Encounter', [['custom', 'Custom encounter'], ...getRoster().map(entry => [entry.section, `${entry.label} (${entry.section})`])]);
  preset.id = id + '-encounter';
  const mode = ui.select(root, 'Combat mode', [['melee', 'Close combat'], ['ranged', 'Ranged combat'], ['space', 'Space combat']]);
  mode.id = id + '-mode';
  const hero = ui.details(root, 'Protagonist: current combat statistics'); hero.open = true;
  for (const key of heroKeys) fields[key] = ui.number(hero, key === 'maxEnergy' ? 'Maximum ENERGY' : key.toUpperCase(), support.playerDefaults[key] ?? 0, 0, key === 'fists' ? 20 : 1000000);
  fields.trueGrit = ui.check(hero, 'True Grit'); fields.rightStuffAvailable = ui.check(hero, 'Right Stuff available');
  fields.dead = ui.check(hero, 'Protagonist is dead');
  for (const [key, input] of Object.entries(fields)) input.id = id + '-' + key;
  const crew = ui.details(root, 'Co-pilot: current combat statistics');
  const copilot = ui.select(crew, 'Co-pilot', [['', 'None'], ['custom', 'Custom co-pilot'], ...support.coPilots.map(unit => [unit.id, unit.name])]);
  copilot.id = id + '-copilot';
  const realPal = ui.check(crew, 'A Real Pal (include its bonus in the entered current skills)');
  for (const key of crewKeys) crewFields[key] = ui.number(crew, key.toUpperCase(), key === 'fists' ? 1 : 0, 0, key === 'fists' ? 20 : 1000000);
  for (const key of ['dead', 'crippled', 'badgeUsed']) crewFields[key] = ui.check(crew, {dead: 'Co-pilot is dead', crippled: 'Gocky is crippled', badgeUsed: 'Deputy Badge already used on this co-pilot'}[key]);
  for (const [key, input] of Object.entries(crewFields)) input.id = id + '-copilot-' + key;
  copilot.addEventListener('change', () => {
    const source = support.coPilots.find(unit => unit.id === copilot.value);
    for (const key of crewKeys) crewFields[key].value = (source?.[key] ?? (key === 'combat' ? 6 : key === 'fists' ? 1 : 0)) + (source && realPal.checked && ['combat', 'weapons', 'manoeuvre', 'shields'].includes(key) && source[key] != null ? 1 : 0);
    for (const key of ['dead', 'crippled', 'badgeUsed']) crewFields[key].checked = false;
  });
  const ship = ui.details(root, 'Ship: current statistics and installed upgrades');
  ui.text(ship, 'Enter current HULL and POWER with installed upgrades already included.');
  const shipPreset = ui.select(ship, 'Ship record', [['custom', 'Custom ship'], ...support.shipDefaults.map(unit => [unit.id, unit.name])]);
  for (const key of shipKeys) shipFields[key] = ui.number(ship, key.toUpperCase(), key === 'hull' || key === 'maxHull' ? 6 : key === 'shieldGenerators' ? 1 : 100, 0, key === 'shieldGenerators' ? 2 : 1000000);
  for (const key of ['shieldsDown', 'shieldsDestroyed', 'backupUsed']) shipFields[key] = ui.check(ship, {shieldsDown: 'Shields recharging', shieldsDestroyed: 'Shields permanently destroyed', backupUsed: 'Reserve generator already used'}[key]);
  for (const [key, input] of Object.entries(shipFields)) input.id = id + '-ship-' + key;
  shipPreset.addEventListener('change', () => {
    const source = support.shipDefaults.find(unit => unit.id === shipPreset.value);
    if (!source) return;
    for (const key of shipKeys) shipFields[key].value = source[key] ?? source[key === 'maxHull' ? 'hull' : key === 'maxPower' ? 'power' : key] ?? 0;
    for (const key of ['shieldsDown', 'shieldsDestroyed', 'backupUsed']) shipFields[key].checked = false;
  });
  const upgrades = support.shipUpgrades.map(item => ({id: item.id, input: ui.check(ship, support.items.find(row => row.id === item.id)?.name || item.id)}));
  const inventory = ui.details(root, 'Owned combat items (local record)');
  ui.text(inventory, 'Enter the items you already have. Story inventory, travel and Stellar Days stay under your control.');
  for (const item of support.items.filter(item => item.combat || support.shipUpgrades.some(upgrade => upgrade.id === item.id))) {
    quantities[item.id] = ui.number(inventory, item.name, 0); quantities[item.id].title = item.effectText;
    quantities[item.id].id = id + '-quantity-' + item.id;
  }
  for (const who of ['hero', 'copilot']) {
    const holder = ui.details(root, (who === 'hero' ? 'Protagonist' : 'Co-pilot') + ' equipment'), controls = {};
    for (const type of ['melee', 'ranged', 'armour']) controls[type] = ui.select(holder, type === 'armour' ? 'Armour' : type === 'melee' ? 'Close weapon' : 'Ranged weapon', [['', 'None'], ...support.items.filter(item => type === 'armour' ? item.combat?.kind === 'armour' : item.combat?.kind === 'weapon' && item.combat.mode === type).map(item => [item.id, item.name])]);
    for (const type of ['melee', 'ranged', 'armour']) controls[type].id = id + '-' + who + '-' + type;
    controls.extras = support.items.filter(item => item.combat?.kind === 'extra').map(item => ({id: item.id, input: ui.check(holder, item.name)}));
    equipment[who] = controls;
  }
  const opponentsRoot = document.createElement('div'); root.append(opponentsRoot);
  const entry = () => getRoster().find(entry => entry.section === preset.value);
  function chooseEncounter() {
    const source = entry(); if (source) mode.value = source.combat.mode;
    mode.disabled = locked || Boolean(source);
    editor?.element.remove();
    const space = mode.value === 'space';
    const stats = space ? ['hull', 'manoeuvre', 'manoeuvreFists', 'weapons', 'weaponsFists', 'shields', 'shieldFists'] : ['expertise', 'fists', 'health'];
    editor = createOpponentEditor({document, id, t, fields: stats.map(key => ({key, label: key.replace('Fists', ' FISTS').toUpperCase(), min: key === 'health' || key === 'hull' ? 1 : 0, max: key.toLowerCase().includes('fists') ? 20 : 1000000})),
      isStatUnavailable: (key, row) => key === 'fists' && row.randomFists === '1d3' || key === 'shieldFists' && row.unprintedShieldFists && Number(row.shields) === 0,
      presets: getRoster().filter(entry => entry.combat.mode === mode.value).flatMap(entry => entry.combat.opponents.map(unit => ({...unit, entrySection: entry.section, displayName: `${unit.name} (${entry.section})`}))),
      onSelect(row) {preset.value = row.entrySection; chooseEncounter();}});
    editor.set(source?.combat.opponents.map(unit => ({...unit, displayName: unit.name})) ?? [space ? {displayName: '', hull: 6, manoeuvre: 3, manoeuvreFists: 1, weapons: 3, weaponsFists: 1, shields: 3, shieldFists: 1} : {displayName: '', expertise: 6, fists: 1, health: 3}]);
    editor.fixCount(Boolean(source)); editor.lock(locked); opponentsRoot.append(editor.element);
    editor.element.addEventListener('input', event => {
      if (event.target.dataset.stat !== 'shields') return;
      const rows = [...editor.element.querySelectorAll('.bsim-opponent-row')], row = event.target.closest('.bsim-opponent-row');
      const shieldFists = row.querySelector('[data-stat="shieldFists"]');
      if (!shieldFists || !source?.combat.opponents[rows.indexOf(row)]?.unprintedShieldFists) return;
      const unavailable = Number(event.target.value) === 0;
      shieldFists.dataset.unavailable = String(unavailable); shieldFists.disabled = locked || unavailable;
    });
  }
  preset.addEventListener('change', chooseEncounter); mode.addEventListener('change', chooseEncounter); chooseEncounter();
  function readPlayer(previous = {}) {
    const values = {...structuredClone(previous)};
    for (const [key, input] of Object.entries(fields)) values[key] = input.type === 'checkbox' ? input.checked : ui.numeric(input);
    const crewSource = support.coPilots.find(unit => unit.id === copilot.value);
    values.realPal = realPal.checked;
    values.copilot = copilot.value ? {...(previous.copilot?.id === copilot.value ? structuredClone(previous.copilot) : crewSource ?? {}), id: copilot.value, trait: crewSource?.trait ?? null,
      ...Object.fromEntries(Object.entries(crewFields).map(([key, input]) => [key, input.type === 'checkbox' ? input.checked : ui.numeric(input)]))} : null;
    values.ship = {...structuredClone(previous.ship ?? {}), ...Object.fromEntries(Object.entries(shipFields).map(([key, input]) => [key, input.type === 'checkbox' ? input.checked : ui.numeric(input)]))};
    values.inventory = Object.fromEntries(Object.entries(quantities).map(([key, input]) => [key, ui.numeric(input)]));
    const selections = Object.fromEntries(Object.entries(equipment).map(([who, controls]) => [who, {melee: controls.melee.value, ranged: controls.ranged.value, armour: controls.armour.value, extras: controls.extras.filter(item => item.input.checked).map(item => item.id)}]));
    selections.shipUpgrades = upgrades.filter(item => item.input.checked).map(item => item.id);
    return configureTwoFistedLoadout(spacePlayer(values), selections, support);
  }
  function readEncounter() {
    const source = entry(), opponents = editor.read().map(unit => ({...unit, name: unit.displayName || 'Opponent'}));
    return source ? prepareTwoFistedEncounter(source, opponents, support) : {mode: mode.value, section: 'custom', label: 'Custom encounter', opponents, ...(mode.value === 'space' ? {heavyHits: structuredClone(support.heavyHits)} : {})};
  }
  function fillPlayer(player) {
    if (!player) return;
    for (const [key, input] of Object.entries(fields)) {if (input.type === 'checkbox') input.checked = Boolean(player[key]); else input.value = player[key] ?? 0;}
    copilot.value = player.copilot?.id ?? (player.copilot ? 'custom' : ''); realPal.checked = Boolean(player.realPal);
    for (const [key, input] of Object.entries(crewFields)) {if (input.type === 'checkbox') input.checked = Boolean(player.copilot?.[key]); else input.value = player.copilot?.[key] ?? 0;}
    for (const [key, input] of Object.entries(shipFields)) {if (input.type === 'checkbox') input.checked = Boolean(player.ship?.[key]); else input.value = player.ship?.[key] ?? (key === 'shieldGenerators' ? 1 : key === 'hull' || key === 'maxHull' ? 6 : 100);}
    for (const [key, input] of Object.entries(quantities)) input.value = player.inventory?.[key] ?? 0;
    for (const [who, controls] of Object.entries(equipment)) {
      const actor = who === 'hero' ? player : player.copilot;
      for (const mode of ['melee', 'ranged']) controls[mode].value = actor?.loadout?.[mode]?.id ?? '';
      controls.armour.value = actor?.armour === 'nova' ? 'nova-armour' : '';
      for (const item of controls.extras) item.input.checked = (player.inventory?.[item.id] ?? 0) > 0 && Boolean(actor?.loadout?.extras?.some(extra => extra.id === item.id));
    }
    for (const item of upgrades) item.input.checked = Boolean(player.ship?.upgrades?.some(upgrade => upgrade.id === item.id));
  }
  return {readPlayer, readEncounter, fillPlayer,
    snapshot() {return {preset: preset.value, mode: mode.value, opponents: editor.snapshot()};},
    restore(saved) {preset.value = saved?.preset ?? 'custom'; if (saved?.mode) mode.value = saved.mode; chooseEncounter(); if (saved?.opponents) editor.set(saved.opponents);},
    lock(value) {locked = value; for (const input of root.querySelectorAll('input,select,button')) input.disabled = value; mode.disabled = value || Boolean(entry()); editor.lock(value);},
  };
}
