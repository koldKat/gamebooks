const escape = value => String(value).replace(/[&<>"']/g, character =>
  ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[character]));

export function validateOpponents(rows, fields, isStatUnavailable) {
  if (!Array.isArray(rows) || !rows.length || rows.length > 100) throw new RangeError('Invalid opponent count');
  return rows.map(row => {
    const result = {...row};
    for (const field of fields) {
      // Derived encounters explicitly opt out of fixed numeric inputs.
      if (isStatUnavailable?.(field.key, row)) { result[field.key] = null; continue; }
      const raw = row[field.key];
      const value = Number(raw);
      if (raw === '' || raw == null || !Number.isFinite(value)
          || value < (field.min ?? 0) || value > (field.max ?? 1000000)
          || Math.abs(value / (field.step ?? 1) - Math.round(value / (field.step ?? 1))) > 1e-8) {
        throw new RangeError('Invalid opponent ' + field.key);
      }
      result[field.key] = value;
    }
    result.displayName = String(row.displayName ?? row.name ?? '').trim().slice(0, 200);
    return result;
  });
}

// Presets fill editable fields; they never replace a running fight.
export function createOpponentEditor({document, id, t, fields, presets = [], language = 'en', onSelect, isStatUnavailable}) {
  const label = key => t('battlesim.editor.' + (language === 'bg' ? 'bg.' : '') + key);
  const element = document.createElement('details');
  element.className = 'bsim-opponent-editor';
  element.open = true;
  element.innerHTML = `<summary>${escape(label('opponents'))}</summary><div class="bsim-opponent-rows"></div><button type="button" class="bsim-action-btn">${escape(label('add'))}</button>`;
  const container = element.querySelector('.bsim-opponent-rows');
  const add = element.querySelector('button');
  let rows = [], serial = 0, locked = false, fixedCount = false;

  function append(source = {}) {
    const index = serial++;
    const row = document.createElement('fieldset');
    row.className = 'bsim-opponent-row';
    const inputId = `${id}-opponent-${index}`;
    row.innerHTML = `<label class="inv-edit-row"><span>${escape(label('name'))}</span><div class="autocomplete-wrap bsim-enemy-ac"><input class="inv-edit-input" id="${inputId}" autocomplete="off" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="${inputId}-list"><ul class="autocomplete-dropdown" id="${inputId}-list" role="listbox"></ul></div></label>`
      + fields.map(field => `<label class="inv-edit-row"><span>${escape(field.label)}</span><input class="inv-edit-input" type="number" min="${field.min ?? 0}" max="${field.max ?? 1000000}" step="${field.step ?? 1}" data-stat="${escape(field.key)}" required></label>`).join('')
      + `<button type="button" class="bsim-action-btn">${escape(label('remove'))}</button>`;
    const name = row.querySelector('[role="combobox"]');
    const list = row.querySelector('[role="listbox"]');
    const remove = row.querySelector('button');
    let current = {...source}, matches = [], selected = -1;
    function close() {
      list.classList.remove('open');
      name.setAttribute('aria-expanded', 'false');
      name.removeAttribute('aria-activedescendant');
    }
    function fill(value) {
      current = {...value};
      name.value = value.displayName ?? value.name ?? '';
      for (const input of row.querySelectorAll('[data-stat]')) {
        input.value = value[input.dataset.stat] ?? '';
        input.dataset.unavailable = String(Boolean(isStatUnavailable
          ? isStatUnavailable(input.dataset.stat, value)
          : value.unavailableStats?.includes(input.dataset.stat)));
        input.disabled = locked || input.dataset.unavailable === 'true';
        input.placeholder = input.dataset.unavailable === 'true' ? '-' : '';
      }
    }
    function suggest() {
      if (locked) return;
      const query = name.value.trim().toLocaleLowerCase();
      matches = presets.filter(preset => String(preset.displayName ?? preset.name ?? '').toLocaleLowerCase().includes(query)).slice(0, 40);
      selected = -1;
      list.innerHTML = matches.map((preset, i) => `<li role="option" id="${inputId}-option-${i}" data-option="${i}">${escape(preset.displayName ?? preset.name)}<span class="ac-sub">${fields.map(field => escape(preset[field.key] ?? '?')).join(' / ')}</span></li>`).join('');
      list.classList.toggle('open', Boolean(matches.length));
      name.setAttribute('aria-expanded', String(Boolean(matches.length)));
      name.removeAttribute('aria-activedescendant');
    }
    function choose(index) {
      if (!locked && matches[index]) { fill(matches[index]); close(); onSelect?.(matches[index]); }
    }
    name.addEventListener('focus', suggest);
    name.addEventListener('input', suggest);
    name.addEventListener('blur', () => { setTimeout(close, 150); });
    name.addEventListener('keydown', event => {
      if (event.key === 'Escape' && list.classList.contains('open')) {
        event.preventDefault(); event.stopPropagation(); close(); return;
      }
      if (!list.classList.contains('open')) return;
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        selected = event.key === 'ArrowDown' ? Math.min(selected + 1, matches.length - 1) : Math.max(selected - 1, 0);
        for (const [i, option] of [...list.children].entries()) {
          option.classList.toggle('ac-active', i === selected); option.setAttribute('aria-selected', String(i === selected));
        }
        name.setAttribute('aria-activedescendant', `${inputId}-option-${selected}`);
        list.children[selected]?.scrollIntoView({block: 'nearest'});
      } else if (event.key === 'Enter' && selected >= 0) { event.preventDefault(); choose(selected); }
    });
    list.addEventListener('pointerdown', event => {
      const option = event.target.closest('[data-option]');
      if (option) { event.preventDefault(); choose(Number(option.dataset.option)); }
    });
    const item = {row, read() {
      return {...current, displayName: name.value,
        ...Object.fromEntries([...row.querySelectorAll('[data-stat]')].map(input =>
          [input.dataset.stat, input.dataset.unavailable === 'true' ? null : input.value]))};
    }};
    remove.addEventListener('click', () => {
      if (locked || fixedCount || rows.length < 2) return;
      rows = rows.filter(candidate => candidate !== item); row.remove(); refresh();
    });
    rows.push(item); container.appendChild(row); fill(source); refresh();
  }
  function refresh() {
    add.disabled = locked || fixedCount || rows.length >= 100;
    add.hidden = fixedCount;
    for (const item of rows) {
      for (const control of item.row.querySelectorAll('input,button')) control.disabled = locked || control.dataset.unavailable === 'true';
      item.row.querySelector('button').disabled = locked || fixedCount || rows.length < 2;
      item.row.querySelector('button').hidden = fixedCount;
      if (locked) {
        item.row.querySelector('.autocomplete-dropdown').classList.remove('open');
        item.row.querySelector('[role="combobox"]').setAttribute('aria-expanded', 'false');
      }
    }
  }
  add.addEventListener('click', () => { if (!locked && !fixedCount && rows.length < 100) append(); });
  append();
  return {element,
    set(opponents) {
      rows = []; container.replaceChildren();
      for (const opponent of opponents?.length ? opponents : [{}]) append(opponent);
    },
    read() { return validateOpponents(rows.map(row => row.read()), fields, isStatUnavailable); },
    snapshot() { return rows.map(row => row.read()); },
    lock(value) { locked = Boolean(value); refresh(); },
    fixCount(value) { fixedCount = Boolean(value); refresh(); },
  };
}
