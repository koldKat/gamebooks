import { test } from 'node:test';
import assert from 'node:assert/strict';

test('anthology cover badges include contained media', async () => {
  const saved = { window: globalThis.window, localStorage: globalThis.localStorage };
  globalThis.window = { innerWidth: 1280, matchMedia: () => ({ matches: false }) };
  globalThis.localStorage = { getItem: () => null };
  try {
    const { _makeCoverThumbHTML } = await import('../../../public/js/covers/markup.js');
    const { _coversFingerprint } = await import('../../../public/js/covers/data.js');
    const anthology = { id: 1, name: 'Anthology', isContainer: true, hasPdf: true, hasLiveReading: true };
    const html = _makeCoverThumbHTML(anthology);
    assert.match(html, /cover-pdf-badge" data-badge-offset="1"/);
    const hidden = { ...anthology, hasPdf: false };
    assert.doesNotMatch(_makeCoverThumbHTML(hidden), /cover-pdf-badge/);
    assert.notEqual(_coversFingerprint([], [anthology], []), _coversFingerprint([], [hidden], []));
    assert.match(_makeCoverThumbHTML({ id: 2, name: 'Direct PDF', pdfPath: 'direct.pdf' }), /cover-pdf-badge/);
    assert.doesNotMatch(_makeCoverThumbHTML({ ...anthology, isSeries: true }), /cover-pdf-badge/);
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    }
  }
});
