'use strict';

const SITE = 'https://koldkat.net';

const { escapeHtml: esc } = require('./html-escape');
function fmtDate(ts) {
  if (!ts) return '';
  return new Date(ts * 1000).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
}
function fmtRelative(ts) {
  if (!ts) return '';
  const diff = Math.floor(Date.now() / 1000) - ts;
  if (diff < 60)     return 'just now';
  if (diff < 3600)   return Math.floor(diff / 60)   + 'm ago';
  if (diff < 86400)  return Math.floor(diff / 3600)  + 'h ago';
  if (diff < 604800) return Math.floor(diff / 86400) + 'd ago';
  return fmtDate(ts);
}
// Same markup engine as announcements (public/js/feed.js's formatAnnBody,
// duplicated again in admin/js/announcements.js) - kept in sync by hand
// since this one runs server-side against a stored post body, not client-side.
const FORUM_COLORS = {
  red: '#f87171', orange: '#fb923c', amber: '#fbbf24', green: '#4ade80',
  teal: '#2dd4bf', blue: '#60a5fa', purple: '#a78bfa', pink: '#f472b6',
};
function renderBody(s) {
  return esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g,     '<em>$1</em>')
    .replace(/__(.+?)__/g,     '<u>$1</u>')
    .replace(/~~(.+?)~~/g,     '<s>$1</s>')
    .replace(/\{color:(red|orange|amber|green|teal|blue|purple|pink)\}(.+?)\{\/color\}/g,
      (_, color, text) => `<span style="color:${FORUM_COLORS[color]}">${text}</span>`)
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/\n/g, '<br>');
}

const IMG_EXTS_F = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif']);
function renderAttachments(list) {
  if (!list?.length) return '';
  const items = list.map(a => {
    const ext = a.filename.slice(a.filename.lastIndexOf('.')).toLowerCase();
    if (IMG_EXTS_F.has(ext))
      return '<a href="/attachments/' + esc(a.filename) + '" target="_blank" class="att-thumb-wrap"><img src="/attachments/' + esc(a.filename) + '" class="att-thumb" alt="' + esc(a.original_name) + '" loading="lazy"></a>';
    return '<a href="/attachments/' + esc(a.filename) + '" target="_blank" class="att-file-link">' + esc(a.original_name) + '</a>';
  }).join('');
  return '<div class="msg-attachments" style="margin-top:0.6rem;padding-top:0.5rem;border-top:1px solid #374151">' + items + '</div>';
}
function computeLevel(xp) {
  if ((xp || 0) <= 0) return 0;
  return Math.min(Math.floor((-1 + Math.sqrt(1 + 8 * xp / 1000)) / 2), 100);
}
function userPanel(u) {
  const name    = u.username || '[deleted]';
  const level   = u.xp != null ? computeLevel(u.xp) : null;
  const initial = name[0].toUpperCase();
  const avatar  = u.avatar_path
    ? '<img class="pu-avatar" src="/avatars/' + esc(u.avatar_path) + '" alt="" loading="lazy">'
    : '<div class="pu-avatar pu-avatar-ph">' + esc(initial) + '</div>';
  const nameEl  = u.public_profile
    ? '<span class="pu-name pu-public">' + esc(name) + '</span>'
    : '<span class="pu-name">' + esc(name) + '</span>';
  const lvlEl   = level !== null ? '<span class="pu-lvl">Lvl ' + level + '</span>' : '';
  return '<div class="user-card">' + avatar + nameEl + lvlEl + '</div>';
}

