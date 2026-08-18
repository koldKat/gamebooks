import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { runInImpersonationContext, isImpersonatingContext } =
  require('../../../server/impersonation-context.js');

// Security-relevant module (server/db/xp.js's award functions gate every
// XP/coin payout on isImpersonatingContext(), specifically to stop XP
// farming via impersonation - see the "Impersonation XP leak" fix) so this
// gets more thorough coverage than a typical pure-function file.

describe('isImpersonatingContext', () => {
  test('false outside of any impersonation context', () => {
    assert.equal(isImpersonatingContext(), false);
  });

  test('true inside a context started with impersonating=true', () => {
    runInImpersonationContext(true, () => {
      assert.equal(isImpersonatingContext(), true);
    });
  });

  test('false inside a context explicitly started with impersonating=false', () => {
    runInImpersonationContext(false, () => {
      assert.equal(isImpersonatingContext(), false);
    });
  });

  test('falsy-but-not-boolean values are coerced to a real boolean', () => {
    runInImpersonationContext(1, () => {
      assert.equal(isImpersonatingContext(), true);
    });
    runInImpersonationContext(0, () => {
      assert.equal(isImpersonatingContext(), false);
    });
  });

  test('reverts to false once the context callback returns', () => {
    runInImpersonationContext(true, () => {});
    assert.equal(isImpersonatingContext(), false);
  });

  test('nested contexts: the inner context wins while active, outer resumes after', () => {
    runInImpersonationContext(true, () => {
      assert.equal(isImpersonatingContext(), true);
      runInImpersonationContext(false, () => {
        assert.equal(isImpersonatingContext(), false);
      });
      assert.equal(isImpersonatingContext(), true);
    });
  });

  test('stays correctly isolated across concurrent async contexts - the whole point of AsyncLocalStorage over a module-level flag', async () => {
    const results = [];
    await Promise.all([
      runInImpersonationContext(true, async () => {
        await new Promise(r => setTimeout(r, 10));
        results.push(['a', isImpersonatingContext()]);
      }),
      runInImpersonationContext(false, async () => {
        await new Promise(r => setTimeout(r, 5));
        results.push(['b', isImpersonatingContext()]);
      }),
    ]);
    assert.deepEqual(results.sort(), [['a', true], ['b', false]]);
  });

  test('runInImpersonationContext returns the callback\'s own return value', () => {
    const result = runInImpersonationContext(true, () => 42);
    assert.equal(result, 42);
  });
});
