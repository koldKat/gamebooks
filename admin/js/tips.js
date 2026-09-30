// Tips tab: lists/filters/edits/deletes the tips table, plus the "Add New Tip"
// form. Self-contained - the tip list (_allTips) isn't read by any other tab.
// To remove: delete this file and its <script type="module"> import in
// admin/index.html; remove #tips-type-filter/#tips-active-filter/#new-tip-save
// listener wiring (this file owns them) and the Tips tab HTML/CSS.

import { api, el, badge, mkBtn, mkEditBtn, appendCell, _esc, showConfirm } from './core.js';
import { editFields } from './editor.js';

let _allTips = [];

export async function loadTips() {
  try {
    _allTips = await api('GET', '/api/admin/tips');
    _renderTips();
  } catch (e) { document.getElementById('tips-body').innerHTML = `<tr><td colspan="4" style="color:#f87171">${_esc(e.message)}</td></tr>`; }
}

function _renderTips() {
  const typeF   = document.getElementById('tips-type-filter').value;
  const activeF = document.getElementById('tips-active-filter').value;
  const tips = _allTips.filter(t =>
    (!typeF   || t.type === typeF) &&
    (activeF === '' || String(t.active) === activeF)
  );
  document.getElementById('tips-count').textContent = `${tips.length} of ${_allTips.length} tips`;
  const tbody = document.getElementById('tips-body');
  tbody.innerHTML = '';
  for (const t of tips) {
    const tr = tbody.insertRow();
    appendCell(tr, badge(t.type, t.type === 'real' ? 'badge-green' : 'badge-amber'));
    const activeTd = tr.insertCell();
    activeTd.innerHTML = `<label style="cursor:pointer"><input type="checkbox" data-id="${t.id}" class="tip-active-cb" ${t.active ? 'checked' : ''}></label>`;
    const textTd = tr.insertCell();
    textTd.style.cssText = 'color:#d1d5db;font-size:0.82rem';
    textTd.innerHTML = `<div class="tip-text-display" data-id="${t.id}" style="cursor:pointer" title="Click to edit">${_esc(t.text)}</div>`;
    const grp = el('div', 'btn-group');
    grp.appendChild(mkEditBtn(() => editTip(t)));
    const delBtn = mkBtn('Delete', 'btn-danger', () => {
      showConfirm('Delete this tip?', async () => { await api('DELETE', `/api/admin/tips/${t.id}`); loadTips(); });
    });
    const typeBtn = mkBtn(t.type === 'real' ? '→ Silly' : '→ Real', 'btn-warn', async () => {
      await api('PATCH', `/api/admin/tips/${t.id}`, { type: t.type === 'real' ? 'silly' : 'real' });
      loadTips();
    });
    grp.appendChild(typeBtn); grp.appendChild(delBtn);
    const actionsTd = tr.insertCell();
    actionsTd.appendChild(grp);
  }
  // Text and the Edit button open the same dialog.
  tbody.querySelectorAll('.tip-text-display').forEach(div => {
    div.addEventListener('click', () => {
      const id = +div.dataset.id;
      const tip = _allTips.find(t => t.id === id);
      if (!tip) return;
      editTip(tip);
    });
  });
  // Active toggles
  tbody.querySelectorAll('.tip-active-cb').forEach(cb => {
    cb.addEventListener('change', async () => {
      await api('PATCH', `/api/admin/tips/${+cb.dataset.id}`, { active: cb.checked });
      const tip = _allTips.find(t => t.id === +cb.dataset.id);
      if (tip) tip.active = cb.checked ? 1 : 0;
    });
  });
}

function editTip(tip) {
  editFields({
    title: 'Edit Tip',
    fields: [
      { key: 'text', label: 'Text', type: 'textarea', value: tip.text, required: true },
      { key: 'type', label: 'Type', options: ['real', 'silly'], value: tip.type },
      { key: 'active', label: 'Active', type: 'checkbox', value: tip.active },
    ],
    save: values => {
      if (!values.text) throw new Error('Text is required.');
      return api('PATCH', `/api/admin/tips/${tip.id}`, values);
    },
    afterSave: loadTips,
  });
}

document.getElementById('tips-type-filter').addEventListener('change', _renderTips);
document.getElementById('tips-active-filter').addEventListener('change', _renderTips);

document.getElementById('new-tip-save').addEventListener('click', async () => {
  const text = document.getElementById('new-tip-text').value.trim();
  const type = document.getElementById('new-tip-type').value;
  const errEl = document.getElementById('new-tip-error');
  errEl.textContent = '';
  if (!text) { errEl.textContent = 'Text is required.'; return; }
  try {
    await api('POST', '/api/admin/tips', { text, type });
    document.getElementById('new-tip-text').value = '';
    loadTips();
  } catch (e) { errEl.textContent = e.message || 'Failed.'; }
});
