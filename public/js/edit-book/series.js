import { editState } from './state.js';
import { apiFetch } from '../state.js';
import { t } from '../i18n.js';
import { _refreshLibraryUi } from '../books.js';

export function openEditSeriesModal(seriesId, name, description, isPublic = false, isOpenWorld = false) {
  ++editState._seriesSession;
  editState._esrSeriesId = seriesId;
  document.getElementById('esr-name').value         = name || '';
  document.getElementById('esr-description').value  = description || '';
  document.getElementById('esr-public').checked     = !!isPublic;
  document.getElementById('esr-open-world').checked = !!isOpenWorld;
  document.getElementById('esr-error').textContent  = '';
  document.getElementById('edit-series-overlay').classList.add('active');
  document.getElementById('esr-name').focus();
}

export function initSeriesBindings(mousedownOnOverlayRef) {
  // ── Edit Series modal events ──────────────────────────────────────────────
  const _closeEsr = () => document.getElementById('edit-series-overlay').classList.remove('active');
  document.getElementById('esr-cancel').addEventListener('click', _closeEsr);
  document.getElementById('esr-close').addEventListener('click', _closeEsr);
  document.getElementById('edit-series-overlay').addEventListener('click', e => {
    if (e.target === e.currentTarget && mousedownOnOverlayRef() === e.currentTarget) _closeEsr();
  });
  document.getElementById('esr-save').addEventListener('click', async () => {
    const name        = document.getElementById('esr-name').value.trim();
    const description = document.getElementById('esr-description').value.trim() || null;
    const isPublic    = document.getElementById('esr-public').checked;
    const isOpenWorld = document.getElementById('esr-open-world').checked;
    const errEl       = document.getElementById('esr-error');
    errEl.textContent = '';
    if (!name) { errEl.textContent = t('err.name_empty'); return; }
    const session = editState._seriesSession;
    const isCurrent = () => session === editState._seriesSession && document.getElementById('edit-series-overlay').classList.contains('active');
    try {
      const r = await apiFetch(`/api/series/${editState._esrSeriesId}`, { method: 'PATCH', body: JSON.stringify({ name, description, is_public: isPublic, is_open_world: isOpenWorld }) });
      if (!r.ok) { const j = await r.json().catch(() => ({})); if (isCurrent()) errEl.textContent = j.error || t('editbook.failed'); return; }
      if (isCurrent()) _closeEsr();
      await _refreshLibraryUi({ feed: true });
    } catch (_) { if (isCurrent()) errEl.textContent = t('editbook.failed'); }
  });

}
