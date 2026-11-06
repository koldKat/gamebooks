// Build compact simulator fields using the shared application form styles.
export function createD20Forms(document, id, tr) {
  let serial = 0;
  const text = (parent, value, tag = 'p') => { const node = document.createElement(tag); node.textContent = value; parent.append(node); return node; };
  const group = (parent, key, open = false) => {
    const node = document.createElement('details'); node.open = open; text(node, tr(key), 'summary'); parent.append(node); return node;
  };
  function field(parent, key, {type = 'text', value = '', min = 0, max = 1000000, entries, optional = false} = {}) {
    const label = document.createElement('label'); label.className = 'inv-edit-row'; text(label, tr(key), 'span');
    const input = document.createElement(entries ? 'select' : 'input'); input.className = 'inv-edit-input';
    input.id = id+'-'+key+'-'+serial++; input.autocomplete = 'off'; input.dataset.field = key;
    if (entries) for (const [value, caption] of entries) { const option = document.createElement('option'); option.value = value; option.textContent = caption; input.append(option); }
    else { input.type = type; if (type === 'number') { input.min = min; input.max = max; input.step = '1'; } }
    input.value = value; input.required = !optional; label.append(input); parent.append(label); return input;
  }
  function checkbox(parent, key, checked = false) {
    const label = document.createElement('label'); label.className = 'inv-edit-row';
    const input = document.createElement('input'); input.type = 'checkbox'; input.checked = checked; input.dataset.field = key;
    label.append(input); text(label, tr(key), 'span'); parent.append(label); return input;
  }
  function button(parent, key, action) {
    const node = document.createElement('button'); node.type = 'button'; node.className = 'bsim-action-btn';
    node.dataset.action = key; node.textContent = tr(key); node.addEventListener('click', action); parent.append(node); return node;
  }
  function number(input, optional = false) {
    if (optional && !input.value.trim()) return undefined;
    const value = Number(input.value);
    if (!input.value.trim() || !Number.isSafeInteger(value) || value < Number(input.min) || value > Number(input.max)) throw new RangeError(tr('invalid'));
    return value;
  }
  return {document, tr, text, group, field, checkbox, button, number};
}
