// Share role-gated NSFW controls across catalog create and edit dialogs.
import { apiFetch } from '../core/state.js';
import { t } from '../i18n.js';

export function resetNsfwToggle(prefix, hooks, { entity = 'books', id = null, isCurrent = () => true } = {}) {
  const row = document.getElementById(`${prefix}-nsfw-row`);
  const toggle = document.getElementById(`${prefix}-nsfw-toggle`);
  if (!row || !toggle) return;
  const allowed = !!(hooks.resolveIsAdmin?.() || hooks.resolveIsModerator?.());
  const request = String((Number(toggle.dataset.request) || 0) + 1);
  toggle.dataset.request = request;
  row.style.display = allowed ? '' : 'none';
  toggle.checked = false;
  toggle.disabled = !allowed || id !== null;
  delete toggle.dataset.original;
  if (!allowed || id === null) return;
  apiFetch(`/api/${entity}/${id}/nsfw`).then(async response => {
    if (!response.ok) return;
    const data = await response.json();
    if (!isCurrent() || toggle.dataset.request !== request) return;
    toggle.checked = !!data.isNsfw;
    toggle.dataset.original = data.isNsfw ? '1' : '0';
    toggle.disabled = false;
  }).catch(() => {});
}

export function readNsfwToggle(prefix) {
  const toggle = document.getElementById(`${prefix}-nsfw-toggle`);
  return !!toggle && !toggle.disabled && toggle.checked;
}

export async function saveNsfwToggle(prefix, entity, id) {
  const toggle = document.getElementById(`${prefix}-nsfw-toggle`);
  if (!toggle || toggle.disabled) return;
  const value = toggle.checked ? '1' : '0';
  if (toggle.dataset.original === value) return;
  const response = await apiFetch(`/api/${entity}/${id}/nsfw`, {
    method: 'PATCH', body: JSON.stringify({ isNsfw: toggle.checked }),
  });
  if (!response.ok) throw new Error(t('err.save'));
  toggle.dataset.original = value;
}
