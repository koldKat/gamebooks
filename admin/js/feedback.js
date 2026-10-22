// Feedback threads, replies, attachments, and read status.

import { api, esc, fmtMsgBody, fmtAttachments, showAlert, showConfirm, renderPaginationControls } from './core.js';

let page = 0, request = 0;
const replies = new Map();
const openThreads = new Set();
let threadRows = new Map();
function renderThreadMessages(thread) {
  return (thread?.messages || []).map(m => `<div class="fmsg fmsg--${m.sender}"><div class="fmsg-body">${fmtMsgBody(m.body)}</div>${fmtAttachments(m.attachments)}<div class="fmsg-time">${new Date(m.created_at * 1000).toLocaleString()}</div></div>`).join('');
}
export async function loadFeedback() {
  const generation = ++request;
  document.querySelectorAll('.feedback-reply-form textarea').forEach(ta => replies.set(ta.id, ta.value));
  const meta = document.getElementById('feedback-meta');
  try {
    const params = new URLSearchParams({ page, pageSize: 20, query: document.getElementById('feedback-search').value.trim() });
    const { threads, unread, pagination } = await api('GET', `/api/admin/feedback?${params}`);
    if (generation !== request) return;
    page = pagination.page;
    threadRows = new Map(threads.map(thread => [String(thread.id),thread]));
    meta.textContent = `${pagination.total} thread${pagination.total !== 1 ? 's' : ''}`;
    const badge = document.getElementById('feedback-unread-badge');
    badge.textContent   = unread > 0 ? String(unread) : '';
    badge.style.display = unread > 0 ? '' : 'none';

    const list = document.getElementById('feedback-list');
    list.innerHTML = threads.map(t => {
      const msgs = t.messages || [];
      const lastMsg = msgs[msgs.length - 1];
      const preview = lastMsg ? lastMsg.body.slice(0, 120).replace(/\n/g, ' ') : '';
      const isOpen = openThreads.has(String(t.id));
      const msgsHtml = isOpen ? renderThreadMessages(t) : '';
      const isUnread = t.admin_unread > 0;
      return `<div class="feedback-card${isUnread ? ' feedback-card--unread' : ''}${isOpen ? ' feedback-card--open' : ''}" id="fc-${t.id}">
        <div class="feedback-card-header" role="button" tabindex="0" aria-expanded="${isOpen}" onclick="toggleFeedbackCard(this)">
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
              <button class="btn btn-info" onclick="sendReply(${t.id})">Send Reply</button>
              <button class="btn btn-danger" onclick="deleteFeedbackMsg(${t.id})">Delete thread</button>
            </div>
          </div>
        </div>
      </div>`;
    }).join('') || '<div class="admin-empty">No feedback found.</div>';
    list.querySelectorAll('textarea').forEach(ta => { ta.value = replies.get(ta.id) || ''; });
    renderPaginationControls('feedback',page,Math.max(1,Math.ceil(pagination.total/pagination.pageSize)),pagination.total,next => { page=next; loadFeedback(); });
  } catch (e) { meta.textContent = 'Error loading feedback.'; console.error(e); }
}

async function toggleFeedbackCard(headerEl) {
  const card = headerEl.closest('.feedback-card');
  const threadId = card.id.slice(3);
  card.classList.toggle('feedback-card--open');
  if (card.classList.contains('feedback-card--open')) openThreads.add(threadId);
  else openThreads.delete(threadId);
  card.querySelector('.feedback-msgs').innerHTML = openThreads.has(threadId) ? renderThreadMessages(threadRows.get(threadId)) : '';
  headerEl.setAttribute('aria-expanded', String(card.classList.contains('feedback-card--open')));
  if (card.classList.contains('feedback-card--open') && card.classList.contains('feedback-card--unread')) {
    try {
      await api('POST', `/api/admin/feedback/${card.id.slice(3)}/read`);
      card.classList.remove('feedback-card--unread');
      if (threadRows.has(threadId)) threadRows.get(threadId).admin_unread = 0;
      const badge = document.getElementById('feedback-unread-badge');
      const n = Math.max(0,(parseInt(badge.textContent,10)||0)-1);
      badge.textContent = n ? String(n) : ''; badge.style.display = n ? '' : 'none';
    } catch (error) { showAlert('Could not mark this thread as read.'); }
  }
}

async function deleteFeedbackMsg(id) {
  showConfirm('Delete this thread from your inbox? Messages and attachments are permanently removed only after both sides delete it.', async () => {
    try {
      await api('DELETE', `/api/admin/feedback/${id}`);
      loadFeedback();
    } catch (error) { showAlert('Failed to delete the thread or its attachments. Please refresh and try again.'); }
  }, { label: 'Delete', variant: 'danger' });
}

async function sendReply(id) {
  const ta    = document.getElementById('reply-' + id);
  const reply = ta?.value?.trim();
  if (!reply) return;
  const button = ta.closest('.feedback-card').querySelector('.feedback-reply-btns button');
  if (button.disabled) return;
  button.disabled = true;
  try {
    await api('POST', `/api/admin/feedback/${id}/reply`, { reply });
    ta.value = ''; replies.delete(ta.id);
    loadFeedback();
  } catch (e) { showAlert('Failed to send reply.'); }
  finally { button.disabled = false; }
}

// Inline onclick handlers resolve through window, not module scope.
window.toggleFeedbackCard = toggleFeedbackCard;
window.deleteFeedbackMsg  = deleteFeedbackMsg;
window.sendReply          = sendReply;

let searchTimer;
document.getElementById('feedback-search').addEventListener('input', () => {
  clearTimeout(searchTimer); ++request;
  document.getElementById('feedback-search-clear').style.display = document.getElementById('feedback-search').value ? 'inline-block' : 'none';
  searchTimer = setTimeout(() => { page=0; loadFeedback(); },200);
});
document.getElementById('feedback-search-clear').addEventListener('click', () => {
  clearTimeout(searchTimer); document.getElementById('feedback-search').value = '';
  document.getElementById('feedback-search-clear').style.display = 'none'; page=0; loadFeedback();
  document.getElementById('feedback-search').focus();
});

document.getElementById('feedback-list').addEventListener('keydown', event => {
  if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('.feedback-card-header')) { event.preventDefault(); toggleFeedbackCard(event.target); }
});
