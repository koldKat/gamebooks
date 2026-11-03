// Build current Sagard combat values and shared editable opponent controls.
import {createOpponentEditor} from '../../opponents.js';
import {sagardEditorRows} from './catalog.js';
import {sagardExtraSetupMarkup, createSagardExtraSetup} from './extra-setup.js';
import {maxSagardLevel} from './core.js';

export const escapeSagard = value => String(value).replace(/[&<>"']/g, ch => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[ch]));

export function sagardSetupMarkup(id, entries) {
  const esc = escapeSagard, rules = entries[0].rules;
  return `<p>Resolve one fight using your current level, hit points and equipment. Story choices, experience marks and trophies remain in the reader.</p>
    <details id="${id}-setup" open><summary>Combat setup</summary>
    <div id="${id}-hero-fields"><label class="inv-edit-row"><span>Current hit points</span><input class="inv-edit-input" id="${id}-hp" type="number" min="1" max="${rules.maxHeroHp}" step="1" value="${rules.maxHeroHp}"></label>
    <label class="inv-edit-row"><span>Current level</span><input class="inv-edit-input" id="${id}-level" type="number" min="0" max="${maxSagardLevel(rules)}" step="1" value="${rules.initialHeroLevel ?? 2}"></label>
    ${rules.weaponOptions ? `<label class="inv-edit-row"><span>Held weapon</span><select class="inv-edit-input" id="${id}-weapon">${rules.weaponOptions.map(row => `<option value="${esc(row.id)}">${esc(row.label)}</option>`).join('')}</select></label>` : `<label class="bsim-checkbox"><input type="checkbox" id="${id}-weapon">Weapon adds 1 damage to every attack</label>`}
    ${rules.maxArmorReduction ? `<label class="inv-edit-row"><span>Armor reduction per hit</span><input class="inv-edit-input" id="${id}-armor" type="number" min="0" max="${rules.maxArmorReduction}" step="1" value="0"></label>` : `<label class="bsim-checkbox"><input type="checkbox" id="${id}-armor">Armor absorbs 1 damage per hit</label>`}
    <label class="inv-edit-row"><span>${esc(rules.shieldLabel ?? 'Shield points remaining')}</span><input class="inv-edit-input" id="${id}-shield" type="number" min="0" max="${rules.maxShield}" step="1" value="0"></label>
    ${['fang', 'moss', ...(rules.spiritLuckEnabled ? ['spiritLuck'] : [])].map(item => `<label class="bsim-checkbox"><input type="checkbox" id="${id}-${item}">${esc(rules.healingLabels[item])} available</label>`).join('')}
    ${(rules.projectiles ?? []).map(item => `<label class="inv-edit-row"><span>${esc(item.label)}s remaining</span><input class="inv-edit-input" id="${id}-ammo-${esc(item.id)}" type="number" min="0" max="${item.maxHeld}" step="1" value="0"></label>`).join('')}
    ${rules.magicDagger ? `<label class="inv-edit-row"><span>Magic dagger power remaining</span><input class="inv-edit-input" id="${id}-magicDaggerPower" type="number" min="0" max="${rules.magicDagger.maximumPower}" step="1" value="0"></label>` : ''}
    ${rules.salt ? `<label class="inv-edit-row"><span>Salt bags held</span><input class="inv-edit-input" id="${id}-saltBags" type="number" min="0" max="${rules.salt.maxHeld}" step="1" value="0"></label><label class="bsim-checkbox"><input type="checkbox" id="${id}-useSalt">Use held salt before zombie combat</label>` : ''}
    ${rules.monkeyWhistle ? `<label class="bsim-checkbox"><input type="checkbox" id="${id}-monkeyWhistle">Unused monkey whistle held</label>` : ''}
    ${rules.tehniteWeapons ? `<label class="bsim-checkbox"><input type="checkbox" id="${id}-tehniteWeapons">Crew holds Tehnite weapons</label>` : ''}
    ${rules.projectiles ? `<label class="bsim-checkbox"><input type="checkbox" id="${id}-dahliaOil">Arrows dipped in Dahlia Oil</label>` : ''}
    ${rules.stunStoneEnabled ? `<label class="bsim-checkbox"><input type="checkbox" id="${id}-stunStone">Stun stone available</label>` : ''}</div>
    <label class="inv-edit-row"><span>Encounter</span><select class="inv-edit-input" id="${id}-encounter"><option value="custom">Custom encounter</option>${entries.map(entry => `<option value="${esc(entry.section)}">${esc(entry.section + ' · ' + entry.name)}</option>`).join('')}</select></label>
    <label class="inv-edit-row" id="${id}-opening-row" hidden><span>Printed approach</span><select class="inv-edit-input" id="${id}-opening"></select></label>
    ${sagardExtraSetupMarkup(id, rules)}
    <label class="bsim-checkbox" id="${id}-opponent-first-row"><input type="checkbox" id="${id}-opponentFirst">Opponent attacks first</label>
    <div id="${id}-opponents"></div><div id="${id}-allies"></div>
    <label class="bsim-checkbox"><input type="checkbox" id="${id}-manualDice">Enter dice manually</label></details><p id="${id}-note"></p>`;
}

export function createSagardSetup({document, id, t, entries}) {
  const rules = entries[0].rules;
  const el = key => document.getElementById(id + '-' + key);
  const selected = () => entries.find(entry => String(entry.section) === el('encounter').value);
  const extra = createSagardExtraSetup(el, rules, selected);
  let stoneBroken = false;
  const fields = [{key: 'level', label: 'Level', min: 0, max: maxSagardLevel(rules)}, {key: 'hp', label: 'Hit points', min: 1, max: 1000000}];
  const isStatUnavailable = (key, row) => (row.immortal && key === 'hp')
    || ((selected()?.mode === 'manual' || selected()?.naval || selected()?.beast || selected()?.unknownOpponentLevel
      || selected()?.enemyAttack?.kind === 'jab' || selected()?.strategy) && row[key] == null);
  const opponents = createOpponentEditor({document, id, t, fields, presets: entries.filter(e => !e.naval && !e.beast && !e.forces).flatMap(e => sagardEditorRows(e.opponents)), isStatUnavailable});
  const allies = createOpponentEditor({document, id: id + '-ally', t, fields, presets: entries.flatMap(e => sagardEditorRows(e.allies ?? [])),
    isStatUnavailable: (key, row) => Boolean(selected()?.strategy && row[key] == null)});
  el('opponents').append(opponents.element); el('allies').append(allies.element);
  allies.element.querySelector('summary').textContent = 'Companions'; allies.fixCount(true);
  const checks = [...(rules.weaponOptions ? [] : ['weapon']), ...(rules.maxArmorReduction ? [] : ['armor']), 'fang', 'moss', 'manualDice', 'opponentFirst',
    ...(rules.stunStoneEnabled ? ['stunStone'] : []),
    ...(rules.salt ? ['useSalt'] : []), ...(rules.monkeyWhistle ? ['monkeyWhistle'] : []),
    ...(rules.tehniteWeapons ? ['tehniteWeapons'] : []),
    ...(rules.spiritLuckEnabled ? ['spiritLuck'] : []), ...(rules.projectiles ? ['dahliaOil'] : [])];
  function openings(value = '') {
    el('opening').innerHTML = '<option value="">Choose the section you came from</option>'
      + (selected()?.openings ?? []).map(row => `<option value="${escapeSagard(row.id)}">${escapeSagard(row.label)}</option>`).join('');
    el('opening').value = value;
  }
  function applyPreset() {
    const spec = selected();
    opponents.set(sagardEditorRows(spec?.forces ? spec.opponents.slice(0, 1) : spec?.opponents?.filter(row => row.canBeTargeted !== false) ?? [{name: 'Opponent', level: 1, hp: 10}]));
    opponents.fixCount(Boolean(spec)); allies.set(sagardEditorRows(spec?.allies ?? []));
    el('opponentFirst').checked = false;
    if (spec && Object.hasOwn(spec, 'defaultWeapon')) el('weapon').checked = Boolean(spec.defaultWeapon);
    if (spec && Object.hasOwn(spec, 'defaultArmor')) el('armor').checked = Boolean(spec.defaultArmor);
    extra.restore({shipHp: el('shipHp')?.value}); openings(); refresh(false);
  }
  function snapshot() {
    return {setup: {encounter: el('encounter').value, hp: el('hp').value, level: el('level').value,
      shield: el('shield').value, opening: el('opening').value,
      ...extra.snapshot(), ...(rules.weaponOptions ? {weapon: el('weapon').value} : {}),
      ...(rules.magicDagger ? {magicDaggerPower: el('magicDaggerPower').value} : {}),
      ...(rules.salt ? {saltBags: el('saltBags').value} : {}),
      ...(rules.stunStoneEnabled ? {stunStoneBroken: stoneBroken} : {}),
      ...(rules.maxArmorReduction ? {armor: el('armor').value} : {}),
      ...(rules.projectiles ? {ammo: Object.fromEntries(rules.projectiles.map(item => [item.id, el('ammo-' + item.id).value]))} : {}),
      ...Object.fromEntries(checks.map(key => [key, el(key).checked]))},
    opponentSetup: opponents.snapshot(), allySetup: selected()?.allies?.length ? allies.snapshot() : []};
  }
  function restore(state) {
    el('encounter').value = state.setup.encounter ?? 'custom';
    el('hp').value = state.setup.hp ?? rules.maxHeroHp; el('level').value = state.setup.level ?? rules.initialHeroLevel ?? 2;
    el('shield').value = state.setup.shield ?? 0;
    for (const key of checks) el(key).checked = Boolean(state.setup[key]);
    if (rules.weaponOptions) el('weapon').value = state.setup.weapon ?? rules.weaponOptions[0].id;
    if (rules.maxArmorReduction) el('armor').value = state.setup.armor ?? 0;
    if (rules.magicDagger) el('magicDaggerPower').value = state.setup.magicDaggerPower ?? 0;
    if (rules.salt) el('saltBags').value = state.setup.saltBags ?? 0;
    stoneBroken = Boolean(state.setup.stunStoneBroken);
    extra.restore(state.setup);
    for (const item of rules.projectiles ?? []) el('ammo-' + item.id).value = state.setup.ammo?.[item.id] ?? 0;
    openings(state.setup.opening);
    opponents.set(state.opponentSetup.length ? state.opponentSetup : sagardEditorRows(selected()?.forces
      ? selected().opponents.slice(0, 1) : selected()?.opponents?.filter(row => row.canBeTargeted !== false) ?? [{name: 'Opponent', level: 1, hp: 10}]));
    allies.set(state.allySetup.length ? state.allySetup : sagardEditorRows(selected()?.allies ?? [])); opponents.fixCount(Boolean(selected()));
  }
  function edited(rows) {
    return rows.map(row => {
      const copy = {...row};
      if (row.chartLevel != null && Number(row.level) !== Number(row.chartLevel)) {delete copy.chart; delete copy.hpBands;}
      return copy;
    });
  }
  function read() {
    const spec = selected();
    if (spec?.mode === 'manual') throw new RangeError(spec.manualReason);
    const enemyRows = edited(opponents.read());
    let encounter = spec ?? {name: enemyRows.map(row => row.displayName || 'Opponent').join(' / '), section: 'custom',
      initiative: el('opponentFirst').checked ? 'enemy' : 'hero', escape: 'even', enemyMode: 'all'};
    if (spec?.openings) {
      const opening = spec.openings.find(row => row.id === el('opening').value);
      if (!opening) throw new RangeError('Choose the printed approach before starting this encounter');
      encounter = {...spec, ...opening, name: spec.name, section: spec.section};
    }
    const weapon = rules.weaponOptions?.find(row => row.id === el('weapon').value);
    if (rules.maxArmorReduction && (!Number.isInteger(Number(el('armor').value))
        || Number(el('armor').value) < 0 || Number(el('armor').value) > rules.maxArmorReduction)) {
      throw new RangeError('Enter a valid armor reduction');
    }
    return {hero: {level: el('level').value, hp: el('hp').value, shield: el('shield').value,
      damageBonus: weapon?.damageBonus ?? (el('weapon').checked ? 1 : 0),
      ...(weapon?.damageOverrides ? {damageOverrides: weapon.damageOverrides} : {}),
      ...(weapon?.bonusOnHitOnly != null ? {bonusOnHitOnly: weapon.bonusOnHitOnly} : {}),
      damageReduction: rules.maxArmorReduction ? Number(el('armor').value) : el('armor').checked ? 1 : 0},
    encounter, rules: entries[0].rules,
    options: {opponents: enemyRows, allies: spec?.allies?.length && !spec.beast ? edited(allies.read()) : [], fang: el('fang').checked, moss: el('moss').checked,
      ...extra.options(), ...(rules.stunStoneEnabled ? {stunStone: el('stunStone').checked && !stoneBroken, stunStoneBroken: stoneBroken} : {}),
      ...(rules.spiritLuckEnabled ? {spiritLuck: el('spiritLuck').checked} : {}),
      ...(rules.magicDagger ? {magicDaggerPower: el('magicDaggerPower').value} : {}),
      ...(rules.salt ? {saltBags: el('saltBags').value, useSalt: el('useSalt').checked} : {}),
      ...(rules.monkeyWhistle ? {monkeyWhistle: el('monkeyWhistle').checked} : {}),
      ...(rules.tehniteWeapons ? {tehniteWeapons: el('tehniteWeapons').checked} : {}),
      ...(rules.projectiles ? {ammo: Object.fromEntries(rules.projectiles.map(item => [item.id, el('ammo-' + item.id).value])), dahliaOil: el('dahliaOil').checked} : {})}};
  }
  function refresh(active) {
    el('hp').max = selected()?.maxHeroHp ?? rules.maxHeroHp;
    for (const input of el('setup').querySelectorAll('input,select,button')) input.disabled = active;
    if (rules.stunStoneEnabled) el('stunStone').disabled = active || stoneBroken;
    opponents.lock(active); allies.lock(active);
    extra.refresh(); el('hero-fields').hidden = Boolean(selected()?.naval);
    el('allies').hidden = !selected()?.allies?.length || Boolean(selected()?.beast);
    el('opponent-first-row').hidden = Boolean(selected()); el('opening-row').hidden = !selected()?.openings;
    el('note').textContent = selected()?.note ?? 'Choose an opponent or enter custom combat values.';
  }
  applyPreset();
  return {selected, applyPreset, snapshot, restore, read, refresh,
    syncFight(fight) {if (fight?.stunStone) stoneBroken = fight.stunStone.broken;}};
}
