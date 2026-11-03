import test from 'node:test';
import assert from 'node:assert/strict';
import {validateBlackSunPages, drawBlackSunPage, drawBlackSunSpecialPage, rerollBlackSunPage} from '../../../../public/js/battlesim/engines/black-sun/random.js';

const pages = [
  {sourcePdfPage: 1, base: 2, attack: 3, defense: 4, moon: 'new'},
  {sourcePdfPage: 2, base: 4, attack: 2, defense: 6, moon: 'half'},
  {sourcePdfPage: 3, base: 2, attack: 3, defense: 4, moon: 'new'},
  {sourcePdfPage: 4, base: 1, attack: 6, defense: 2, moon: 'full'},
];

test('every source position has its own equal interval, preserving repeated combinations and their frequency', () => {
  for (let i = 0; i < pages.length; i++) {
    assert.deepEqual(drawBlackSunPage(pages, () => i / pages.length), pages[i]);
    assert.deepEqual(drawBlackSunPage(pages, () => (i + 0.999) / pages.length), pages[i]);
  }
  const result = drawBlackSunPage(pages, () => 0); result.base = 6; assert.equal(pages[0].base, 2);
});

test('base, both ability dice and moon always come from the same page', () => {
  let calls = 0;
  const page = drawBlackSunPage(pages, () => {calls++; return 0.7;});
  assert.equal(calls, 1); assert.deepEqual(page, pages[2]);
});

test('used special routes exclude all equivalent moons and preserve eligible source weights', () => {
  const routes = {new: 'one', full: 'one', crescent: 'two', half: 'three', gibbous: 'four'};
  for (const random of [0, 0.5, 0.9999]) {
    assert.deepEqual(drawBlackSunSpecialPage(pages, routes, ['one'], () => random), {page: pages[1], section: 'three'});
  }
  assert.throws(() => drawBlackSunSpecialPage(pages, routes, ['one', 'three']), RangeError);
  assert.equal(drawBlackSunSpecialPage(pages, routes, ['three'], () => 0.8).page.sourcePdfPage, 4);
});

test('incomplete source records, duplicate source positions and invalid random draws are rejected', () => {
  assert.throws(() => validateBlackSunPages([]), RangeError);
  assert.throws(() => validateBlackSunPages([...pages, pages[0]]), RangeError);
  for (const change of [{moon: null}, {base: 0}, {attack: 7}, {defense: 1.5}]) {
    assert.throws(() => validateBlackSunPages([{...pages[0], ...change}]), RangeError);
  }
  for (const random of [-1, 1, NaN, Infinity]) assert.throws(() => drawBlackSunPage(pages, () => random), RangeError);
});

test('Keeper’s Charm rerolls the entire page only when the current base die is one', () => {
  assert.deepEqual(rerollBlackSunPage(pages[3], pages, true, () => 0), pages[0]);
  assert.throws(() => rerollBlackSunPage(pages[0], pages, true), RangeError);
  assert.throws(() => rerollBlackSunPage(pages[3], pages, false), RangeError);
});
