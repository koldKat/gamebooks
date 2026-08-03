// ── Play Together (party) ──────────────────────────────────────────────────────
// Self-contained module. Imports only from state.js, play.js and util.js.
// To remove: delete this file, remove its import line and setPartyHooks()/initParty()/
// connectPartySSE()/disconnectPartySSE()/loadPartyInvites() calls from boot.js, and
// remove the party-* CSS from style.css.

import { currentBookId, apiFetch, getToken, isDemoMode, loadState } from './state.js?v=11';
import { render, suppressAutoNav, showAlert, showConfirm } from './play.js?v=69';
import { escapeHtml } from './util.js?v=39';
import { t } from './i18n.js?v=32';

// Hooks into main.js for things that aren't part of this module's scope.
let _hooks = {};
export function setPartyHooks(h) { _hooks = h || {}; }

let _sseSource    = null;
let _sseBookId    = null;
let _currentParty = null;
let _connectGen   = 0;

export function disconnectPartySSE() {
  _connectGen++; // discard any in-flight connectPartySSE() call for a book we've since navigated away from
  if (_sseSource) { _sseSource.close(); _sseSource = null; _sseBookId = null; }
  _currentParty = null;
  const btn = document.getElementById('party-btn');
  if (btn) { btn.classList.remove('party-active'); btn.textContent = t('party.btn'); }
}

export async function connectPartySSE(bookId) {
  disconnectPartySSE();
  const gen = _connectGen;
  if (!getToken()) return;
  try {
    const res = await apiFetch(`/api/books/${bookId}/party`);
    const { party } = await res.json();
    if (gen !== _connectGen) return; // superseded by a newer connectPartySSE()/disconnectPartySSE() call
    _currentParty = party;
    const btn = document.getElementById('party-btn');
    if (party && btn) {
      btn.classList.add('party-active');
      const others = party.members.filter(m => m.id !== _hooks.getCurrentUserId?.());
      btn.textContent = others.length ? t('party.btn_with', { names: others.map(m => m.username).join(', ') }) : t('party.btn_partners');
      _sseBookId = bookId;
      _sseSource = new EventSource(`/api/books/${bookId}/stream?token=${encodeURIComponent(getToken())}`);
      _sseSource.onmessage = async (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.type === 'state_updated' && currentBookId === _sseBookId) {
            suppressAutoNav(true);
            try { await loadState(_sseBookId); render(); }
            finally { suppressAutoNav(false); }
            _hooks.scheduleRewardProfileRefresh?.();
          } else if (data.type === 'party_changed') {
            // Someone else accepted an invite or left - refresh membership (and
            // reconnect, since accepting/leaving may add/drop us from this party).
            const wasOpen = document.getElementById('party-modal-overlay')?.classList.contains('active');
            const refreshedBookId = _sseBookId;
            const genBefore = _connectGen;
            await connectPartySSE(refreshedBookId);
            // connectPartySSE()'s own disconnectPartySSE() call bumps the generation by
            // exactly 1 in the common case - if it's anything else, a real navigation
            // (another connectPartySSE()/disconnectPartySSE() call) ran concurrently and
            // _currentParty no longer belongs to refreshedBookId, so skip rendering it.
            if (wasOpen && _connectGen === genBefore + 1) {
              // Preserve whatever the user was mid-typing in the invite box - a live
              // membership update shouldn't wipe out an in-progress invite.
              const draftInvite = document.getElementById('party-invite-input')?.value || '';
              _renderPartyModal(refreshedBookId, _currentParty);
              const newInput = document.getElementById('party-invite-input');
              if (newInput && draftInvite) newInput.value = draftInvite;
            }
          }
        } catch (_) {}
      };
      // Don't close on error - let EventSource auto-reconnect (browser retries with backoff)
      _sseSource.onerror = () => {};
    } else if (btn) {
      btn.classList.remove('party-active');
      btn.textContent = t('party.btn');
    }
  } catch (_) {}
}

