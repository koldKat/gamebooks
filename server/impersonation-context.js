'use strict';

// Single, request-scoped source of truth for "is the account behind this
// request currently impersonated" - checked centrally by server/db/xp.js's
// _awardXpTx/_awardCoinsTx so no XP or coins can ever be awarded while an
// admin is impersonating someone, no matter which route or db function
// triggers the award. This replaces threading an `impersonating` flag
// through every individual award call site by hand, which is what let this
// leak recur even after being "fixed" once - a route or db function added
// later would silently reopen it unless someone remembered the rule every
// single time. AsyncLocalStorage propagates the flag through the whole
// async call chain of one request without needing every function signature
// to carry it, and (unlike a plain module-level variable) stays correctly
// isolated per-request even though Node interleaves multiple concurrent
// requests on the same process.
//
// Deliberately has no other dependencies (not even `db`) - server/db/xp.js
// is required BY server/db.js, so if this module required db.js back
// (directly or via request-helpers.js, which does require db.js), that
// would be a circular require.

const { AsyncLocalStorage } = require('async_hooks');

const _store = new AsyncLocalStorage();

function runInImpersonationContext(impersonating, fn) {
  return _store.run({ impersonating: !!impersonating }, fn);
}

function isImpersonatingContext() {
  return !!_store.getStore()?.impersonating;
}

module.exports = { runInImpersonationContext, isImpersonatingContext };