const CSS = `
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body {
  background: #111827; color: #e5e7eb;
  font-family: 'Segoe UI', system-ui, sans-serif;
  font-size: 15px; line-height: 1.55; padding: 0.3rem 0.35rem 0.75rem;
}
a { color: #60a5fa; text-decoration: none; }
a:hover { text-decoration: underline; }
.nav-btn {
  background: none; border: none; padding: 0; margin: 0;
  color: #60a5fa; font-family: inherit; font-size: inherit;
  cursor: pointer; text-align: left; display: inline;
}
.nav-btn:hover { text-decoration: underline; }
.site-header {
  max-width: 100%; margin-bottom: 0.45rem;
  border-bottom: 1px solid #374151; padding-bottom: 0.28rem;
  display: flex; align-items: baseline; gap: 0.55rem; flex-wrap: wrap;
}
.site-header h1 { font-size: 1rem; color: #f3f4f6; }
.site-header .sub { font-size: 0.78rem; color: #9ca3af; }
.site-header .back {
  font-size: 0.74rem; margin-left: auto;
  background: none; border: none; padding: 0;
  color: #60a5fa; font-family: inherit; cursor: pointer;
}
.site-header .back:hover { text-decoration: underline; }
.wrap { max-width: 100%; padding: 0 0.5rem; }
.cat-grid {
  display: flex; flex-direction: column; gap: 0.35rem;
}
.cat-card {
  background: #1f2937; border: 1px solid #374151; border-radius: 8px;
  padding: 0.58rem 0.65rem; display: block; color: inherit;
  transition: border-color 0.15s; cursor: pointer;
}
.cat-card:hover { border-color: #4b5563; }
.cat-name { font-size: 0.95rem; font-weight: 700; color: #f3f4f6; margin-bottom: 0.25rem; }
.cat-desc { font-size: 0.8rem; color: #9ca3af; margin-bottom: 0.3rem; }
.cat-stats { font-size: 0.75rem; color: #6b7280; }
.cat-stats .sep { margin: 0 0.4rem; }
.thread-list { display: flex; flex-direction: column; gap: 0.35rem; }
.thread-card {
  background: #1f2937; border: 1px solid #374151; border-radius: 8px;
  padding: 0.56rem 0.65rem; display: grid;
  grid-template-columns: 1fr auto; gap: 0.2rem 1rem;
  transition: border-color 0.15s;
  position: relative;
}
.thread-card:hover { border-color: #4b5563; }
.thread-title {
  font-size: 0.92rem; font-weight: 600; color: #f3f4f6; grid-column: 1;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.thread-title .nav-btn { color: inherit; font-weight: inherit; }
.thread-title .nav-btn:hover { color: #60a5fa; text-decoration: none; }
/* Themed replacement for the native title="" tooltip - shows the full,
   untruncated title on hover, matching the rest of the forum's dark theme
   instead of the browser's plain default tooltip box. Positioned relative to
   .thread-card, NOT .thread-title - .thread-title needs its own
   overflow:hidden for the ellipsis truncation above, and an element's own
   overflow:hidden clips any absolutely-positioned descendant (including
   ::after) that renders outside its box, even one explicitly positioned to
   escape via bottom: calc(100% + Npx). .thread-card has no overflow rule of
   its own, so it doesn't clip the tooltip. */
.thread-card[data-tooltip]:hover::after {
  content: attr(data-tooltip);
  position: absolute;
  bottom: calc(100% + 6px);
  left: 0.65rem;
  background: #1f2937;
  border: 1px solid #374151;
  color: #f3f4f6;
  padding: 0.35rem 0.55rem;
  border-radius: 6px;
  font-size: 0.78rem;
  font-weight: 500;
  white-space: nowrap;
  width: max-content;
  box-shadow: 0 8px 20px rgba(0,0,0,0.5);
  z-index: 20;
  pointer-events: none;
}
.thread-meta { font-size: 0.75rem; color: #6b7280; grid-column: 1; }
.thread-meta .author { color: #9ca3af; }
.thread-stats {
  grid-column: 2; grid-row: 1 / 3; display: flex; flex-direction: column;
  align-items: flex-end; justify-content: center; gap: 0.2rem;
  font-size: 0.75rem; color: #6b7280; white-space: nowrap;
}
.cat-header {
  margin-bottom: 0;
}
.cat-header-name {
  font-size: 1.05rem; font-weight: 700; color: #f3f4f6; margin-bottom: 0.2rem;
}
.cat-header-desc { font-size: 0.82rem; color: #9ca3af; }
.badge {
  display: inline-flex; align-items: center;
  font-size: 0.68rem; padding: 0.1rem 0.4rem; border-radius: 4px;
  font-weight: 600; letter-spacing: 0.03em; margin-right: 0.25rem;
}
.badge-pin  { background: #1e3a5f; color: #60a5fa; }
.badge-lock { background: #1f2937; color: #9ca3af; border: 1px solid #374151; }
.post-wrap {
  display: flex; gap: 0.6rem; margin-bottom: 0.6rem; align-items: flex-start;
}
.post-card {
  background: #1f2937; border: 1px solid #374151; border-radius: 8px;
  padding: 0.9rem 1rem; flex: 1; min-width: 0;
}
.post-card.op { border-left: 3px solid #1d4ed8; }
.post-content { min-width: 0; }
.post-meta {
  font-size: 0.75rem; color: #6b7280; margin-bottom: 0.6rem;
  display: flex; gap: 0.75rem; flex-wrap: wrap; align-items: center;
}
.post-body { font-size: 0.88rem; color: #d1d5db; white-space: pre-wrap; word-break: break-word; }
.post-body.deleted { color: #4b5563; font-style: italic; }
.post-actions { margin-top: 0.65rem; display: flex; gap: 0.5rem; flex-wrap: wrap; }
.user-card {
  width: 80px; flex-shrink: 0;
  background: #1f2937; border: 1px solid #374151; border-radius: 8px;
  padding: 0.75rem 0.5rem;
  display: flex; flex-direction: column;
  align-items: center; text-align: center; gap: 0.35rem;
}
.pu-avatar {
  width: 42px; height: 42px; border-radius: 50%; object-fit: cover;
  background: #374151; display: block;
}
.pu-avatar-ph {
  line-height: 42px; font-size: 1rem; color: #9ca3af;
  font-weight: 700; user-select: none;
}
.pu-name {
  font-size: 0.72rem; color: #d1d5db; font-weight: 600;
  word-break: break-all; line-height: 1.3;
}
.pu-public { color: #60a5fa; }
.pu-lvl { font-size: 0.68rem; color: #6b7280; }
@media (max-width: 480px) {
  .post-wrap { flex-direction: column; }
  .user-card { flex-direction: row; width: auto; padding: 0.5rem 0.75rem; gap: 0.5rem; align-items: center; text-align: left; }
}
.thread-page-title {
  font-size: 1.05rem; font-weight: 700; color: #f3f4f6;
  margin-bottom: 1rem; word-break: break-word;
}
.breadcrumb { font-size: 0.8rem; color: #6b7280; margin-bottom: 0.5rem; }
.breadcrumb a { color: #60a5fa; }
.status-badges { margin-bottom: 0.75rem; }
.forum-form {
  background: #1f2937; border: 1px solid #374151; border-radius: 8px;
  padding: 0.6rem 0.65rem; margin-top: 0.5rem;
}
.forum-form h3 { font-size: 0.82rem; color: #9ca3af; margin-bottom: 0.4rem; text-transform: uppercase; letter-spacing: 0.05em; }
.forum-input {
  width: 100%; background: #111827; color: #d1d5db;
  border: 1px solid #374151; border-radius: 6px;
  padding: 0.4rem 0.55rem; font-size: 0.85rem; font-family: inherit;
  outline: none; margin-bottom: 0.35rem; transition: border-color 0.15s;
}
.forum-input:focus { border-color: #6b7280; }
textarea.forum-input { resize: vertical; min-height: var(--ta-min-h, 100px); }
.forum-btn {
  background: #1d4ed8; color: #eff6ff; border: 1px solid #1e40af;
  border-radius: 6px; padding: 0.38rem 0.9rem; font-size: 0.82rem;
  font-family: inherit; cursor: pointer; transition: background 0.12s;
}
.forum-btn:hover   { background: #2563eb; }
.forum-btn:disabled { opacity: 0.5; cursor: default; }
.forum-btn-cancel {
  background: transparent; color: #6b7280; border: 1px solid #374151;
  border-radius: 6px; padding: 0.38rem 0.9rem; font-size: 0.82rem;
  font-family: inherit; cursor: pointer;
}
.forum-btn-cancel:hover { color: #9ca3af; }
.forum-btn-del {
  background: transparent; color: #f87171; border: 1px solid #7f1d1d;
  border-radius: 6px; padding: 0.25rem 0.65rem; font-size: 0.75rem;
  font-family: inherit; cursor: pointer; transition: background 0.12s;
}
.forum-btn-del:hover { background: #7f1d1d; }
.forum-btn-admin {
  background: transparent; color: #fbbf24; border: 1px solid #78350f;
  border-radius: 6px; padding: 0.25rem 0.65rem; font-size: 0.75rem;
  font-family: inherit; cursor: pointer; transition: background 0.12s;
}
.forum-btn-admin:hover { background: #78350f; }
.forum-err { font-size: 0.8rem; color: #f87171; min-height: 1rem; }
.forum-btn-edit {
  background: transparent; color: #9ca3af; border: 1px solid #374151;
  border-radius: 6px; padding: 0.25rem 0.65rem; font-size: 0.75rem;
  font-family: inherit; cursor: pointer; transition: color 0.12s, border-color 0.12s;
}
.forum-btn-edit:hover { color: #d1d5db; border-color: #4b5563; }
.post-edited { color: #4b5563; font-style: italic; font-size: 0.72rem; }
.att-pick-btn { display:inline-flex;align-items:center;gap:0.3rem;padding:0.22rem 0.55rem;border:1px dashed #374151;border-radius:4px;font-size:0.78rem;color:#6b7280;cursor:pointer;font-family:inherit;background:none;transition:border-color 0.15s,color 0.15s; }
.att-pick-btn:hover { border-color:#4b5563;color:#9ca3af; }
.att-list { display:flex;flex-wrap:wrap;gap:0.35rem;min-height:0; }
.att-item { display:flex;align-items:center;gap:0.3rem;background:#1f2937;border:1px solid #374151;border-radius:4px;padding:0.18rem 0.4rem;font-size:0.75rem;color:#9ca3af;max-width:200px; }
.att-item.att-uploading { color:#6b7280; }
.att-item.att-error { border-color:#ef4444;color:#f87171; }
.att-item-name { overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0; }
.att-item-rm { background:none;border:none;color:#4b5563;cursor:pointer;padding:0 0.15rem;font-size:0.85rem;line-height:1;flex-shrink:0; }
.att-item-rm:hover { color:#9ca3af; }
.att-thumb-wrap { display:block;line-height:0; }
.att-thumb { max-width:180px;max-height:130px;border-radius:4px;object-fit:cover;border:1px solid #374151; }
.att-file-link { display:inline-flex;align-items:center;gap:0.3rem;font-size:0.75rem;color:#60a5fa;text-decoration:none;padding:0.18rem 0.45rem;background:#1f2937;border:1px solid #374151;border-radius:4px; }
.att-file-link:hover { text-decoration:underline;border-color:#4b5563; }
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: #111827; }
::-webkit-scrollbar-thumb { background: #374151; border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: #4b5563; }
* { scrollbar-width: thin; scrollbar-color: #374151 #111827; }
@keyframes forum-unread-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(74, 222, 128, 0); }
  50%       { box-shadow: 0 0 0 4px rgba(74, 222, 128, 0.2); }
}
.thread-card.has-unread, .cat-card.has-unread {
  border-left: 3px solid #16a34a;
  animation: forum-unread-pulse 2s ease-in-out infinite;
}
.post-card.is-new { border-left: 3px solid #16a34a; animation: forum-unread-pulse 2s ease-in-out infinite; }
/* Same reduce-motion opt-out as the main app (public/css/reduce-motion.css) -
   this page is a separate document (served in its own iframe), so it can't
   see the parent's body.reduce-motion class directly and has to re-check the
   same localStorage flag itself (see the body.reduce-motion.<script> below). */
body.reduce-motion .thread-card.has-unread,
body.reduce-motion .cat-card.has-unread,
body.reduce-motion .post-card.is-new {
  animation: none !important;
}
.unread-dot {
  display: inline-block; width: 7px; height: 7px; border-radius: 50%;
  background: #4ade80; margin-left: 0.45rem; vertical-align: middle; flex-shrink: 0;
}
.auth-notice {
  font-size: 0.82rem; color: #6b7280; margin-top: 1rem;
  padding: 0.6rem 0.8rem; border: 1px solid #374151;
  border-radius: 6px; text-align: center;
}
.auth-notice a { color: #60a5fa; }
.empty { color: #6b7280; font-size: 0.85rem; text-align: center; padding: 2.5rem 0; }
.error-page { text-align: center; padding: 3rem 0; color: #6b7280; }
.error-page h2 { color: #f3f4f6; margin-bottom: 0.5rem; }
.conf-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.7);
  z-index: 1000; display: flex; align-items: center;
  justify-content: center; padding: 1rem;
}
.conf-box {
  background: #1f2937; border: 1px solid #374151; border-radius: 8px;
  padding: 1.25rem 1.25rem 1rem; max-width: 380px; width: 100%;
}
.conf-msg { color: #d1d5db; font-size: 0.88rem; margin-bottom: 1rem; }
.conf-btns { display: flex; justify-content: flex-end; gap: 0.5rem; }
@media (max-width: 500px) {
  .thread-card { grid-template-columns: 1fr; }
  .thread-stats { grid-column: 1; flex-direction: row; justify-content: flex-start; }
}
`;

