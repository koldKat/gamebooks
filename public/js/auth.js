// ── Auth (login / register / forgot / reset password) ─────────────────────────
// Self-contained module. Imports only from state.js, i18n.js and util.js.
// To remove: delete this file, remove its import line and setOnAuthSuccess()/initAuth()/
// showAuthForm()/showResetPanel()/hasPendingResetToken() calls from boot.js.

import { setToken, setUsername } from './state.js?v=13';
import { t } from './i18n.js?v=49';
import { fetchPublic } from './util.js?v=61';

// Called after a successful login/register (main.js wires this to showBooks()).
let _onAuthSuccess = null;
export function setOnAuthSuccess(fn) { _onAuthSuccess = fn || null; }

// Captured once at module load so showLogin() in main.js can detect a pending reset.
let _pendingResetToken = new URLSearchParams(location.search).get('reset_token') || null;
if (_pendingResetToken) history.replaceState({}, '', location.pathname);

export function hasPendingResetToken() { return !!_pendingResetToken; }

export function showResetPanel() {
  document.querySelector('.auth-form').style.display       = 'none';
  document.getElementById('forgot-pw-btn').style.display   = 'none';
  document.getElementById('forgot-pw-panel').style.display = 'none';
  document.getElementById('reset-pw-panel').style.display  = '';
}

export function showAuthForm() {
  document.querySelector('.auth-form').style.display       = '';
  document.getElementById('forgot-pw-btn').style.display   = '';
  document.getElementById('forgot-pw-panel').style.display = 'none';
  document.getElementById('reset-pw-panel').style.display  = 'none';
}

async function doAuth(endpoint) {
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  const errEl    = document.getElementById('login-error');
  errEl.textContent = '';

  if (!username || !password) { errEl.textContent = t('err.username_password'); return; }

  try {
    const res  = await fetchPublic(endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body:   JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) { errEl.textContent = data.error || t('msg.error'); return; }
    setToken(data.token);
    setUsername(data.username);
    await _onAuthSuccess?.();
  } catch (_) {
    errEl.textContent = t('err.connect');
  }
}

async function doRegister() {
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  const confirm  = document.getElementById('register-password-confirm').value;
  const email    = document.getElementById('register-email').value.trim();
  const errEl    = document.getElementById('login-error');
  errEl.textContent = '';

  if (!username || !password) { errEl.textContent = t('err.username_password'); return; }
  if (password !== confirm) { errEl.textContent = t('auth.passwords_no_match'); return; }

  try {
    const res  = await fetchPublic('/api/register', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body:   JSON.stringify({ username, password, email: email || undefined }),
    });
    const data = await res.json();
    if (!res.ok) { errEl.textContent = data.error || t('msg.error'); return; }
    setToken(data.token);
    setUsername(data.username);
    await _onAuthSuccess?.();
  } catch (_) {
    errEl.textContent = t('err.connect');
  }
}

