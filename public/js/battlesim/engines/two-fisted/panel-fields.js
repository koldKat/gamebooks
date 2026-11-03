// Build compact themed form controls for the Two-Fisted simulator panel.
export function twoFistedFields(document, id, fieldPrefix = id) {
  let serial = 0;
  function field(parent, label, input) {
    const row = document.createElement('label'), span = document.createElement('span');
    row.className = 'inv-edit-row'; span.textContent = label; input.className = 'inv-edit-input';
    input.id = `${fieldPrefix}-field-${serial++}`; row.append(span, input); parent.append(row); return input;
  }
  function number(parent, label, value = 0, min = 0, max = 1000000) {
    const input = document.createElement('input'); input.type = 'number'; input.min = min; input.max = max;
    input.step = 1; input.value = value; return field(parent, label, input);
  }
  function select(parent, label, options) {
    const input = document.createElement('select');
    for (const [value, title] of options) {
      const option = document.createElement('option'); option.value = value; option.textContent = title; input.append(option);
    }
    return field(parent, label, input);
  }
  function check(parent, label, value = false) {
    const row = document.createElement('label'), input = document.createElement('input'), span = document.createElement('span');
    row.className = 'bsim-checkbox'; input.type = 'checkbox'; input.checked = value;
    span.textContent = label; row.append(input, span); parent.append(row); return input;
  }
  function button(parent, label, action, key) {
    const input = document.createElement('button'); input.type = 'button'; input.className = 'bsim-action-btn'; input.textContent = label;
    if (key) input.id = id + '-' + key; input.addEventListener('click', action); parent.append(input); return input;
  }
  function details(parent, label) {
    const node = document.createElement('details'), summary = document.createElement('summary');
    summary.textContent = label; node.append(summary); parent.append(node); return node;
  }
  function text(parent, value) {const node = document.createElement('p'); node.textContent = value; parent.append(node); return node;}
  function numeric(input) {
    const value = Number(input.value);
    if (!input.value.trim() || !Number.isSafeInteger(value) || value < Number(input.min) || value > Number(input.max)) throw new RangeError('Check ' + input.closest('label').textContent);
    return value;
  }
  return {field, number, select, check, button, details, text, numeric};
}
