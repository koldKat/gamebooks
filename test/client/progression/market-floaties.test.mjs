import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { rewardFloaterTypeEnabled } from '../../../public/js/progression/floater-policy.js';

for (const currency of ['rubies', 'diamonds']) {
  test(`${currency} purchases float once, without replaying history or disabled feedback`, () => {
    const code = fs.readFileSync('public/js/progression/rewards.js', 'utf8');
    const floats = [];
    let enabled = true;
    const context = vm.createContext({
      rewardFloaterTypeEnabled,
      window: { addEventListener() {} },
      floatiesEnabled: () => enabled,
      waitForCameraIdle: () => false,
      getUsername: () => 'Player',
      saveRewardCache() {}, updateCoinsDisplay() {}, updateShopSnapshot() {},
      updateHeartbeatCoinsDisplay() {}, renderBooksXpSummary() {},
      _broadcastLiveEvent() {}, _queueRewardFloater() {}, _scheduleLiveUiRefresh() {},
      _spawnRewardFloater: (...args) => floats.push(args),
      RUBY_SVG: '<svg></svg>', DIAMOND_SVG: '<svg></svg>',
    });
    vm.runInContext((
      code.slice(code.indexOf('let _lastRewardXp'), code.indexOf('// ── Floater queue')) +
      code.slice(code.indexOf('export function _processRewardSnapshot'), code.indexOf('export function _scheduleRewardProfileRefresh'))
    ).replace(/^export /gm, ''), context);
    const snapshot = {
      xp: 10, level: 1, coinsBalance: 100,
      [`${currency}Earned`]: 36, [`${currency}Bought`]: 5,
    };
    context._processRewardSnapshot(snapshot);
    assert.equal(floats.length, 0);
    snapshot[`${currency}Bought`] = 7;
    context._processRewardSnapshot(snapshot);
    assert.equal(floats.length, 1);
    assert.equal(floats[0][0], currency);
    assert.match(floats[0][1], /\+2/);
    context._processRewardSnapshot(snapshot);
    assert.equal(floats.length, 1, 'duplicate response/SSE must not replay a purchase');
    enabled = false;
    snapshot[`${currency}Bought`] = 8;
    context._processRewardSnapshot(snapshot);
    enabled = true;
    context._processRewardSnapshot(snapshot);
    assert.equal(floats.length, 1, 'disabled feedback must stay skipped');
    snapshot[`${currency}Bought`] = 9;
    snapshot[`${currency}Earned`] = 37;
    context._processRewardSnapshot(snapshot);
    assert.equal(floats.length, 2);
    assert.match(floats[1][1], /\+2/, 'simultaneous earned and purchased gems are combined');
  });
}
