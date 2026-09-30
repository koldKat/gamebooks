// Series tab: lists all series, dialog edit (name/description/public/open-world),
// and delete (unlinks all books, removes user_series rows).
// To remove: delete this file and its <script type="module"> import in
// admin/index.html; remove the Series tab HTML/CSS.

import {
  api, el, badge, mkBtn, mkEditBtn, appendCell, _esc, showConfirm,
  storeData, getFiltered, renderPaged, setSearchFields, wireTableSearch,
} from './core.js';
import { editFields } from './editor.js';

export function renderSeriesTable(series) {
  const tbody = document.getElementById('series-body');
  tbody.innerHTML = '';
  if (!series.length) {
    const searching = !!document.getElementById('series-search')?.value.trim();
    tbody.innerHTML = `<tr><td colspan="7" style="color:#6b7280;padding:1rem">${searching ? 'No series found.' : 'No series yet.'}</td></tr>`;
    return;
  }
  for (const s of series) {
    const tr = tbody.insertRow();
    const nameTd = tr.insertCell();
    nameTd.textContent = s.name;
    appendCell(tr, s.created_by_username || '-');
    appendCell(tr, badge(s.book_count, s.book_count > 0 ? 'badge-green' : 'badge-grey'));
    appendCell(tr, s.is_public ? badge('Public','badge-green') : badge('Private','badge-grey'));
    appendCell(tr, s.created_at ? new Date(s.created_at * 1000).toLocaleDateString() : '-');
    const descTd = tr.insertCell();
    descTd.style.cssText = 'max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#9ca3af;font-size:0.8rem';
    descTd.textContent = s.description || '-';
    const actionsTd = tr.insertCell();
    const grp = el('div', 'btn-group');
    grp.appendChild(mkEditBtn(() => _openSeriesEdit(s)));
    const delBtn  = mkBtn('Delete', 'btn-danger', () => {
      showConfirm(`Delete series "${s.name}"? This will unlink all books from this series.`, async () => {
        await api('DELETE', `/api/admin/series/${s.id}`);
        loadAdminSeries();
      });
    });
    grp.appendChild(delBtn);
    actionsTd.appendChild(grp);
  }
}

export async function loadAdminSeries() {
  const tbody = document.getElementById('series-body');
  tbody.innerHTML = '<tr><td colspan="7" style="color:#6b7280;padding:1rem">Loading…</td></tr>';
  try {
    const series = await api('GET', '/api/admin/series/all');
    document.getElementById('series-meta').textContent = `${series.length} series`;
    storeData('series', series);
    renderPaged('series', getFiltered('series'), renderSeriesTable);
  } catch (e) { tbody.innerHTML = `<tr><td colspan="7" style="color:#f87171">${_esc(e.message)}</td></tr>`; }
}

function _openSeriesEdit(s) {
  editFields({
    title: `Edit Series: ${s.name}`,
    fields: [
      { key: 'name', label: 'Name', value: s.name, required: true },
      { key: 'description', label: 'Description', type: 'textarea', value: s.description },
      { key: 'is_public', label: 'Make public', type: 'checkbox', value: s.is_public },
      { key: 'is_open_world', label: 'Open world series', type: 'checkbox', value: s.is_open_world },
    ],
    save: values => api('PATCH', `/api/admin/series/${s.id}`, { ...values, description: values.description || null }),
    afterSave: loadAdminSeries,
  });
}

setSearchFields('series', ['name', 'created_by_username']);
wireTableSearch('series', 'series-search', 'series-search-clear', renderSeriesTable);
