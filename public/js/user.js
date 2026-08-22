// user.js - admin/author/contributor state and badge helpers

import { getUsername } from './state.js?v=1464';

let _adminUsername  = null;
const _authorMap    = {};
const _contributorSet = new Set();

export function setAdminUsername(name) {
  _adminUsername = name || null;
}

// No hardcoded username fallback, on purpose - a hardcoded name would go
// stale the moment the real admin renamed. `profile.isAdmin` is the real,
// server-computed, id-based value (server/db/auth.js's isUserAdmin()) and is
// used whenever it's available. Before that arrives (or if profile is null),
// this falls back to comparing against `_adminUsername`, which is itself
// fetched fresh from /api/config's adminUsername (server/db/auth.js's
// getAdminUsername(), also id-based - `SELECT username FROM users WHERE
// is_admin = 1` - just exposed as a username string for this comparison) -
// so there's still no literal name baked into the client. Before that config
// fetch resolves, this correctly returns false rather than guessing.
export function resolveIsAdmin(profile = null) {
  if (typeof profile?.isAdmin === 'boolean') return profile.isAdmin;
  const username = String(profile?.username || getUsername() || '').trim().toLowerCase();
  const configured = String(_adminUsername || '').trim().toLowerCase();
  return !!username && !!configured && username === configured;
}

// Takes the already-resolved boolean directly (matching authorBadge/
// contributorBadge below), not a username to re-derive it from - all 3
// callers (boot.js) are rendering the CURRENTLY LOGGED IN user's own header,
// where resolveIsAdmin()'s result (_isAdmin) is already sitting in scope and
// is strictly more reliable: it's driven by profile.isAdmin the moment
// /api/profile resolves, while re-deriving via a username compare here would
// depend on /api/config's adminUsername having *also* already arrived (a
// separate, unawaited fetch - see boot.js) - a real race that could leave
// the actual admin's own badge silently missing for a moment on login/
// profile-save even though _isAdmin was already correctly true.
export function adminBadge(isAdmin) {
  return isAdmin ? '<span class="admin-badge" data-tooltip="Admin">★</span>' : '';
}

// For badging OTHER users (feed.js's per-entry usernames) - there's no
// per-entry isAdmin boolean coming from the server (feed entries only ever
// carried isAuthor/isContributor), so this compares against _adminUsername
// the same way resolveIsAdmin()'s fallback does. Do not pass a username into
// adminBadge() above - it takes a boolean now and a truthy non-empty
// username string would make it return the star for every single user.
export function adminBadgeForUsername(username) {
  const u = String(username || '').trim().toLowerCase();
  const configured = String(_adminUsername || '').trim().toLowerCase();
  return (!!u && !!configured && u === configured) ? adminBadge(true) : '';
}

export function authorBadge(username) {
  if (!_authorMap[username]?.isAuthor) return '';
  return '<span class="author-badge" data-tooltip="Author">★</span>';
}

export function contributorBadge(username) {
  if (!_contributorSet.has(username)) return '';
  return '<span class="contributor-badge" data-tooltip="Contributor">✦</span>';
}

export function displayFor(username) {
  return _authorMap[username]?.displayName || username;
}

export function registerAuthor(username, isAuthor, displayName) {
  if (isAuthor) _authorMap[username] = { isAuthor: true, displayName: displayName || null };
  else delete _authorMap[username];
}

export function registerContributor(username, isContributor) {
  if (isContributor) _contributorSet.add(username);
  else _contributorSet.delete(username);
}
