// Present per-encounter weapon choices and reader decisions for blank chart cells.
import { resolveCombatCommandChartResult } from './core.js';

export function createCombatCommandOptionsPanel({ document, holder, id, dispatch }) {
  let shown, firearms;
  function render(fight) {
    if (shown === fight) return;
    shown = fight;
    firearms = undefined;
    holder.replaceChildren();
    if (!fight) return;
    if (fight.config.firearms) {
      const label = document.createElement('label'); label.className = 'bsim-checkbox';
      firearms = document.createElement('input'); firearms.type = 'checkbox';
      firearms.id = id + '-firearms'; firearms.checked = Boolean(fight.firearmsUsed);
      firearms.disabled = fight.status !== 'fighting' || Boolean(fight.firearmsUsed);
      const text = document.createElement('span');
      text.textContent = fight.firearmsUsed ? 'Guns are in use for this encounter.' : 'Use guns at the start of the next round';
      label.append(firearms, text); holder.appendChild(label);
      if (fight.firearmsUsed) {
        const note = document.createElement('p');
        note.textContent = fight.config.firearms.note || 'Record the printed consequence on your sheet.';
        holder.appendChild(note);
      }
    }
    if (fight.status !== 'awaiting-chart-value') return;
    const pending = fight.pendingChartResult, attack = fight.history.at(-1)?.attacks[pending.attackIndex];
    const note = document.createElement('p');
    note.textContent = `The printed Chart ${attack.chart} is blank for roll ${attack.total}, Attack Strength ${attack.strength}. Enter the casualties you choose for this attack.`;
    holder.appendChild(note);
    const label = document.createElement('label'); label.className = 'inv-edit-row';
    const text = document.createElement('span'); text.textContent = 'Casualties from this attack';
    const input = document.createElement('input'); input.className = 'inv-edit-input';
    input.id = id + '-chart-result'; input.type = 'number'; input.min = '0'; input.max = '1000000'; input.step = '1';
    label.append(text, input); holder.appendChild(label);
    const button = document.createElement('button'); button.className = 'bsim-action-btn';
    button.id = id + '-apply-chart-result'; button.type = 'button'; button.textContent = 'Apply chart result';
    button.addEventListener('click', () => dispatch(current => {
      if (!input.value.trim()) throw new RangeError('Enter a casualty count, including zero if that is your choice.');
      return resolveCombatCommandChartResult(current, Number(input.value));
    }, fight));
    holder.appendChild(button);
  }
  return { render, roundOptions: () => ({ useFirearms: Boolean(firearms?.checked) }) };
}
