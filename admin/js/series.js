// Series tab: lists all series, inline edit (name/description/public/open-world),
// and delete (unlinks all books, removes user_series rows).
// To remove: delete this file and its <script type="module"> import in
// admin/index.html; remove the Series tab HTML/CSS.

import {
  api, el, badge, mkBtn, appendCell, _esc, showConfirm,
  storeData, getFiltered, renderPaged, setSearchFields, wireTableSearch,
} from './core.js?v=1';

export function renderSeriesTable(series) {
  const tbody = document.getElementById('series-body');
  tbody.innerHTML = '';
  if (!series.length) { tbody.innerHTML = '<tr><td colspan="7" style="color:#6b7280;padding:1rem">No series yet.</td></tr>'; return; }
  for (const s of series) {
    const tr = tbody.insertRow();
    // Name (editable inline)
    const nameTd = tr.insertCell();
    nameTd.innerHTML = `<span class="link" style="font-weight:600">${_esc(s.name)}</span>`;
    appendCell(tr, s.created_by_username || '-');
    appendCell(tr, badge(s.book_count, s.book_count > 0 ? 'badge-green' : 'badge-grey'));
    appendCell(tr, s.is_public ? badge('Public','badge-green') : badge('Private','badge-grey'));
    appendCell(tr, s.created_at ? new Date(s.created_at * 1000).toLocaleDateString() : '-');
    const descTd = tr.insertCell();
    descTd.style.cssText = 'max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#9ca3af;font-size:0.8rem';
    descTd.textContent = s.description || '-';
    const actionsTd = tr.insertCell();
    const grp = el('div', 'btn-group');
    const editBtn = mkBtn('Edit', 'btn-info', () => _openSeriesEdit(s, tr));
    const delBtn  = mkBtn('Delete', 'btn-danger', () => {
      showConfirm(`Delete series "${s.name}"? This will unlink all books from this series.`, async () => {
        await api('DELETE', `/api/admin/series/${s.id}`);
        loadAdminSeries();
      });
    });
    grp.appendChild(editBtn); grp.appendChild(delBtn);
    actionsTd.appendChild(grp);
  }
}

export async function loadAdminSeries() {
  const tbody = document.getElementById('series-body');
  tbody.innerHTML = '<tr><td colspan="7" style="color:#6b7280;padding:1rem">Loading…</td></tr>';
  try {
    const series = await api('GET', '/api/admin/series/all');
    storeData('series', series);
    renderPaged('series', getFiltered('series'), renderSeriesTable);
  } catch (e) { tbody.innerHTML = `<tr><td colspan="7" style="color:#f87171">${_esc(e.message)}</td></tr>`; }
}

function _openSeriesEdit(s, tr) {
  // Replace row with an inline edit form
  const origHTML = tr.innerHTML;
  tr.innerHTML = `
    <td colspan="4">
      <div style="display:flex;gap:0.5rem;flex-wrap:wrap;align-items:flex-start">
        <input id="se-name" type="text" value="${_esc(s.name)}" style="background:#111827;border:1px solid #374151;border-radius:5px;color:#d1d5db;padding:0.25rem 0.5rem;font-size:0.82rem;font-family:inherit;width:180px">
        <textarea id="se-desc" placeholder="Description" rows="4" style="background:#111827;border:1px solid #374151;border-radius:5px;color:#d1d5db;padding:0.25rem 0.5rem;font-size:0.82rem;font-family:inherit;flex:1;min-width:140px;resize:vertical">${_esc(s.description || '')}</textarea>
        <label style="display:flex;align-items:center;gap:0.3rem;font-size:0.8rem;color:#d1d5db;cursor:pointer;white-space:nowrap">
          <input type="checkbox" id="se-public" ${s.is_public ? 'checked' : ''}> Public
        </label>
        <label style="display:flex;align-items:center;gap:0.3rem;font-size:0.8rem;color:#a78bfa;cursor:pointer;white-space:nowrap" title="Enables persistent character + portal travel across books in this series">
          <input type="checkbox" id="se-open-world" ${s.is_open_world ? 'checked' : ''}> Open world
        </label>
      </div>
    </td>
    <td colspan="3">
      <div class="btn-group">
        <button class="btn btn-info" id="se-save">Save</button>
        <button class="btn" id="se-cancel">Cancel</button>
      </div>
    </td>`;
  tr.querySelector('#se-cancel').addEventListener('click', () => { tr.innerHTML = origHTML; _reattachSeriesRowEvents(s, tr); });
  tr.querySelector('#se-save').addEventListener('click', async () => {
    const name = tr.querySelector('#se-name').value.trim();
    if (!name) return;
    await api('PATCH', `/api/admin/series/${s.id}`, { name, description: tr.querySelector('#se-desc').value.trim() || null, is_public: tr.querySelector('#se-public').checked, is_open_world: tr.querySelector('#se-open-world').checked });
    loadAdminSeries();
  });
}

function _reattachSeriesRowEvents(s, tr) {
  const delBtn = tr.querySelector('.btn-danger');
  if (delBtn) delBtn.addEventListener('click', () => {
    showConfirm(`Delete series "${s.name}"? This will unlink all books from this series.`, async () => {
      await api('DELETE', `/api/admin/series/${s.id}`);
      loadAdminSeries();
    });
  });
  const editBtn = tr.querySelector('.btn-info');
  if (editBtn) editBtn.addEventListener('click', () => _openSeriesEdit(s, tr));
}

setSearchFields('series', ['name', 'created_by_username']);
wireTableSearch('series', 'series-search', 'series-search-clear', renderSeriesTable);
