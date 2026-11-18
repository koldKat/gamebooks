// Apply the player's NSFW cover preference to the cover panel and wallpaper.
let hidden = !localStorage.getItem('gamebook_auth_token') || localStorage.getItem('hide-nsfw-books') !== '0';
let catalog = null;
let pending = null;
let bookIds = new Set();
let seriesIds = new Set();
let coverUrls = new Set();

export function hideNsfwBooks() { return hidden; }
export function nsfwVisibilityKey() { return JSON.stringify(catalog); }

export async function loadNsfwCatalog({ force = false } = {}) {
  if (pending) return pending;
  if (catalog && !force) return catalog;
  pending = (async () => {
    try {
      const response = await fetch('/api/public/nsfw', { cache: 'no-store' });
      if (!response.ok) throw new Error('Content labels unavailable');
      const data = await response.json();
      if (![data.bookIds, data.seriesIds, data.coverUrls].every(Array.isArray)) throw new Error('Invalid content labels');
      catalog = data;
      bookIds = new Set(data.bookIds.map(Number));
      seriesIds = new Set(data.seriesIds.map(Number));
      coverUrls = new Set(data.coverUrls);
      return data;
    } catch {
      // Keep the last valid labels; first-load artwork stays hidden until retry.
      return catalog;
    } finally { pending = null; }
  })();
  return pending;
}

function isNsfwBook(item) {
  if (!catalog) return true;
  return item?.isSeries
    ? seriesIds.has(Number(item.entityId ?? item.id))
    : bookIds.has(Number(typeof item === 'object' ? item.id : item));
}

export function isHiddenNsfwBook(item) { return hidden && isNsfwBook(item); }

export function isHiddenNsfwCover(url) {
  return hidden && (!catalog || coverUrls.has(url));
}

export function filterNsfwPublicBooks(items = [], hide = hidden) {
  return items.filter(item => !hide || !isNsfwBook(item)).map(item => {
    const next = { ...item };
    if (Array.isArray(item.children)) next.children = filterNsfwPublicBooks(item.children, hide);
    if (Array.isArray(item.childIds)) {
      next.childIds = item.childIds.filter(id => !hide || !isNsfwBook(id));
      next.childNames = (item.childNames || []).filter((_, i) => !hide || !isNsfwBook(item.childIds[i]));
    }
    return next;
  });
}

export function applyNsfwPreference(value) {
  const next = value !== '0' && value !== false;
  const changed = hidden !== next;
  hidden = next;
  localStorage.setItem('hide-nsfw-books', hidden ? '1' : '0');
  const checkbox = document.getElementById('hide-nsfw-books-cb');
  if (checkbox) checkbox.checked = hidden;
  if (changed) document.dispatchEvent(new CustomEvent('nsfw-preference-changed'));
}

export function initNsfwSettings(savePrefs) {
  const checkbox = document.getElementById('hide-nsfw-books-cb');
  if (!checkbox) return;
  checkbox.checked = hidden;
  checkbox.addEventListener('change', () => {
    applyNsfwPreference(checkbox.checked);
    savePrefs?.({ hideNsfwBooks: hidden ? '1' : '0' });
  });
}
