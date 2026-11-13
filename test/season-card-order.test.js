'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const events = require('../public/js/seasonal-events/calendar.json');
const schedule = vm.createContext({});
vm.runInContext(fs.readFileSync('public/js/seasonal-events/schedule.js', 'utf8').replace(/\bexport /g, ''), schedule);

test('admin cards show active and next occurrences, moving past Halloween to next year', () => {
  const result = schedule.orderedSeasonOccurrences(events, new Date('2026-11-13T12:00:00Z'));
  assert.equal(result[0].event.id, 'friday-13');
  assert.equal(result[0].window.start, '2026-11-12');
  assert.equal(result[1].event.id, 'thanksgiving');
  assert.equal(result.find(row => row.event.id === 'halloween').window.start, '2027-10-28');
  const dates = Array.from(result, row => row.window?.start ?? '9999-12-31');
  assert.deepEqual(dates, [...dates].sort());
  assert.equal(result.length, events.length);
});

test('cross-year active events remain first and unknown dates stay last', () => {
  const unknown = { id: 'unknown', dates: {}, title: 'Unpublished date' };
  const result = schedule.orderedSeasonOccurrences([...events, unknown], new Date('2027-01-01T12:00:00Z'));
  assert.equal(result[0].window.start, '2026-12-29');
  assert.equal(result[0].window.end, '2027-01-04');
  assert.equal(result.at(-1).event.id, 'unknown');
  assert.equal(result.at(-1).window, null);
});

test('date ordering retains overlap exclusions and supports future calendar entries', () => {
  const friday = events.find(event => event.id === 'friday-13');
  const holiday = { id: 'holiday', start: 1112, end: 1114, day: 1113 };
  const future = { id: 'future', dates: { 2031: '2031-01-01' }, daysAround: 0 };
  const result = schedule.orderedSeasonOccurrences([friday, holiday, future], new Date('2026-11-12T12:00:00Z'));
  assert.notEqual(result.find(row => row.event.id === 'friday-13').window.center, '2026-11-13');
  assert.equal(result.find(row => row.event.id === 'future').window.start, '2031-01-01');
});

test('admin cards render in occurrence order and display the next Halloween dates', () => {
  const nodes = new Map();
  const element = () => ({ children: [], dataset: {}, textContent: '',
    append(...items) { this.children.push(...items); },
    replaceChildren() { this.children = []; }, addEventListener() {} });
  class CurrentDate extends Date {
    constructor(...args) { super(...(args.length ? args : ['2026-11-13T12:00:00Z'])); }
  }
  const context = vm.createContext({
    Date: CurrentDate, seasonalEvents: events, orderedSeasonOccurrences: schedule.orderedSeasonOccurrences,
    seasonalDay: schedule.seasonalDay, createCursorPreviews: () => () => {},
    document: { createElement: element, getElementById(id) {
      if (!nodes.has(id)) nodes.set(id, element());
      return nodes.get(id);
    } },
  });
  vm.runInContext(fs.readFileSync('admin/js/seasons.js', 'utf8')
    .replace(/^import .*;\n/gm, '').replace(/\bexport /g, ''), context);
  context.renderSeasonCards();
  const cards = nodes.get('seasons-list').children;
  assert.equal(cards.length, events.length);
  assert.equal(cards[0].children[3].dataset.seasonTest, 'friday-13');
  const halloween = cards.find(card => card.children[3].dataset.seasonTest === 'halloween');
  assert.match(halloween.children[1].textContent, /^2027-10-28/);
});
