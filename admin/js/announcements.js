// Announcements tab: draft/publish/pin workflow, "Show N older" collapse
// (same convention as the Users tab's "Show N inactive users"), and the
// New/Edit compose form.
// To remove: delete this file and its <script type="module"> import in
// admin/index.html; remove the Announcements tab HTML/CSS.

import { mkBtn, showConfirm } from './core.js?v=1';

let _annEditId = null;
let _annEditIsDraft = false;

function annEsc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Same markup engine as the player-facing renderer (public/js/feed.js's
// formatAnnBody/ANN_COLORS) - duplicated here rather than imported since
// admin/js is a separate, self-contained bundle. Without this the admin
// preview showed literal **/{color:...} tags instead of the formatted
// result players actually see.
const ANN_COLORS = {
  red: '#f87171', orange: '#fb923c', amber: '#fbbf24', green: '#4ade80',
  teal: '#2dd4bf', blue: '#60a5fa', purple: '#a78bfa', pink: '#f472b6',
};
function annFormatBody(s) {
  return annEsc(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g,     '<em>$1</em>')
    .replace(/__(.+?)__/g,     '<u>$1</u>')
    .replace(/~~(.+?)~~/g,     '<s>$1</s>')
    .replace(/\{color:(red|orange|amber|green|teal|blue|purple|pink)\}(.+?)\{\/color\}/g,
      (_, color, text) => `<span style="color:${ANN_COLORS[color]}">${text}</span>`)
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
}

function annFmt(ts) {
  return ts ? new Date(ts * 1000).toLocaleString('en-GB', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '-';
}

function annResetCompose() {
  _annEditId = null;
  _annEditIsDraft = false;
  document.getElementById('ann-title').value = '';
  document.getElementById('ann-body').value  = '';
  document.getElementById('ann-compose-error').textContent = '';
  document.getElementById('ann-compose-label').textContent = 'New Announcement';
  document.getElementById('ann-cancel-edit').style.display = 'none';
  document.getElementById('ann-publish-new').textContent   = 'Publish';
}

function annStartEdit(row) {
  _annEditId = row.id;
  _annEditIsDraft = !!row.is_draft;
  document.getElementById('ann-title').value = row.title;
  document.getElementById('ann-body').value  = row.body;
  document.getElementById('ann-compose-error').textContent = '';
  document.getElementById('ann-compose-label').textContent = row.is_draft ? 'Edit Draft' : 'Edit Announcement';
  document.getElementById('ann-cancel-edit').style.display = '';
  document.getElementById('ann-publish-new').textContent   = row.is_draft ? 'Update & Publish' : 'Update';
  document.getElementById('ann-title').focus();
  document.getElementById('tab-announcements').scrollTop = 0;
}

function renderAnnCard(row) {
  const isDraft = row.is_draft === 1;
  const date    = isDraft
    ? `Created ${annFmt(row.created_at)}`
    : `Published ${annFmt(row.published_at)}`;
  const publishBtn = isDraft
    ? `<button class="ann-card-btn publish" data-id="${row.id}" data-action="publish">Publish</button>`
    : `<button class="ann-card-btn unpublish" data-id="${row.id}" data-action="unpublish">Unpublish</button>`;
  const pinBtn = !isDraft
    ? (row.pinned
        ? `<button class="ann-card-btn unpin" data-id="${row.id}" data-action="unpin">Unpin</button>`
        : `<button class="ann-card-btn pin" data-id="${row.id}" data-action="pin">Pin</button>`)
    : '';
  const pinnedBadge = row.pinned ? `<span class="ann-pinned-badge">Pinned</span>` : '';
  return `<div class="ann-card${row.pinned ? ' ann-card-pinned' : ''}" data-id="${row.id}">
    <div class="ann-card-title">${annEsc(row.title)}${pinnedBadge}</div>
    <div class="ann-card-body">${annFormatBody(row.body)}</div>
    <div class="ann-card-meta">${date}</div>
    <div class="ann-card-actions">
      <button class="ann-card-btn" data-id="${row.id}" data-action="edit">Edit</button>
      ${publishBtn}
      ${pinBtn}
      <button class="btn btn-danger" data-id="${row.id}" data-action="delete">Delete</button>
    </div>
  </div>`;
}

function wireAnnActionButtons(container, rows) {
  container.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id  = +btn.dataset.id;
      const action = btn.dataset.action;
      if (action === 'edit') {
        const row = rows.find(r => r.id === id);
        if (row) annStartEdit(row);
      } else if (action === 'publish') {
        await fetch(`/api/admin/announcements/${id}/publish`, { method: 'POST' });
        annResetCompose();
        loadAnnouncements();
      } else if (action === 'unpublish') {
        await fetch(`/api/admin/announcements/${id}/unpublish`, { method: 'POST' });
        loadAnnouncements();
      } else if (action === 'pin') {
        await fetch(`/api/admin/announcements/${id}/pin`, { method: 'POST' });
        loadAnnouncements();
      } else if (action === 'unpin') {
        await fetch(`/api/admin/announcements/${id}/unpin`, { method: 'POST' });
        loadAnnouncements();
      } else if (action === 'delete') {
        showConfirm('Delete this announcement? This cannot be undone.', async () => {
          await fetch(`/api/admin/announcements/${id}`, { method: 'DELETE' });
          if (_annEditId === id) annResetCompose();
          loadAnnouncements();
        }, { label: 'Delete', variant: 'danger' });
      }
    });
  });
}

