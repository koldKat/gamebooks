import { escapeHtml } from '../util.js';
import { t } from '../i18n.js';

let _previewLoadCleanup = null;
function _clearPreviewLoad() {
  _previewLoadCleanup?.();
  _previewLoadCleanup = null;
}

// Hides the hover image preview (avatar/cover, wired up per-render further
// down) - shared by the normal mouseleave path and the click guard below.
export function _hideFeedPreview() {
  _clearPreviewLoad();
  const preview = document.getElementById('feed-img-preview');
  if (!preview) return;
  preview.style.display = 'none';
  preview.classList.remove('feed-img-preview--avatar');
  const previewImg = document.getElementById('feed-img-preview-img');
  const previewFooter = document.getElementById('feed-img-preview-footer');
  const previewLevel = document.getElementById('feed-img-preview-level');
  if (previewImg) previewImg.style.display = 'block';
  if (previewFooter) previewFooter.style.display = 'none';
  if (previewLevel) { previewLevel.textContent = ''; previewLevel.style.display = 'none'; }
  const bar = document.getElementById('feed-img-bar');
  if (bar) {
    bar._loadTimer = clearTimeout(bar._loadTimer);
    bar.style.transition = 'none';
    bar.style.width = '0';
    bar.style.opacity = '0';
  }
}
// Same fix as tooltip.js's own click guard: a hover preview shown right
// before a click opens a new dialog (e.g. clicking a feed avatar/cover to
// open its public profile/activity view) never gets a mouseleave, since the
// pointer doesn't actually leave the element - it stays floating on top of
// whatever just opened until the mouse happens to move again. Module-level
// (registered once, not per feed render) since loadFeed() re-renders the
// feed's own DOM on every SSE update.
document.addEventListener('click', _hideFeedPreview);

function _positionFeedPreview(ev) {
  const preview = document.getElementById('feed-img-preview');
  const footer = document.getElementById('feed-img-preview-footer');
  const offset = 14;
  let x = ev.clientX + offset;
  let y = ev.clientY + offset;
  const footerVisible = preview.classList.contains('feed-img-preview--avatar') && footer && footer.style.display !== 'none';
  const previewWidth = Math.max(preview.offsetWidth, footerVisible ? footer.offsetWidth : 0);
  const previewHeight = preview.offsetHeight + (footerVisible ? footer.offsetHeight + 6 : 0);
  if (x + previewWidth  > window.innerWidth)  x = ev.clientX - previewWidth  - offset;
  if (y + previewHeight > window.innerHeight) y = ev.clientY - previewHeight - offset;
  preview.style.left = x + 'px';
  preview.style.top  = y + 'px';
}

function _feedHoverThumbWidth() {
  const thumb = document.querySelector('#covers-grid .cover-thumb');
  const width = Math.round(thumb?.getBoundingClientRect?.().width || 0);
  return width > 0 ? width : 90;
}

export function bindFeedPreviews(el) {
  // Hover image previews (desktop only - touch devices have no reliable mouseleave)
  const preview = document.getElementById('feed-img-preview');
  const previewImg = document.getElementById('feed-img-preview-img');
  const previewFooter = document.getElementById('feed-img-preview-footer');
  const previewLevel = document.getElementById('feed-img-preview-level');
  if (window.innerWidth > 768) el.querySelectorAll('.feed-user, [data-cover]').forEach(item => {
    const url = item.dataset.avatar || item.dataset.cover;
    const isCover = !!item.dataset.cover;
    const userLevel = item.dataset.userLevel || '';
    const userTitle = item.dataset.userTitle || '';
    item.addEventListener('mouseenter', ev => {
      _clearPreviewLoad();
      if (!url && !userLevel && !userTitle) return;
      const thumbWidth = _feedHoverThumbWidth();
      if (url) {
        previewImg.src = url;
        previewImg.style.display = 'block';
        previewImg.style.width  = `${thumbWidth}px`;
        previewImg.style.height = isCover ? `${Math.round(thumbWidth * 1.5)}px` : `${thumbWidth}px`;
      } else {
        previewImg.style.display = 'none';
      }
      preview.classList.toggle('feed-img-preview--avatar', !isCover);
      if (!isCover && userLevel) {
        previewFooter.style.display = 'block';
        previewLevel.innerHTML = `<span class="feed-hover-level-kicker">${t('feed.hover_level', { n: escapeHtml(userLevel) })}</span>${userTitle ? ` <span class="feed-hover-level-title">${escapeHtml(userTitle)}</span>` : ''}`;
        previewLevel.style.display = 'block';
      } else {
        previewFooter.style.display = 'none';
        previewLevel.textContent = '';
        previewLevel.style.display = 'none';
      }
      preview.style.display = 'block';
      _positionFeedPreview(ev);

      const bar = document.getElementById('feed-img-bar');
      bar._loadTimer = clearTimeout(bar._loadTimer);
      if (!url) {
        bar.style.transition = 'none';
        bar.style.width = '0';
        bar.style.opacity = '0';
      } else if (previewImg.complete && previewImg.naturalWidth) {
        bar.style.transition = 'none';
        bar.style.width = '0';
        bar.style.opacity = '0';
      } else {
        bar.style.transition = 'none';
        bar.style.width = '0';
        bar.style.opacity = '1';
        void bar.offsetWidth;
        bar.style.transition = 'width 1.5s cubic-bezier(0.1,0.4,0.5,1)';
        bar.style.width = '80%';
        const finish = () => {
          _clearPreviewLoad();
          bar.style.transition = 'width 0.1s ease';
          bar.style.width = '100%';
          bar._loadTimer = setTimeout(() => {
            bar.style.transition = 'opacity 0.3s ease';
            bar.style.opacity = '0';
          }, 120);
        };
        previewImg.addEventListener('load',  finish, { once: true });
        previewImg.addEventListener('error', finish, { once: true });
        _previewLoadCleanup = () => {
          previewImg.removeEventListener('load', finish);
          previewImg.removeEventListener('error', finish);
        };
      }
    });
    item.addEventListener('mousemove', _positionFeedPreview);
    item.addEventListener('mouseleave', _hideFeedPreview);
  });
}
