import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

function setup() {
  const listeners = [];
  const elements = new Map();
  function element(id) {
    if (!elements.has(id)) {
      const classes = new Set();
      elements.set(id, {
        style: {}, disabled: false, clicks: 0,
        classList: { contains: v => classes.has(v), add: v => classes.add(v), remove: v => classes.delete(v) },
        setAttribute(name, value) { this[name] = value; },
        click() { this.clicks++; },
      });
    }
    return elements.get(id);
  }
  const context = {
    currentBookId: 1,
    document: { getElementById: element, addEventListener: (type, fn, capture) => listeners.push({ fn, capture }) },
    t: key => ({ 'party.btn': 'Party', 'ctrl.guide': 'Guide', 'notes.notebook_title': 'Notebook' })[key],
  };
  const source = path => readFileSync(new URL(path, import.meta.url), 'utf8').replace(/^import .*;\n/gm, '').replace(/^export /gm, '');
  runInNewContext(source('../../../public/js/core/util.js') + '\n' + source('../../../public/js/boot/play-shortcuts.js') + '\ninitPlayShortcuts();', context);
  const press = (code, extra = {}) => {
    const event = { code, target: { tagName: 'DIV' }, preventDefault() { this.defaultPrevented = true; }, ...extra };
    listeners.forEach(({ fn }) => fn(event));
    return event;
  };
  return { context, element, press, listeners };
}

for (const [key, button, overlay, close] of [
  ['P', 'party-btn', 'party-modal-overlay', 'party-modal-close'],
  ['G', 'guide-btn', 'guide-modal-overlay', 'guide-modal-close'],
  ['N', 'notebook-btn', 'notebook-modal-overlay', 'notebook-modal-cancel'],
]) {
  test(`${key} uses the existing ${button} open and close actions`, () => {
    const { element, press, listeners } = setup();
    assert.ok(listeners.every(l => l.capture === true));
    assert.equal(element(button)['aria-keyshortcuts'], key);
    assert.ok(element(button).innerHTML.startsWith(`<span class="shortcut-hint-letter">${key}</span>`));
    element('eq-overlay').classList.add('active');
    assert.equal(press(`Key${key}`, { key: 'ж' }).defaultPrevented, true);
    assert.equal(element(button).clicks, 1);
    assert.equal(element('eq-overlay').classList.contains('active'), false);
    element(overlay).classList.add('active');
    press(`Key${key}`);
    assert.equal(element(close).clicks, 1);
  });

  test(`${key} respects typing, modifiers, repeats and play-screen visibility`, () => {
    const { context, element, press } = setup();
    for (const extra of [
      { target: { tagName: 'INPUT' } }, { target: { tagName: 'TEXTAREA' } },
      { target: { tagName: 'SELECT' } },
      { target: { tagName: 'DIV', isContentEditable: true } },
      { ctrlKey: true }, { metaKey: true }, { altKey: true }, { repeat: true },
    ]) press(`Key${key}`, extra);
    element('main-screen').style.display = 'none';
    press(`Key${key}`);
    element('main-screen').style.display = 'flex';
    context.currentBookId = null;
    press(`Key${key}`);
    context.currentBookId = 1;
    element(button).disabled = true;
    press(`Key${key}`);
    element(button).disabled = false;
    element(button).style.display = 'none';
    press(`Key${key}`);
    assert.equal(element(button).clicks, 0);
  });
}