const CONFIRM_JS = `
function showConfirm(msg, onOk) {
  var ov = document.createElement('div');
  ov.className = 'conf-overlay';
  ov.innerHTML = '<div class="conf-box"><p class="conf-msg">' + msg + '</p>' +
    '<div class="conf-btns">' +
    '<button class="forum-btn-del" id="conf-ok">Confirm</button>' +
    '<button class="forum-btn-cancel" id="conf-cancel">Cancel</button>' +
    '</div></div>';
  document.body.appendChild(ov);
  ov.querySelector('#conf-cancel').onclick = function() { ov.remove(); };
  ov.querySelector('#conf-ok').onclick = function() { ov.remove(); onOk(); };
}
`;

function shell(title, description, canonical, bodyHtml) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <link rel="canonical" href="${SITE}${canonical}">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <meta name="robots" content="index, follow">
  <style>${CSS}</style>
</head>

<body>
<script>if (localStorage.getItem('reduce-motion') === '1') document.body.classList.add('reduce-motion');</script>
<script>
(function() {
  // Drives textarea.forum-input's min-height (see --ta-min-h below). Deliberately
  // NOT a plain vh unit: #forum-modal-frame's own height is set by the parent
  // based on THIS page's measured content height (see reportHeight() further
  // down) - if the textarea sized itself off the iframe's own vh, growing the
  // iframe would grow the textarea, which grows the measured content, which
  // grows the iframe again, settling only after several visibly jerky resize
  // steps. Using the outer (parent) window's height instead is a value that
  // never changes as a side effect of this page's own layout, breaking the loop.
  // Computed once at load rather than kept live via a window.parent resize
  // listener - a listener registered on the (persistent) parent window from
  // this (destroyed-on-every-navigation) iframe document would leak one
  // stale listener per page the user navigates to inside the forum.
  var outerH = (window.parent && window.parent !== window) ? window.parent.innerHeight : window.innerHeight;
  document.documentElement.style.setProperty('--ta-min-h', Math.max(100, outerH * 0.3) + 'px');
})();
</script>
${bodyHtml}
<script>
(function() {
  function openAppInParent(ev) {
    if (window.parent && window.parent !== window) {
      ev.preventDefault();
      window.parent.postMessage({ type: 'gamebooks-open-app' }, window.location.origin);
      return false;
    }
    window.location.href = '/';
    return false;
  }
  document.addEventListener('click', function(ev) {
    var link = ev.target.closest('[data-open-app], a[href="/"]');
    if (!link) return;
    openAppInParent(ev);
  });
  window.__gamebooksOpenApp = openAppInParent;
})();
</script>
</body>
</html>`;
}

function renderForumIndex(categories) {
  const cards = categories.length === 0
    ? '<p class="empty">No categories yet.</p>'
    : categories.map(c => {
        const threadStr = c.thread_count === 1 ? '1 thread' : (c.thread_count || 0) + ' threads';
        const lastStr   = c.last_post_at ? 'last post ' + fmtRelative(c.last_post_at) : 'no posts yet';
        return '<div class="cat-card" data-last-post-at="' + (c.last_post_at || 0) + '" onclick="location.href=\'/forum/c/' + esc(c.slug) + '\'">'
          + '<div class="cat-name">' + esc(c.name) + '</div>'
          + '<div class="cat-desc">' + esc(c.description || '') + '</div>'
          + '<div class="cat-stats">' + threadStr + '<span class="sep">·</span>' + lastStr + '</div>'
          + '</div>';
      }).join('\n');

  const body = `
  <header class="site-header">
    <h1>Gamebook Tracker</h1>
    <span class="sub">Forum</span>
  </header>
  <main class="wrap">
    <div class="cat-grid">
