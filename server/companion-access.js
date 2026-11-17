'use strict';

// Identify accounts authorized to test companion trading and single-copy counts.
function canTestCompanions(account) {
  return account?.is_admin === 1 || account?.username?.toLowerCase() === 'sashii';
}

module.exports = { canTestCompanions };
