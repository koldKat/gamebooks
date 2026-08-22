// Feedback tab: lists feedback threads, auto-marks unread as read on tab view,
// renders messages/attachments, and handles reply/delete.
// To remove: delete this file and its <script type="module"> import in
// admin/index.html; remove the Feedback tab HTML/CSS.

import { api, esc, fmtMsgBody, fmtAttachments, showAlert, showConfirm } from './core.js?v=1464';

export async function loadFeedback() {
  const meta = document.getElementById('feedback-meta');
  try {
    const threads = await api('GET', '/api/admin/feedback');
    const unread  = threads.filter(t => t.admin_unread > 0).length;
    meta.textContent = `${threads.length} thread${threads.length !== 1 ? 's' : ''}${unread ? `, ${unread} with new messages` : ''}`;
    const badge = document.getElementById('feedback-unread-badge');
    badge.textContent   = unread > 0 ? String(unread) : '';
    badge.style.display = unread > 0 ? '' : 'none';

    // Auto-mark as read when admin views the tab
    for (const t of threads.filter(t => t.admin_unread > 0)) {
      api('POST', `/api/admin/feedback/${t.id}/read`).catch(() => {});
      t.admin_unread = 0;
    }
    badge.textContent   = '';
    badge.style.display = 'none';

    const list = document.getElementById('feedback-list');
    list.innerHTML = threads.map(t => {
      const msgs = t.messages || [];
      const lastMsg = msgs[msgs.length - 1];
      const preview = lastMsg ? lastMsg.body.slice(0, 120).replace(/\n/g, ' ') : '';
      const msgsHtml = msgs.map(m => `
        <div class="fmsg fmsg--${m.sender}">
          <div class="fmsg-body">${fmtMsgBody(m.body)}</div>
          ${fmtAttachments(m.attachments)}
          <div class="fmsg-time">${new Date(m.created_at * 1000).toLocaleString()}</div>
        </div>`).join('');
      const isUnread = t.admin_unread > 0;
      return `<div class="feedback-card${isUnread ? ' feedback-card--unread feedback-card--open' : ''}" id="fc-${t.id}">
        <div class="feedback-card-header" onclick="toggleFeedbackCard(this)">
          <span class="feedback-card-toggle">&#9654;</span>
          <div class="feedback-card-info">
            <span><strong>${esc(t.username)}</strong>${t.email ? ` &lt;${esc(t.email)}&gt;` : ''}<span class="feedback-card-count">${msgs.length} msg${msgs.length !== 1 ? 's' : ''}</span></span>
            <div class="feedback-card-preview">${esc(preview)}</div>
          </div>
          <span class="feedback-card-date">${new Date(t.created_at * 1000).toLocaleString()}</span>
        </div>
        <div class="feedback-card-body">
          <div class="feedback-msgs">${msgsHtml}</div>
          <div class="feedback-reply-form">
            <textarea id="reply-${t.id}" rows="6" placeholder="Reply…"></textarea>
            <div class="feedback-reply-btns">
              <button onclick="sendReply(${t.id})">Send Reply</button>
              <button class="feedback-delete-btn" onclick="deleteFeedbackMsg(${t.id})">Delete thread</button>
            </div>
          </div>
        </div>
      </div>`;
    }).join('');
  } catch (e) { meta.textContent = 'Error loading feedback.'; console.error(e); }
}

function toggleFeedbackCard(headerEl) {
  headerEl.closest('.feedback-card').classList.toggle('feedback-card--open');
}

async function deleteFeedbackMsg(id) {
  showConfirm('Delete this thread?', async () => {
    await api('DELETE', `/api/admin/feedback/${id}`);
    loadFeedback();
  }, { label: 'Delete', variant: 'danger' });
}

async function sendReply(id) {
  const ta    = document.getElementById('reply-' + id);
  const reply = ta?.value?.trim();
  if (!reply) return;
  try {
    await api('POST', `/api/admin/feedback/${id}/reply`, { reply });
    loadFeedback();
  } catch (e) { showAlert('Failed to send reply.'); }
}

// The feedback-card HTML above uses inline onclick="..." attributes (built as
// strings via innerHTML) - those resolve against the global scope, not this
// module's scope, so these three must be attached to window explicitly to
// keep working, unlike everything else in this file which is wired via
// addEventListener and stays properly module-scoped.
window.toggleFeedbackCard = toggleFeedbackCard;
window.deleteFeedbackMsg  = deleteFeedbackMsg;
window.sendReply          = sendReply;
