// Display announcement history only when the header version is clicked.
import { formatAnnBody } from './formatting.js';
import { escapeHtml } from '../core/util.js';
import { loadingHtml } from '../ui-helpers/loading.js';
import '../ui-helpers/dialog-escape.js';

let dialog;

export function openChangelog() {
  if (dialog?.open) return;
  if (!document.querySelector('link[data-changelog-style]')) {
    const style = document.createElement('link');
    style.rel = 'stylesheet';
    style.href = '/css/components/changelog.css';
    style.dataset.changelogStyle = '';
    document.head.append(style);
  }
  const current = document.createElement('dialog');
  dialog = current;
  current.id = 'changelog-dialog';
  current.setAttribute('aria-labelledby', 'changelog-title');
  current.innerHTML = '<header><h2 id="changelog-title" class="modal-title">Changelog</h2><button type="button" class="modal-close-btn" data-dialog-close aria-label="Close">×</button></header><div class="changelog-body"></div><button type="button" class="changelog-more">Earlier announcements</button>';
  const body = current.querySelector('.changelog-body');
  const more = current.querySelector('.changelog-more');
  let cursor = null, loading = false, controller;
  const close = () => current.close();
  current.querySelector('[data-dialog-close]').addEventListener('click', close);
  current.addEventListener('close', () => {
    controller?.abort();
    current.remove();
    if (dialog === current) dialog = null;
  }, { once: true });
  current.addEventListener('click', event => {
    if (event.target !== current) return;
    const bounds = current.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) close();
  });
  async function load() {
    if (loading) return;
    loading = true;
    more.disabled = true;
    const status = document.createElement('div');
    status.innerHTML = loadingHtml();
    body.append(status);
    controller = new AbortController();
    try {
      const response = await fetch('/api/announcements/history' + (cursor ? '?before=' + encodeURIComponent(cursor) : ''), { signal: controller.signal });
      if (!response.ok) throw new Error('History unavailable');
      const page = await response.json();
      if (!current.open) return;
      for (const item of page.items) {
        const article = document.createElement('article');
        article.className = 'changelog-entry';
        const date = new Date(item.published_at * 1000);
        article.innerHTML = `<h3>${escapeHtml(item.title)}</h3><time datetime="${date.toISOString()}">${escapeHtml(date.toLocaleDateString(undefined, { dateStyle: 'long' }))}</time><div class="feed-ann-body">${formatAnnBody(item.body, item.bookCovers)}</div>`;
        body.append(article);
      }
      if (!body.querySelector('article')) {
        const empty = document.createElement('p');
        empty.textContent = 'No announcements yet.';
        body.append(empty);
      }
      cursor = page.next;
      more.hidden = !cursor;
      more.textContent = 'Earlier announcements';
    } catch (error) {
      if (error.name !== 'AbortError' && current.open) {
        more.hidden = false;
        more.textContent = 'Unable to load. Try again';
      }
    } finally {
      status.remove();
      loading = false;
      more.disabled = false;
    }
  }
  more.addEventListener('click', load);
  document.body.append(current);
  current.showModal();
  load();
}
