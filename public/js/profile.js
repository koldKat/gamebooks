// ── Profile modal, avatar crop, XP bar display ─────────────────────────────────
// Self-contained module. Imports from state.js, i18n.js, shop.js, util.js.
// To remove: delete this file, remove its import line and initProfile()/
// updateAvatarUI()/renderBooksXpSummary()/setProfileHooks() calls
// from boot.js, and delete public/css/profile.css and its <link> in index.html.

import { apiFetch, setUsername, isDemoMode, getToken, setCurrentUserLevel, getUsername } from './state.js?v=13';
import { t } from './i18n.js?v=57';
import { updateCoinsDisplay } from './shop.js?v=79';
import { escapeHtml, compressToBlob } from './util.js?v=70';

let _hooks = {};
export function setProfileHooks(h) { _hooks = h || {}; }

// ── Avatar ────────────────────────────────────────────────────────────────────

function setAvatarCircle(el, url) {
  if (!el) return;
  if (url) {
    el.style.backgroundImage = 'none';
    el.innerHTML = `<img src="${url}" alt="${t('profile.avatar_alt')}">`;
  } else {
    el.style.backgroundImage = '';
    el.innerHTML = '';
  }
}

export function updateAvatarUI(avatarUrl) {
  setAvatarCircle(document.getElementById('profile-avatar'), avatarUrl);
  setAvatarCircle(document.getElementById('profile-modal-avatar'), avatarUrl);
}

// ── XP bar display ────────────────────────────────────────────────────────────

function _xpLevelBounds(xp) {
  const n = xp <= 0 ? 0 : Math.floor((-1 + Math.sqrt(1 + 8 * xp / 1000)) / 2);
  return { levelXp: 1000 * n * (n + 1) / 2, nextLevelXp: 1000 * (n + 1) * (n + 2) / 2 };
}

function _xpLabelParts(xp, data) {
  const { levelXp, nextLevelXp } = _xpLevelBounds(xp);
  const pct   = Math.max(0, Math.min(100, Math.round(((xp - levelXp) / (nextLevelXp - levelXp)) * 100)));
  const toGo  = Math.max(0, Math.round(nextLevelXp - xp));
  const xpStr = Math.round(xp).toLocaleString();
  const fullHtml = data?.nextLevelXp != null
    ? `<span class="xp-val">${xpStr} XP</span> · ${toGo.toLocaleString()} to next LVL`
    : `<span class="xp-val">${xpStr} XP</span>`;
  const short = data?.nextLevelXp != null ? `${toGo.toLocaleString()} XP to next LVL` : `${xpStr} XP`;
  return { pct, fullHtml, short };
}

function _xpRenderPrefix(prefix, xp, data) {
  const { pct, fullHtml, short } = _xpLabelParts(xp, data);
  const fill = document.getElementById(`${prefix}-xp-bar-fill`);
  const el   = document.getElementById(`${prefix}-xp-text`);
  if (fill) fill.style.width = `${pct}%`;
  if (el) el[prefix === 'books' ? 'innerHTML' : 'textContent'] = prefix === 'books' ? fullHtml : short;
}

function _xpBoostHtml(xpBoostPct, xpFromBoostWhole) {
  return xpBoostPct > 0
    ? `<span style="color:#22d3ee">+${xpBoostPct}% boost</span> <span>(${xpFromBoostWhole.toLocaleString()} XP)</span>`
    : '';
}

function _renderBoostAmount(prefix, data, boostXp) {
  const boostEl = document.getElementById(`${prefix}-xp-boost`);
  if (!boostEl) return;
  const xpBoostPct = Number(data?.xpBoostPct) || 0;
  boostEl.innerHTML = _xpBoostHtml(xpBoostPct, Math.round(Math.max(0, boostXp)));
}

let _displayedXp      = null; // last value rendered into books/play bars (may be mid-animation)
let _displayedBoostXp = null; // last "XP earned from boost" value rendered (mirrors _displayedXp)
let _xpAnimGen    = 0;
const XP_ANIM_MS_PER_LEVEL = 100; // e.g. lvl 37 -> 3.7s; low levels earn less XP, so near-instant is fine

