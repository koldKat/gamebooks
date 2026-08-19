// feedback.js - Feedback submission modal

import { getUsername, getToken, apiFetch } from './state.js?v=14';
import { t } from './i18n.js?v=73';
import { uploadAttachment, addAttachmentItem } from './util.js?v=89';

export function initFeedback() {
  document.getElementById('feedback-btn').addEventListener('click', () => {
    const user = getUsername();
    const unRow = document.getElementById('feedback-username-input').closest('.input-group');
    if (user) {
      document.getElementById('feedback-username-input').value = user;
      unRow.style.display = '';
    } else {
      document.getElementById('feedback-username-input').value = '';
      unRow.style.display = 'none';
    }
    document.getElementById('feedback-email-input').value    = '';
    document.getElementById('feedback-message-input').value  = '';
    document.getElementById('feedback-error').textContent    = '';
    document.getElementById('feedback-att-list').innerHTML   = '';
    document.getElementById('feedback-modal-overlay').classList.add('active');
    document.getElementById('feedback-message-input').focus();

    // Prefill from the user's profile email so they're not stuck retyping it every time.
    if (getToken()) {
      apiFetch('/api/profile').then(res => res.ok ? res.json() : null).then(data => {
        const emailInput = document.getElementById('feedback-email-input');
        if (data?.email && !emailInput.value) emailInput.value = data.email;
      }).catch(() => {});
    }

    let _pendingIds = [];

    document.getElementById('feedback-file-input').value = '';

    const submitBtn = document.getElementById('feedback-submit-btn');
    const cancelBtn = document.getElementById('feedback-cancel-btn');
    const newSubmit = submitBtn.cloneNode(true);
    const newCancel = cancelBtn.cloneNode(true);
    submitBtn.parentNode.replaceChild(newSubmit, submitBtn);
    cancelBtn.parentNode.replaceChild(newCancel, cancelBtn);

    const fileInput = document.getElementById('feedback-file-input');
    const fileInputNew = fileInput.cloneNode(false);
    fileInput.parentNode.replaceChild(fileInputNew, fileInput);

    fileInputNew.addEventListener('change', async () => {
      for (const file of fileInputNew.files) {
        const item = addAttachmentItem(document.getElementById('feedback-att-list'), file.name);
        try {
          const data = await uploadAttachment(file);
          _pendingIds.push(data.id);
          item.classList.remove('att-uploading');
          item.querySelector('.att-item-rm').addEventListener('click', () => {
            _pendingIds = _pendingIds.filter(id => id !== data.id);
            item.remove();
          });
        } catch {
          item.classList.replace('att-uploading', 'att-error');
          item.querySelector('.att-item-name').textContent = t('util.upload_failed', { name: file.name });
        }
      }
      fileInputNew.value = '';
    });

    newCancel.addEventListener('click', () => {
      document.getElementById('feedback-modal-overlay').classList.remove('active');
    });

    newSubmit.addEventListener('click', async () => {
      const message = document.getElementById('feedback-message-input').value.trim();
      if (!message) {
        document.getElementById('feedback-error').textContent = t('feedback.message_required');
        return;
      }
      newSubmit.disabled = true;
      try {
        const res = await apiFetch('/api/feedback', {
          method: 'POST',
          body: JSON.stringify({
            username: document.getElementById('feedback-username-input').value,
            email:    document.getElementById('feedback-email-input').value.trim() || null,
            message,
            attachment_ids: _pendingIds,
          }),
        });
        if (!res.ok) throw new Error();
        document.getElementById('feedback-modal-overlay').classList.remove('active');
      } catch {
        document.getElementById('feedback-error').textContent = t('feedback.submit_error');
      } finally {
        newSubmit.disabled = false;
      }
    });
  });

  let _mdOnOverlay = false;
  const feedbackOverlay = document.getElementById('feedback-modal-overlay');
  feedbackOverlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === feedbackOverlay; });
  feedbackOverlay.addEventListener('click', e => {
    if (e.target === feedbackOverlay && _mdOnOverlay) feedbackOverlay.classList.remove('active');
  });
  document.getElementById('feedback-close').addEventListener('click', () =>
    document.getElementById('feedback-modal-overlay').classList.remove('active'));
}
