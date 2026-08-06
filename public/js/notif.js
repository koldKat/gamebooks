// notif.js - Notification badge, inbox badge, forum badge, notification dropdown

import { getToken, apiFetch, isDemoMode } from './state.js?v=13';
import { t } from './i18n.js?v=36';
import { escapeHtml } from './util.js?v=45';

let _hooks = {};
export function setNotifHooks(h) { _hooks = h || {}; }

// ── State ─────────────────────────────────────────────────────────────────────
let _badgeRefreshTimer         = null;
let _badgeRefreshInboxPending  = false;
let _badgeRefreshNotifPending  = false;
let _badgeRefreshForumPending  = false;
let _badgeRefreshRewardPending = false;
let _badgeRefreshPartyPending  = false;
let _badgeRefreshPrefsPending  = false;

let _notifDropdownOpen = false;

// ── Helpers ───────────────────────────────────────────────────────────────────
function _timeAgo(ms) {
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60)    return 'just now';
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

// ── Badge refreshes ───────────────────────────────────────────────────────────
async function refreshNotifBadge() {
  if (!getToken()) return;
  try {
    const res  = await apiFetch('/api/notifications');
    if (!res.ok) return;
    const data = await res.json();
    // Re-check after the await, not just before it - a logout that happens
    // while this fetch is in flight must not have this stale response set
    // the badge active again once it lands.
    if (!getToken()) return;
    const btn  = document.getElementById('notif-btn');
    btn.classList.toggle('notif-btn--active', data.unseen > 0);
    btn._notifData = data;
  } catch {}
}

async function refreshForumBadge() {
  try {
    const res = await apiFetch('/api/forum/latest');
    if (!res.ok) return;
    const { lastPostAt, userSeen } = await res.json();
    if (!getToken()) return;
    const btn = document.getElementById('forum-btn');
    if (btn) btn.classList.toggle('forum-btn--active', lastPostAt > userSeen);
  } catch {}
}

export async function refreshInboxBadge() {
  if (!getToken()) return;
  try {
    const res = await apiFetch('/api/feedback');
    if (!res.ok) return;
    const threads = await res.json();
    if (!getToken()) return;
    const unread  = threads.reduce((sum, t) => sum + (t.user_unread || 0), 0);
    const btn = document.getElementById('inbox-btn');
    btn.textContent = unread > 0 ? `${t('btn.inbox')} (${unread})` : t('btn.inbox');
    btn.classList.toggle('inbox-btn--active', unread > 0);
  } catch {}
}

// Belt-and-suspenders cleanup for showLogin() (boot.js) - the in-flight-fetch
// re-checks above should already stop a stale response from re-lighting a
// badge after logout, but this clears any state that was already set before
// logout happened, and covers any refresh path not yet updated to re-check.
export function resetNotifBadgesForLogout() {
  const notifBtn = document.getElementById('notif-btn');
  if (notifBtn) { notifBtn.classList.remove('notif-btn--active'); notifBtn._notifData = null; }
  const forumBtn = document.getElementById('forum-btn');
  if (forumBtn) forumBtn.classList.remove('forum-btn--active');
  const inboxBtn = document.getElementById('inbox-btn');
  if (inboxBtn) { inboxBtn.classList.remove('inbox-btn--active'); inboxBtn.textContent = t('btn.inbox'); }
}

// ── Scheduled batch refresh ───────────────────────────────────────────────────
export function _scheduleLiveUiRefresh({
  inbox  = false,
  notif  = false,
  forum  = false,
  reward = false,
  party  = false,
  prefs  = false,
} = {}, delay = 120) {
  _badgeRefreshInboxPending  ||= !!inbox;
  _badgeRefreshNotifPending  ||= !!notif;
  _badgeRefreshForumPending  ||= !!forum;
  _badgeRefreshRewardPending ||= !!reward;
  _badgeRefreshPartyPending  ||= !!party;
  _badgeRefreshPrefsPending  ||= !!prefs;
  if (_badgeRefreshTimer) clearTimeout(_badgeRefreshTimer);
  _badgeRefreshTimer = setTimeout(async () => {
    _badgeRefreshTimer = null;
    if (!getToken() || isDemoMode) {
      _badgeRefreshInboxPending  = false;
      _badgeRefreshNotifPending  = false;
      _badgeRefreshForumPending  = false;
      _badgeRefreshRewardPending = false;
      _badgeRefreshPartyPending  = false;
      _badgeRefreshPrefsPending  = false;
      return;
    }
    const jobs = [];
    if (_badgeRefreshInboxPending)  jobs.push(refreshInboxBadge());
    if (_badgeRefreshNotifPending)  jobs.push(refreshNotifBadge());
    if (_badgeRefreshForumPending)  jobs.push(refreshForumBadge());
    if (_badgeRefreshRewardPending) jobs.push(_hooks.refreshCoinsDisplay?.());
    if (_badgeRefreshPartyPending && document.getElementById('books-screen')?.style.display !== 'none') {
      jobs.push(_hooks.loadPartyInvites?.());
    }
    if (_badgeRefreshPrefsPending)  jobs.push(_hooks.syncPrefs?.());
    _badgeRefreshInboxPending  = false;
    _badgeRefreshNotifPending  = false;
    _badgeRefreshForumPending  = false;
    _badgeRefreshRewardPending = false;
    _badgeRefreshPartyPending  = false;
    _badgeRefreshPrefsPending  = false;
    await Promise.allSettled(jobs);
  }, delay);
}

