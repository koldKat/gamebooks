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
    target.classList.add('reading-zoom-target');
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
  const window = document.defaultView;
  const bounds = source.getBoundingClientRect();
  const firstImage = source.tagName === 'IMG' ? source : source.querySelector('img');
  const singleImage = source.tagName === 'IMG' || (source.children.length === 1 && source.firstElementChild === firstImage);
  const imageBounds = firstImage?.getBoundingClientRect();
  const nativeRatio = imageBounds?.width ? firstImage.naturalWidth / imageBounds.width : 1;
  const naturalWidth = Number(source.dataset.sourceWidth) || (singleImage ? firstImage.naturalWidth : bounds.width * nativeRatio) || bounds.width;
  const naturalHeight = Number(source.dataset.sourceHeight) || (singleImage ? firstImage.naturalHeight : bounds.height * nativeRatio) || bounds.height;
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
  const originalImages = source.tagName === 'IMG' ? [source] : [...source.querySelectorAll('img')];
  let imageIndex = 0;
  for (const node of [copy, ...copy.querySelectorAll('*')]) {
    node.classList.remove('reading-zoom-target');
    node.removeAttribute('id');
    node.removeAttribute('tabindex');
    if (node.getAttribute('role') === 'button') {
      node.removeAttribute('role');
      node.removeAttribute('aria-label');
    }
    if (node.tagName === 'A') node.removeAttribute('href');
    if (node.tagName === 'FIGURE') {
      node.style.maxWidth = 'none';
      node.style.margin = '0';
    }
    if (node.tagName === 'IMG' && node.parentElement?.tagName === 'FIGURE'
        && !node.parentElement.matches('.reading-art-parts,.reading-source-sheet')) {
      node.style.width = '100%';
      node.style.maxWidth = 'none';
      node.style.height = 'auto';
      node.style.display = 'block';
    }
    if (node.tagName === 'IMG') {
      const original = originalImages[imageIndex++];
      if (node.parentElement?.matches('figure.reading-art-parts')) {
        node.style.flex = `${original.naturalWidth} 1 0px`;
        node.style.minWidth = '0';
        node.style.maxWidth = 'none';
        node.style.height = 'auto';
      }
    }
  }
  copy.style.width = '100%';
  copy.style.maxWidth = 'none';
  copy.style.margin = '0';
  if (copy.tagName === 'IMG') copy.style.height = 'auto';
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
  let fittedWidth = 0;
  let fittedHeight = 0;
  let maximumWidth = 0;
  let maximumHeight = 0;
  const resize = value => {
    const oldScale = scale;
    const centerX = (viewport.scrollLeft + viewport.clientWidth / 2) / oldScale;
    const centerY = (viewport.scrollTop + viewport.clientHeight / 2) / oldScale;
    scale = Math.max(1, Math.min(6, value));
    canvas.style.width = `${Math.floor(fittedWidth * scale)}px`;
    viewport.style.width = `${Math.min(maximumWidth, Math.ceil(fittedWidth * scale))}px`;
    viewport.style.height = `${Math.min(maximumHeight, Math.ceil(fittedHeight * scale))}px`;
    viewport.scrollLeft = scale === 1 ? 0 : centerX * scale - viewport.clientWidth / 2;
    viewport.scrollTop = scale === 1 ? 0 : centerY * scale - viewport.clientHeight / 2;
    viewport.classList.toggle('can-pan', fittedWidth * scale > viewport.clientWidth || fittedHeight * scale > viewport.clientHeight);
    smaller.disabled = scale === 1;
    larger.disabled = scale === 6;
    reset.textContent = `${Math.round(scale * 100)}%`;
  };
  const smaller = button('Zoom out', '−', () => resize(scale - .25));
  const reset = button('Fit illustration', '100%', () => resize(1));
  const larger = button('Zoom in', '+', () => resize(scale + .25));
  const close = button('Close', '×', () => dialog.close());
  close.setAttribute('data-dialog-close', '');
  dialog.append(toolbar, viewport);
  const fit = () => {
    const style = window.getComputedStyle(dialog);
    const horizontal = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight) + parseFloat(style.borderLeftWidth) + parseFloat(style.borderRightWidth);
    const vertical = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom) + parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth)
      + toolbar.offsetHeight + parseFloat(window.getComputedStyle(toolbar).marginBottom);
    maximumWidth = Math.floor(window.innerWidth * .75 - horizontal);
    maximumHeight = Math.floor(window.innerHeight * .85 - vertical);
    const ratio = Math.min(1, (maximumWidth - 1) / naturalWidth, (maximumHeight - 1) / naturalHeight);
    fittedWidth = Math.max(1, naturalWidth * ratio);
    fittedHeight = Math.max(1, naturalHeight * ratio);
    resize(scale);
  };
  viewport.tabIndex = 0;
  viewport.setAttribute('aria-label', 'Illustration. Drag or use arrow keys to pan when zoomed.');
  let drag = null;
  viewport.addEventListener('pointerdown', event => {
    if (event.button !== 0 || !viewport.classList.contains('can-pan')) return;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, left: viewport.scrollLeft, top: viewport.scrollTop };
    viewport.setPointerCapture(event.pointerId);
    viewport.classList.add('panning');
    event.preventDefault();
  });
  viewport.addEventListener('pointermove', event => {
    if (!drag || drag.id !== event.pointerId) return;
    viewport.scrollLeft = drag.left + drag.x - event.clientX;
    viewport.scrollTop = drag.top + drag.y - event.clientY;
  });
  const endDrag = () => { drag = null; viewport.classList.remove('panning'); };
  viewport.addEventListener('lostpointercapture', endDrag);
  viewport.addEventListener('pointerup', endDrag);
  viewport.addEventListener('pointercancel', endDrag);
  viewport.addEventListener('dragstart', event => event.preventDefault());
  viewport.addEventListener('keydown', event => {
    const direction = { ArrowLeft: [-40, 0], ArrowRight: [40, 0], ArrowUp: [0, -40], ArrowDown: [0, 40] }[event.key];
    if (!direction) return;
    event.preventDefault();
    viewport.scrollBy(...direction);
  });
  dialog.addEventListener('close', () => {
    window.removeEventListener('resize', fit);
    dialog.remove(); // Release the copied DOM and image references immediately.
  }, { once: true });
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  });
  document.body.append(dialog);
  dialog.showModal();
  fit();
  window.addEventListener('resize', fit);
  close.focus();
}
