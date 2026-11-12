// Render an app-themed, keyboard-accessible menu backed by an existing select.
let nextId = 0;
export const normalSimulatorCase = text => String(text).replace(/(?<![\p{L}\p{N}_])\p{Lu}{2,}(?![\p{L}\p{N}_])/gu,
  word => /^[IVXLCDM]+$/.test(word) ? word : word[0] + word.slice(1).toLowerCase());
export function createThemedSelect(select) {
  const document = select.ownerDocument, view = document.defaultView;
  const wrapper = document.createElement('div');
  wrapper.className = 'themed-select';
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'inv-edit-input themed-select-trigger';
  trigger.setAttribute('role', 'combobox');
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');
  const labelElement = select.closest('label') || select.labels?.[0] || select.closest('.inv-edit-row');
  const label = labelElement?.querySelector('span')?.textContent ||
    [...(labelElement?.childNodes || [])].filter(node=>node.nodeType===3).map(node=>node.textContent).join('').trim();
  if (label) trigger.setAttribute('aria-label', label);
  const value = document.createElement('span');
  value.className = 'themed-select-value';
  trigger.append(value);
  const menu = document.createElement('div');
  menu.id = `themed-select-${++nextId}`;
  menu.className = 'themed-select-menu';
  menu.setAttribute('role', 'listbox');
  menu.hidden = true;
  trigger.setAttribute('aria-controls', menu.id);
  select.before(wrapper);
  // Keep the native field's parent intact: existing book panels hide or inspect
  // that row through parentElement. Only the visible trigger gets a wrapper.
  wrapper.append(trigger);
  select.classList.add('themed-select-native');
  (select.closest('.inv-overlay') || document.body).append(menu);
  let opened = false, active = -1, listeners, search = '', lastSearch = 0;
  const options = () => Array.from(select.options);
  const enabled = index => options()[index] && !options()[index].disabled;
  function close(restoreFocus = false) {
    opened = false;
    listeners?.abort();
    listeners = null;
    menu.hidden = true;
    menu.replaceChildren();
    trigger.setAttribute('aria-expanded', 'false');
    trigger.removeAttribute('aria-activedescendant');
    if (restoreFocus && !trigger.disabled) trigger.focus();
  }
  function highlight(index) {
    active = index;
    for (const row of menu.children) row.classList.toggle('is-active', Number(row.dataset.index) === active);
    const row = menu.children[active];
    if (!row) return;
    trigger.setAttribute('aria-activedescendant', row.id);
    if (row.offsetTop < menu.scrollTop) menu.scrollTop = row.offsetTop;
    else if (row.offsetTop + row.offsetHeight > menu.scrollTop + menu.clientHeight) menu.scrollTop = row.offsetTop + row.offsetHeight - menu.clientHeight;
  }
  function position() {
    const rect = trigger.getBoundingClientRect(), viewport = view.visualViewport;
    const width = viewport?.width || view.innerWidth, height = viewport?.height || view.innerHeight;
    const left = viewport?.offsetLeft || 0, top = viewport?.offsetTop || 0;
    const below = top + height - rect.bottom - 8, above = rect.top - top - 8;
    const down = below >= 200 || below >= above;
    const menuWidth = Math.min(Math.max(rect.width, 220), width - 16);
    menu.style.width = `${menuWidth}px`;
    menu.style.maxHeight = `${Math.max(1, Math.min(256, height - 16, down ? below : above))}px`;
    menu.style.left = `${Math.max(left + 8, Math.min(rect.left, left + width - menuWidth - 8))}px`;
    const proposedTop = down ? rect.bottom + 4 : rect.top - menu.offsetHeight - 4;
    menu.style.top = `${Math.max(top + 8, Math.min(proposedTop, top + height - menu.offsetHeight - 8))}px`;
  }
  function draw() {
    const current = options();
    while (menu.children.length > current.length) menu.lastElementChild.remove();
    current.forEach((option, index) => {
      // A layout sync can run between capture and bubble of a real click.
      // Keep the clicked row attached so its selection handler still runs.
      let row = menu.children[index];
      if (!row) {
        row = document.createElement('div');
        row.id = `${menu.id}-${index}`;
        row.className = 'themed-select-option';
        row.dataset.index = index;
        row.setAttribute('role', 'option');
        menu.append(row);
      }
      row.setAttribute('aria-selected', String(index === select.selectedIndex));
      row.setAttribute('aria-disabled', String(option.disabled));
      const text = normalSimulatorCase(option.label);
      if (row.textContent !== text) row.textContent = text;
    });
  }
  function sync() {
    const text = normalSimulatorCase(select.selectedOptions[0]?.label || '');
    if (value.textContent !== text) value.textContent = text;
    const disabled = select.disabled || !options().some((_, index) => enabled(index));
    if (trigger.disabled !== disabled) trigger.disabled = disabled;
    const hidden = select.hidden || select.style.display === 'none';
    if (wrapper.hidden !== hidden) wrapper.hidden = hidden;
    if (hidden || opened && !trigger.getClientRects().length) close();
    if (trigger.disabled) close();
    else if (opened) { draw(); position(); highlight(enabled(active) ? active : select.selectedIndex); }
  }
  function open() {
    sync();
    if (trigger.disabled) return;
    opened = true;
    draw();
    menu.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    position();
    highlight(enabled(select.selectedIndex) ? select.selectedIndex : options().findIndex((_, index) => enabled(index)));
    listeners = new view.AbortController();
    const signal = listeners.signal;
    document.addEventListener('pointerdown', event => {
      if (!wrapper.contains(event.target) && !menu.contains(event.target)) close();
    }, {capture: true, signal});
    document.addEventListener('focusin', event => {
      if (!wrapper.contains(event.target) && !menu.contains(event.target)) close();
    }, {signal});
    view.addEventListener('resize', position, {signal});
    view.addEventListener('scroll', event => { if (event.target !== menu) position(); }, {capture: true, signal});
    view.visualViewport?.addEventListener('resize', position, {signal});
  }
  function choose(index) {
    if (select.disabled || !enabled(index)) return;
    const changed = select.selectedIndex !== index;
    select.selectedIndex = index;
    sync();
    close(true);
    if (changed) select.dispatchEvent(new view.Event('change', {bubbles: true}));
  }
  trigger.addEventListener('click', event => { event.preventDefault(); opened ? close() : open(); });
  trigger.addEventListener('keydown', event => {
    if (event.key === 'Tab') { close(); return; }
    if (event.key === 'Escape') {
      if (opened) { event.preventDefault(); event.stopPropagation(); close(true); }
      return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' '].includes(event.key)) {
      event.preventDefault(); event.stopPropagation();
      if (!opened) { open(); return; }
      if (event.key === 'Enter' || event.key === ' ') { choose(active); return; }
      const candidates = options().map((_, index) => index).filter(enabled);
      const at = candidates.indexOf(active);
      const index = event.key === 'Home' ? 0 : event.key === 'End' ? candidates.length - 1
        : (at + (event.key === 'ArrowUp' ? -1 : 1) + candidates.length) % candidates.length;
      highlight(candidates[index]);
    } else if (event.key.length === 1) {
      event.preventDefault(); event.stopPropagation();
      const now = Date.now(); search = now - lastSearch > 1000 ? event.key : search + event.key; lastSearch = now;
      if (!opened) open();
      const index = options().findIndex((option, index) => enabled(index) && option.label.toLocaleLowerCase().startsWith(search.toLocaleLowerCase()));
      if (index >= 0) highlight(index);
    }
  });
  menu.addEventListener('pointerdown', event => event.preventDefault());
  menu.addEventListener('click', event => {
    const row = event.target.closest('[data-index]');
    if (row && menu.contains(row)) choose(Number(row.dataset.index));
  });
  select.addEventListener('change', sync);
  sync();
  return {sync, close, destroy() {
    close(); select.removeEventListener('change', sync); menu.remove();
    wrapper.remove(); select.classList.remove('themed-select-native');
  }};
}
