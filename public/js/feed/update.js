const snapshots = new WeakMap();

function captureScroll(root) {
  const scroller = document.getElementById('landing-wrapper');
  if (!scroller) return () => {};
  if (scroller.scrollTop <= 0) return () => { scroller.scrollTop = 0; };
  const top = scroller.getBoundingClientRect().top;
  const anchor = [...root.querySelectorAll('.feed-entry, .feed-day-header')]
    .find(el => el.getBoundingClientRect().bottom > top && el.getClientRects().length);
  const html = anchor?.innerHTML;
  const day = anchor?.closest('.feed-day-card');
  const offset = anchor?.getBoundingClientRect().top;
  const scrollTop = scroller.scrollTop;
  return () => {
    const searchRoot = day?.isConnected ? day : root;
    const replacement = anchor?.isConnected ? anchor : [...searchRoot.querySelectorAll('.feed-entry, .feed-day-header')]
      .find(el => el.innerHTML === html && el.getClientRects().length);
    scroller.scrollTop = replacement
      ? scroller.scrollTop + replacement.getBoundingClientRect().top - offset
      : scrollTop;
  };
}

// Preserve day-card shells and cover stacks; only changed content needs new bindings.
export function updateFeedContents(root, blocks, reset = false) {
  let previous = snapshots.get(root) || new Map();
  if (reset || [...previous.values()].some(record => record.node.parentNode !== root)) previous = new Map();
  const restoreScroll = captureScroll(root);
  const next = new Map(), changedRoots = [];
  let structureChanged = reset;
  if (!previous.size) root.replaceChildren();
  let cursor = root.firstElementChild;
  for (const block of blocks) {
    const old = previous.get(block.key);
    const coversChanged = JSON.stringify(old?.covers) !== JSON.stringify(block.covers);
    let node = old?.node;
    if (!old || old.html !== block.html || coversChanged) {
      const template = document.createElement('template');
      template.innerHTML = block.html;
      const incoming = template.content.firstElementChild;
      if (node?.classList.contains('feed-day-card') && incoming.classList.contains('feed-day-card')) {
        node.className = incoming.className;
        if (incoming.hasAttribute('data-day-index')) node.dataset.dayIndex = incoming.dataset.dayIndex;
        else node.removeAttribute('data-day-index');
        const stack = node.querySelector('.feed-day-cover-stack');
        const newStack = incoming.querySelector('.feed-day-cover-stack');
        if (stack && old.covers?.some(url => !block.covers?.includes(url))) stack.replaceChildren();
        if (!newStack) stack?.remove();
        else if (!stack) node.prepend(newStack);
        if (old.html !== block.html) {
          const content = incoming.querySelector('.feed-day-content');
          node.querySelector('.feed-day-content').replaceWith(content);
          changedRoots.push(content);
        }
        if (coversChanged) structureChanged = true;
      } else {
        if (node === cursor) cursor = node.nextElementSibling;
        node?.remove();
        node = incoming;
        changedRoots.push(node);
      }
    }
    if (node !== cursor) { root.insertBefore(node, cursor); structureChanged = true; }
    else cursor = cursor.nextElementSibling;
    next.set(block.key, { node, html: block.html, covers: block.covers });
  }
  for (const [key, record] of previous) if (!next.has(key)) { record.node.remove(); structureChanged = true; }
  snapshots.set(root, next);
  return { changedRoots, changed: structureChanged || changedRoots.length > 0, restoreScroll };
}
