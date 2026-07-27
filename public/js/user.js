// user.js - admin/author/contributor state and badge helpers

import { getUsername } from './state.js?v=11';

let _adminUsername  = null;
const _authorMap    = {};
const _contributorSet = new Set();

export function setAdminUsername(name) {
  _adminUsername = name || null;
}

export function resolveIsAdmin(profile = null) {
  if (typeof profile?.isAdmin === 'boolean') return profile.isAdmin;
  const username = String(profile?.username || getUsername() || '').trim().toLowerCase();
  if (!username) return false;
  const configured = String(_adminUsername || '').trim().toLowerCase();
  return username === 'koldkat' || (!!configured && username === configured);
}

// Mirrors resolveIsAdmin()'s logic exactly (same hardcoded 'koldkat' fallback,
// same case-insensitive compare) - these two answer the same question ("is
// this user the admin") and must agree, or a user resolveIsAdmin() already
// treats as admin (e.g. in the brief window before /api/config's
// adminUsername arrives) could render without their badge here.
export function adminBadge(username) {
  const u = String(username || '').trim().toLowerCase();
  if (!u) return '';
  const configured = String(_adminUsername || '').trim().toLowerCase();
  if (u !== 'koldkat' && (!configured || u !== configured)) return '';
  return '<span class="admin-badge" data-tooltip="Admin">★</span>';
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