export async function loadPartyInvites() {
  const section = document.getElementById('party-invites-section');
  if (!section) return;
  try {
    const res = await apiFetch('/api/party-invites');
    const { invites } = await res.json();
    if (!invites || !invites.length) { section.innerHTML = ''; return; }
    section.innerHTML = invites.map(inv => `
      <div class="party-invite-card" data-invite-id="${inv.id}">
        <div class="party-invite-text">
          ${t('party.invite_text', { inviter: `<strong>${escapeHtml(inv.inviter_username)}</strong>`, book: `<strong>${escapeHtml(inv.book_name)}</strong>` })}
        </div>
        <div class="party-invite-actions">
          <button class="party-invite-accept" data-id="${inv.id}">${t('party.accept')}</button>
          <button class="party-invite-decline" data-id="${inv.id}">${t('party.decline')}</button>
        </div>
      </div>
    `).join('');
    section.querySelectorAll('.party-invite-accept').forEach(btn =>
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        const r = await apiFetch(`/api/party-invites/${btn.dataset.id}/accept`, { method: 'POST' });
        if (r.ok) {
          btn.closest('.party-invite-card').remove();
          _hooks.scheduleRewardProfileRefresh?.(80);
          await _hooks.refreshBooksListOnly?.();
          loadPartyInvites();
        }
        else { const j = await r.json().catch(() => ({})); showAlert(j.error || t('party.accept_failed')); btn.disabled = false; }
      })
    );
    section.querySelectorAll('.party-invite-decline').forEach(btn =>
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        const r = await apiFetch(`/api/party-invites/${btn.dataset.id}/decline`, { method: 'POST' });
        if (r.ok) { btn.closest('.party-invite-card').remove(); }
        else { showAlert(t('party.decline_failed')); btn.disabled = false; }
      })
    );
  } catch (_) {}
}

function _wireInviteAutocomplete(inputId, sendBtnId, onSend) {
  const inp = document.getElementById(inputId);
  if (!inp) return;
  let _ddTimer = null;
  const getOrCreateDd = () => {
    let dd = inp.parentElement.querySelector('.party-invite-dropdown');
    if (!dd) { dd = document.createElement('div'); dd.className = 'party-invite-dropdown'; inp.parentElement.appendChild(dd); }
    return dd;
  };
  const hideDd = () => { const dd = inp.parentElement?.querySelector('.party-invite-dropdown'); if (dd) dd.remove(); };
  inp.addEventListener('input', () => {
    clearTimeout(_ddTimer);
    const q = inp.value.trim();
    if (q.length < 1) { hideDd(); return; }
    _ddTimer = setTimeout(async () => {
      try {
        const res = await apiFetch(`/api/users/search?q=${encodeURIComponent(q)}`);
        const { users } = await res.json();
        if (!users?.length) { hideDd(); return; }
        const dd = getOrCreateDd();
        dd.innerHTML = users.map(u => `<button data-username="${escapeHtml(u.username)}">${escapeHtml(u.username)}</button>`).join('');
        dd.querySelectorAll('button').forEach(btn => btn.addEventListener('mousedown', e => {
          e.preventDefault();
          inp.value = btn.dataset.username;
          hideDd();
        }));
      } catch (_) {}
    }, 180);
  });
  inp.addEventListener('blur', () => setTimeout(hideDd, 150));
  inp.addEventListener('keydown', e => { if (e.key === 'Escape') hideDd(); });
  document.getElementById(sendBtnId)?.addEventListener('click', () => { hideDd(); onSend(inp.value.trim()); });
}