function _animateXpTo(toXp, data) {
  const fromXp      = _displayedXp != null ? _displayedXp : toXp;
  const toBoostXp    = Math.floor(Number(data?.xpFromBoost) || 0);
  const fromBoostXp  = _displayedBoostXp != null ? _displayedBoostXp : toBoostXp;
  const gen = ++_xpAnimGen;
  const durationMs = Math.max(0, Number(data?.level) || 0) * XP_ANIM_MS_PER_LEVEL;
  if (fromXp === toXp || durationMs <= 0) {
    _xpRenderPrefix('books', toXp, data);
    _xpRenderPrefix('play',  toXp, data);
    _renderBoostAmount('books', data, toBoostXp);
    _renderBoostAmount('play',  data, toBoostXp);
    _displayedXp = toXp;
    _displayedBoostXp = toBoostXp;
    return;
  }
  const start = performance.now();
  function step(now) {
    if (gen !== _xpAnimGen) return; // superseded by a newer update
    const t      = Math.min(1, (now - start) / durationMs);
    const current      = fromXp      + (toXp      - fromXp)      * t; // linear: a restart only changes rate, never bursts
    const currentBoost = fromBoostXp + (toBoostXp - fromBoostXp) * t;
    _xpRenderPrefix('books', current, data);
    _xpRenderPrefix('play',  current, data);
    _renderBoostAmount('books', data, currentBoost);
    _renderBoostAmount('play',  data, currentBoost);
    _displayedXp = current;
    _displayedBoostXp = currentBoost;
    if (t < 1) requestAnimationFrame(step);
    else { _displayedXp = toXp; _displayedBoostXp = toBoostXp; }
  }
  requestAnimationFrame(step);
}

function _xpApply(xp, data, fromXp = null) {
  _xpRenderPrefix('profile', xp, data); // profile bar/text always snaps instantly
  if (fromXp != null && Number.isFinite(fromXp) && fromXp !== xp) {
    _displayedXp = fromXp;
    _animateXpTo(xp, data);
  } else {
    _xpAnimGen++; // cancel any in-flight animation
    _xpRenderPrefix('books', xp, data);
    _xpRenderPrefix('play',  xp, data);
    const boostXp = Math.floor(Number(data?.xpFromBoost) || 0);
    _renderBoostAmount('books', data, boostXp);
    _renderBoostAmount('play',  data, boostXp);
    _displayedXp = xp;
    _displayedBoostXp = boostXp;
  }
}

function _hbRateText(bonusHeartbeatXp, bonusHeartbeatXpFree) {
  const rate = 1 + (bonusHeartbeatXp + bonusHeartbeatXpFree) * 0.1;
  return `+${rate % 1 === 0 ? rate : rate.toFixed(1)} heartbeat XP/min`;
}

function _renderXpSummary(prefix, data) {
  const wrap = document.getElementById(`${prefix}-xp-summary`);
  if (!wrap) return;
  if (!data || isDemoMode || !getToken()) { wrap.style.display = 'none'; return; }
  const { level = 0, title = null, bonusHeartbeatXp = 0, bonusHeartbeatXpFree = 0 } = data;
  const levelEl  = document.getElementById(`${prefix}-xp-level`);
  const titleEl  = document.getElementById(`${prefix}-xp-title`);
  const hbRateEl = document.getElementById(`${prefix}-xp-hb-rate`);
  if (!levelEl || !titleEl) return;
  levelEl.textContent = `Lvl ${level}`;
  titleEl.textContent = title || '';
  if (hbRateEl) hbRateEl.textContent = _hbRateText(bonusHeartbeatXp, bonusHeartbeatXpFree);
  if (prefix === 'play') {
    const kicker = wrap.querySelector('.play-xp-kicker');
    if (kicker) kicker.textContent = getUsername() || 'Player';
  }
  wrap.style.display = '';
}

export function renderBooksXpSummary(data, opts = {}) {
  const xp = Math.floor(Number(data?.xp) || 0);
  _xpApply(xp, data || null, opts.fromXp);
  _renderXpSummary('books', data);
  _renderXpSummary('play', data);
}

