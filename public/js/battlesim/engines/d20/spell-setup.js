// Collect prepared spells and available slots for a player's chosen class.
export function createD20SpellSetup(parent, ui) {
  const root = ui.group(parent, 'spellSetup'), slots = {}, rows = [];
  const area = ui.document.createElement('div'); root.append(area);
  const levels = Array.from({length:10}, (_, value) => [String(value), value ? ui.tr('spellLevel')+' '+value : ui.tr('cantrip')]);
  function add(spell = '', level = '0') {
    if (rows.length >= 100) throw new RangeError(ui.tr('invalid'));
    const box = ui.document.createElement('fieldset'); box.className = 'bsim-opponent-row'; area.append(box);
    const name = ui.field(box, 'spell', {value:spell}), selection = ui.field(box, 'spellLevel', {entries:levels, value:level});
    const item = {box, name, selection}; rows.push(item);
    ui.button(box, 'remove', () => { rows.splice(rows.indexOf(item), 1); box.remove(); });
  }
  ui.button(root, 'addSpell', () => add());
  const resources = ui.group(root, 'availableSlots');
  for (let level=1; level<=9; level++) slots[level] = ui.field(resources, 'slots.'+level, {type:'number', max:100, value:0});
  let previous = null;
  function fill(actor) {
    previous = actor?.spellcasting ?? null;
    for (const row of rows) row.box.remove(); rows.length = 0;
    for (const [level, spells] of Object.entries(previous?.spells ?? {})) for (const spell of spells) add(spell, level);
    for (const [level, input] of Object.entries(slots)) input.value = actor?.spellSlots?.[level] ?? previous?.slots[level] ?? 0;
  }
  function read() {
    if (!rows.length) return {spellcasting:undefined, spellSlots:undefined};
    const prepared = {}, maximum = {}, remaining = {};
    for (const row of rows) {
      const spell = row.name.value.trim(); if (!spell) throw new RangeError(ui.tr('invalid'));
      (prepared[row.selection.value] ??= []).push(spell);
    }
    for (const [level, input] of Object.entries(slots)) {
      const value = ui.number(input), max = Math.max(value, previous?.slots[level] ?? 0);
      if (max || prepared[level]) { maximum[level] = max; remaining[level] = value; }
    }
    return {spellcasting:{spells:prepared, slots:maximum}, spellSlots:remaining};
  }
  return {read, fill};
}
