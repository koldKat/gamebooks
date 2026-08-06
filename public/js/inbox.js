// inbox.js - Inbox thread list, conversation view, and reply UI

import { apiFetch, getUsername } from './state.js?v=13';
import { t } from './i18n.js?v=38';
import { showConfirm } from './play.js?v=87';
import { refreshInboxBadge } from './notif.js?v=52';
import { escapeHtml, isImageFilename, uploadAttachment, addAttachmentItem } from './util.js?v=47';

let _inboxThreads    = [];
let _currentThreadId = null;
let _pendingAttIds   = [];
let _attSession      = 0;

function _formatMsgBody(str) {
  return escapeHtml(str)
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
}

function _renderAttachments(attachments) {
  if (!attachments?.length) return '';
  const items = attachments.map(a => {
    if (isImageFilename(a.filename)) {
      return `<a href="/attachments/${escapeHtml(a.filename)}" target="_blank" class="att-thumb-wrap">
        <img src="/attachments/${escapeHtml(a.filename)}" class="att-thumb" alt="${escapeHtml(a.original_name)}" loading="lazy">
      </a>`;
    }
    return `<a href="/attachments/${escapeHtml(a.filename)}" target="_blank" class="att-file-link">${escapeHtml(a.original_name)}</a>`;
  }).join('');
  return `<div class="msg-attachments">${items}</div>`;
}

function _renderInboxList() {
  const list = document.getElementById('inbox-list');
  if (!_inboxThreads.length) {
    list.innerHTML = `<p class="inbox-empty">${t('inbox.empty')}</p>`;
    return;
  }
  list.innerHTML = _inboxThreads.map(th => {
    const unread  = (th.user_unread || 0) > 0;
    const msgs    = th.messages || [];
    const lastMsg = msgs[msgs.length - 1];
    const preview = lastMsg
      ? escapeHtml(lastMsg.body.substring(0, 80) + (lastMsg.body.length > 80 ? '…' : ''))
      : '';
    const date    = new Date(th.created_at * 1000).toLocaleDateString();
    const cnt     = msgs.length;
    const fromLabel = th.username && th.username !== getUsername() ? `<span class="inbox-item-from">${escapeHtml(th.username)}</span>` : '';
    return `<div class="inbox-item${unread ? ' inbox-item--unread' : ''}" data-id="${th.id}">
      <div class="inbox-item-meta">
        ${fromLabel}
        <span class="inbox-item-date">${date}</span>
        <span class="inbox-item-count">${cnt} message${cnt !== 1 ? 's' : ''}</span>
      </div>
      <div class="inbox-item-preview">${preview}</div>
    </div>`;
  }).join('');
  list.querySelectorAll('.inbox-item').forEach(el => {
    el.addEventListener('click', () => _openThread(Number(el.dataset.id)));
  });
}

function _renderConversation(thread) {
  document.getElementById('inbox-conv-date').textContent =
    new Date(thread.created_at * 1000).toLocaleDateString();
  const msgs = document.getElementById('inbox-messages');
  msgs.innerHTML = (thread.messages || []).map(m => `
    <div class="inbox-msg inbox-msg--${m.sender}">
      <div class="inbox-msg-body">${_formatMsgBody(m.body)}${_renderAttachments(m.attachments)}</div>
      <div class="inbox-msg-time">${new Date(m.created_at * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
    </div>`).join('');
  requestAnimationFrame(() => { msgs.scrollTop = msgs.scrollHeight; });
}

async function _openThread(threadId) {
  const thread = _inboxThreads.find(th => th.id === threadId);
  if (!thread) return;
  _currentThreadId = threadId;
  apiFetch(`/api/feedback/${threadId}/read`, { method: 'POST' }).catch(() => {});
  thread.user_unread = 0;
  refreshInboxBadge();
  _renderConversation(thread);
  document.getElementById('inbox-reply-input').value = '';
  _clearAttachments();
  document.getElementById('inbox-threads-view').style.display = 'none';
  document.getElementById('inbox-conv-view').style.display    = '';
}

