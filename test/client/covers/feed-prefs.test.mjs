import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

test('a device reduced-motion preference does not check the app setting by default', () => {
  const source = readFileSync(new URL('../../../public/js/covers/state.js', import.meta.url), 'utf8')
    .replace('export const coversState', 'globalThis.coversState');
  for (const saved of [null, '0', '1']) {
    const context = vm.createContext({
      localStorage: { getItem: key => key === 'reduce-motion' ? saved : null },
      window: { matchMedia: () => ({ matches: true }) },
    });
    vm.runInContext(source, context);
    assert.equal(context.coversState._reduceMotion, saved === '1');
  }
});

test('restoring enabled feed covers redraws them without saving preferences again', () => {
  const source = readFileSync(new URL('../../../public/js/covers/prefs.js', import.meta.url), 'utf8')
    .replace(/^import .*;$/gm, '').replace(/^export /gm, '');
  const classes = new Set(['no-feed-day-covers']);
  let refreshes = 0, saves = 0;
  const checkbox = { checked: false };
  const coversState = { _feedDayCovers: false, _coverTooltipTitlePct: 100,
    _hooks: { refreshDayCovers: () => refreshes++, savePrefs: () => saves++ } };
  const context = vm.createContext({ coversState,
    localStorage: { setItem() {} }, getToken: () => 'player',
    _setCoverFavoritesFromPrefs() {}, _effectiveLandingCoverSource: () => 'public',
    _landingCoverPool: () => [],
    document: { body: { classList: { toggle: (name, on) => on ? classes.add(name) : classes.delete(name) } },
      documentElement: { style: { setProperty() {} } },
      getElementById: id => id === 'feed-day-covers-cb' ? checkbox : null },
  });
  vm.runInContext(source, context);
  context.setCoversPrefsState({ feedDayCovers: '1' });
  assert.equal(classes.has('no-feed-day-covers'), false);
  assert.equal(checkbox.checked, true);
  assert.equal(refreshes, 1, 'restoring the enabled state must repopulate unloaded stacks');
  assert.equal(saves, 0);
  coversState._feedDayCovers = false;
  context._persistFeedDayCoversPref();
  assert.equal(classes.has('no-feed-day-covers'), true);
  coversState._feedDayCovers = true;
  context._persistFeedDayCoversPref();
  assert.equal(refreshes, 2, 'each re-enable schedules one redraw');
  assert.equal(saves, 2);
  coversState._reduceMotion = true;
  context.resetFeedDisplayPrefsForLogout();
  assert.equal(coversState._reduceMotion, false, 'logout clears the previous account motion preference');
  assert.equal(classes.has('reduce-motion'), false);
});
