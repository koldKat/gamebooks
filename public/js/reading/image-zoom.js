// Enlarge reader artwork on demand without decoding copies or changing the run.
const bound = new WeakSet();

export function bindReadingImageZoom(root) {
  const document = root.ownerDocument;
  const targetFor = node => {
    if (node.closest?.('a,button,input,select,textarea')) return null;
    let target = node.closest?.('img,figure');
    if (!target || !root.contains(target)) return null;
    if (target.tagName === 'FIGURE' && !target.querySelector('img')) return null;
    if (target.matches('img.reading-inline-symbol,img.reading-inline-initial,img.reading-inline-word')) return null;
    // A protected illustration can consist of many adjoining native PNG strips.
    // Enlarge the complete composition, never an individual strip.
    for (let parent = target.parentElement; parent && parent !== root; parent = parent.parentElement) {
      if (parent.tagName === 'FIGURE' && !parent.matches('.reading-source-flipbook')) target = parent;
    }
    return target;
  };
  const targets = new Set([...root.querySelectorAll('img')].map(targetFor).filter(Boolean));
  for (const target of targets) {
    if (target.querySelector('a,button,input')) continue;
    target.tabIndex = 0;
    target.setAttribute('role', 'button');
    target.setAttribute('aria-label', 'Enlarge illustration');
  }
  if (bound.has(root)) return;
  bound.add(root);
  root.addEventListener('keydown', event => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const target = targetFor(event.target);
    if (!target || target !== event.target || target.getAttribute('role') !== 'button') return;
    event.preventDefault();
    event.stopPropagation();
    openReadingImageZoom(target, document);
  });
  root.addEventListener('click', event => {
    const target = targetFor(event.target);
    if (!target || document.defaultView.getSelection()?.toString()) return;
    event.preventDefault();
    event.stopPropagation();
    openReadingImageZoom(target, document);
  });
}

export function openReadingImageZoom(source, document = source.ownerDocument) {
  // Reuse image URLs and browser cache. No canvas, new raster or preloaded gallery.
  const dialog = document.createElement('dialog');
  dialog.className = 'reading-image-zoom';
  dialog.setAttribute('aria-label', 'Enlarged illustration');
  const toolbar = document.createElement('div');
  toolbar.className = 'reading-image-zoom-toolbar';
  const viewport = document.createElement('div');
  viewport.className = 'reading-image-zoom-viewport';
  const canvas = document.createElement('div');
  canvas.className = 'reading-image-zoom-canvas';
  const copy = source.cloneNode(true);
  for (const node of [copy, ...copy.querySelectorAll('*')]) {
    node.removeAttribute('id');
    node.removeAttribute('tabindex');
    if (node.getAttribute('role') === 'button') {
      node.removeAttribute('role');
      node.removeAttribute('aria-label');
    }
    if (node.tagName === 'A') node.removeAttribute('href');
    if (node.tagName === 'FIGURE') node.style.maxWidth = 'none';
  }
  copy.style.width = '100%';
  copy.style.maxWidth = 'none';
  copy.style.margin = '0';
  canvas.append(copy);
  viewport.append(canvas);
  const button = (label, text, onClick) => {
    const element = document.createElement('button');
    element.type = 'button';
    element.textContent = text;
    element.setAttribute('aria-label', label);
    element.addEventListener('click', onClick);
    toolbar.append(element);
    return element;
  };
  let scale = 1;
  const resize = value => {
    scale = Math.max(1, Math.min(6, value));
    canvas.style.width = `${scale * 100}%`;
    smaller.disabled = scale === 1;
    larger.disabled = scale === 6;
    reset.textContent = `${Math.round(scale * 100)}%`;
  };
  const smaller = button('Zoom out', '−', () => resize(scale - .5));
  const reset = button('Fit illustration', '100%', () => resize(1));
  const larger = button('Zoom in', '+', () => resize(scale + .5));
  const close = button('Close', '×', () => dialog.close());
  close.setAttribute('data-dialog-close', '');
  dialog.append(toolbar, viewport);
  dialog.addEventListener('close', () => {
    dialog.remove(); // Release the copied DOM and image references immediately.
  }, { once: true });
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  });
  document.body.append(dialog);
  resize(1);
  dialog.showModal();
  close.focus();
}
