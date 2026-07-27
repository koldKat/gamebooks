// util.js - Shared pure utility functions

import { apiFetch } from './state.js?v=11';
import { t } from './i18n.js?v=12';

export function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

export async function fetchPublic(url, options) {
  const res = await fetch(url, options);
  if (res.status === 503) { window.dispatchEvent(new Event('maintenance-mode')); throw new Error('Maintenance'); }
  return res;
}

// Image compression — shrinks to fit within maxDim, then JPEG-quality iterates down until <= maxBytes.
// Best-effort: at the quality floor it returns whatever blob it has rather
// than giving up, since a slightly-over-budget blob is more useful to a
// caller than nothing at all - `confirmCrop()` (profile.js) is the one
// exception that wants a stricter "gave up" signal, and does its own
// `if (!blob) return;` check for that.
export function compressToBlob(canvas, maxBytes) {
  return new Promise(resolve => {
    const tryQ = q => {
      canvas.toBlob(blob => {
        if (!blob) { resolve(null); return; }
        if (blob.size <= maxBytes || q <= 0.1) resolve(blob);
        else tryQ(+(q - 0.1).toFixed(1));
      }, 'image/jpeg', q);
    };
    tryQ(0.92);
  });
}

export function compressImage(file, maxBytes = 512 * 1024, maxDim = 1200) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      try {
        URL.revokeObjectURL(url);
        const canvas = document.createElement('canvas');
        let w = img.naturalWidth, h = img.naturalHeight;
        if (w > maxDim || h > maxDim) {
          const r = Math.min(maxDim / w, maxDim / h);
          w = Math.round(w * r); h = Math.round(h * r);
        }
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(null); return; }
        ctx.drawImage(img, 0, 0, w, h);
        compressToBlob(canvas, maxBytes).then(resolve).catch(reject);
      } catch (e) { reject(e); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Failed to load image')); };
    img.src = url;
  });
}

// ── Feedback/inbox attachment upload ──────────────────────────────────────────
// Used to be two separately-maintained near-identical copies (feedback.js's
// _uploadFile, inbox.js's _uploadAttachment) - both used a raw fetch() instead
// of apiFetch, silently missing the app-wide 401/503 handling every other
// authenticated call gets.

const _ATTACHMENT_IMG_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif']);

export function isImageFilename(name) {
  const s = String(name || '');
  return _ATTACHMENT_IMG_EXTS.has(s.slice(s.lastIndexOf('.')).toLowerCase());
}

export async function uploadAttachment(file, maxBytes = 512 * 1024) {
  let body;
  if (isImageFilename(file.name) && file.size > maxBytes) {
    const blob = await compressImage(file, maxBytes);
    body = blob || file;
  } else {
    body = file;
  }
  const res = await apiFetch('/api/attachments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream', 'X-Filename': encodeURIComponent(file.name) },
    body,
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Upload failed');
  return res.json();
}

export function addAttachmentItem(container, name) {
  const item = document.createElement('div');
  item.className = 'att-item att-uploading';
  item.innerHTML = `<span class="att-item-name">${escapeHtml(name)}</span><button class="att-item-rm" title="${t('util.remove_title')}">✕</button>`;
  container.appendChild(item);
  return item;
}
