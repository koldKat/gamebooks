// Build the current Firearm input and shared editable opponent/companion controls.
import {createOpponentEditor} from '../../opponents.js';
import {firearmEditorRows} from './catalog.js';

export const escapeFirearm = value => String(value).replace(/[&<>"']/g, ch => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[ch]));

export function firearmSetupMarkup(id, entries, definition = {}) {
  const esc = escapeFirearm;
  return `<p>${definition.combatSkill ? 'Resolve one encounter with your current Firearm or Combat skill and its printed rules.' : 'Resolve one fight using your current Firearm skill. A successful hit kills.'} Story choices and other skill tests remain in the book.</p>
    <details id="${id}-setup" open><summary>Combat setup</summary>
    <label class="inv-edit-row"><span>Current Firearm</span><input class="inv-edit-input" id="${id}-firearm" type="number" min="0" max="12" step="1" value="7"></label>
    ${definition.combatSkill ? `<label class="inv-edit-row"><span>Current Combat</span><input class="inv-edit-input" id="${id}-combat" type="number" min="0" max="12" step="1" value="7"></label><label class="inv-edit-row" id="${id}-skill-type-row"><span>Custom fight skill</span><select class="inv-edit-input" id="${id}-skillType"><option>Firearm</option><option>Combat</option></select></label>` : ''}
    <label class="inv-edit-row"><span>Encounter</span><select class="inv-edit-input" id="${id}-encounter"><option value="custom">Custom encounter</option>${entries.map(entry => `<option value="${esc(entry.section)}">${esc(entry.section + ' · ' + entry.name)}</option>`).join('')}</select></label>
    <label class="bsim-checkbox" id="${id}-opponent-first-row"><input type="checkbox" id="${id}-opponentFirst">Opponent fires first</label>
    <div id="${id}-opponents"></div><div id="${id}-allies"></div>
    ${definition.combatSkill ? `<label class="bsim-checkbox" id="${id}-opening-wound-row" hidden><input type="checkbox" id="${id}-openingWound">Opening shot hit you after the printed Luck test</label>` : ''}
    <label class="bsim-checkbox"><input type="checkbox" id="${id}-manualDice">Enter dice manually</label></details>
    <p id="${id}-note"></p>`;
}

export function createFirearmSetup({document, id, t, entries, definition = {}}) {
  const el = key => document.getElementById(id + '-' + key), fields = [{key: 'skill', label: definition.combatSkill ? 'Skill' : 'Firearm skill', max: 12}];
  const opponents = createOpponentEditor({document, id, t, fields, presets: entries.flatMap(e => firearmEditorRows(e.opponents))});
  const allies = createOpponentEditor({document, id: id + '-ally', t, fields, presets: entries.flatMap(e => firearmEditorRows(e.allies ?? []))});
  el('opponents').append(opponents.element); el('allies').append(allies.element);
  allies.element.querySelector('summary').textContent = 'Companions'; allies.fixCount(true);
  const selected = () => entries.find(entry => String(entry.section) === el('encounter').value);
  function applyPreset() {
    const spec = selected();
    opponents.set(firearmEditorRows(spec?.opponents ?? [{name: 'Opponent', skill: 7}])); opponents.fixCount(Boolean(spec));
    allies.set(firearmEditorRows(spec?.allies ?? [])); el('opponentFirst').checked = false;
    if (el('openingWound')) el('openingWound').checked = false;
    refresh(false);
  }
  function snapshot() {
    const setup = {firearm: el('firearm').value, encounter: el('encounter').value,
      manualDice: el('manualDice').checked, opponentFirst: el('opponentFirst').checked};
    if (el('combat')) Object.assign(setup, {combat: el('combat').value,
      skillType: el('skillType').value, openingWound: el('openingWound').checked});
    return {setup, opponentSetup: opponents.snapshot(), allySetup: selected()?.allies?.length ? allies.snapshot() : []};
  }
  function restore(state) {
    el('encounter').value = state.setup.encounter ?? 'custom'; el('firearm').value = state.setup.firearm ?? 7;
    el('manualDice').checked = state.setup.manualDice ?? false; el('opponentFirst').checked = state.setup.opponentFirst ?? false;
    if (el('combat')) {
      el('combat').value = state.setup.combat ?? 7; el('skillType').value = state.setup.skillType ?? 'Firearm';
      el('openingWound').checked = state.setup.openingWound ?? false;
    }
    opponents.set(state.opponentSetup.length ? state.opponentSetup : firearmEditorRows(selected()?.opponents ?? [{name: 'Opponent', skill: 7}]));
    allies.set(state.allySetup.length ? state.allySetup : firearmEditorRows(selected()?.allies ?? [])); opponents.fixCount(Boolean(selected()));
  }
  function read() {
    const spec = selected(), enemies = opponents.read();
    const skillType = spec?.heroSkill ?? el('skillType')?.value ?? 'Firearm';
    return {skill: el(skillType === 'Combat' ? 'combat' : 'firearm').value, encounter: spec ?? {name: enemies.map(row => row.displayName || 'Opponent').join(' / '),
      section: 'custom', mode: 'alternating', heroSkill: skillType, opponentFirst: el('opponentFirst').checked},
    options: {opponents: enemies.map((row, i) => ({...spec?.opponents[i], ...row})),
      allies: spec?.allies?.length ? allies.read().map((row, i) => ({...spec.allies[i], ...row})) : [],
      initialHeroHits: spec?.openingWoundChoice && el('openingWound')?.checked ? 1 : 0}};
  }
  function refresh(active) {
    for (const input of el('setup').querySelectorAll('input,select,button')) input.disabled = active;
    opponents.lock(active); allies.lock(active);
    el('allies').hidden = !selected()?.allies?.length; el('opponent-first-row').hidden = Boolean(selected());
    if (el('opening-wound-row')) el('opening-wound-row').hidden = !selected()?.openingWoundChoice;
    if (el('skill-type-row')) el('skill-type-row').hidden = Boolean(selected());
    el('note').textContent = selected()?.note ?? '';
  }
  applyPreset();
  return {selected, applyPreset, snapshot, restore, read, refresh};
}
