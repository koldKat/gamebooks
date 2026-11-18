// Mount icon cards in small chunks and retain SVG markup only near the viewport.
export function mountLazyIconGrid({ grid, items, renderItem, loadItems, root = grid, hydrate, release }) {
  let offset = 0, alive = true, scheduled = false, active = 0;
  const visible = new Map(), waiting = new Map(), inFlight = new Set();
  const cache = new Map();
  const sentinel = document.createElement('div');
  sentinel.className = 'lazy-icon-grid-sentinel';
  sentinel.setAttribute('aria-hidden', 'true');

  function schedule() {
    if (!alive || scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      while (alive && active < 2 && waiting.size) {
        const batch = [...waiting].slice(0, 24);
        for (const [id] of batch) { waiting.delete(id); inFlight.add(id); }
        active++;
        Promise.resolve().then(() => alive ? loadItems(batch.map(([id]) => id)) : []).then(result => {
          if (!alive) return;
          const byId = new Map((result || []).map(item => [Number(item.id), item]));
          for (const [id, card] of batch) {
            const item = byId.get(id);
            if (visible.get(id) !== card || !grid.contains(card) || !item) continue;
            cache.delete(id); cache.set(id, item);
            while (cache.size > 96) cache.delete(cache.keys().next().value);
            card.querySelector('[data-lazy-icon]').innerHTML = item.svg_data || '';
            hydrate?.(item);
          }
        }).catch(() => {}).finally(() => {
          active--;
          for (const [id] of batch) inFlight.delete(id);
          schedule();
        });
      }
    });
  }

  function appendChunk() {
    if (!alive || offset >= items.length) return;
    const fragment = document.createDocumentFragment();
    const cards = [];
    for (const item of items.slice(offset, offset + 64)) {
      const card = renderItem(item);
      card.dataset.lazyIconId = item.id;
      cards.push(card);
      fragment.appendChild(card);
    }
    offset += cards.length;
    grid.insertBefore(fragment, sentinel);
    for (const card of cards) observer.observe(card);
    if (offset >= items.length) observer.unobserve(sentinel);
  }

  const observer = new IntersectionObserver(entries => {
    if (!alive) return;
    for (const entry of entries) {
      if (entry.target === sentinel) {
        if (entry.isIntersecting) appendChunk();
        continue;
      }
      const card = entry.target, id = Number(card.dataset.lazyIconId);
      if (entry.isIntersecting) {
        visible.set(id, card);
        const cached = cache.get(id);
        if (cached) {
          card.querySelector('[data-lazy-icon]').innerHTML = cached.svg_data || '';
          hydrate?.(cached);
        } else if (!card.querySelector('[data-lazy-icon]').childNodes.length && !inFlight.has(id)) waiting.set(id, card);
      } else {
        visible.delete(id);
        waiting.delete(id);
        card.querySelector('[data-lazy-icon]').replaceChildren();
        release?.(id);
      }
    }
    schedule();
  }, { root, rootMargin: '100px' });
  grid.replaceChildren(sentinel);
  appendChunk();
  if (offset < items.length) observer.observe(sentinel);
  return {
    disconnect() {
      alive = false;
      observer.disconnect();
      waiting.clear();
      for (const [id, card] of visible) {
        card.querySelector('[data-lazy-icon]').replaceChildren();
        release?.(id);
      }
      visible.clear();
      cache.clear();
    },
  };
}