function renderXpBlock(data) {
  const { level = 0, title = null, coinsBalance = 0, xpFromBoost = 0, xpBoostPct = 0,
          totalBooks = 0, createdBooks = 0, booksPlayed = 0, totalRuns = 0, wins = 0, deaths = 0, battles = 0,
          bonusHeartbeatXp = 0, bonusHeartbeatXpFree = 0 } = data;
  const xpFromBoostWhole = Math.floor(Number(xpFromBoost) || 0);
  setCurrentUserLevel(level);
  renderBooksXpSummary(data);
  document.getElementById('profile-level-badge').textContent = `Lvl ${level}`;
  document.getElementById('profile-title-text').textContent  = title || '';
  const hbRateEl = document.getElementById('profile-xp-hb-rate');
  if (hbRateEl) hbRateEl.textContent = _hbRateText(bonusHeartbeatXp, bonusHeartbeatXpFree);
  const boostEl = document.getElementById('profile-xp-boost-earned');
  if (boostEl) boostEl.innerHTML = _xpBoostHtml(xpBoostPct, xpFromBoostWhole);
  updateCoinsDisplay(coinsBalance);
  const statsEl = document.getElementById('profile-own-stats');
  if (statsEl && totalBooks > 0) {
    statsEl.innerHTML =
      `<span class="pub-stat"><span class="pub-stat-val">${totalBooks}</span> books` +
        (createdBooks > 0 ? ` <span style="color:#6b7280;font-size:0.78em">(<span style="color:#60a5fa;font-weight:700">${createdBooks}</span> created)</span>` : '') +
      `</span>` +
      `<span class="pub-stat"><span class="pub-stat-val">${booksPlayed}</span> played</span>` +
      `<span class="pub-stat"><span class="pub-stat-val">${totalRuns}</span> runs</span>` +
      `<span class="pub-stat pub-stat-win"><span class="pub-stat-val">${wins}</span> wins</span>` +
      `<span class="pub-stat pub-stat-death"><span class="pub-stat-val">${deaths}</span> losses</span>` +
      (battles > 0 ? `<span class="pub-stat pub-stat-battle"><span class="pub-stat-val">${battles}</span> ${t('pub.stat.battle_deaths')}</span>` : '');
  } else if (statsEl) {
    statsEl.innerHTML = '';
  }
}

// ── Image compression ─────────────────────────────────────────────────────────
// The full load+resize+compress pipeline (compressImage) now lives in util.js,
// shared with feedback.js/inbox.js/add-book.js/edit-book.js - this used to be
// a second, separately-maintained copy here that had quietly drifted (gave up
// and returned null sooner than util.js's copy on a stubborn image). Only
// compressToBlob is still needed directly in this file, for confirmCrop's
// already-drawn canvas below.

const IMG_MAX_BYTES = 256 * 1024;

// ── Crop ──────────────────────────────────────────────────────────────────────

const CROP_SIZE = 320;

let _cropImage   = null;
let _cropOffsetX = 0;
let _cropOffsetY = 0;
let _cropScale   = 1;
let _cropDragging  = false;
let _cropDragStartX = 0;
let _cropDragStartY = 0;
let _cropDragOriginX = 0;
let _cropDragOriginY = 0;

function drawCrop() {
  const canvas = document.getElementById('crop-canvas');
  const ctx    = canvas.getContext('2d');
  ctx.clearRect(0, 0, CROP_SIZE, CROP_SIZE);
  if (!_cropImage) return;
  ctx.drawImage(_cropImage, _cropOffsetX, _cropOffsetY, _cropImage.width * _cropScale, _cropImage.height * _cropScale);
}

