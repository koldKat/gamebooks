import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bindReadingImageZoom } from '../../../public/js/reading/image-zoom.js';

function setup() {
  const listeners = new Map();
  const root = {
    ownerDocument: {},
    contains: () => true,
    querySelectorAll: () => [],
    addEventListener(type, handler) {
      assert.equal(listeners.has(type), false, `duplicate ${type} listener`);
      listeners.set(type, handler);
    },
  };
  const event = target => ({ target, key: 'Enter',
    preventDefault() { throw Error('Reader navigation was intercepted'); },
    stopPropagation() { throw Error('Reader navigation was intercepted'); },
  });
  return { root, listeners, event };
}

test('ordinary reference tables never open the illustration viewer', () => {
  const { root, listeners, event } = setup();
  const figure = { tagName: 'FIGURE', querySelector: () => null };
  const cell = { closest: selector => selector === 'img,figure' ? figure : null };
  bindReadingImageZoom(root);
  assert.doesNotThrow(() => listeners.get('click')(event(cell)));
  assert.doesNotThrow(() => listeners.get('keydown')(event(cell)));
});

test('illustration choice links keep their existing reader navigation', () => {
  const { root, listeners, event } = setup();
  const linkedImage = { closest: () => ({ tagName: 'A' }) };
  bindReadingImageZoom(root);
  assert.doesNotThrow(() => listeners.get('click')(event(linkedImage)));
});

test('rendering another passage in the same pane does not accumulate zoom handlers', () => {
  const { root, listeners } = setup();
  bindReadingImageZoom(root);
  bindReadingImageZoom(root);
  assert.equal(listeners.size, 2);
});
