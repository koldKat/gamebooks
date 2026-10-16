import { createOpponentEditor } from '../../opponents.js';
import { fields } from './opponents.js';

export function createSkyfallOpponentSetup({document, id, t, tk, encounters, getRun, getData, resolve, configure}) {
  const select = document.getElementById(id + '-encounter');
  const editor = createOpponentEditor({document, id, t,
    isStatUnavailable: (key, enemy) => select.value !== 'custom'
      && !(key === 'damage' && encounters.find(entry => String(entry.section) === select.value)?.manualDamageRequired)
      && enemy.unavailableStats?.includes(key),
    fields: fields.map(field => ({...field, label: tk(field.key === 'damage' ? 'weaponDamage' : field.key)})),
    presets: encounters.flatMap(entry => entry.foes.map(enemy => ({...enemy,
      unavailableStats: fields.filter(field => enemy[field.key] === null).map(field => field.key)}))),
  });
  select.insertAdjacentHTML('afterbegin', `<option value="custom">${t('battlesim.editor.custom')}</option>`);
  select.value = 'custom';
  select.closest('label').after(editor.element);
  let run;
  function fill() {
    const preset = encounters.find(entry => String(entry.section) === select.value);
    if (preset) {
      let source = preset;
      try { source = resolve?.() ?? preset; } catch { /* Missing source values remain blank for manual entry. */ }
      editor.set(source.foes.map(enemy => ({...enemy,
        unavailableStats: fields.filter(field => enemy[field.key] === null).map(field => field.key),
      })));
    } else editor.set([{}]);
    editor.fixCount(Boolean(preset));
  }
  select.addEventListener('change', fill);
  const count = document.getElementById(id + '-count');
  count?.addEventListener('change', fill);
  return {
    render() {
      if (run !== getRun()) {
        run = getRun();
        const data = getData();
        const setup = data?.opponentSetup;
        const section = String(setup?.section ?? data?.fight?.encounter.section ?? 'custom');
        select.value = [...select.options].some(option => option.value === section) ? section : 'custom';
        configure();
        const size = setup?.opponents?.length ?? data?.fight?.encounter.foes.length;
        if (count && [...count.options].some(option => option.value === String(size))) count.value = String(size);
        if (setup?.opponents) editor.set(setup.opponents); else fill();
      }
      const busy = getData()?.fight?.status === 'fighting';
      editor.lock(busy);
      select.disabled = Boolean(getData()?.fight?.pending);
      editor.fixCount(select.value !== 'custom');
    },
    read() { return editor.snapshot(); },
    save(data) { data.opponentSetup = {section: select.value, opponents: editor.snapshot()}; },
  };
}
