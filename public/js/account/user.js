// user.js - admin/author/contributor state and badge helpers

import { getUsername } from '../core/state.js';
import { renderRoleBadge } from './role-badges.js';
import { publicName } from '../core/public-name.js';

let _adminUsername  = null;
const _authorMap    = {};
const _contributorSet = new Set();
const _moderatorSet = new Set();
const _squireSet = new Set();

export function setAdminUsername(name) {
  _adminUsername = name || null;
}

// Prefer the server's isAdmin flag; otherwise use the fetched admin username.
// Until either is available, return false rather than guessing.
export function resolveIsAdmin(profile = null) {
  if (typeof profile?.isAdmin === 'boolean') return profile.isAdmin;
  const username = String(profile?.username || getUsername() || '').trim().toLowerCase();
  const configured = String(_adminUsername || '').trim().toLowerCase();
  return !!username && !!configured && username === configured;
}

// Use the resolved admin boolean for the current user's badge; avoid a second config-fetch race.
export function adminBadge(isAdmin) {
  return isAdmin ? renderRoleBadge('admin') : '';
}

// Other-player badges use the fetched admin username.
// Do not pass usernames to adminBadge(), which expects a boolean.
export function adminBadgeForUsername(username) {
  const u = String(username || '').trim().toLowerCase();
  const configured = String(_adminUsername || '').trim().toLowerCase();
  return (!!u && !!configured && u === configured) ? adminBadge(true) : '';
}

export function authorBadge(username) {
  if (!_authorMap[username]?.isAuthor) return '';
  return renderRoleBadge('author');
}

export function contributorBadge(username) {
  if (!_contributorSet.has(username)) return '';
  return renderRoleBadge('contributor');
}

export function displayFor(username) {
  return publicName(_authorMap[username]?.displayName || username);
}

export function registerAuthor(username, isAuthor, displayName) {
  if (isAuthor) _authorMap[username] = { isAuthor: true, displayName: displayName || null };
  else delete _authorMap[username];
}

export function registerContributor(username, isContributor) {
  if (isContributor) _contributorSet.add(username);
  else _contributorSet.delete(username);
}

export function moderatorBadge(username) {
  return _moderatorSet.has(username) ? renderRoleBadge('moderator') : '';
}
export function registerModerator(username, isModerator) {
  if (isModerator) _moderatorSet.add(username);
  else _moderatorSet.delete(username);
}
export function resolveIsModerator() { return _moderatorSet.has(getUsername()); }

export function squireBadge(username) {
  return _squireSet.has(username) ? renderRoleBadge('squire') : '';
}
export function registerSquire(username, isSquire) {
  if (isSquire) _squireSet.add(username);
  else _squireSet.delete(username);
}
export function resolveIsSquire() { return _squireSet.has(getUsername()); }