function clampCropOffsets() {
  const w = _cropImage.width  * _cropScale;
  const h = _cropImage.height * _cropScale;
  if (w < CROP_SIZE) { _cropScale = CROP_SIZE / _cropImage.width;  clampCropOffsets(); return; }
  if (h < CROP_SIZE) { _cropScale = CROP_SIZE / _cropImage.height; clampCropOffsets(); return; }
  _cropOffsetX = Math.min(0, Math.max(CROP_SIZE - w, _cropOffsetX));
  _cropOffsetY = Math.min(0, Math.max(CROP_SIZE - h, _cropOffsetY));
}

function openCropModal(file) {
  const reader = new FileReader();
  reader.onload = ev => {
    const img = new Image();
    img.onload = () => {
      _cropImage   = img;
      _cropScale   = Math.max(CROP_SIZE / img.width, CROP_SIZE / img.height);
      _cropOffsetX = (CROP_SIZE - img.width  * _cropScale) / 2;
      _cropOffsetY = (CROP_SIZE - img.height * _cropScale) / 2;
      const canvas = document.getElementById('crop-canvas');
      canvas.width  = CROP_SIZE;
      canvas.height = CROP_SIZE;
      drawCrop();
      document.getElementById('crop-modal-overlay').classList.add('active');
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
}

function closeCropModal() {
  const overlay = document.getElementById('crop-modal-overlay');
  overlay.classList.remove('active');
  overlay._cropAc?.abort();
  overlay._cropAc = null;
  _cropImage = null;
}

async function confirmCrop() {
  if (!_cropImage) return;
  const out = document.createElement('canvas');
  out.width  = 512;
  out.height = 512;
  const ctx = out.getContext('2d');
  const sx  = -_cropOffsetX / _cropScale;
  const sy  = -_cropOffsetY / _cropScale;
  const sw  =  CROP_SIZE    / _cropScale;
  ctx.drawImage(_cropImage, sx, sy, sw, sw, 0, 0, 512, 512);
  const blob = await compressToBlob(out, IMG_MAX_BYTES);
  if (!blob) return;
  closeCropModal();
  try {
    const res  = await apiFetch('/api/profile/avatar', { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: blob });
    const data = await res.json();
    if (res.ok) updateAvatarUI(data.avatarUrl ? `${data.avatarUrl}?t=${Date.now()}` : null);
  } catch (_) {
    document.getElementById('profile-error').textContent = t('err.avatar');
  }
}

// ── Profile modal ─────────────────────────────────────────────────────────────

export async function openProfileModal() {
  document.getElementById('profile-error').textContent = '';
  document.getElementById('profile-current-password').value = '';
  document.getElementById('profile-new-password').value     = '';
  document.getElementById('profile-confirm-password').value = '';
  try {
    const res  = await apiFetch('/api/profile');
    const data = await res.json();
    _hooks.onRewardSnapshot?.(data);
    document.getElementById('profile-username-input').value = data.username || '';
    document.getElementById('profile-public-cb').checked    = data.publicProfile || false;
    document.getElementById('profile-hide-feed-cb').checked = data.hideFeed || false;
    const emailInput = document.getElementById('profile-email-input');
    if (emailInput) { emailInput.value = data.email || ''; document.getElementById('profile-email-error').textContent = ''; }
    updateAvatarUI(data.avatarUrl);
    renderXpBlock(data);
    const dnRow = document.getElementById('profile-display-name-row');
    if (dnRow) {
      dnRow.style.display = data.isAuthor ? '' : 'none';
      const dnInput = document.getElementById('profile-display-name-input');
      if (dnInput) dnInput.value = data.displayName || '';
    }
  } catch (_) {
    document.getElementById('profile-error').textContent = t('profile.load_failed');
  }
  document.getElementById('profile-modal-overlay').classList.add('active');
  document.getElementById('profile-username-input').focus();
}

export function closeProfileModal() {
  document.getElementById('profile-modal-overlay').classList.remove('active');
}

async function saveProfile() {
  const errEl = document.getElementById('profile-error');
  errEl.textContent = '';
  const username        = document.getElementById('profile-username-input').value.trim();
  const currentPassword = document.getElementById('profile-current-password').value;
  const newPassword     = document.getElementById('profile-new-password').value;
  const confirmPassword = document.getElementById('profile-confirm-password').value;
  if (newPassword && newPassword !== confirmPassword) { errEl.textContent = t('err.passwords_mismatch'); return; }
  const body = { username, publicProfile: document.getElementById('profile-public-cb').checked, hideFeed: document.getElementById('profile-hide-feed-cb').checked };
  if (newPassword) { body.currentPassword = currentPassword; body.newPassword = newPassword; }
  const dnInput = document.getElementById('profile-display-name-input');
  if (dnInput) body.displayName = dnInput.value.trim();
  const emailInput = document.getElementById('profile-email-input');
  if (emailInput) body.email = emailInput.value.trim();
  try {
    const res  = await apiFetch('/api/profile', { method: 'PATCH', body: JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok) {
      const emailErrEl = document.getElementById('profile-email-error');
      if (emailErrEl) emailErrEl.textContent = data.errors?.email || '';
      const otherErrors = Object.entries(data.errors || {}).filter(([k]) => k !== 'email').map(([, v]) => v).join(' ');
      errEl.textContent = otherErrors || data.error || t('err.save');
      return;
    }
    const emailErrEl = document.getElementById('profile-email-error');
    if (emailErrEl) emailErrEl.textContent = '';
    _hooks.onRewardSnapshot?.(data);
    setUsername(data.username);
    _hooks.onSaveSuccess?.(data);
    closeProfileModal();
  } catch (_) {
    errEl.textContent = t('err.connect');
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────

export function initProfile() {
  document.getElementById('profile-btn')?.addEventListener('click', openProfileModal);
  document.getElementById('profile-cancel-btn')?.addEventListener('click', closeProfileModal);
  document.getElementById('profile-modal-close')?.addEventListener('click', closeProfileModal);
  document.getElementById('profile-modal-overlay')?.addEventListener('click', e => {
    if (e.target === e.currentTarget && _hooks.getMousedownOverlay?.() === e.currentTarget) closeProfileModal();
  });
  document.getElementById('profile-save-btn')?.addEventListener('click', saveProfile);
  document.getElementById('profile-username-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter')  saveProfile();
    if (e.key === 'Escape') closeProfileModal();
  });
  document.getElementById('profile-change-avatar-btn')?.addEventListener('click', () =>
    document.getElementById('profile-avatar-file').click()
  );
  document.getElementById('profile-avatar-file')?.addEventListener('change', e => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    openCropModal(file);
  });

  document.getElementById('crop-cancel-btn')?.addEventListener('click', closeCropModal);
  document.getElementById('crop-confirm-btn')?.addEventListener('click', confirmCrop);

  const cropViewport = document.getElementById('crop-viewport');
  if (cropViewport) {
    function onCropPointerDown(e) {
      e.preventDefault();
      _cropDragging = true;
      const pt = e.touches ? e.touches[0] : e;
      _cropDragStartX  = pt.clientX;
      _cropDragStartY  = pt.clientY;
      _cropDragOriginX = _cropOffsetX;
      _cropDragOriginY = _cropOffsetY;
    }
    function onCropPointerMove(e) {
      if (!_cropDragging || !_cropImage) return;
      e.preventDefault();
      const pt = e.touches ? e.touches[0] : e;
      _cropOffsetX = _cropDragOriginX + (pt.clientX - _cropDragStartX);
      _cropOffsetY = _cropDragOriginY + (pt.clientY - _cropDragStartY);
      clampCropOffsets();
      drawCrop();
    }
    function onCropPointerUp() { _cropDragging = false; }

    const ac = new AbortController();
    const sig = { signal: ac.signal };
    cropViewport.addEventListener('mousedown',  onCropPointerDown);
    cropViewport.addEventListener('touchstart', onCropPointerDown, { passive: false });
    window.addEventListener('mousemove',  onCropPointerMove, sig);
    window.addEventListener('touchmove',  onCropPointerMove, { ...sig, passive: false });
    window.addEventListener('mouseup',    onCropPointerUp,   sig);
    window.addEventListener('touchend',   onCropPointerUp,   sig);
    document.getElementById('crop-modal-overlay')._cropAc = ac;
  }
}
