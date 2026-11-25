// Collect explicit character combat stats and optional defenses for d20 fights.
import {ABILITIES, normalizeD20Actor} from './core.js';
import {DAMAGE_TYPES} from './damage.js';
import {createD20SpellSetup, createItemSpellSetup} from './spell-setup.js';

export function createD20ActorForm(parent, ui, {name = '', title = 'player', open = true, hideBasics = false,
  itemSpells = false, showLevel = false} = {}) {
  const root = ui.group(parent, title, open), fields = {}, checks = {};
  fields.name = ui.field(root, 'name', {value:name});
  if (showLevel) fields.level = ui.field(root, 'combatLevel', {type:'number', min:1, max:100, value:1});
  for (const key of ['hp', 'maxHp', 'ac', 'bonus']) fields[key] = ui.field(root, key,
    {type:'number', min:key === 'bonus' ? -1000 : key === 'maxHp' ? 1 : 0, value:key === 'bonus' ? 0 : ''});
  fields.formula = ui.field(root, 'formula');
  fields.type = ui.field(root, 'damageType', {entries:DAMAGE_TYPES.map(type => [type, ui.tr('damage.'+type)]), value:'slashing'});
  fields.ability = ui.field(root, 'attackAbility', {entries:[['', ui.tr('manualModifier')], ...ABILITIES.map(key => [key, key.toUpperCase()])]});
  checks.magical = ui.checkbox(root, 'magical'); checks.silvered = ui.checkbox(root, 'silvered');
  const advanced = ui.group(root, 'characterDetails');
  for (const key of ABILITIES) {
    fields['ability-'+key] = ui.field(advanced, 'ability.'+key, {type:'number', min:-1000, max:1000, value:0});
    fields['save-'+key] = ui.field(advanced, 'save.'+key, {type:'number', min:-1000, max:1000, value:0});
  }
  fields.strength = ui.field(advanced, 'strengthScore', {type:'number', min:1, max:1000, optional:true});
  const skills = ['athletics', 'acrobatics', 'perception', 'survival'];
  for (const skill of skills) fields[skill] = ui.field(advanced, skill, {type:'number', min:-1000, max:1000, optional:true});
  for (const key of ['immunities','resistances','vulnerabilities','conditionImmunities']) fields[key] = ui.field(advanced, key, {optional:true});
  checks.elf = ui.checkbox(advanced, 'elf'); checks.undead = ui.checkbox(advanced, 'undead');
  checks.aquatic = ui.checkbox(advanced, 'aquatic');
  checks.magicResistance = ui.checkbox(advanced, 'magicResistance');
  checks.nonmagicalPhysicalResistance = ui.checkbox(advanced, 'physicalResistance');
  const spells = itemSpells ? createItemSpellSetup(advanced, ui) : createD20SpellSetup(advanced, ui);
  if (hideBasics) for (const key of ['name','hp','maxHp','ac','bonus']) fields[key].closest('label').hidden = true;
  let original = null;
  const csv = value => value.split(',').map(part => part.trim().toLowerCase()).filter(Boolean);
  function read(overrides = {}, {preserveAttacks = false} = {}) {
    const abilities = {}, saves = {};
    for (const key of ABILITIES) { abilities[key] = ui.number(fields['ability-'+key]); saves[key] = ui.number(fields['save-'+key]); }
    const strength = ui.number(fields.strength, true), skillBonuses = {};
    for (const skill of skills) {
      const bonus = ui.number(fields[skill], true);
      if (bonus != null) skillBonuses[skill] = bonus;
    }
    const ability = fields.ability.value || undefined;
    const hp = overrides.hp ?? ui.number(fields.hp), maxHp = overrides.maxHp ?? ui.number(fields.maxHp);
    const attack = {name:ui.tr('attack'), bonus:overrides.bonus ?? ui.number(fields.bonus), magical:checks.magical.checked, silvered:checks.silvered.checked,
      ...(ability ? {ability} : {}), damage:[{formula:fields.formula.value.trim(), type:fields.type.value, ...(ability ? {ability} : {})}]};
    const {attacks, defenses, tags} = original ?? {};
    return normalizeD20Actor({...original, ...spells.read(), name:overrides.name ?? fields.name.value, hp, maxHp,
      level:fields.level ? ui.number(fields.level) : original?.level,
      dead:hp > 0 ? false : original?.dead ?? false,
      baseMaxHp:Math.max(maxHp, original?.baseMaxHp ?? 0), ac:overrides.ac ?? ui.number(fields.ac), abilities, saves,
      attacks:preserveAttacks && attacks ? attacks : [attack],
      abilityScores:strength == null ? {} : {str:strength}, skillBonuses,
      tags:[...(tags ?? []).filter(tag => !['elf','undead','aquatic'].includes(tag)), ...(checks.elf.checked ? ['elf'] : []),
        ...(checks.undead.checked ? ['undead'] : []), ...(checks.aquatic.checked ? ['aquatic'] : [])],
      defenses:{...defenses, immunities:csv(fields.immunities.value), resistances:csv(fields.resistances.value), vulnerabilities:csv(fields.vulnerabilities.value),
        nonmagicalPhysicalResistance:checks.nonmagicalPhysicalResistance.checked}, conditionImmunities:csv(fields.conditionImmunities.value),
      magicResistance:checks.magicResistance.checked});
  }
  function fill(actor) {
    original = actor ? structuredClone(actor) : null;
    spells.fill(actor);
    if (fields.level) fields.level.value = actor?.level ?? 1;
    for (const key of ['hp', 'maxHp', 'ac']) fields[key].value = actor?.[key] ?? '';
    fields.name.value = actor?.name ?? name; const attack = actor?.attacks?.[0];
    fields.bonus.value = attack?.bonus ?? 0; fields.formula.value = attack?.damage?.[0]?.formula ?? '';
    fields.type.value = attack?.damage?.[0]?.type ?? 'slashing'; fields.ability.value = attack?.ability ?? '';
    for (const key of ABILITIES) { fields['ability-'+key].value = actor?.abilities?.[key] ?? 0; fields['save-'+key].value = actor?.saves?.[key] ?? 0; }
    fields.strength.value = actor?.abilityScores?.str || '';
    for (const skill of skills) fields[skill].value = actor?.skillBonuses?.[skill] ?? '';
    for (const key of ['immunities','resistances','vulnerabilities']) fields[key].value = (actor?.defenses?.[key] ?? []).join(', ');
    fields.conditionImmunities.value = (actor?.conditionImmunities ?? []).join(', ');
    checks.magical.checked = attack?.magical ?? false; checks.silvered.checked = attack?.silvered ?? false;
    checks.elf.checked = actor?.tags?.includes('elf') ?? false; checks.undead.checked = actor?.tags?.includes('undead') ?? false;
    checks.aquatic.checked = actor?.tags?.includes('aquatic') ?? false;
    checks.magicResistance.checked = actor?.magicResistance ?? false;
    checks.nonmagicalPhysicalResistance.checked = actor?.defenses?.nonmagicalPhysicalResistance ?? false;
  }
  function showAttackFields(visible) {
    for (const key of ['bonus','formula','type','ability']) fields[key].closest('label').hidden = !visible;
    for (const key of ['magical','silvered']) checks[key].closest('label').hidden = !visible;
  }
  return {root, read, fill, showAttackFields, lock(value) { root.querySelectorAll('input,select,button').forEach(input => { input.disabled = value; }); }};
}