function _clearAttachments() {
  _pendingAttIds = [];
  _attSession++;
  const list = document.getElementById('inbox-att-list');
  if (list) list.innerHTML = '';
}

function _showThreadList() {
  document.getElementById('inbox-conv-view').style.display    = 'none';
  document.getElementById('inbox-threads-view').style.display = '';
  _currentThreadId = null;
  _clearAttachments();
}

export function initInbox(mousedownOnOverlayRef) {
  document.getElementById('inbox-btn').addEventListener('click', async () => {
    try {
      const res = await apiFetch('/api/feedback');
      if (!res.ok) return;
      _inboxThreads = await res.json();
      _showThreadList();
      _renderInboxList();
      document.getElementById('inbox-modal-overlay').classList.add('active');
    } catch {}
  });

  document.getElementById('inbox-back-btn').addEventListener('click', () => {
    _renderInboxList();
    _showThreadList();
  });

  document.getElementById('inbox-file-input').addEventListener('change', async function() {
    for (const file of this.files) {
      const item = addAttachmentItem(document.getElementById('inbox-att-list'), file.name);
      const contextThread  = _currentThreadId;
      const contextSession = _attSession;
      try {
        const data = await uploadAttachment(file);
        if (_currentThreadId !== contextThread || _attSession !== contextSession) { item.remove(); continue; }
        _pendingAttIds.push(data.id);
        item.classList.remove('att-uploading');
        item.querySelector('.att-item-rm').addEventListener('click', () => {
          _pendingAttIds = _pendingAttIds.filter(id => id !== data.id);
          item.remove();
        });
      } catch {
        item.classList.replace('att-uploading', 'att-error');
        item.querySelector('.att-item-name').textContent = t('util.upload_failed', { name: file.name });
      }
    }
    this.value = '';
  });

  document.getElementById('inbox-reply-send-btn').addEventListener('click', async () => {
    const input   = document.getElementById('inbox-reply-input');
    const message = input.value.trim();
    if (!message || !_currentThreadId) return;
    const btn = document.getElementById('inbox-reply-send-btn');
    btn.disabled = true;
    const idsToSend = [..._pendingAttIds];
    try {
      const res = await apiFetch(`/api/feedback/${_currentThreadId}/reply`, {
        method: 'POST',
        body:   JSON.stringify({ message, attachment_ids: idsToSend }),
      });
      if (!res.ok) throw new Error();
      input.value = '';
      _clearAttachments();
      const listRes = await apiFetch('/api/feedback');
      if (listRes.ok) {
        _inboxThreads = await listRes.json();
        const updated = _inboxThreads.find(th => th.id === _currentThreadId);
        if (updated) _renderConversation(updated);
      }
    } catch { /* silent */ } finally { btn.disabled = false; }
  });

  document.getElementById('inbox-conv-delete-btn').addEventListener('click', () => {
    if (!_currentThreadId) return;
    showConfirm(t('inbox.confirm_delete'), async () => {
      await apiFetch(`/api/feedback/${_currentThreadId}`, { method: 'DELETE' });
      _inboxThreads = _inboxThreads.filter(th => th.id !== _currentThreadId);
      _renderInboxList();
      _showThreadList();
      refreshInboxBadge();
    }, { confirmLabel: t('btn.delete'), danger: true });
  });

  const _closeInbox = () => document.getElementById('inbox-modal-overlay').classList.remove('active');
  document.getElementById('inbox-close-btn').addEventListener('click', _closeInbox);
  document.getElementById('inbox-conv-close-btn').addEventListener('click', _closeInbox);
  document.getElementById('inbox-modal-close-x').addEventListener('click', _closeInbox);
  document.getElementById('inbox-modal-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('inbox-modal-overlay') && mousedownOnOverlayRef() === e.currentTarget) _closeInbox();
  });
}
