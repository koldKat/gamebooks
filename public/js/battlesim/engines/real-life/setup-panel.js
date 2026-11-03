// Build and snapshot the Real Life panel's editable current values and combatant presets.
import {createOpponentEditor} from '../../opponents.js';
import {realLifeEditorRows} from './catalog.js';
import {realLifePlayer} from './core.js';

export const escapeRealLife = value => String(value).replace(/[&<>"']/g, ch => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[ch]));
const playerFields = [['strength', 'Current Strength', 7], ['sword', 'Current Swordsmanship', 7],
  ['firearm', 'Current Firearm', 7], ['horsemanship', 'Current Horsemanship', 7], ['wounds', 'Current Wounds', 4]];
const extraFields = {agility: ['agility', 'Current Agility', 7], luck: ['luck', 'Current Luck', 7], javelin: ['javelin', 'Current Javelin', 7]};
const fieldsFor = definition => definition?.combatFields?.map(key => extraFields[key] ?? playerFields.find(row => row[0] === key)) ?? playerFields;
const weapons = {sword: 'Sword', firearm: 'Pistol', strength: 'Bare hands', javelin: 'Javelin'};

export function realLifeSetupMarkup(id, entries, definition) {
  const esc = escapeRealLife;
  return `<p>Resolve an individual fight using your current values. Story choices and noncombat tests remain in the book.</p>
    <details id="${id}-setup" open><summary>Combat setup</summary>
      ${fieldsFor(definition).map(([key, label, value]) => `<label class="inv-edit-row"><span>${label}</span><input class="inv-edit-input" type="number" min="${key === 'wounds' ? 1 : 0}" max="${key === 'wounds' ? 10000 : 99}" step="1" value="${value}" id="${id}-${key}"></label>`).join('')}
      <label class="inv-edit-row"><span>Encounter</span><select class="inv-edit-input" id="${id}-encounter"><option value="custom">Custom encounter</option>${entries.map(entry => `<option value="${esc(entry.section)}">${esc(entry.section + ' · ' + entry.name)}</option>`).join('')}</select></label>
      <label class="inv-edit-row"><span>Weapon</span><select class="inv-edit-input" id="${id}-weapon"></select></label>
      <label class="bsim-checkbox" id="${id}-mounted-row"><input type="checkbox" id="${id}-mounted">Currently mounted</label>
      <label class="bsim-checkbox" id="${id}-charge-row" hidden><input type="checkbox" id="${id}-charge">Attempt the optional mounted charge</label>
      <div id="${id}-opponents"></div><div id="${id}-allies"></div>
      <label class="bsim-checkbox"><input type="checkbox" id="${id}-manualDice">Enter dice manually</label>
    </details><p id="${id}-note"></p>`;
}

export function createRealLifeSetup({document, id, t, entries, definition}) {
  const playerFields = fieldsFor(definition);
  const el = key => document.getElementById(id + '-' + key);
  const fields = [{key: 'skill', label: 'Weapon skill', max: 99}, {key: 'wounds', label: 'Current Wounds', min: 1, max: 10000},
    {key: 'damage', label: 'Wounds per hit', min: 1, max: 100}, {key: 'horsemanship', label: 'Horsemanship', max: 99},
    {key: 'mounted', label: 'Position', options: [{value: '0', label: 'On foot'}, {value: '1', label: 'Mounted'}]}];
  const editable = (actors, weapon) => realLifeEditorRows(actors, weapon).map(row => ({...row, mounted: row.mounted ? '1' : '0'}));
  const presets = entries.flatMap(entry => editable(entry.opponents, entry.weapon ?? 'sword'));
  const opponents = createOpponentEditor({document, id, t, fields, presets,
    isStatUnavailable: (key, row) => (key === 'skill' && Boolean(selected()?.enemyAttackMode === 'agility-avoidance' && row.noSkillPrinted))
      || (key === 'wounds' && Boolean(selected()?.knifePossession && row.noWoundsPrinted))});
  const allies = createOpponentEditor({document, id: id + '-ally', t, fields, presets: entries.flatMap(entry => editable(entry.allies ?? []))});
  el('opponents').append(opponents.element); el('allies').append(allies.element);
  allies.element.querySelector('summary').textContent = 'Companions fighting beside you'; allies.fixCount(true);
  function selected() {return entries.find(entry => String(entry.section) === el('encounter').value);}
  function weaponOptions(value) {
    const spec = selected(), allowed = spec?.weaponChoices ?? (spec?.weapon ? [spec.weapon] : definition?.weapons ?? ['sword', 'firearm', 'strength']);
    el('weapon').innerHTML = allowed.map(key => `<option value="${key}">${weapons[key]}</option>`).join('');
    el('weapon').value = allowed.includes(value) ? value : allowed[0];
  }
  function applyPreset(keepWeapon = false) {
    weaponOptions(keepWeapon ? el('weapon').value : undefined);
    const spec = selected(), weapon = el('weapon').value;
    opponents.set(editable(spec?.opponents ?? [{name: 'Opponent', skill: 7, wounds: 4}], weapon));
    opponents.fixCount(Boolean(spec));
    allies.set(editable(spec?.allies ?? [], weapon));
    el('mounted').checked = Boolean(spec?.mountedCombat || spec?.mountedStart); el('charge').checked = false;
    refresh(false);
  }
  function snapshot() {
    const setup = Object.fromEntries([...el('setup').querySelectorAll('input[id],select[id]')]
      .filter(input => !input.closest('.bsim-opponent-editor')).map(input => [input.id.slice(id.length + 1), input.type === 'checkbox' ? input.checked : input.value]));
    return {setup, opponentSetup: opponents.snapshot(), allySetup: selected()?.allies?.length ? allies.snapshot() : []};
  }
  function restore(state) {
    el('encounter').value = state.setup.encounter ?? 'custom'; weaponOptions(state.setup.weapon);
    for (const [key, , defaultValue] of playerFields) el(key).value = state.setup[key] ?? state.player?.[key] ?? defaultValue;
    el('manualDice').checked = state.setup.manualDice ?? false; el('mounted').checked = state.setup.mounted ?? Boolean(selected()?.mountedCombat || selected()?.mountedStart);
    el('charge').checked = state.setup.charge ?? false;
    opponents.set(state.opponentSetup.length ? state.opponentSetup : editable(selected()?.opponents ?? [{name: 'Opponent', skill: 7, wounds: 4}], el('weapon').value));
    allies.set(state.allySetup.length ? state.allySetup : editable(selected()?.allies ?? [], el('weapon').value));
    opponents.fixCount(Boolean(selected()));
  }
  const numeric = rows => rows.map(row => ({...row, mounted: row.mounted === '1'}));
  function read() {
    const spec = selected(), weapon = el('weapon').value;
    const enemies = numeric(opponents.read()).map((row, index) => ({...row, target: spec?.opponents[index]?.target ?? 'hero'}));
    return {player: realLifePlayer(Object.fromEntries(playerFields.map(([key]) => [key, el(key).value]))),
      encounter: spec ?? {name: enemies.map(enemy => enemy.displayName || 'Opponent').join(' / '), section: 'custom'},
      options: {weapon, mounted: el('mounted').checked, charge: el('charge').checked, opponents: enemies, allies: spec?.allies?.length ? numeric(allies.read()) : []}};
  }
  function refresh(active) {
    for (const input of el('setup').querySelectorAll('input,select,button')) input.disabled = active;
    opponents.lock(active); allies.lock(active);
    const spec = selected();
    for (const input of el('setup').querySelectorAll('[data-stat="horsemanship"],[data-stat="mounted"]')) input.closest('label').hidden = !(spec?.mountedCombat && !spec?.horseRule);
    el('allies').hidden = !spec?.allies?.length; el('mounted-row').hidden = !(spec?.mountedCombat || spec?.mountedStart);
    el('charge-row').hidden = !spec?.optionalCharge;
    el('note').textContent = [spec?.note, spec?.opponents.some(enemy => enemy.unprintedSkill) ? 'The book prints ? for this opponent’s skill. Enter your chosen value before starting.' : ''].filter(Boolean).join(' ');
  }
  applyPreset();
  return {selected, snapshot, restore, read, refresh, applyPreset};
}
