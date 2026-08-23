// auth.js - Login screen. Owns nothing beyond the login form itself.

import { apiFetch, setToken, setUsername } from '../../js/state.js?v=1467';
import { t } from '../../js/i18n.js?v=1467';
import { escapeHtml } from '../../js/util.js?v=1467';

export function renderLogin(mount, onSuccess) {
  mount.innerHTML = `
    <div class="m-login">
      <h1>${escapeHtml(t('app.title'))}</h1>
      <form id="m-login-form">
        <input id="m-login-user" type="text" placeholder="${escapeHtml(t('auth.username'))}" autocomplete="username" required>
        <input id="m-login-pass" type="password" placeholder="${escapeHtml(t('auth.password'))}" autocomplete="current-password" required>
        <button type="submit">${escapeHtml(t('auth.login'))}</button>
        <div id="m-login-error" class="m-error"></div>
      </form>
    </div>`;

  const form  = document.getElementById('m-login-form');
  const errEl = document.getElementById('m-login-error');

  form.addEventListener('submit', async e => {
    e.preventDefault();
    errEl.textContent = '';
    const username = document.getElementById('m-login-user').value.trim();
    const password = document.getElementById('m-login-pass').value;
    if (!username || !password) return;

    let res, data;
    try {
      res  = await apiFetch('/api/login', { method: 'POST', body: JSON.stringify({ username, password }) });
      data = await res.json().catch(() => ({}));
    } catch (_) {
      errEl.textContent = t('auth.network_error');
      return;
    }
    if (!res.ok) {
      errEl.textContent = data.error || t('auth.login_failed');
      return;
    }
    setToken(data.token);
    setUsername(data.username);
    onSuccess();
  });
}
