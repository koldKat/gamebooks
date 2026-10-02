'use strict';

// Request-scoped impersonation state blocks XP/coins centrally across all award paths.

const { AsyncLocalStorage } = require('async_hooks');

const _store = new AsyncLocalStorage();

function runInImpersonationContext(impersonating, fn) {
  return _store.run({ impersonating: !!impersonating }, fn);
}

function isImpersonatingContext() {
  return !!_store.getStore()?.impersonating;
}

module.exports = { runInImpersonationContext, isImpersonatingContext };