// ── Notification dropdown ─────────────────────────────────────────────────────
export function _closeNotifDropdown() {
  document.getElementById('notif-dropdown').style.display = 'none';
  _notifDropdownOpen = false;
}

export function _openNotifDropdown(btn, data) {
  const dd    = document.getElementById('notif-dropdown');
  const list  = document.getElementById('notif-list');
  const empty = document.getElementById('notif-empty');

  list.innerHTML = '';
  if (!data.items.length) {
    empty.style.display = '';
  } else {
    empty.style.display = 'none';
    for (const n of data.items) {
      let iconClass = 'icon-level', iconChar = 'LVL', text = '';
      if (n.type === 'level_up') {
        iconClass = 'icon-level'; iconChar = 'LVL';
        text = `Reached <strong>Level ${n.payload.level}</strong>${n.payload.title ? ` - ${escapeHtml(n.payload.title)}` : ''}`;
      } else if (n.type === 'coin_gain') {
        iconClass = 'icon-coin'; iconChar = '◉';
        const amt = n.payload.amount;
        const coinReasonMap = {
          xp_milestone:        'XP milestone',
          level_up_coin:       'Level up reward',
          playtime_24h:        '24h playtime reward',
          book_completed:      'Book completed',
          visit_all_series:    'Series fully completed',
          visit_all_anthology: 'Anthology fully completed',
          shop_refund:         'Shop purchase refunded',
          runs_milestone:      'Completed runs milestone',
        };
        const reasonLabel = coinReasonMap[n.payload.reason] || '';
        text = `Earned <strong>${amt} Gold Coin${amt !== 1 ? 's' : ''}</strong>${reasonLabel ? ` <span style="color:#9ca3af;font-weight:normal">· ${reasonLabel}</span>` : ''}`;
      } else if (n.type === 'gc_gift') {
        iconClass = 'icon-coin'; iconChar = '◉';
        const amt = n.payload.amount;
        const msg = n.payload.message ? ` <span style="color:#9ca3af;font-weight:normal">· ${escapeHtml(n.payload.message)}</span>` : '';
        text = `You received <strong>${amt} Gold Coin${amt !== 1 ? 's' : ''}</strong> from the admin${msg}`;
      } else if (n.type === 'role_assigned') {
        iconClass = n.payload.role === 'contributor' ? 'icon-role-contributor' : 'icon-role-author';
        iconChar  = n.payload.role === 'contributor' ? '✦' : '★';
        text = `You have been designated as <strong>${n.payload.label}</strong>`;
      }
      const unseen = !n.seen;
      list.innerHTML += `<div class="notif-item${unseen ? ' notif-unseen' : ''}">
        <div class="notif-item-icon ${iconClass}">${iconChar}</div>
        <div class="notif-item-body">
          <div class="notif-item-text">${text}</div>
          <div class="notif-item-time">${_timeAgo(n.createdAt)}</div>
        </div>
        ${unseen ? '<div class="notif-unseen-dot"></div>' : ''}
      </div>`;
    }
  }

  const rect = btn.getBoundingClientRect();
  dd.style.top   = `${rect.bottom + 6}px`;
  dd.style.right = `${window.innerWidth - rect.right}px`;
  dd.style.left  = 'auto';
  dd.style.display = '';
  dd.scrollTop = 0;
  _notifDropdownOpen = true;

  if (data.unseen > 0) {
    apiFetch('/api/notifications/seen', { method: 'POST' }).catch(() => {});
    btn.classList.remove('notif-btn--active');
    btn._notifData = { unseen: 0, items: data.items.map(n => ({ ...n, seen: true })) };
  }
}

export function isNotifDropdownOpen() { return _notifDropdownOpen; }