function _initResetPasswordFlow() {
  // Wire the submit handler once; DOM toggling is handled by showLogin() via hasPendingResetToken().
  document.getElementById('reset-submit-btn').addEventListener('click', async () => {
    const token   = _pendingResetToken;
    const password = document.getElementById('reset-password').value;
    const confirm  = document.getElementById('reset-password-confirm').value;
    const errEl    = document.getElementById('reset-error');
    const succEl   = document.getElementById('reset-success');
    errEl.textContent = ''; succEl.style.display = 'none';
    if (!password) { errEl.textContent = t('auth.enter_new_password'); return; }
    if (password !== confirm) { errEl.textContent = t('auth.passwords_no_match'); return; }
    try {
      const res  = await fetchPublic('/api/reset-password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body:   JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) { errEl.textContent = data.error || 'Something went wrong.'; return; }
      document.getElementById('reset-submit-btn').style.display = 'none';
      document.getElementById('reset-password').style.display = 'none';
      document.getElementById('reset-password-confirm').style.display = 'none';
      succEl.style.display = '';
      _pendingResetToken = null;
      setTimeout(() => showAuthForm(), 3000);
    } catch (_) { errEl.textContent = t('err.connect'); }
  });
}

export function initAuth() {
  let _registerEmailShown = false;
  const loginBtn      = document.getElementById('login-btn');
  const registerBtn   = document.getElementById('register-btn');
  const confirmInput  = document.getElementById('register-password-confirm');
  const emailInput    = document.getElementById('register-email');
  const emailHint     = document.getElementById('register-email-hint');
  const forgotBtn     = document.getElementById('forgot-pw-btn');
  const forgotPanel   = document.getElementById('forgot-pw-panel');
  const forgotBack    = document.getElementById('forgot-back-btn');
  const forgotSubmit  = document.getElementById('forgot-submit-btn');
  const forgotSuccess = document.getElementById('forgot-success');
  const forgotError   = document.getElementById('forgot-error');

  function _resetRegisterBtn() {
    registerBtn.textContent = t('auth.register');
    registerBtn.classList.remove('auth-confirm-btn');
    registerBtn.classList.add('auth-alt-btn');
    loginBtn.style.display = '';
  }

  loginBtn.addEventListener('click', () => {
    _registerEmailShown = false;
    confirmInput.style.display = 'none';
    emailInput.style.display = 'none';
    emailHint.style.display  = 'none';
    _resetRegisterBtn();
    doAuth('/api/login');
  });

  registerBtn.addEventListener('click', () => {
    if (!_registerEmailShown) {
      _registerEmailShown = true;
      confirmInput.style.display = '';
      emailInput.style.display = '';
      emailHint.style.display  = '';
      registerBtn.textContent = t('auth.confirm');
      registerBtn.classList.remove('auth-alt-btn');
      registerBtn.classList.add('auth-confirm-btn');
      loginBtn.style.display = 'none';
      confirmInput.focus();
      return;
    }
    doRegister();
  });

  forgotBtn.addEventListener('click', () => {
    document.querySelector('.auth-form').style.display = 'none';
    forgotBtn.style.display = 'none';
    forgotPanel.style.display = '';
    document.getElementById('forgot-identifier').focus();
  });

  forgotBack.addEventListener('click', showAuthForm);

  forgotSubmit.addEventListener('click', async () => {
    const identifier = document.getElementById('forgot-identifier').value.trim();
    forgotError.textContent = ''; forgotSuccess.style.display = 'none';
    if (!identifier) { forgotError.textContent = t('auth.enter_username_or_email'); return; }
    forgotSubmit.disabled = true;
    forgotSubmit.textContent = t('auth.sending');
    forgotSubmit.classList.add('btn--sending');
    try {
      const res  = await fetchPublic('/api/forgot-password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body:   JSON.stringify({ identifier }),
      });
      const data = await res.json();
      if (!res.ok) { forgotError.textContent = data.error || 'Something went wrong.'; return; }
      if (data.noEmail) {
        forgotSuccess.classList.add('auth-warning');
        forgotSuccess.textContent = t('auth.no_email_on_file');
      } else {
        forgotSuccess.classList.remove('auth-warning');
        forgotSuccess.textContent = t('auth.reset_link_sent_maybe');
      }
      forgotSuccess.style.display = '';
    } catch (_) { forgotError.textContent = t('err.connect'); }
    finally {
      forgotSubmit.disabled = false;
      forgotSubmit.textContent = t('auth.send_reset_link');
      forgotSubmit.classList.remove('btn--sending');
    }
  });

  _initResetPasswordFlow();
  document.getElementById('reset-back-btn').addEventListener('click', () => {
    _pendingResetToken = null;
    showAuthForm();
  });

  document.getElementById('login-username').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('login-password').focus();
  });
  document.getElementById('login-password').addEventListener('keydown', e => {
    if (e.key === 'Enter') doAuth('/api/login');
  });
}