function _renderPartyModal(bookId, party) {
  const currentUserId = _hooks.getCurrentUserId?.();
  const hasPartners = party && party.members.filter(m => m.id !== currentUserId).length > 0;
  document.getElementById('party-modal-title').textContent = hasPartners ? t('party.title_together') : t('party.title_solo');
  const body = document.getElementById('party-modal-body');
  if (!hasPartners) {
    body.innerHTML = `
      ${party ? `<p class="party-msg" style="color:#fbbf24">${t('party.invite_pending')}</p>` : `<p class="party-msg">${t('party.invite_intro')}</p>`}
      <div class="party-section-label">${t('party.invite_by_username')}</div>
      <div class="party-invite-row">
        <div class="party-invite-wrap">
          <input type="text" class="party-invite-input" id="party-invite-input" placeholder="${t('party.username_placeholder')}" autocomplete="off" autocapitalize="off">
        </div>
        <button class="party-invite-send" id="party-invite-send-btn">${t('party.invite_send')}</button>
      </div>
      <div id="party-invite-msg" style="font-size:0.8rem;min-height:1.2em;color:#9ca3af"></div>
      ${party ? `<button class="party-leave-btn" id="party-cancel-btn">${t('party.cancel_invite')}</button>` : ''}
    `;
    _wireInviteAutocomplete('party-invite-input', 'party-invite-send-btn', async (username) => {
      if (!username) return;
      const msgEl = document.getElementById('party-invite-msg');
      msgEl.textContent = '';
      const r = await apiFetch(`/api/books/${bookId}/party`, {
        method: 'POST',
        body: JSON.stringify({ usernames: [username] })
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { msgEl.style.color = '#ef4444'; msgEl.textContent = j.error || t('party.invite_failed'); return; }
      const err = j.errors?.[0];
      if (err) {
        msgEl.style.color = '#ef4444';
        msgEl.textContent = err.error === 'user_not_found' ? t('party.user_not_found') :
                            err.error === 'already_tracking' ? t('party.already_tracking') :
                            err.error === 'already_invited' ? t('party.already_invited') : err.error;
        return;
      }
      msgEl.style.color = '#34d399';
      msgEl.textContent = t('party.invite_sent', { name: username });
      document.getElementById('party-invite-input').value = '';
      await connectPartySSE(bookId);
      _renderPartyModal(bookId, _currentParty);
    });
    document.getElementById('party-cancel-btn')?.addEventListener('click', async () => {
      const r = await apiFetch(`/api/books/${bookId}/party`, { method: 'DELETE' });
      if (!r.ok) { showAlert(t('party.cancel_failed')); return; }
      closePartyModal();
      await connectPartySSE(bookId);
    });
  } else {
    const memberRows = party.members.map(m => {
      const isYou = m.id === currentUserId;
      const avatar = m.avatar_path
        ? `<img class="party-member-avatar" src="/avatars/${escapeHtml(m.avatar_path)}" alt="">`
        : `<div class="party-member-avatar" style="display:flex;align-items:center;justify-content:center;font-size:0.65rem;color:#9ca3af">${escapeHtml(m.username[0].toUpperCase())}</div>`;
      return `<div class="party-member-row">${avatar}<span>${escapeHtml(m.username)}</span>${isYou ? `<span class="party-member-you">${t('party.you')}</span>` : ''}</div>`;
    }).join('');
    body.innerHTML = `
      <div class="party-section-label">${t('party.members')}</div>
      ${memberRows}
      <div class="party-section-label" style="margin-top:0.5rem">${t('party.invite_more')}</div>
      <div class="party-invite-row">
        <div class="party-invite-wrap">
          <input type="text" class="party-invite-input" id="party-invite-input" placeholder="${t('party.username_placeholder')}" autocomplete="off" autocapitalize="off">
        </div>
        <button class="party-invite-send" id="party-invite-send-btn">${t('party.invite_send')}</button>
      </div>
      <div id="party-invite-msg" style="font-size:0.8rem;min-height:1.2em;color:#9ca3af"></div>
      <button class="party-leave-btn" id="party-leave-btn">${t('party.stop_playing')}</button>
    `;
    _wireInviteAutocomplete('party-invite-input', 'party-invite-send-btn', async (username) => {
      if (!username) return;
      const msgEl = document.getElementById('party-invite-msg');
      msgEl.textContent = '';
      const r = await apiFetch(`/api/books/${bookId}/party/invite`, {
        method: 'POST',
        body: JSON.stringify({ username })
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { msgEl.style.color = '#ef4444'; msgEl.textContent = j.error || t('party.invite_failed'); return; }
      msgEl.style.color = '#34d399';
      msgEl.textContent = t('party.invite_sent', { name: username });
      document.getElementById('party-invite-input').value = '';
    });
    document.getElementById('party-leave-btn').addEventListener('click', async () => {
      showConfirm(t('party.stop_confirm'), async () => {
        const r = await apiFetch(`/api/books/${bookId}/party`, { method: 'DELETE' });
        if (!r.ok) { showAlert(t('party.leave_failed')); return; }
        closePartyModal();
        await connectPartySSE(bookId);
      });
    });
  }
}

function openPartyModal() {
  const bookId = currentBookId;
  if (!bookId) return;
  _renderPartyModal(bookId, _currentParty);
  document.getElementById('party-modal-overlay').classList.add('active');
  const inp = document.getElementById('party-invite-input');
  if (inp) inp.focus();
}

function closePartyModal() {
  document.getElementById('party-modal-overlay').classList.remove('active');
}

export function initParty() {
  const overlay = document.getElementById('party-modal-overlay');
  let _mousedownOnOverlay = null;
  overlay.addEventListener('mousedown', e => { _mousedownOnOverlay = (e.target === overlay) ? overlay : null; });

  document.getElementById('party-btn').addEventListener('click', openPartyModal);
  document.getElementById('party-modal-close').addEventListener('click', closePartyModal);
  overlay.addEventListener('click', e => {
    if (e.target === e.currentTarget && _mousedownOnOverlay === e.currentTarget) closePartyModal();
  });
}