${cards}
    </div>
  </main>
  <script>
  (async function() {
    var tok = localStorage.getItem('gamebook_auth_token');
    if (!tok) return;
    try {
      var r = await fetch('/api/forum/latest', { headers: { 'Authorization': 'Bearer ' + tok } });
      var d = await r.json();
      var seen = d.userSeen || 0;
      document.querySelectorAll('.cat-card[data-last-post-at]').forEach(function(card) {
        if (parseInt(card.dataset.lastPostAt, 10) > seen) card.classList.add('has-unread');
      });
    } catch(e) {}
  })();
  </script>`;

  return shell(
    'Forum - Gamebook Tracker',
    'Community forum for Gamebook Tracker - discuss gamebooks, share playthroughs, and connect with other readers.',
    '/forum',
    body
  );
}

function renderForumCategory(category, threads) {
  if (!category) {
    return shell('Not Found - Forum', '', '/forum', `
  <header class="site-header">
    <h1>Gamebook Tracker</h1>
    <span class="sub">Forum</span>
    <button class="back" onclick="location.href='/forum'">← Forum</button>
  </header>
  <main class="wrap">
    <div class="error-page"><h2>Category not found</h2><p><button class="nav-btn" onclick="location.href='/forum'">Back to forum</button></p></div>
  </main>`);
  }

  const threadCards = threads.length === 0
    ? '<p class="empty">No threads yet. Be the first to post!</p>'
    : threads.map(t => {
        const badges = (t.is_pinned ? '<span class="badge badge-pin">pinned</span>' : '')
                     + (t.is_locked ? '<span class="badge badge-lock">locked</span>' : '');
        const replies = t.reply_count + (t.reply_count === 1 ? ' reply' : ' replies');
        return '<div class="thread-card" data-thread-id="' + t.id + '" data-last-post-at="' + (t.last_post_at || 0) + '" data-tooltip="' + esc(t.title) + '">'
          + '<div class="thread-title">' + badges + '<a class="nav-btn" href="/forum/thread/' + t.id + '">' + esc(t.title) + '</a></div>'
          + '<div class="thread-meta">by <span class="author">' + esc(t.username || '[deleted]') + '</span> · ' + fmtDate(t.created_at) + '</div>'
          + '<div class="thread-stats"><span>' + replies + '</span><span>last: ' + fmtRelative(t.last_post_at) + '</span></div>'
          + '</div>';
      }).join('\n');

  const body = `
  <header class="site-header">
    <h1>Gamebook Tracker</h1>
    <span class="sub">Forum</span>
    <button class="back" onclick="location.href='/forum'">← Forum</button>
  </header>
  <main class="wrap">
    <div class="breadcrumb"><button class="nav-btn" onclick="location.href='/forum'">Forum</button> › ${esc(category.name)}</div>
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:1rem">
      <div class="cat-header">
        <div class="cat-header-name">${esc(category.name)}</div>
        <div class="cat-header-desc">${esc(category.description || '')}</div>
      </div>
      <div id="new-thread-wrap" style="display:none;flex-shrink:0;margin-left:1rem">
        <button class="forum-btn" id="new-thread-btn">+ New Thread</button>
      </div>
    </div>
    <div id="new-thread-form-wrap">
      <div class="forum-form" id="new-thread-form" style="display:none">
        <h3>New Thread</h3>
        <input class="forum-input" id="thread-title" type="text" inputmode="text" placeholder="Title" autocomplete="off" spellcheck="true" maxlength="200">
        <textarea class="forum-input" id="thread-body" placeholder="Write something\u2026" spellcheck="true" maxlength="20000"></textarea>
        <div style="display:flex;flex-wrap:wrap;gap:0.5rem;align-items:center">
          <label style="cursor:pointer" for="thread-file-input"><span class="att-pick-btn">+ Attach</span></label>
          <input type="file" id="thread-file-input" multiple style="display:none" accept="image/*,.pdf,.txt,.md,.csv,.json,.xml,.zip,.7z,.rar,.gz">
          <div id="thread-att-list" class="att-list" style="flex:1"></div>
          <span class="forum-err" id="thread-err"></span>
          <button class="forum-btn" id="thread-submit">Post</button>
          <button class="forum-btn-cancel" id="thread-cancel">Cancel</button>
        </div>
      </div>
    </div>
    <div class="thread-list">
