// Anthologies tab: lists all anthology container books across all users.
// Deleting reuses the same DELETE /api/admin/books/:id route as regular books
// (children get orphaned via parent_book_id ON DELETE SET NULL, not deleted).
// To remove: delete this file and its <script type="module"> import in
// admin/index.html; remove the Anthologies tab HTML/CSS.

import {
  api, badge, mkBtn, appendCell, _esc, showAlert, showConfirm,
  storeData, getFiltered, renderPaged, setSearchFields, wireTableSearch,
} from './core.js?v=1412';

export function renderAnthologiesTable(anthologies) {
  const tbody = document.getElementById('anthologies-body');
  tbody.innerHTML = '';
  if (!anthologies.length) { tbody.innerHTML = '<tr><td colspan="7" style="color:#6b7280;padding:1rem">No anthologies yet.</td></tr>'; return; }
  for (const a of anthologies) {
    const tr = tbody.insertRow();
    const nameTd = tr.insertCell();
    nameTd.innerHTML = `<span class="link" style="font-weight:600">${_esc(a.name)}</span>`;
    appendCell(tr, a.created_by_username || '-');
    appendCell(tr, badge(a.child_count, a.child_count > 0 ? 'badge-green' : 'badge-grey'));
    appendCell(tr, a.is_public ? badge('Public','badge-green') : badge('Private','badge-grey'));
    appendCell(tr, a.created_at ? new Date(a.created_at * 1000).toLocaleDateString() : '-');
    const descTd = tr.insertCell();
    descTd.style.cssText = 'max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#9ca3af;font-size:0.8rem';
    descTd.textContent = a.description || '-';
    appendCell(tr, mkBtn('Delete', 'btn-danger', () => _confirmDeleteAnthology(a.id, a.name)));
  }
}

export async function loadAdminAnthologies() {
  const tbody = document.getElementById('anthologies-body');
  tbody.innerHTML = '<tr><td colspan="7" style="color:#6b7280;padding:1rem">Loading…</td></tr>';
  try {
    const anthologies = await api('GET', '/api/admin/anthologies');
    storeData('anthologies', anthologies);
    renderPaged('anthologies', getFiltered('anthologies'), renderAnthologiesTable);
  } catch (e) { tbody.innerHTML = `<tr><td colspan="7" style="color:#f87171">${_esc(e.message)}</td></tr>`; }
}

function _confirmDeleteAnthology(id, name) {
  showConfirm(`Delete anthology "${name}"? Its child books will remain but no longer be linked to it.`, async () => {
    const res = await fetch(`/api/admin/books/${id}`, { method: 'DELETE' });
    const r = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (r?.error === 'has_readers') {
        showAlert(`Cannot delete - ${r.count} reader(s) still have this book: ${(r.names || []).join(', ')}. Remove it from their libraries first.`);
      } else {
        showAlert(`Delete failed: ${r?.error || res.status}`);
      }
      return;
    }
    loadAdminAnthologies();
  }, { label: 'Delete', variant: 'danger' });
}

setSearchFields('anthologies', ['name', 'created_by_username']);
wireTableSearch('anthologies', 'anthologies-search', 'anthologies-search-clear', renderAnthologiesTable);
