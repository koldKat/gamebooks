import { getToken, clearToken, clearUsername } from '../core/state.js';
import { t } from '../i18n.js';
import { escapeHtml } from '../core/util.js';

const _PDF_ICON_MARKUP = `
  <span class="inline-svg-icon pdf-svg-icon" aria-hidden="true">
    <svg viewBox="0 0 24 24" focusable="false">
      <path d="M7 2h7l5 5v15a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z"></path>
      <path d="M14 2v6h6"></path>
      <path d="M8 17h2.1a1.9 1.9 0 0 0 0-3.8H8V17Z"></path>
      <path d="M12 13.2h1.5a1.9 1.9 0 1 1 0 3.8H12v-3.8Z"></path>
      <path d="M16.5 17v-3.8H19"></path>
      <path d="M16.5 15.1H18.6"></path>
    </svg>
  </span>
`;
const _EPUB_ICON_MARKUP = `
  <span class="inline-svg-icon epub-svg-icon" aria-hidden="true">
    <svg viewBox="0 0 24 24" focusable="false">
      <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"></path>
    </svg>
  </span>
`;
const _PDF_MAX_BYTES = 256 * 1024 * 1024;
const _EPUB_MAX_BYTES = 256 * 1024 * 1024;


export function formatFileSize(bytes) {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value < 0) return '';
  if (value < 1024) return `${value} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let size = value / 1024;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  const decimals = size >= 100 ? 0 : size >= 10 ? 1 : 2;
  return `${size.toFixed(decimals)} ${units[unitIndex]}`;
}

export function _acceptPdfSelection(file, { inputId, labelId, errorId }) {
  if (!file) return false;
  const errEl = errorId ? document.getElementById(errorId) : null;
  if (errEl) errEl.textContent = '';
  if (file.size > _PDF_MAX_BYTES) {
    if (errEl) errEl.textContent = t('editbook.pdf_too_large', { size: formatFileSize(_PDF_MAX_BYTES) });
    const input = inputId ? document.getElementById(inputId) : null;
    if (input) input.value = '';
    const label = labelId ? document.getElementById(labelId) : null;
    if (label) label.textContent = '';
    return false;
  }
  return true;
}

export function _setPdfInlineLabel(el, text) {
  if (!el) return;
  el.innerHTML = `${_PDF_ICON_MARKUP}<span>${escapeHtml(text || '')}</span>`;
}

export function _setPdfCurrentLink(linkEl, sizeBytes = null) {
  if (!linkEl) return;
  const sizeText = formatFileSize(sizeBytes);
  _setPdfInlineLabel(linkEl, sizeText ? t('editbook.current_pdf_size', { size: sizeText }) : t('editbook.current_pdf'));
}

export function _acceptEpubSelection(file, { inputId, labelId, errorId }) {
  if (!file) return false;
  const errEl = errorId ? document.getElementById(errorId) : null;
  if (errEl) errEl.textContent = '';
  if (file.size > _EPUB_MAX_BYTES) {
    if (errEl) errEl.textContent = t('editbook.epub_too_large', { size: formatFileSize(_EPUB_MAX_BYTES) });
    const input = inputId ? document.getElementById(inputId) : null;
    if (input) input.value = '';
    const label = labelId ? document.getElementById(labelId) : null;
    if (label) label.textContent = '';
    return false;
  }
  return true;
}

export function _setEpubInlineLabel(el, text) {
  if (!el) return;
  el.innerHTML = `${_EPUB_ICON_MARKUP}<span>${escapeHtml(text || '')}</span>`;
}

export function _setEpubCurrentLink(linkEl, sizeBytes = null) {
  if (!linkEl) return;
  const sizeText = formatFileSize(sizeBytes);
  _setEpubInlineLabel(linkEl, sizeText ? t('editbook.current_epub_size', { size: sizeText }) : t('editbook.current_epub'));
}

export function _setModalUploadProgress(prefix, pct = null, kind = 'pdf') {
  const wrap = document.getElementById(`${prefix}-${kind}-progress`);
  const bar  = document.getElementById(`${prefix}-${kind}-progress-bar`);
  if (!wrap || !bar) return;
  if (pct == null) { wrap.style.display = 'none'; bar.style.width = '0%'; return; }
  wrap.style.display = 'block';
  bar.style.width = `${Math.max(0, Math.min(100, Number(pct) || 0))}%`;
}

export function _setButtonsDisabled(ids, disabled) {
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = !!disabled;
  });
}

function _parseResponseJsonSafe(text) {
  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
}

export function _uploadPdfWithProgress(urlPath, file, prefix, isCurrent = () => true, { keepProgress = false } = {}) {
  const progress = pct => { if (isCurrent()) _setModalUploadProgress(prefix, pct); };
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', urlPath, true);
    const token = getToken();
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.setRequestHeader('Content-Type', 'application/pdf');
    xhr.upload.onprogress = e => {
      if (!e.lengthComputable) return;
      progress((e.loaded / e.total) * 100);
    };
    xhr.onerror = () => { progress(null); reject(new Error(t('editbook.network_error'))); };
    xhr.onload = () => {
      const status = xhr.status || 0;
      if (status === 503) {
        window.dispatchEvent(new Event('maintenance-mode'));
        progress(null);
        reject(new Error(t('editbook.maintenance')));
        return;
      }
      if (status === 401) {
        clearToken(); clearUsername();
        window.dispatchEvent(new Event('auth-expired'));
        progress(null);
        reject(new Error(t('editbook.unauthorized')));
        return;
      }
      const data = _parseResponseJsonSafe(xhr.responseText);
      if (status < 200 || status >= 300) {
        progress(null);
        reject(new Error(data?.error || t('editbook.pdf_upload_failed')));
        return;
      }
      progress(100);
      if (!keepProgress) setTimeout(() => progress(null), 250);
      resolve(data);
    };
    progress(0);
    xhr.send(file);
  });
}

export function _uploadEpubWithProgress(urlPath, file, prefix, isCurrent = () => true, { keepProgress = false } = {}) {
  const progress = pct => { if (isCurrent()) _setModalUploadProgress(prefix, pct, 'epub'); };
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', urlPath, true);
    const token = getToken();
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.setRequestHeader('Content-Type', 'application/epub+zip');
    xhr.upload.onprogress = e => {
      if (!e.lengthComputable) return;
      progress((e.loaded / e.total) * 100);
    };
    xhr.onerror = () => { progress(null); reject(new Error(t('editbook.network_error'))); };
    xhr.onload = () => {
      const status = xhr.status || 0;
      if (status === 503) {
        window.dispatchEvent(new Event('maintenance-mode'));
        progress(null);
        reject(new Error(t('editbook.maintenance')));
        return;
      }
      if (status === 401) {
        clearToken(); clearUsername();
        window.dispatchEvent(new Event('auth-expired'));
        progress(null);
        reject(new Error(t('editbook.unauthorized')));
        return;
      }
      const data = _parseResponseJsonSafe(xhr.responseText);
      if (status < 200 || status >= 300) {
        progress(null);
        reject(new Error(data?.error || t('editbook.epub_upload_failed')));
        return;
      }
      progress(100);
      if (!keepProgress) setTimeout(() => progress(null), 250);
      resolve(data);
    };
    progress(0);
    xhr.send(file);
  });
}

export function _adminPdfHref(pdfPath) {
  if (!pdfPath) return '';
  const token = getToken();
  return token ? `/books/${pdfPath}?token=${encodeURIComponent(token)}` : `/books/${pdfPath}`;
}