${threadCards}
    </div>
    <div id="auth-notice-wrap"></div>
  </main>
  <script>
  var CATEGORY_ID = ${category.id};
  ${CONFIRM_JS}
  (async function() {
    var token = localStorage.getItem('gamebook_auth_token');
    var noticeWrap = document.getElementById('auth-notice-wrap');
    if (!token) {
      noticeWrap.innerHTML = '<p class="auth-notice">Log in to the <a href="/" data-open-app="1">app</a> to post.</p>';
      return;
    }
    var r, me;
    try { r = await fetch('/api/forum/me', { headers: { 'Authorization': 'Bearer ' + token } }); } catch(e) { return; }
    if (!r.ok) { noticeWrap.innerHTML = '<p class="auth-notice">Log in to the <a href="/" data-open-app="1">app</a> to post.</p>'; return; }
    me = await r.json();

    document.getElementById('new-thread-wrap').style.display = '';
    var toggleBtn = document.getElementById('new-thread-btn');
    var form      = document.getElementById('new-thread-form');

    var _threadAttIds = [];
    var _tImgExts = new Set(['.jpg','.jpeg','.png','.gif','.webp','.avif']);
    var _tImgMax  = 512 * 1024;
    function _tAddAttItem(name) {
      var c = document.getElementById('thread-att-list');
      var d = document.createElement('div');
      d.className = 'att-item att-uploading';
      var safe = name.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
      d.innerHTML = '<span class="att-item-name">' + safe + '</span>'
        + '<button class="att-item-rm" title="Remove">\u2715</button>';
      c.appendChild(d); return d;
    }
    function _tCompressToBlob(canvas, maxB) {
      return new Promise(function(res) {
        var tryQ = function(q) {
          canvas.toBlob(function(blob) {
            if (!blob) { res(null); return; }
            if (blob.size <= maxB || q <= 0.1) res(blob);
            else tryQ(+(q-0.1).toFixed(1));
          }, 'image/jpeg', q);
        };
        tryQ(0.92);
      });
    }
    function _tCompressImg(file) {
      var maxDim = 1200;
      return new Promise(function(resolve, reject) {
        var img = new Image();
        var url = URL.createObjectURL(file);
        img.onload = function() {
          try {
            URL.revokeObjectURL(url);
            var canvas = document.createElement('canvas');
            var w = img.naturalWidth, h = img.naturalHeight;
            if (w > maxDim || h > maxDim) {
              var r = Math.min(maxDim/w, maxDim/h); w = Math.round(w*r); h = Math.round(h*r);
            }
            canvas.width = w; canvas.height = h;
            var ctx = canvas.getContext('2d');
            if (!ctx) { resolve(null); return; }
            ctx.drawImage(img, 0, 0, w, h);
            _tCompressToBlob(canvas, _tImgMax).then(resolve).catch(reject);
          } catch(e) { reject(e); }
        };
        img.onerror = reject; img.src = url;
      });
    }
    function _tClearAtts() {
      _threadAttIds = [];
      document.getElementById('thread-att-list').innerHTML = '';
    }
    document.getElementById('thread-file-input').addEventListener('change', async function() {
      for (var fi = 0; fi < this.files.length; fi++) {
        var file = this.files[fi];
        var item = _tAddAttItem(file.name);
        try {
          var ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
          var bdata;
          if (_tImgExts.has(ext) && file.size > _tImgMax) {
            var blob = await _tCompressImg(file); bdata = blob || file;
          } else { bdata = file; }
          var uRes = await fetch('/api/attachments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/octet-stream', 'X-Filename': encodeURIComponent(file.name), 'Authorization': 'Bearer ' + token },
            body: bdata
          });
          if (!uRes.ok) throw new Error();
          var uData = await uRes.json();
          _threadAttIds.push(uData.id);
          item.classList.remove('att-uploading');
          (function(id, el) {
            el.querySelector('.att-item-rm').addEventListener('click', function() {
              _threadAttIds = _threadAttIds.filter(function(x){ return x !== id; });
              el.remove();
            });
          })(uData.id, item);
        } catch(e) {
          item.classList.remove('att-uploading'); item.classList.add('att-error');
          item.querySelector('.att-item-name').textContent = 'Failed: ' + file.name;
        }
      }
      this.value = '';
    });

    toggleBtn.addEventListener('click', function() {
      form.style.display = ''; toggleBtn.style.display = 'none';
      document.getElementById('thread-title').focus();
    });
    document.getElementById('thread-cancel').addEventListener('click', function() {
      form.style.display = 'none'; toggleBtn.style.display = '';
      document.getElementById('thread-title').value = '';
      document.getElementById('thread-body').value = '';
      _tClearAtts();
    });
    document.getElementById('thread-submit').addEventListener('click', async function() {
      var title = document.getElementById('thread-title').value.trim();
      var body  = document.getElementById('thread-body').value.trim();
      var err   = document.getElementById('thread-err');
      err.textContent = '';
      if (!title) { err.textContent = 'Title required.'; return; }
      if (!body)  { err.textContent = 'Body required.'; return; }
      var btn = document.getElementById('thread-submit');
      btn.disabled = true; btn.textContent = 'Posting\u2026';
      try {
        var res = await fetch('/api/forum/threads', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
          body: JSON.stringify({ title: title, body: body, category_id: CATEGORY_ID, attachment_ids: _threadAttIds.slice() })
        });
        var d = await res.json();
        if (!res.ok) { err.textContent = d.error || 'Error'; btn.disabled = false; btn.textContent = 'Post'; return; }
        window.location.href = '/forum/thread/' + d.id;
      } catch(e) { err.textContent = 'Request failed'; btn.disabled = false; btn.textContent = 'Post'; }
    });
  })();
  (async function() {
    var tok = localStorage.getItem('gamebook_auth_token');
    if (!tok) return;
    try {
      var r = await fetch('/api/forum/latest', { headers: { 'Authorization': 'Bearer ' + tok } });
      var d = await r.json();
      var globalSeen = d.userSeen || 0;
      document.querySelectorAll('.thread-card[data-thread-id]').forEach(function(card) {
        var lastPostAt = parseInt(card.dataset.lastPostAt, 10);
        if (lastPostAt > globalSeen) {
          card.classList.add('has-unread');
          var titleBtn = card.querySelector('.thread-title .nav-btn');
          if (titleBtn) titleBtn.insertAdjacentHTML('afterend', '<span class="unread-dot"></span>');
        }
      });
    } catch(e) {}
  })();
  </script>`;

  return shell(
    esc(category.name) + ' - Forum - Gamebook Tracker',
    esc(category.description || category.name) + ' - Gamebook Tracker Forum',
    '/forum/c/' + category.slug,
    body
  );
}

function renderForumThread(thread, posts) {
  if (!thread) {
    return shell('Not Found - Forum', '', '/forum', `
  <header class="site-header">
    <h1>Gamebook Tracker</h1>
    <span class="sub">Forum</span>
    <button class="back" onclick="location.href='/forum'">← Forum</button>
  </header>
  <main class="wrap">
    <div class="error-page"><h2>Thread not found</h2><p><button class="nav-btn" onclick="location.href='/forum'">Back to forum</button></p></div>
  </main>`);
  }

  const t = thread;
  const catBack = t.category_slug
    ? '<button class="nav-btn" onclick="location.href=\'/forum\'">Forum</button> › <button class="nav-btn" onclick="location.href=\'/forum/c/' + esc(t.category_slug) + '\'">' + esc(t.category_name) + '</button> › ' + esc(t.title)
    : '<button class="nav-btn" onclick="location.href=\'/forum\'">Forum</button> › ' + esc(t.title);

  const badges = (t.is_pinned ? '<span class="badge badge-pin">pinned</span>' : '')
               + (t.is_locked ? '<span class="badge badge-lock">locked</span>' : '');

  const opEditedNote = t.edited_at ? '<span class="post-edited">edited ' + fmtDate(t.edited_at) + '</span>' : '';
  const opHtml = '<div class="post-wrap">'
    + '<div class="post-card op" id="post-op" data-created-at="' + t.created_at + '">'
    + '<div class="post-content">'
    + '<div class="post-meta" id="op-meta"><span>' + fmtDate(t.created_at) + '</span>' + opEditedNote + '</div>'
    + '<div class="post-body" id="op-body" data-raw="' + esc(t.body) + '">' + renderBody(t.body) + '</div>'
    + renderAttachments(t.attachments)
    + '<div class="post-actions" id="op-actions"></div>'
    + '</div>'
    + '</div>'
    + userPanel(t)
    + '</div>';

  const postsHtml = posts.map(p => {
    const editedNote = p.edited_at ? '<span class="post-edited">edited ' + fmtDate(p.edited_at) + '</span>' : '';
    return '<div class="post-wrap">'
      + '<div class="post-card" id="post-' + p.id + '" data-created-at="' + p.created_at + '">'
      + '<div class="post-content">'
      + '<div class="post-meta" id="post-meta-' + p.id + '"><span>' + fmtDate(p.created_at) + '</span>' + editedNote + '</div>'
      + '<div class="post-body' + (p.is_deleted ? ' deleted' : '') + '" id="post-body-' + p.id + '" data-raw="' + esc(p.body) + '">' + renderBody(p.body) + '</div>'
      + (p.is_deleted ? '' : renderAttachments(p.attachments))
      + '<div class="post-actions" id="post-actions-' + p.id + '"></div>'
      + '</div>'
      + '</div>'
      + userPanel(p)
      + '</div>';
  }).join('');

  const postsMeta = JSON.stringify(posts.map(p => ({ id: p.id, userId: p.user_id, deleted: !!p.is_deleted })));
  const catBackUrl = t.category_slug ? '/forum/c/' + t.category_slug : '/forum';

  const body = `
  <header class="site-header">
    <h1>Gamebook Tracker</h1>
    <span class="sub">Forum</span>
    <button class="back" onclick="location.href='${esc(catBackUrl)}'">← ${esc(t.category_name || 'Forum')}</button>
  </header>
  <main class="wrap">
    <div class="breadcrumb">${catBack}</div>
    ${badges ? '<div class="status-badges">' + badges + '</div>' : ''}
    <div class="thread-page-title" id="thread-title-display" data-raw="${esc(t.title)}">${esc(t.title)}</div>
    ${opHtml}
    <div id="posts-list">${postsHtml}</div>
    <div id="reply-wrap"></div>
    <div id="auth-notice-wrap"></div>
  </main>
  <script>
  var THREAD_ID    = ${t.id};
  var IS_LOCKED    = ${t.is_locked ? 'true' : 'false'};
  var IS_PINNED    = ${t.is_pinned ? 'true' : 'false'};
  var OP_USER_ID   = ${t.user_id !== null && t.user_id !== undefined ? t.user_id : 'null'};
  var POSTS_META   = ${postsMeta};
  var CAT_BACK_URL = '${esc(catBackUrl)}';

  ${CONFIRM_JS}

  function makeBtn(label, cls, onClick) {
    var b = document.createElement('button');
    b.className = cls; b.textContent = label;
    b.addEventListener('click', onClick);
    return b;
  }

  function _escBr(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\\n/g,'<br>');
  }

  (async function() {
    var token = localStorage.getItem('gamebook_auth_token');
    var noticeWrap = document.getElementById('auth-notice-wrap');
    if (!token) {
      if (!IS_LOCKED) noticeWrap.innerHTML = '<p class="auth-notice">Log in to the <a href="/" data-open-app="1">app</a> to reply.</p>';
      return;
    }
    var r, me;
    try { r = await fetch('/api/forum/me', { headers: { 'Authorization': 'Bearer ' + token } }); } catch(e) { return; }
    if (!r.ok) { noticeWrap.innerHTML = '<p class="auth-notice">Log in to the <a href="/" data-open-app="1">app</a> to reply.</p>'; return; }
    me = await r.json();
    var isAdmin = me.isAdmin;

    // ── OP actions ────────────────────────────────────────────────────────────
    var opActions = document.getElementById('op-actions');
    if (me.id === OP_USER_ID || isAdmin) {
      opActions.appendChild(makeBtn('Edit', 'forum-btn-edit', function() {
        var titleEl = document.getElementById('thread-title-display');
        var bodyEl  = document.getElementById('op-body');
        var metaEl  = document.getElementById('op-meta');
        if (document.getElementById('op-edit-form')) return;
        titleEl.style.display = 'none';
        bodyEl.style.display  = 'none';
        opActions.style.display = 'none';
        var f = document.createElement('div');
        f.id = 'op-edit-form';
        f.innerHTML = '<input class="forum-input" id="op-edit-title" type="text" maxlength="200" value="">'
          + '<textarea class="forum-input" id="op-edit-body" maxlength="20000"></textarea>'
          + '<div style="display:flex;gap:0.5rem;align-items:center;flex-wrap:wrap">'
          + '<button class="forum-btn" id="op-edit-save">Save</button>'
          + '<button class="forum-btn-cancel" id="op-edit-cancel">Cancel</button>'
          + '<span class="forum-err" id="op-edit-err"></span></div>';
        bodyEl.parentNode.insertBefore(f, bodyEl);
        document.getElementById('op-edit-title').value = titleEl.dataset.raw;
        document.getElementById('op-edit-body').value  = bodyEl.dataset.raw;
        document.getElementById('op-edit-cancel').onclick = function() {
          f.remove(); titleEl.style.display = ''; bodyEl.style.display = ''; opActions.style.display = '';
        };
        document.getElementById('op-edit-save').onclick = async function() {
          var newTitle = document.getElementById('op-edit-title').value.trim();
          var newBody  = document.getElementById('op-edit-body').value.trim();
          var err = document.getElementById('op-edit-err');
          err.textContent = '';
          if (!newTitle) { err.textContent = 'Title required.'; return; }
          if (!newBody)  { err.textContent = 'Body required.'; return; }
          var btn = document.getElementById('op-edit-save');
          btn.disabled = true; btn.textContent = 'Saving\u2026';
          try {
            var res = await fetch('/api/forum/threads/' + THREAD_ID, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
              body: JSON.stringify({ title: newTitle, body: newBody })
            });
            var d = await res.json();
            if (!res.ok) { err.textContent = d.error || 'Error'; btn.disabled = false; btn.textContent = 'Save'; return; }
            titleEl.textContent = newTitle; titleEl.dataset.raw = newTitle;
            bodyEl.innerHTML = _escBr(newBody);
            bodyEl.dataset.raw = newBody;
            var existing = metaEl.querySelector('.post-edited');
            var note = existing || document.createElement('span');
            note.className = 'post-edited'; note.textContent = 'edited just now';
            if (!existing) metaEl.appendChild(note);
            f.remove(); titleEl.style.display = ''; bodyEl.style.display = ''; opActions.style.display = '';
          } catch(e) { err.textContent = 'Request failed'; btn.disabled = false; btn.textContent = 'Save'; }
        };
      }));
    }
    if (me.id === OP_USER_ID || isAdmin) {
      opActions.appendChild(makeBtn('Delete Thread', 'forum-btn-del', function() {
        showConfirm('Delete this thread and all replies? This cannot be undone.', async function() {
          var res = await fetch('/api/forum/threads/' + THREAD_ID, { method: 'DELETE', headers: { 'Authorization': 'Bearer ' + token } });
          if (res.ok) window.location.href = CAT_BACK_URL;
        });
      }));
    }
    if (me.id === OP_USER_ID || isAdmin) {
      opActions.appendChild(makeBtn(IS_LOCKED ? 'Unlock' : 'Lock', 'forum-btn-admin', async function() {
        await fetch('/api/forum/threads/' + THREAD_ID + '/lock', { method: 'POST', headers: { 'Authorization': 'Bearer ' + token } });
        window.location.reload();
      }));
    }
    if (me.id === OP_USER_ID || isAdmin) {
      opActions.appendChild(makeBtn(IS_PINNED ? 'Unpin' : 'Pin', 'forum-btn-admin', async function() {
        await fetch('/api/forum/threads/' + THREAD_ID + '/pin', { method: 'POST', headers: { 'Authorization': 'Bearer ' + token } });
        window.location.reload();
      }));
    }

    // ── Post actions ──────────────────────────────────────────────────────────
    for (var i = 0; i < POSTS_META.length; i++) {
      var pm = POSTS_META[i];
      if (pm.deleted) continue;
      if (me.id !== pm.userId && !isAdmin) continue;
      var el = document.getElementById('post-actions-' + pm.id);
      if (!el) continue;
      (function(pmId, elRef) {
        elRef.appendChild(makeBtn('Edit', 'forum-btn-edit', function() {
          var bodyEl = document.getElementById('post-body-' + pmId);
          var metaEl = document.getElementById('post-meta-' + pmId);
          if (document.getElementById('post-edit-form-' + pmId)) return;
          bodyEl.style.display = 'none';
          elRef.style.display = 'none';
          var f = document.createElement('div');
          f.id = 'post-edit-form-' + pmId;
          f.innerHTML = '<textarea class="forum-input" id="post-edit-body-' + pmId + '" maxlength="20000"></textarea>'
            + '<div style="display:flex;gap:0.5rem;align-items:center;flex-wrap:wrap">'
            + '<button class="forum-btn" id="post-edit-save-' + pmId + '">Save</button>'
            + '<button class="forum-btn-cancel" id="post-edit-cancel-' + pmId + '">Cancel</button>'
            + '<span class="forum-err" id="post-edit-err-' + pmId + '"></span></div>';
          bodyEl.parentNode.insertBefore(f, bodyEl);
          document.getElementById('post-edit-body-' + pmId).value = bodyEl.dataset.raw;
          document.getElementById('post-edit-cancel-' + pmId).onclick = function() {
            f.remove(); bodyEl.style.display = ''; elRef.style.display = '';
          };
          document.getElementById('post-edit-save-' + pmId).onclick = async function() {
            var newBody = document.getElementById('post-edit-body-' + pmId).value.trim();
            var err = document.getElementById('post-edit-err-' + pmId);
            err.textContent = '';
            if (!newBody) { err.textContent = 'Body required.'; return; }
            var btn = document.getElementById('post-edit-save-' + pmId);
            btn.disabled = true; btn.textContent = 'Saving\u2026';
            try {
              var res = await fetch('/api/forum/posts/' + pmId, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
                body: JSON.stringify({ body: newBody })
              });
              var d = await res.json();
              if (!res.ok) { err.textContent = d.error || 'Error'; btn.disabled = false; btn.textContent = 'Save'; return; }
              bodyEl.innerHTML = _escBr(newBody);
              bodyEl.dataset.raw = newBody;
              var existing = metaEl.querySelector('.post-edited');
              var note = existing || document.createElement('span');
              note.className = 'post-edited'; note.textContent = 'edited just now';
              if (!existing) metaEl.appendChild(note);
              f.remove(); bodyEl.style.display = ''; elRef.style.display = '';
            } catch(e) { err.textContent = 'Request failed'; btn.disabled = false; btn.textContent = 'Save'; }
          };
        }));
        elRef.appendChild(makeBtn('Delete', 'forum-btn-del', function() {
          showConfirm('Delete this reply?', async function() {
            var res = await fetch('/api/forum/posts/' + pmId, { method: 'DELETE', headers: { 'Authorization': 'Bearer ' + token } });
            if (res.ok) {
              var card = document.getElementById('post-' + pmId);
              if (card) {
                card.querySelector('.post-body').className = 'post-body deleted';
                card.querySelector('.post-body').textContent = '[deleted]';
                elRef.remove();
              }
            }
          });
        }));
      })(pm.id, el);
    }

    // ── Reply form ────────────────────────────────────────────────────────────
    if (IS_LOCKED) {
      noticeWrap.innerHTML = '<p class="auth-notice" style="color:#9ca3af">This thread is locked.</p>';
      return;
    }
    var replyWrap = document.getElementById('reply-wrap');
    replyWrap.innerHTML = '<div class="forum-form">'
      + '<h3>Reply</h3>'
      + '<textarea class="forum-input" id="reply-body" placeholder="Write a reply\u2026" spellcheck="true" maxlength="20000"></textarea>'
      + '<div style="display:flex;flex-wrap:wrap;gap:0.5rem;align-items:center">'
      + '<label style="cursor:pointer" for="reply-file-input"><span class="att-pick-btn">+ Attach</span></label>'
      + '<input type="file" id="reply-file-input" multiple style="display:none" accept="image/*,.pdf,.txt,.md,.csv,.json,.xml,.zip,.7z,.rar,.gz">'
      + '<div id="reply-att-list" class="att-list" style="flex:1"></div>'
      + '<span class="forum-err" id="reply-err"></span>'
      + '<button class="forum-btn" id="reply-submit">Post Reply</button>'
      + '</div></div>';

    var _replyAttIds = [];
    var IMG_EXT_SET = new Set(['.jpg','.jpeg','.png','.gif','.webp','.avif']);
    var IMG_MAX_AT  = 512 * 1024;

    function _addForumAttItem(name) {
      var c = document.getElementById('reply-att-list');
      var d = document.createElement('div');
      d.className = 'att-item att-uploading';
      var safe = name.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
      d.innerHTML = '<span class="att-item-name">' + safe + '</span>'
        + '<button class="att-item-rm" title="Remove">\u2715</button>';
      c.appendChild(d); return d;
    }
    async function _compressToBlob(canvas, maxB) {
      return new Promise(function(res) {
        var tryQ = function(q) {
          canvas.toBlob(function(blob) {
            if (!blob) { res(null); return; }
            if (blob.size <= maxB || q <= 0.1) res(blob);
            else tryQ(+(q-0.1).toFixed(1));
          }, 'image/jpeg', q);
        };
        tryQ(0.92);
      });
    }
    async function _compressImg(file) {
      var maxDim = 1200;
      return new Promise(function(resolve, reject) {
        var img = new Image();
        var url = URL.createObjectURL(file);
        img.onload = function() {
          try {
            URL.revokeObjectURL(url);
            var canvas = document.createElement('canvas');
            var w = img.naturalWidth, h = img.naturalHeight;
            if (w > maxDim || h > maxDim) {
              var r = Math.min(maxDim/w, maxDim/h); w = Math.round(w*r); h = Math.round(h*r);
            }
            canvas.width = w; canvas.height = h;
            var ctx = canvas.getContext('2d');
            if (!ctx) { resolve(null); return; }
            ctx.drawImage(img, 0, 0, w, h);
            _compressToBlob(canvas, IMG_MAX_AT).then(resolve).catch(reject);
          } catch(e) { reject(e); }
        };
        img.onerror = reject; img.src = url;
      });
    }

    document.getElementById('reply-file-input').addEventListener('change', async function() {
      for (var fi = 0; fi < this.files.length; fi++) {
        var file = this.files[fi];
        var item = _addForumAttItem(file.name);
        try {
          var ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
          var body_data;
          if (IMG_EXT_SET.has(ext) && file.size > IMG_MAX_AT) {
            var blob = await _compressImg(file); body_data = blob || file;
          } else { body_data = file; }
          var uRes = await fetch('/api/attachments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/octet-stream', 'X-Filename': encodeURIComponent(file.name), 'Authorization': 'Bearer ' + token },
            body: body_data
          });
          if (!uRes.ok) throw new Error();
          var uData = await uRes.json();
          _replyAttIds.push(uData.id);
          item.classList.remove('att-uploading');
          (function(id, el) {
            el.querySelector('.att-item-rm').addEventListener('click', function() {
              _replyAttIds = _replyAttIds.filter(function(x){ return x !== id; });
              el.remove();
            });
          })(uData.id, item);
        } catch(e) {
          item.classList.remove('att-uploading'); item.classList.add('att-error');
          item.querySelector('.att-item-name').textContent = 'Failed: ' + file.name;
        }
      }
      this.value = '';
    });

    document.getElementById('reply-submit').addEventListener('click', async function() {
      var body = document.getElementById('reply-body').value.trim();
      var err  = document.getElementById('reply-err');
      err.textContent = '';
      if (!body) { err.textContent = 'Reply cannot be empty.'; return; }
      var btn = document.getElementById('reply-submit');
      btn.disabled = true; btn.textContent = 'Posting\u2026';
      try {
        var res = await fetch('/api/forum/threads/' + THREAD_ID + '/posts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
          body: JSON.stringify({ body: body, attachment_ids: _replyAttIds.slice() })
        });
        if (res.ok) { await fetch('/api/forum/seen', { method: 'POST', headers: { 'Authorization': 'Bearer ' + token } }); window.location.reload(); return; }
        var d = await res.json();
        err.textContent = d.error || 'Error';
        btn.disabled = false; btn.textContent = 'Post Reply';
      } catch(e) { err.textContent = 'Request failed'; btn.disabled = false; btn.textContent = 'Post Reply'; }
    });
  })();
  (async function() {
    var tok = localStorage.getItem('gamebook_auth_token');
    var globalSeen = 0;
    if (tok) {
      try {
        var r = await fetch('/api/forum/latest', { headers: { 'Authorization': 'Bearer ' + tok } });
        var d = await r.json();
        globalSeen = d.userSeen || 0;
      } catch(e) {}
    }
    document.querySelectorAll('.post-card[data-created-at]').forEach(function(card) {
      if (parseInt(card.dataset.createdAt, 10) > globalSeen) card.classList.add('is-new');
    });
    if (tok) fetch('/api/forum/seen', { method: 'POST', headers: { 'Authorization': 'Bearer ' + tok } }).catch(function(){});
  })();
  </script>`;

  return shell(
    esc(t.title) + ' - Forum - Gamebook Tracker',
    'Forum thread: ' + esc(t.title),
    '/forum/thread/' + t.id,
    body
  );
}

module.exports = { renderForumIndex, renderForumCategory, renderForumThread };
