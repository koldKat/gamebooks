// feedback.js - Feedback submission modal

import { getUsername, getToken, apiFetch } from '../core/state.js';
import { t } from '../i18n.js';
import { uploadAttachment, addAttachmentItem } from '../core/util.js';

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
      if (newSubmit.disabled) return;
      const uploads = Array.from(fileInputNew.files, file => {
        const item = addAttachmentItem(document.getElementById('feedback-att-list'), file.name);
        // Wire removal up front so the ✕ works while still uploading or after a failure.
        let removed = false, uploadedId = null;
        item.querySelector('.att-item-rm').addEventListener('click', () => {
          removed = true;
          if (uploadedId != null) _pendingIds = _pendingIds.filter(id => id !== uploadedId);
          item.remove();
        });
        return { file, item, isRemoved: () => removed, setId: id => { uploadedId = id; } };
      });
      fileInputNew.value = '';
      for (const { file, item, isRemoved, setId } of uploads) {
        if (!fileInputNew.isConnected) break;
        if (isRemoved()) continue;
        try {
          const data = await uploadAttachment(file);
          if (!fileInputNew.isConnected || isRemoved()) continue;
          setId(data.id);
          _pendingIds.push(data.id);
          item.classList.remove('att-uploading');
        } catch {
          if (!fileInputNew.isConnected || isRemoved()) continue;
          item.classList.replace('att-uploading', 'att-error');
          item.querySelector('.att-item-name').textContent = t('util.upload_failed', { name: file.name });
        }
      }
    });

    newCancel.addEventListener('click', () => {
      document.getElementById('feedback-modal-overlay').classList.remove('active');
    });

    newSubmit.addEventListener('click', async () => {
      const attachments = document.getElementById('feedback-att-list');
      const uploadIssue = attachments.querySelector('.att-uploading') ? 'att.upload_pending'
        : attachments.querySelector('.att-error') ? 'att.upload_errors' : null;
      if (uploadIssue) {
        document.getElementById('feedback-error').textContent = t(uploadIssue);
        return;
      }
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
        if (newSubmit.isConnected) document.getElementById('feedback-modal-overlay').classList.remove('active');
      } catch {
        if (newSubmit.isConnected) document.getElementById('feedback-error').textContent = t('feedback.submit_error');
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
