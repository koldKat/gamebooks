import { createOpponentEditor } from './opponents.js';

export function createCustomOpponentSetup({document, id, t, fields, presets, language = 'en', selectKey = 'encounter', fixedCount = false, defaults = {}, getRun, getData, isBusy}) {
  const select = document.getElementById(id + '-' + selectKey);
  const editor = createOpponentEditor({document, id, t, fields, presets, language});
  editor.fixCount(fixedCount);
  const option = document.createElement('option');
  option.value = '0'; option.textContent = t('battlesim.editor.' + (language === 'bg' ? 'bg.' : '') + 'custom');
  select.prepend(option); select.value = '0'; select.closest('label').after(editor.element);
  let run;
  function visibility() { editor.element.hidden = select.value !== '0'; }
  select.addEventListener('change', visibility);
  return {
    render() {
      if (run !== getRun()) {
        run = getRun();
        const saved = getData()?.customOpponentSetup;
        select.value = getData()?.setup?.[selectKey] ?? getData()?.setup?.[id + '-' + selectKey] ?? saved?.section ?? '0';
        editor.set(saved?.opponents ?? [defaults]);
      }
      const fight = getData()?.fight;
      editor.lock(isBusy ? isBusy(getData()) : fight && ('outcome' in fight ? !fight.outcome : fight.status === 'fighting'));
      visibility();
    },
    settings(data, options = {}, selection = select.value) {
      if (String(selection) !== '0') return options;
      const opponents = editor.read();
      data.customOpponentSetup = {section: '0', opponents: editor.snapshot()};
      return {...options, opponents};
    },
  };
}
