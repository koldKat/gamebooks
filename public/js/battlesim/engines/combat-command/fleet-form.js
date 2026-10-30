// Build compact shared fleet inputs and read explicit numeric choices.
export const escapeFleet = value => String(value ?? '').replace(/[&<>"']/g, character =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));

export function fleetNumber(document, holder, label, { value = '', min = 0, max = 1000000, optional = false } = {}) {
  const row = document.createElement('label'); row.className = 'inv-edit-row';
  const title = document.createElement('span'); title.textContent = label;
  const input = document.createElement('input'); input.className = 'inv-edit-input'; input.type = 'number';
  input.min = min; input.max = max; input.step = '1'; input.value = value ?? ''; input.required = !optional;
  row.append(title, input); holder.appendChild(row);
  return { element: input, read() {
    if (optional && input.value.trim() === '') return undefined;
    const number = Number(input.value);
    if (input.value.trim() === '' || !Number.isSafeInteger(number) || number < min || number > max) {
      throw new RangeError(`${label}: enter a whole number from ${min} to ${max}.`);
    }
    return number;
  } };
}

export function fleetSelect(document, holder, label, options, value = '') {
  const row = document.createElement('label'); row.className = 'inv-edit-row';
  const title = document.createElement('span'); title.textContent = label;
  const select = document.createElement('select'); select.className = 'inv-edit-input';
  for (const option of options) {
    const item = document.createElement('option'); item.value = String(option.value); item.textContent = option.label;
    select.appendChild(item);
  }
  select.value = String(value); row.append(title, select); holder.appendChild(row); return select;
}

export function fleetButton(document, holder, label, action) {
  const button = document.createElement('button'); button.type = 'button'; button.className = 'bsim-action-btn';
  button.textContent = label; button.addEventListener('click', action); holder.appendChild(button); return button;
}

export function fleetCheck(document, holder, label) {
  const row = document.createElement('label'); row.className = 'bsim-checkbox';
  const input = document.createElement('input'); input.type = 'checkbox';
  row.append(input, document.createTextNode(label)); holder.appendChild(row); return input;
}

// Every allocation is explicit; empty fields mean zero, never an automatic priority.
export function fleetDistribution(document, holder, force, destinations) {
  const heading = document.createElement('p'); heading.textContent = 'Allocate every surviving ship once. Damaged ships keep their damage.';
  holder.appendChild(heading);
  const amounts = [], wounded = [];
  for (const unit of force.filter(unit => unit.count)) {
    const group = document.createElement('fieldset'); const legend = document.createElement('legend');
    legend.textContent = `${unit.name}: ${unit.count}${unit.damage ? `, one ship with ${unit.damage} damage` : ''}`;
    group.appendChild(legend); holder.appendChild(group);
    for (const destination of destinations) amounts.push({ id: destination.value, key: unit.key,
      field: fleetNumber(document, group, destination.label, { value: 0, max: unit.count }) });
    if (unit.damage) wounded.push({ key: unit.key, field: fleetSelect(document, group, 'Damaged ship goes to',
      [{ value: '', label: 'Choose a sector' }, ...destinations]) });
  }
  return { read() {
    const allocation = {};
    for (const { id, key, field } of amounts) {
      const count = field.read();
      if (count) (allocation[id] ??= {})[key] = count;
    }
    return { allocation, woundedDestination: Object.fromEntries(wounded.map(row => [row.key, row.field.value])) };
  } };
}