export async function loadAnnouncements() {
  const rows = await fetch('/api/admin/announcements').then(r => r.json());
  const drafts = rows.filter(r => r.is_draft === 1);
  const publishedAll = rows.filter(r => r.is_draft === 0);

  // Same "Show N inactive users (31+ days)" philosophy as the Users table:
  // older entries are collapsed behind a button at the bottom, not hidden
  // behind a hover/toggle affordance. Pinned announcements are always shown.
  const thirtyDaysAgo = Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60;
  const visible = publishedAll.filter(r => r.pinned || r.published_at >= thirtyDaysAgo);
  const hidden  = publishedAll.filter(r => !r.pinned && r.published_at < thirtyDaysAgo);

  const draftEl = document.getElementById('ann-drafts-list');
  const pubEl   = document.getElementById('ann-published-list');

  draftEl.innerHTML = drafts.length ? drafts.map(renderAnnCard).join('') : '<span class="ann-empty">No drafts.</span>';
  pubEl.innerHTML   = visible.length ? visible.map(renderAnnCard).join('')
                    : (hidden.length ? '' : '<span class="ann-empty">No published announcements.</span>');

  wireAnnActionButtons(draftEl, rows);
  wireAnnActionButtons(pubEl, rows);

  if (hidden.length) {
    const row = document.createElement('div');
    row.className = 'ann-show-older-row';
    row.appendChild(mkBtn(`Show ${hidden.length} announcement${hidden.length !== 1 ? 's' : ''} (30+ days)`, 'btn-info', () => {
      row.remove();
      const hiddenWrap = document.createElement('div');
      hiddenWrap.innerHTML = hidden.map(renderAnnCard).join('');
      wireAnnActionButtons(hiddenWrap, rows); // wire while still isolated, before moving into pubEl
      while (hiddenWrap.firstChild) pubEl.appendChild(hiddenWrap.firstChild);
    }));
    pubEl.appendChild(row);
  }
}

function annTrim(s) {
  return s.split('\n').map(l => l.trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

async function annSubmit(publish) {
  const title = document.getElementById('ann-title').value.trim();
  const body  = annTrim(document.getElementById('ann-body').value);
  const errEl = document.getElementById('ann-compose-error');
  if (!title || !body) { errEl.textContent = 'Title and body are required.'; return; }
  errEl.textContent = '';

  try {
    if (_annEditId) {
      const r = await fetch(`/api/admin/announcements/${_annEditId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, body }),
      });
      if (!r.ok) { errEl.textContent = `Save failed (${r.status})`; return; }
      if (publish && _annEditIsDraft) {
        await fetch(`/api/admin/announcements/${_annEditId}/publish`, { method: 'POST' });
      }
    } else {
      const row = await fetch('/api/admin/announcements', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, body }),
      }).then(r => r.json());
      if (publish) {
        await fetch(`/api/admin/announcements/${row.id}/publish`, { method: 'POST' });
      }
    }
  } catch (e) {
    errEl.textContent = 'Network error - announcement not saved.';
    return;
  }
  annResetCompose();
  await loadAnnouncements();
}

document.getElementById('ann-save-draft').addEventListener('click',  () => annSubmit(false));
document.getElementById('ann-publish-new').addEventListener('click', () => annSubmit(true));
document.getElementById('ann-cancel-edit').addEventListener('click', annResetCompose);
