// Cache account seasonal previews, scoped to the verified admin and auth session.
const prefix = 'seasonal-preview:';
let identity = null;
let pendingPreference = null;
const token = () => { try { return localStorage.getItem('gamebook_auth_token'); } catch { return null; } };
const notify = () => window.dispatchEvent(new Event('seasonal-preview-change'));
export function setSeasonPreviewUser(profile) {
  identity = profile?.isAdmin === true && profile.id ? { id: String(profile.id), token: token() } : null;
  if (!profile) pendingPreference = null;
  if (identity && pendingPreference?.token === identity.token
    && (!pendingPreference.id || pendingPreference.id === identity.id)) setSeasonPreview(pendingPreference.value);
  notify();
}
function key() { return identity && identity.token && identity.token === token() ? prefix + identity.id : null; }
export function seasonPreview() {
  const name = key();
  if (!name) return null;
  try { return localStorage.getItem(name); } catch { return null; }
}
export function setSeasonPreview(value) {
  const name = key();
  if (!name) throw Error('Sign in to your administrator account in the main app first.');
  pendingPreference = { token:token(), id:identity.id, value };
  if (value === null) localStorage.removeItem(name);
  else localStorage.setItem(name, value);
  notify();
}
// Prefs and profile requests can finish in either order during app startup.
export function applySeasonPreviewPreference(value) {
  value = value === 'automatic' || value == null ? null : value;
  pendingPreference = { token:token(), value };
  if (key()) setSeasonPreview(value);
}
export function isSeasonPreviewStorageKey(key) { return key === null || key === 'gamebook_auth_token' || key?.startsWith(prefix); }
