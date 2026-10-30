// Build shared themed controls for personnel combat setup and pending dice.
export function personnelField(document, holder, label, input) {
  const row = document.createElement('label'); row.className = 'inv-edit-row';
  const text = document.createElement('span'); text.textContent = label;
  input.className = 'inv-edit-input'; row.append(text, input); holder.appendChild(row);
  return input;
}
export function personnelSelect(document, holder, label, options, value = '') {
  const input = document.createElement('select');
  for (const item of options) {
    const option = document.createElement('option');
    option.value = item.value ?? item; option.textContent = item.label ?? item; input.appendChild(option);
  }
  input.value = String(value);
  return personnelField(document, holder, label, input);
}
export function personnelCheckbox(document, holder, label, checked = false) {
  const row = document.createElement('label'); row.className = 'bsim-checkbox';
  const input = document.createElement('input'); input.type = 'checkbox'; input.checked = checked;
  const text = document.createElement('span'); text.textContent = label;
  row.append(input, text); holder.appendChild(row); return input;
}
export function personnelButton(document, holder, label, action) {
  const button = document.createElement('button'); button.type = 'button';
  button.className = 'bsim-action-btn'; button.textContent = label;
  button.addEventListener('click', action); holder.appendChild(button); return button;
}
export const personnelChartOptions = [{value:'',label:'Choose chart'}, ...'ABCDEFG'];
