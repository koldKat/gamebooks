// Display original page frames on demand without navigating or changing player state.
const bound = new WeakSet();

function framesFor(node, bookId) {
  const names = ['class', 'data-reading-frames'];
  if (node.attributes.length !== names.length
      || [...node.attributes].some(a => !names.includes(a.name))) throw new Error('Invalid flipbook attributes');
  const frames = JSON.parse(node.getAttribute('data-reading-frames'));
  const imagePath = new RegExp(`^/api/books/${Number(bookId)}/reading-images/[a-f0-9]{64}\\.png$`);
  if (!Array.isArray(frames) || frames.length < 2 || frames.length > 200
      || frames.some(f => !f || Object.keys(f).sort().join(',') !== 'label,src'
        || typeof f.src !== 'string' || !imagePath.test(f.src)
        || typeof f.label !== 'string' || f.label.length > 80)) throw new Error('Invalid flipbook frames');
  return frames;
}

function activate(node, document, frames) {
  const image = document.createElement('img');
  image.alt = '';
  const controls = document.createElement('figcaption');
  const previous = document.createElement('button');
  const next = document.createElement('button');
  const position = document.createElement('input');
  const label = document.createElement('span');
  previous.type = next.type = 'button';
  previous.textContent = '‹'; next.textContent = '›';
  previous.setAttribute('aria-label', 'Previous frame');
  next.setAttribute('aria-label', 'Next frame');
  position.type = 'range'; position.min = '0'; position.max = String(frames.length - 1); position.step = '1';
  position.setAttribute('aria-label', 'Original page frame');
  label.setAttribute('aria-live', 'polite');
  let index = frames.length - 1;
  const show = value => {
    index = Math.max(0, Math.min(frames.length - 1, value));
    image.src = frames[index].src;
    image.alt = frames[index].label;
    label.textContent = `${index + 1} / ${frames.length}`;
    position.value = String(index);
    previous.disabled = index === 0; next.disabled = index === frames.length - 1;
  };
  previous.addEventListener('click', event => { event.stopPropagation(); show(index - 1); });
  next.addEventListener('click', event => { event.stopPropagation(); show(index + 1); });
  position.addEventListener('input', () => {
    const value = Number(position.value);
    if (Number.isInteger(value)) show(value);
  });
  controls.append(previous, position, next, label);
  node.replaceChildren(image, controls);
  bound.add(node);
  show(index);
  return node;
}

export function copySourceFlipbook(node, document, bookId) {
  const frames = framesFor(node, bookId);
  if (node.childNodes.length) throw new Error('Invalid flipbook content');
  const target = document.createElement('figure');
  target.className = 'reading-source-flipbook';
  return activate(target, document, frames);
}

export function bindReadingSourceFlipbooks(root, bookId) {
  for (const node of root.querySelectorAll('figure.reading-source-flipbook')) {
    if (bound.has(node)) continue;
    try {
      const frames = framesFor(node, bookId);
      if (node.childNodes.length) continue;
      activate(node, root.ownerDocument, frames);
    } catch {
      // Invalid imported controls stay inert and never load an external image.
    }
  }
}
