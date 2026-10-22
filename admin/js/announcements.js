// Announcements: draft, publish, pin, and edit controls.

import { api, mkBtn, showConfirm, showAlert, matchesQuery, renderPaged, _pageState } from './core.js';
import { openEditor } from './editor.js';

let _annEditId = null;
let _annEditIsDraft = false;
let _annEditor = null;

function annEsc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Match the player-facing announcement formatter without importing the desktop app.
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
    // Open preview links in a new tab so they cannot replace the admin page.
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+|\/book\/\d+|\/series\/\d+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
}

function annFmt(ts) {
  return ts ? new Date(ts * 1000).toLocaleString('en-GB', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '-';
}

function annResetCompose() {
  _annEditor?.close();
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
  _annEditor = openEditor({
    title: row.is_draft ? 'Edit Draft' : 'Edit Announcement',
    content: document.getElementById('ann-compose'),
    focus: '#ann-title',
    onClose: () => { _annEditor = null; annResetCompose(); },
  });
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
    ? `<button class="btn btn-watch" data-id="${row.id}" data-action="publish">Publish</button>`
    : `<button class="btn btn-warn" data-id="${row.id}" data-action="unpublish">Unpublish</button>`;
  const pinBtn = !isDraft
    ? (row.pinned
        ? `<button class="btn btn-warn" data-id="${row.id}" data-action="unpin">Unpin</button>`
        : `<button class="btn btn-info" data-id="${row.id}" data-action="pin">Pin</button>`)
    : '';
  const pinnedBadge = row.pinned ? `<span class="ann-pinned-badge">Pinned</span>` : '';
  return `<div class="ann-card${row.pinned ? ' ann-card-pinned' : ''}" data-id="${row.id}">
    <div class="ann-card-title">${annEsc(row.title)}${pinnedBadge}</div>
    <div class="ann-card-body">${annFormatBody(row.body)}</div>
    <div class="ann-card-meta">${date}</div>
    <div class="ann-card-actions">
      <button class="btn btn-info admin-edit-btn" data-id="${row.id}" data-action="edit">Edit</button>
      ${publishBtn}
      ${pinBtn}
      <button class="btn btn-danger" data-id="${row.id}" data-action="delete">Delete</button>
    </div>
  </div>`;
}

function wireAnnActionButtons(container, rows) {
  container.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
      const id  = +btn.dataset.id;
      const action = btn.dataset.action;
      if (action === 'edit') {
        const row = rows.find(r => r.id === id);
        if (row) annStartEdit(row);
      } else if (action === 'publish') {
        await api('POST', `/api/admin/announcements/${id}/publish`);
        annResetCompose();
        loadAnnouncements();
      } else if (action === 'unpublish') {
        await api('POST', `/api/admin/announcements/${id}/unpublish`);
        loadAnnouncements();
      } else if (action === 'pin') {
        await api('POST', `/api/admin/announcements/${id}/pin`);
        loadAnnouncements();
      } else if (action === 'unpin') {
        await api('POST', `/api/admin/announcements/${id}/unpin`);
        loadAnnouncements();
      } else if (action === 'delete') {
        showConfirm('Delete this announcement? This cannot be undone.', async () => {
          await api('DELETE', `/api/admin/announcements/${id}`);
          if (_annEditId === id) annResetCompose();
          loadAnnouncements();
        }, { label: 'Delete', variant: 'danger' });
      }
      } catch (error) { showAlert('Could not update announcement. Please retry.'); }
    });
  });
}

let announcementRows = [];
export async function loadAnnouncements() {
  try {
    announcementRows = await api('GET', '/api/admin/announcements');
    renderAnnouncements();
  } catch (error) { document.getElementById('announcements-meta').textContent = 'Could not load announcements. Use Refresh to retry.'; }
}
function renderAnnouncements() {
  const query = document.getElementById('announcements-search').value.trim();
  const rows = announcementRows.filter(row => !query || matchesQuery(row.title,query) || matchesQuery(row.body,query));
  document.getElementById('announcements-meta').textContent = `${rows.length} of ${announcementRows.length} announcements`;
  for (const [key, draft, target] of [['ann-drafts',1,'ann-drafts-list'],['ann-published',0,'ann-published-list']]) {
    const list = document.getElementById(target);
    renderPaged(key, rows.filter(row => row.is_draft === draft).sort((a,b) => (b.pinned||0)-(a.pinned||0) || (b.published_at||b.created_at)-(a.published_at||a.created_at) || b.id-a.id), page => {
      list.innerHTML = page.map(renderAnnCard).join('') || '<div class="admin-empty">No matching announcements.</div>';
      wireAnnActionButtons(list, page);
    },10);
  }
}
document.getElementById('announcements-search').addEventListener('input', () => {
  document.getElementById('announcements-search-clear').style.display = document.getElementById('announcements-search').value ? 'inline-block' : 'none';
  _pageState['ann-drafts'] = { page: 0 }; _pageState['ann-published'] = { page: 0 };
  renderAnnouncements();
});
document.getElementById('announcements-search-clear').addEventListener('click', () => {
  const input = document.getElementById('announcements-search');
  input.value = ''; input.dispatchEvent(new Event('input')); input.focus();
});

function annTrim(s) {
  return s.split('\n').map(l => l.trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

async function annSubmit(publish) {
  if (_annEditor?.dialog.getAttribute('aria-busy') === 'true') return;
  const editor = _annEditor;
  const title = document.getElementById('ann-title').value.trim();
  const body  = annTrim(document.getElementById('ann-body').value);
  const errEl = document.getElementById('ann-compose-error');
  if (!title || !body) { errEl.textContent = 'Title and body are required.'; return; }
  errEl.textContent = '';
  editor?.setBusy(true);

  try {
    if (_annEditId) {
      const r = await fetch(`/api/admin/announcements/${_annEditId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, body }),
      });
      if (!r.ok) { errEl.textContent = `Save failed (${r.status})`; return; }
      if (publish && _annEditIsDraft) {
        const published = await fetch(`/api/admin/announcements/${_annEditId}/publish`, { method: 'POST' });
        if (!published.ok) { errEl.textContent = `Publish failed (${published.status})`; return; }
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
  } finally { editor?.setBusy(false); }
  annResetCompose();
  await loadAnnouncements();
}

document.getElementById('ann-save-draft').addEventListener('click',  () => annSubmit(false));
document.getElementById('ann-publish-new').addEventListener('click', () => annSubmit(true));
document.getElementById('ann-cancel-edit').addEventListener('click', annResetCompose);
